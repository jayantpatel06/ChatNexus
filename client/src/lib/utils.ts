import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Avatar helper functions - shared across components
export const getUserInitials = (username: string) => {
  return username.slice(0, 2).toUpperCase();
};

export const getAvatarColor = (username: string) => {
  const index = username.length % 6;
  return `var(--avatar-${index})`;
};

// React Query key constants
export const QUERY_KEYS = {
  GLOBAL_MESSAGES: ["/api/global-messages"],
  ONLINE_USERS: ["/api/users/online"],
  USER: ["/api/user"],
  messageHistory: (userId: number) => ["/api/messages/history", userId],
} as const;
