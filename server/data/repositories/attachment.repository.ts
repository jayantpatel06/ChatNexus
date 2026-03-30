import type { Attachment, InsertAttachment } from "@shared/schema";
import { prisma } from "../prisma/client";
import { getConversationId } from "./message.repository";

export const attachmentRepository = {
  async create(attachment: InsertAttachment): Promise<Attachment> {
    if (!prisma) throw new Error("Database not initialized");
    try {
      return await prisma.attachment.create({
        data: attachment,
      });
    } catch (error) {
      console.error("Error creating attachment:", error);
      throw error;
    }
  },

  async deleteById(id: number): Promise<void> {
    if (!prisma) return;
    try {
      await prisma.attachment.delete({
        where: { id },
      });
    } catch (error) {
      console.error("Error deleting attachment:", error);
    }
  },

  async getOlderThan(olderThan: Date): Promise<Attachment[]> {
    if (!prisma) return [];
    try {
      return await prisma.attachment.findMany({
        where: {
          createdAt: { lt: olderThan },
        },
      });
    } catch (error) {
      console.error("Error getting old attachments:", error);
      return [];
    }
  },

  async getByConversation(user1Id: number, user2Id: number): Promise<Attachment[]> {
    if (!prisma) return [];
    try {
      return await prisma.attachment.findMany({
        where: {
          message: {
            conversationId: getConversationId(user1Id, user2Id),
          },
        },
      });
    } catch (error) {
      console.error("Error getting conversation attachments:", error);
      return [];
    }
  },

  async getByMessageIds(messageIds: number[]): Promise<Attachment[]> {
    if (!prisma || messageIds.length === 0) return [];
    try {
      return await prisma.attachment.findMany({
        where: {
          messageId: { in: messageIds },
        },
      });
    } catch (error) {
      console.error("Error getting attachments by message IDs:", error);
      return [];
    }
  },

  async deleteByMessageIds(messageIds: number[]): Promise<void> {
    if (!prisma || messageIds.length === 0) return;
    try {
      await prisma.attachment.deleteMany({
        where: {
          messageId: { in: messageIds },
        },
      });
    } catch (error) {
      console.error("Error deleting attachments by message IDs:", error);
    }
  },
};
