import jwt from 'jsonwebtoken';
import { User } from '@shared/schema';

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev_secret_key_123';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d'; // 7 days default for better UX

interface AppJwtPayload {
    sub: number;
    username: string;
    isGuest: boolean;
    iat?: number;
    exp?: number;
}

export function signToken(user: User): string {
    // Sign a token with user ID, username, and guest status
    return jwt.sign(
        { 
            sub: user.userId, 
            username: user.username,
            isGuest: user.isGuest 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

export function verifyToken(token: string): { userId: number; username: string; isGuest: boolean } | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        if (typeof decoded === 'string') {
            return null;
        }

        const payload = decoded as unknown as AppJwtPayload;
        return { 
            userId: payload.sub, 
            username: payload.username,
            isGuest: payload.isGuest ?? false
        };
    } catch (error) {
        return null;
    }
}

/**
 * Decode token without verification (useful for checking expiry)
 */
export function decodeToken(token: string): AppJwtPayload | null {
    try {
        const decoded = jwt.decode(token);
        if (typeof decoded === 'string' || !decoded) {
            return null;
        }
        return decoded as unknown as AppJwtPayload;
    } catch {
        return null;
    }
}
