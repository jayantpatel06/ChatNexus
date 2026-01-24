import { Express } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { registerUserSchema, loginUserSchema } from "@shared/schema";
import { signToken } from "./lib/jwt";
import { jwtAuth } from "./middleware/jwt-auth";

const scryptAsync = promisify(scrypt);

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

export function setupAuth(app: Express) {
  // Trust proxy for production environments behind reverse proxies
  app.set("trust proxy", 1);

  // Guest login - returns JWT token directly
  app.post("/api/guest-login", async (req, res, next) => {
    try {
      const { username } = req.body;

      if (!username || typeof username !== "string" || username.trim().length === 0) {
        return res.status(400).json({ message: "Username is required" });
      }

      const trimmedUsername = username.trim();

      if (trimmedUsername.length < 2) {
        return res.status(400).json({ message: "Username must be at least 2 characters long" });
      }

      if (trimmedUsername.length > 20) {
        return res.status(400).json({ message: "Username must be less than 20 characters" });
      }

      // Ensure username is unique
      const existingUser = await storage.getUserByUsername(trimmedUsername);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        username: trimmedUsername,
        isGuest: true,
        isOnline: true,
        gmail: null,
        passwordHash: null,
        age: null,
        gender: null,
      });

      // Generate JWT token
      const token = signToken(user);

      res.status(201).json({ user, token });
    } catch (error) {
      next(error);
    }
  });

  // Member registration - returns JWT token directly
  app.post("/api/register", async (req, res, next) => {
    try {
      const validatedData = registerUserSchema.parse(req.body);

      const existingUser = await storage.getUserByGmail(validatedData.gmail);
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const existingUsername = await storage.getUserByUsername(validatedData.username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        gmail: validatedData.gmail,
        passwordHash: await hashPassword(validatedData.password),
        username: validatedData.username,
        age: validatedData.age,
        gender: validatedData.gender,
        isGuest: false,
        isOnline: true,
      });

      // Generate JWT token
      const token = signToken(user);

      res.status(201).json({ user, token });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input data" });
      }
      next(error);
    }
  });

  // Member login - returns JWT token directly
  app.post("/api/login", async (req, res, next) => {
    try {
      const validatedData = loginUserSchema.parse(req.body);

      const user = await storage.getUserByGmail(validatedData.gmail);
      if (!user || !user.passwordHash || !(await comparePasswords(validatedData.password, user.passwordHash))) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Update online status
      await storage.updateUserOnlineStatus(user.userId, true);

      // Generate JWT token
      const token = signToken(user);

      res.status(200).json({ user, token });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input data" });
      }
      next(error);
    }
  });

  // Logout - requires JWT auth
  app.post("/api/logout", jwtAuth, async (req, res, next) => {
    try {
      const user = req.jwtUser!;

      if (user.isGuest) {
        // If it's a guest user, delete them from the database
        await storage.deleteUser(user.userId);
      } else {
        // For regular users, just update online status
        await storage.updateUserOnlineStatus(user.userId, false);
      }

      // JWT tokens are stateless - client should delete the token from localStorage
      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });

  // Get current user - requires JWT auth
  // Note: Online status is managed by Socket.io connection, not by this endpoint
  app.get("/api/user", jwtAuth, async (req, res, next) => {
    try {
      const user = req.jwtUser!;
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  // Refresh token endpoint - get a new token before the old one expires
  app.post("/api/auth/refresh", jwtAuth, async (req, res, next) => {
    try {
      const user = req.jwtUser!;
      
      // Generate a fresh token
      const token = signToken(user);
      
      res.json({ token, user });
    } catch (error) {
      next(error);
    }
  });
}
