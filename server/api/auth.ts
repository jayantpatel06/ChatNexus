import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import {
  loginUserSchema,
  registerUserSchema,
  type DbUser,
  type InsertUser,
  type LoginUser,
  type RegisterUser,
  type User,
} from "@shared/schema";
import { promisify } from "util";
import { signToken } from "../lib/jwt";
import {
  invalidateJwtUserCache,
  jwtAuth,
  primeJwtUserCache,
} from "../middleware/jwt-auth";
import {
  authRateLimiter,
  guestLoginRateLimiter,
} from "../middleware/rate-limit";
import { storage } from "../storage";

const scryptAsync = promisify(scrypt);

function toPublicUser(user: DbUser): User {
  const { gmail: _gmail, passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

function validateGuestUsername(username: unknown): string | null {
  if (!username || typeof username !== "string" || username.trim().length === 0) {
    return "Username is required";
  }

  const trimmedUsername = username.trim();

  if (trimmedUsername.length < 2) {
    return "Username must be at least 2 characters long";
  }

  if (trimmedUsername.length > 20) {
    return "Username must be less than 20 characters";
  }

  return null;
}

function parseRegisterPayload(body: unknown): RegisterUser {
  return registerUserSchema.parse(body);
}

function parseLoginPayload(body: unknown): LoginUser {
  return loginUserSchema.parse(body);
}

async function ensureUsernameIsAvailable(username: string) {
  const existingUser = await storage.getUserByUsername(username);
  return !existingUser;
}

async function createGuestUser(username: string) {
  const user = await storage.createUser({
    username,
    isGuest: true,
    isOnline: true,
    gmail: null,
    passwordHash: null,
    age: null,
    gender: null,
  });

  primeJwtUserCache(user);
  return { user: toPublicUser(user), token: signToken(user) };
}

async function registerMemberUser(
  userInput: Omit<InsertUser, "passwordHash"> & { password: string },
) {
  const user = await storage.createUser({
    gmail: userInput.gmail,
    passwordHash: await hashPassword(userInput.password),
    username: userInput.username,
    age: userInput.age,
    gender: userInput.gender,
    isGuest: false,
    isOnline: true,
  });

  primeJwtUserCache(user);
  return { user: toPublicUser(user), token: signToken(user) };
}

async function authenticateMemberUser(gmail: string, password: string) {
  const user = await storage.getUserByGmail(gmail);
  if (!user || !user.passwordHash) {
    return null;
  }

  const passwordsMatch = await comparePasswords(password, user.passwordHash);
  if (!passwordsMatch) {
    return null;
  }

  await storage.updateUserOnlineStatus(user.userId, true);
  const nextUser: DbUser = {
    ...user,
    isOnline: true,
  };
  primeJwtUserCache(nextUser);
  return { user: toPublicUser(nextUser), token: signToken(nextUser) };
}

async function logoutUser(user: DbUser) {
  invalidateJwtUserCache(user.userId);
  await storage.clearEphemeralConversationsForUser(user.userId);

  if (user.isGuest) {
    await storage.deleteUser(user.userId);
    return;
  }

  await storage.updateUserOnlineStatus(user.userId, false);
}

function refreshUserToken(user: DbUser) {
  return { token: signToken(user), user: toPublicUser(user) };
}

async function guestLoginController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const validationMessage = validateGuestUsername(req.body?.username);
    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const trimmedUsername = req.body.username.trim();
    const isAvailable = await ensureUsernameIsAvailable(trimmedUsername);
    if (!isAvailable) {
      return res.status(400).json({ message: "Username already exists" });
    }

    return res.status(201).json(await createGuestUser(trimmedUsername));
  } catch (error) {
    next(error);
  }
}

async function registerController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const validatedData = parseRegisterPayload(req.body);

    const existingUser = await storage.getUserByGmail(validatedData.gmail);
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const existingUsername = await storage.getUserByUsername(validatedData.username);
    if (existingUsername) {
      return res.status(400).json({ message: "Username already exists" });
    }

    return res.status(201).json(await registerMemberUser(validatedData));
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Invalid input data" });
    }
    next(error);
  }
}

async function loginController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const validatedData = parseLoginPayload(req.body);
    const payload = await authenticateMemberUser(
      validatedData.gmail,
      validatedData.password,
    );

    if (!payload) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    return res.status(200).json(payload);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Invalid input data" });
    }
    next(error);
  }
}

async function logoutController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await logoutUser(req.jwtUser!);
    res.sendStatus(200);
  } catch (error) {
    next(error);
  }
}

async function currentUserController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.json(toPublicUser(req.jwtUser!));
  } catch (error) {
    next(error);
  }
}

async function refreshTokenController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.json(refreshUserToken(req.jwtUser!));
  } catch (error) {
    next(error);
  }
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  app.post("/api/guest-login", guestLoginRateLimiter, guestLoginController);
  app.post("/api/register", authRateLimiter, registerController);
  app.post("/api/login", authRateLimiter, loginController);
  app.post("/api/logout", jwtAuth, logoutController);
  app.get("/api/user", jwtAuth, currentUserController);
  app.post("/api/auth/refresh", jwtAuth, refreshTokenController);
}
