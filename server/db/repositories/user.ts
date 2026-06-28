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

  async updatePrivacy(
    userId: number,
    isPrivate: boolean,
  ): Promise<DbUser | undefined> {
    if (!prisma) return undefined;

    const updatedUser = await prisma.user.update({
      where: { userId },
      data: {
        isPrivate,
      },
    });

    return updatedUser ?? undefined;
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

  async updatePassword(id: number, passwordHash: string): Promise<DbUser | undefined> {
    if (!prisma) return undefined;
    try {
      return await prisma.user.update({
        where: { userId: id },
        data: { passwordHash },
      });
    } catch (error) {
      console.error("Error updating password:", error);
      throw error;
    }
  },

  async updateProfile(
    id: number,
    profile: { username: string; age: number; gender?: string },
  ): Promise<DbUser | undefined> {
    if (!prisma) return undefined;
    try {
      return await prisma.user.update({
        where: { userId: id },
        data: {
          username: profile.username,
          age: profile.age,
          gender: profile.gender,
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

  async deleteUser(id: number): Promise<{
    conversationPartnerIds: number[];
    attachments: Array<{ url: string }>;
  }> {
    if (!prisma) return { conversationPartnerIds: [], attachments: [] };

    const { messageRepository } = await import("../message");

    const [conversationPartnerIds, messages] = await Promise.all([
      messageRepository.getConversationPartners(id),
      prisma.message.findMany({
        where: {
          OR: [{ senderId: id }, { receiverId: id }],
        },
        select: {
          msgId: true,
          attachments: true,
        },
      }),
    ]);

    const messageIds = messages.map((message) => message.msgId);
    const attachments = messages.flatMap((message) => message.attachments);

    await prisma.$transaction(async (tx) => {
      if (messageIds.length > 0) {
        await tx.attachment.deleteMany({
          where: {
            messageId: { in: messageIds },
          },
        });
      }

      await tx.messageReaction.deleteMany({
        where:
          messageIds.length > 0
            ? {
                OR: [{ messageId: { in: messageIds } }, { userId: id }],
              }
            : { userId: id },
      });

      if (messageIds.length > 0) {
        await tx.message.deleteMany({
          where: {
            msgId: { in: messageIds },
          },
        });
      }

      await tx.globalMessage.deleteMany({
        where: { senderId: id },
      });

      await tx.friendRequest.deleteMany({
        where: {
          OR: [{ senderId: id }, { receiverId: id }],
        },
      });

      await tx.friendship.deleteMany({
        where: {
          OR: [{ userId1: id }, { userId2: id }],
        },
      });

      await tx.userBlock.deleteMany({
        where: {
          OR: [{ blockerId: id }, { blockedId: id }],
        },
      });

      await tx.user.deleteMany({
        where: { userId: id },
      });
    });

    return { conversationPartnerIds, attachments };
  },
};
