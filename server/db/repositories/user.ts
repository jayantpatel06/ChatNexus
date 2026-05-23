import type { DbUser, InsertUser, User } from "@shared/schema";
import { prisma } from "../prisma";
import { publicUserSelect } from "../message";

export const userRepository = {
  async getById(id: number): Promise<DbUser | undefined> {
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

  async getByUsername(username: string): Promise<DbUser | undefined> {
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

  async getByGmail(gmail: string): Promise<DbUser | undefined> {
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

  async create(insertUser: InsertUser): Promise<DbUser> {
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

  async updateUsername(id: number, username: string): Promise<DbUser | undefined> {
    if (!prisma) return undefined;
    try {
      return await prisma.user.update({
        where: { userId: id },
        data: { username },
      });
    } catch (error) {
      console.error("Error updating username:", error);
      throw error;
    }
  },

  async updateProfile(
    id: number,
    profile: { username: string; age: number },
  ): Promise<DbUser | undefined> {
    if (!prisma) return undefined;
    try {
      return await prisma.user.update({
        where: { userId: id },
        data: {
          username: profile.username,
          age: profile.age,
        },
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      throw error;
    }
  },

  async getOnlineUsers(): Promise<User[]> {
    if (!prisma) return [];
    try {
      return await prisma.user.findMany({
        where: { isOnline: true },
        select: publicUserSelect,
      });
    } catch (error) {
      console.error("Error getting online users:", error);
      return [];
    }
  },

  async getByIds(ids: number[]): Promise<User[]> {
    if (!prisma || ids.length === 0) return [];
    try {
      return await prisma.user.findMany({
        where: {
          userId: { in: ids },
        },
        select: publicUserSelect,
      });
    } catch (error) {
      console.error("Error getting users by IDs:", error);
      return [];
    }
  },
};
