import type { DbUser, User } from "@shared/schema";

export function toPublicUser(user: DbUser): User {
  const { gmail: _gmail, passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export function sortUsersByPresence(users: User[]): User[] {
  return users.sort(
    (left, right) =>
      Number(right.isOnline) - Number(left.isOnline) ||
      left.username.localeCompare(right.username),
  );
}
