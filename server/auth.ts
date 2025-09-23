import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, registerUserSchema, loginUserSchema } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

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

function generateGuestUsername(): string {
  const randomNum = Math.floor(Math.random() * 999) + 1;
  return `Guest${randomNum}`;
}

export function setupAuth(app: Express) {
  let sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error("SESSION_SECRET environment variable is required for security");
    }
    // In development, generate a short-lived secret to avoid crashing the server.
    // This is insecure and only intended for local development.
    console.warn('SESSION_SECRET not set. Using a generated development secret. Do NOT use in production.');
    sessionSecret = `dev-${Math.random().toString(36).slice(2)}`;
  }

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "gmail" },
      async (gmail, password, done) => {
        try {
          const user = await storage.getUserByGmail(gmail);
          if (!user || !user.passwordHash || !(await comparePasswords(password, user.passwordHash))) {
            return done(null, false);
          } else {
            return done(null, user);
          }
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => done(null, user.userId));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Guest login
  app.post("/api/guest-login", async (req, res, next) => {
    try {
      let username = generateGuestUsername();
      
      // Ensure username is unique
      while (await storage.getUserByUsername(username)) {
        username = generateGuestUsername();
      }

      const user = await storage.createUser({
        username,
        isGuest: true,
        isOnline: true,
        gmail: null,
        passwordHash: null,
        age: null,
        gender: null,
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  // Member registration
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

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input data" });
      }
      next(error);
    }
  });

  // Member login
  app.post("/api/login", async (req, res, next) => {
    try {
      const validatedData = loginUserSchema.parse(req.body);
      
      passport.authenticate("local", async (err: any, user: SelectUser | false) => {
        if (err) return next(err);
        if (!user) {
          return res.status(401).json({ message: "Invalid email or password" });
        }

        // Update online status
        await storage.updateUserOnlineStatus(user.userId, true);
        
        req.login(user, (loginErr) => {
          if (loginErr) return next(loginErr);
          res.status(200).json(user);
        });
      })(req, res, next);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input data" });
      }
      next(error);
    }
  });

  app.post("/api/logout", async (req, res, next) => {
    try {
      if (req.user) {
        if (req.user.isGuest) {
          // If it's a guest user, delete them from the database
          await storage.deleteUser(req.user.userId);
        } else {
          // For regular users, just update online status
          await storage.updateUserOnlineStatus(req.user.userId, false);
        }
      }
      
      req.logout((err) => {
        if (err) return next(err);
        res.sendStatus(200);
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/user", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      // Automatically mark user as online when they have a valid session
      await storage.updateUserOnlineStatus(req.user.userId, true);
      
      res.json(req.user);
    } catch (error) {
      next(error);
    }
  });

  // Update username
  app.put("/api/user/username", async (req, res, next) => {
    try {
      console.log('Username update request:', {
        isAuthenticated: req.isAuthenticated(),
        hasSession: !!req.session,
        sessionId: req.sessionID,
        user: req.user ? { userId: req.user.userId, username: req.user.username } : null,
        cookies: req.headers.cookie
      });
      
      if (!req.isAuthenticated()) {
        console.log('User not authenticated for username update');
        return res.status(401).json({ message: "Not authenticated" });
      }
      
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
      
      if (trimmedUsername === req.user.username) {
        return res.status(400).json({ message: "Please choose a different username" });
      }
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(trimmedUsername);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      // Update the username
      const updatedUser = await storage.updateUserUsername(req.user.userId, trimmedUsername);
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update username" });
      }
      
      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating username:', error);
      next(error);
    }
  });
}
