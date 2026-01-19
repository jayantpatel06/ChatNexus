import jwt from 'jsonwebtoken';
import { User } from '@shared/schema';

const JWT_SECRET = process.env.SESSION_SECRET || 'dev_secret_key_123';

interface AppJwtPayload {
    sub: number;
    username: string;
}

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
        const decoded = jwt.verify(token, JWT_SECRET);

        if (typeof decoded === 'string') {
            return null;
        }

        const payload = decoded as unknown as AppJwtPayload;
        return { userId: payload.sub, username: payload.username };
    } catch (error) {
        return null;
    }
}
