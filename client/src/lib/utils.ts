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

