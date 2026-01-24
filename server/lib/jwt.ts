import jwt, { SignOptions } from 'jsonwebtoken';
import { User } from '@shared/schema';

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev_secret_key_123';
// JWT expiry in seconds (7 days = 604800 seconds)
const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

interface AppJwtPayload {
    sub: number;
    username: string;
    isGuest: boolean;
    iat?: number;
    exp?: number;
}

export function signToken(user: User): string {
    const options: SignOptions = { expiresIn: JWT_EXPIRY_SECONDS };
    
    return jwt.sign(
        { 
            sub: user.userId, 
            username: user.username,
            isGuest: user.isGuest 
        },
        JWT_SECRET,
        options
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
