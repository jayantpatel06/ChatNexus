import jwt from 'jsonwebtoken';
import { User } from '@shared/schema';

const JWT_SECRET = process.env.SESSION_SECRET || 'dev_secret_key_123';

export function signToken(user: User): string {
    // Sign a minimal token with user ID and username
    // Expires in 24 hours
    return jwt.sign(
        { sub: user.userId, username: user.username },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

export function verifyToken(token: string): { userId: number, username: string } | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { sub: number, username: string };
        return { userId: decoded.sub, username: decoded.username };
    } catch (error) {
        return null;
    }
}
