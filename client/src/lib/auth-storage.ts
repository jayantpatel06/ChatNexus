import type { User } from "@shared/schema";

const TOKEN_KEY = "chatnexus_jwt";
const USER_KEY = "chatnexus_user";

export type JwtPayload = {
  exp?: number;
  iat?: number;
  sub?: number;
  username?: string;
  isGuest?: boolean;
};

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function parseStoredUser(raw: string): User | null {
  const parsed = JSON.parse(raw) as Record<string, unknown> | null;

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const { userId, username, age, gender, isOnline, isGuest } = parsed;
  const hasValidAge =
    age === null ||
    (Number.isInteger(age) && (age as number) >= 18 && (age as number) <= 120);
  const hasValidGender =
    gender === null || (typeof gender === "string" && gender.length <= 10);

  if (
    !Number.isInteger(userId) ||
    (userId as number) <= 0 ||
    typeof username !== "string" ||
    username.length < 1 ||
    username.length > 50 ||
    !hasValidAge ||
    !hasValidGender ||
    typeof isOnline !== "boolean" ||
    typeof isGuest !== "boolean"
  ) {
    return null;
  }

  return {
    userId,
    username,
    age,
    gender,
    isOnline,
    isGuest,
  } as User;
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return parseStoredUser(raw);
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function setStoredUser(user: User): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeStoredUser(): void {
  localStorage.removeItem(USER_KEY);
}

export function decodeStoredToken(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

export function hasValidStoredAuthSession(): boolean {
  const token = getStoredToken();
  if (!token || !getStoredUser()) {
    return false;
  }

  const payload = decodeStoredToken(token);
  return Boolean(payload?.exp && payload.exp * 1000 > Date.now());
}
