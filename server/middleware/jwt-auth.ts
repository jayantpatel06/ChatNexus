import { Request, Response, NextFunction } from "express";
import type { DbUser } from "@shared/schema";
import { verifyToken } from "../lib/jwt";
import { storage } from "../storage";

const JWT_USER_CACHE_TTL_MS = 10 * 1000;

type JwtUserCacheEntry = {
  user: DbUser;
  expiresAt: number;
};

const jwtUserCache = new Map<number, JwtUserCacheEntry>();

function getCachedJwtUser(userId: number): DbUser | undefined {
  const cached = jwtUserCache.get(userId);

  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    jwtUserCache.delete(userId);
    return undefined;
  }

  return cached.user;
}

export function primeJwtUserCache(user: DbUser): void {
  jwtUserCache.set(user.userId, {
    user,
    expiresAt: Date.now() + JWT_USER_CACHE_TTL_MS,
  });
}

export function invalidateJwtUserCache(userId: number): void {
  jwtUserCache.delete(userId);
}

// Extend Express Request to include user from JWT
declare global {
  namespace Express {
    interface Request {
      jwtUser?: DbUser;
    }
  }
}

/**
 * JWT Authentication Middleware
 * Validates the Authorization header and attaches user to request
 */
export async function jwtAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const cachedUser = getCachedJwtUser(decoded.userId);
    if (cachedUser) {
      req.jwtUser = cachedUser;
      return next();
    }

    const user = await storage.getUser(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    primeJwtUserCache(user);
    req.jwtUser = user;
    next();
  } catch (error) {
    console.error("JWT Auth middleware error:", error);
    return res.status(401).json({ message: "Authentication failed" });
  }
}
