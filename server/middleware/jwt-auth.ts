import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';
import { storage } from '../storage';
import { User } from '@shared/schema';

// Extend Express Request to include user from JWT
declare global {
  namespace Express {
    interface Request {
      jwtUser?: User;
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
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Fetch fresh user data from database to ensure user still exists
    const user = await storage.getUser(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Attach user to request for use in route handlers
    req.jwtUser = user;
    next();
  } catch (error) {
    console.error('JWT Auth middleware error:', error);
    return res.status(401).json({ message: 'Authentication failed' });
  }
}

/**
 * Optional JWT Authentication Middleware
 * Attaches user to request if token is valid, but doesn't block if no token
 */
export async function optionalJwtAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);

      if (decoded) {
        const user = await storage.getUser(decoded.userId);
        if (user) {
          req.jwtUser = user;
        }
      }
    }
    
    next();
  } catch (error) {
    // Silently continue without user
    next();
  }
}
