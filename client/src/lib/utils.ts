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
  const colors = [
    "from-blue-500 to-purple-500",
    "from-green-500 to-teal-500",
    "from-orange-500 to-red-500",
    "from-purple-500 to-pink-500",
    "from-indigo-500 to-blue-500",
    "from-yellow-500 to-orange-500",
  ];
  const index = username.length % colors.length;
  return colors[index];
};

// React Query key constants
export const QUERY_KEYS = {
  GLOBAL_MESSAGES: ["/api/global-messages"],
  ONLINE_USERS: ["/api/users/online"],
  USER: ["/api/user"],
  messageHistory: (userId: number) => ["/api/messages/history", userId],
} as const;
