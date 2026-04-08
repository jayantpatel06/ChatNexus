import { z } from "zod";
import type {
  GlobalMessage as PrismaGlobalMessage,
  Message as PrismaMessage,
  User as PrismaUser,
} from "@prisma/client";

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

export const guestLoginSchema = z.object({
  username: z.string().min(2).max(20),
  age: z.number().min(13).max(120),
  gender: z.enum(["Male", "Female", "Other"]),
});

export const registerUserSchema = z.object({
  gmail: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(1).max(50),
  age: z.number().min(13).max(120),
  gender: z.enum(["Male", "Female", "Other"]),
});

export const updateUserProfileSchema = z.object({
  username: z.string().trim().min(2).max(20),
  age: z.coerce.number().int().min(13).max(120),
});

export const publicUserSchema = z.object({
  userId: z.number().int().positive(),
  username: z.string().min(1).max(50),
  age: z.number().int().min(18).max(120).nullable(),
  gender: z.string().max(10).nullable(),
  isOnline: z.boolean(),
  isGuest: z.boolean(),
});

export const insertMessageSchema = z.object({
  senderId: z.number(),
  receiverId: z.number(),
  conversationId: z.string().optional(),
  replyToId: z.number().int().positive().optional(),
  message: z.string().min(1).max(5000),
});

export const updateMessageSchema = z.object({
  message: z.string().trim().min(1),
});

export const messageReactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
});

// Type exports using Prisma generated types
export type DbUser = PrismaUser;
export type PublicUser = Omit<PrismaUser, "gmail" | "passwordHash">;
export type User = PublicUser;
export type SelfUserProfile = User & { gmail: string | null };
export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
export type GuestLogin = z.infer<typeof guestLoginSchema>;
export type RegisterUser = z.infer<typeof registerUserSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
type MessageRecord = Omit<
  PrismaMessage,
  "replyToId" | "editedAt" | "deletedAt"
> & {
  replyToId: number | null;
  editedAt: Date | null;
  deletedAt: Date | null;
};
export type MessageReaction = {
  id: number;
  messageId: number;
  userId: number;
  emoji: string;
  createdAt: Date;
};
export type MessageReactionWithUser = MessageReaction & { user: User };
export type MessageReplyPreview = Pick<
  MessageRecord,
  "msgId" | "senderId" | "message" | "deletedAt"
> & {
  sender: User;
};
export type Message = MessageRecord & {
  attachments?: Attachment[];
  reactions?: MessageReactionWithUser[];
  replyTo?: MessageReplyPreview | null;
};
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type UpdateMessage = z.infer<typeof updateMessageSchema>;
export type MessageReactionInput = z.infer<typeof messageReactionSchema>;

export const insertAttachmentSchema = z.object({
  messageId: z.number(),
  url: z.string(),
  filename: z.string(),
  fileType: z.string(),
});

export type Attachment = {
  id: number;
  messageId: number;
  url: string;
  filename: string;
  fileType: string;
  createdAt: Date;
};

export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;

export const insertGlobalMessageSchema = z.object({
  senderId: z.number(),
  message: z.string().min(1).max(2000),
});

export type GlobalMessage = PrismaGlobalMessage;
export type GlobalMessageWithSender = GlobalMessage & { sender: User };
export type InsertGlobalMessage = z.infer<typeof insertGlobalMessageSchema>;

export type Friendship = {
  id: number;
  userId1: number;
  userId2: number;
  createdAt: Date;
};

export type FriendRequestStatus = "pending" | "accepted" | "rejected";

export type FriendRequest = {
  id: number;
  senderId: number;
  receiverId: number;
  status: FriendRequestStatus;
  createdAt: Date;
  respondedAt: Date | null;
};

export type UserBlock = {
  id: number;
  blockerId: number;
  blockedId: number;
  createdAt: Date;
};
