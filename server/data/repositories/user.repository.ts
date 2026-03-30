import type { InsertUser, User } from "@shared/schema";
import { prisma } from "../prisma/client";

export const userRepository = {
  async getById(id: number): Promise<User | undefined> {
    if (!prisma) return undefined;
    try {
      const user = await prisma.user.findUnique({
        where: { userId: id },
      });
      return user ?? undefined;
    } catch (error) {
      console.error("Error getting user:", error);
      return undefined;
    }
  },

  async getByUsername(username: string): Promise<User | undefined> {
    if (!prisma) return undefined;
    try {
      const user = await prisma.user.findFirst({
        where: { username },
      });
      return user ?? undefined;
    } catch (error) {
      console.error("Error getting user by username:", error);
      return undefined;
    }
  },

  async getByGmail(gmail: string): Promise<User | undefined> {
    if (!prisma) return undefined;
    try {
      const user = await prisma.user.findUnique({
        where: { gmail },
      });
      return user ?? undefined;
    } catch (error) {
      console.error("Error getting user by email:", error);
      return undefined;
    }
  },

  async create(insertUser: InsertUser): Promise<User> {
    if (!prisma) throw new Error("Database not initialized");
    try {
      return await prisma.user.create({
        data: insertUser,
      });
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  },

  async deleteById(id: number): Promise<void> {
    if (!prisma) return;
    try {
      await prisma.message.deleteMany({
        where: {
          OR: [{ senderId: id }, { receiverId: id }],
        },
      });

      await prisma.globalMessage.deleteMany({
        where: { senderId: id },
      });

      await prisma.user.delete({
        where: { userId: id },
      });
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  },

  async updateOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    if (!prisma) return;
    try {
      await prisma.user.update({
        where: { userId: id },
        data: { isOnline },
      });
    } catch (error) {
      console.error("Error updating user online status:", error);
    }
  },

  async updateUsername(id: number, username: string): Promise<User | undefined> {
    if (!prisma) return undefined;
    try {
      return await prisma.user.update({
        where: { userId: id },
        data: { username },
      });
    } catch (error) {
      console.error("Error updating username:", error);
      return undefined;
    }
  },

  async getOnlineUsers(): Promise<User[]> {
    if (!prisma) return [];
    try {
      return await prisma.user.findMany({
        where: { isOnline: true },
      });
    } catch (error) {
      console.error("Error getting online users:", error);
      return [];
    }
  },
};
