import { z } from "zod";
import type { User as PrismaUser, Message as PrismaMessage } from "@prisma/client";

// Zod schemas for validation
export const insertUserSchema = z.object({
  gmail: z.string().email().nullable().optional(),
  passwordHash: z.string().nullable().optional(),
  username: z.string().min(1).max(50),
  age: z.number().min(13).max(120).nullable().optional(),
  gender: z.string().max(10).nullable().optional(),
  isOnline: z.boolean().default(false).optional(),
  isGuest: z.boolean().default(false).optional(),
});

export const loginUserSchema = z.object({
  gmail: z.string().email(),
  password: z.string().min(1),
});

export const registerUserSchema = z.object({
  gmail: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(1).max(50),
  age: z.number().min(13).max(120),
  gender: z.enum(["Male", "Female", "Other"]),
});

export const insertMessageSchema = z.object({
  senderId: z.number(),
  receiverId: z.number(),
  message: z.string().min(1),
});

// Type exports using Prisma generated types
export type User = PrismaUser;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
export type RegisterUser = z.infer<typeof registerUserSchema>;
export type Message = PrismaMessage;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
