import jwt, { SignOptions } from "jsonwebtoken";
import { User } from "@shared/schema";

const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

interface AppJwtPayload {
  sub: number;
  username: string;
  isGuest: boolean;
  iat?: number;
  exp?: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim() || process.env.SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }

  return secret;
}

export function assertJwtSecretConfigured(): void {
  getJwtSecret();
}

export function signToken(user: User): string {
  const options: SignOptions = { expiresIn: JWT_EXPIRY_SECONDS };

  return jwt.sign(
    {
      sub: user.userId,
      username: user.username,
      isGuest: user.isGuest,
    },
    getJwtSecret(),
    options,
  );
}

export function verifyToken(
  token: string,
): { userId: number; username: string; isGuest: boolean } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());

    if (typeof decoded === "string") {
      return null;
    }

    const payload = decoded as unknown as AppJwtPayload;
    return {
      userId: payload.sub,
      username: payload.username,
      isGuest: payload.isGuest ?? false,
    };
  } catch {
    return null;
  }
}

