import type { Express, NextFunction, Request, Response } from "express";
import type { Server as SocketIOServer } from "socket.io";
import {
  messageReactionSchema,
  updateMessageSchema,
} from "@shared/schema";
import { jwtAuth } from "../middleware/jwt-auth";
import {
  cleanupExpiredGlobalMessagesIfNeeded,
  emitSidebarUsers,
} from "../socket";
import { storage } from "../storage";

function parseHistoryParams(params: { userId?: string }, query: any) {
  const otherUserId = parseInt(params.userId ?? "", 10);
  if (isNaN(otherUserId)) {
    return { error: "Invalid user ID" };
  }

  const limit = Math.min(parseInt((query.limit as string) ?? "40", 10) || 40, 100);
  const cursorParam = query.cursor as string | undefined;

  let cursor: { timestamp: string; msgId: number } | undefined;
  if (cursorParam) {
    const [tsStr, idStr] = cursorParam.split("_");
    const msgId = Number(idStr);
    if (!Number.isNaN(msgId) && tsStr) {
      cursor = { timestamp: new Date(Number(tsStr)).toISOString(), msgId };
    }
  }

  return { otherUserId, limit, cursor };
}

function parseGlobalMessagesLimit(query: any) {
  return Math.min(parseInt((query.limit as string) ?? "100", 10) || 100, 500);
}

function parseConversationTargetUserId(params: { userId?: string }) {
  const otherUserId = parseInt(params.userId ?? "", 10);
  if (isNaN(otherUserId)) {
    return { error: "Invalid user ID" as const };
  }

  return { otherUserId };
}

function parseMessageId(params: { messageId?: string }) {
  const messageId = parseInt(params.messageId ?? "", 10);
  if (isNaN(messageId) || messageId <= 0) {
    return { error: "Invalid message ID" as const };
  }

  return { messageId };
}

function parseConversationStatsUserIds(query: any) {
  const rawUserIds = typeof query.userIds === "string" ? query.userIds : "";

  if (!rawUserIds) {
    return { userIds: [] as number[] };
  }

  const parsedUserIds = rawUserIds
    .split(",")
    .map((value: string) => parseInt(value.trim(), 10))
    .filter((value: number) => Number.isInteger(value) && value > 0);

  const userIds = Array.from(new Set<number>(parsedUserIds)).slice(0, 100);

  if (userIds.length === 0) {
    return { error: "Invalid user IDs" as const };
  }

  return { userIds };
}

function emitConversationMessageUpdate(io: SocketIOServer, message: { senderId: number; receiverId: number }) {
  io.to(`user:${message.senderId}`)
    .to(`user:${message.receiverId}`)
    .emit("message_updated", { message });
}

async function getRecentMessagesController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.json(await storage.getRecentMessagesForUser(req.jwtUser!.userId));
  } catch (error) {
    console.error("Error fetching recent messages:", error);
    next(error);
  }
}

async function getConversationStatsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = parseConversationStatsUserIds(req.query);
    if ("error" in parsed) {
      return res.status(400).json({ message: parsed.error });
    }

    const stats = await storage.getConversationStats(req.jwtUser!.userId, parsed.userIds);
    res.json(Object.fromEntries(stats));
  } catch (error) {
    console.error("Error fetching conversation stats:", error);
    next(error);
  }
}

async function getMessageHistoryController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = parseHistoryParams(req.params, req.query);
    if ("error" in parsed) {
      return res.status(400).json({ message: parsed.error });
    }

    const { messages, nextCursor } = await storage.getMessagesBetweenUsersCursor(
      req.jwtUser!.userId,
      parsed.otherUserId,
      {
        limit: parsed.limit,
        cursor: parsed.cursor,
      },
    );

    res.json({
      messages,
      nextCursor: nextCursor
        ? `${new Date(nextCursor.timestamp).getTime()}_${nextCursor.msgId}`
        : null,
    });
  } catch (error) {
    console.error("Error fetching paginated messages:", error);
    next(error);
  }
}

async function getGlobalMessagesController(
  req: Request,
  res: Response,
  next: NextFunction,
  io: SocketIOServer,
) {
  try {
    await cleanupExpiredGlobalMessagesIfNeeded(io);
    const limit = parseGlobalMessagesLimit(req.query);
    const messages = await storage.getGlobalMessages(limit);
    console.log(`[API] Fetched ${messages.length} global messages (limit: ${limit})`);
    res.json(messages);
  } catch (error) {
    console.error("Error fetching global messages:", error);
    next(error);
  }
}

function createClearConversationController(io: SocketIOServer) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = parseConversationTargetUserId(req.params);
      if ("error" in parsed) {
        return res.status(400).json({ message: parsed.error });
      }

      const deletedMessages = await storage.clearConversation(
        req.jwtUser!.userId,
        parsed.otherUserId,
      );
      await emitSidebarUsers(io);
      res.json({ deletedMessages });
    } catch (error) {
      console.error("Error clearing conversation:", error);
      next(error);
    }
  };
}

function createClearConversationAttachmentsController(io: SocketIOServer) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = parseConversationTargetUserId(req.params);
      if ("error" in parsed) {
        return res.status(400).json({ message: parsed.error });
      }

      const deletedAttachments = await storage.clearConversationAttachments(
        req.jwtUser!.userId,
        parsed.otherUserId,
      );
      await emitSidebarUsers(io);
      res.json({ deletedAttachments });
    } catch (error) {
      console.error("Error clearing conversation attachments:", error);
      next(error);
    }
  };
}

function createEditMessageController(io: SocketIOServer) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsedMessageId = parseMessageId(req.params);
      if ("error" in parsedMessageId) {
        return res.status(400).json({ message: parsedMessageId.error });
      }

      const payload = updateMessageSchema.parse(req.body);
      const existingMessage = await storage.getConversationMessage(
        parsedMessageId.messageId,
        req.jwtUser!.userId,
      );

      if (!existingMessage) {
        return res.status(404).json({ message: "Message not found" });
      }

      if (existingMessage.senderId !== req.jwtUser!.userId) {
        return res
          .status(403)
          .json({ message: "You can only edit your own messages" });
      }

      if (existingMessage.deletedAt) {
        return res.status(400).json({ message: "Deleted messages cannot be edited" });
      }

      const updatedMessage = await storage.updateConversationMessage(
        parsedMessageId.messageId,
        payload.message,
      );
      if (!updatedMessage) {
        return res.status(500).json({ message: "Failed to update message" });
      }

      emitConversationMessageUpdate(io, updatedMessage);
      await emitSidebarUsers(io, [updatedMessage.senderId, updatedMessage.receiverId]);
      res.json({ message: updatedMessage });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input data" });
      }

      next(error);
    }
  };
}

function createDeleteMessageController(io: SocketIOServer) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsedMessageId = parseMessageId(req.params);
      if ("error" in parsedMessageId) {
        return res.status(400).json({ message: parsedMessageId.error });
      }

      const existingMessage = await storage.getConversationMessage(
        parsedMessageId.messageId,
        req.jwtUser!.userId,
      );
      if (!existingMessage) {
        return res.status(404).json({ message: "Message not found" });
      }

      if (existingMessage.senderId !== req.jwtUser!.userId) {
        return res
          .status(403)
          .json({ message: "You can only delete your own messages" });
      }

      const deletedMessage = await storage.deleteConversationMessage(
        parsedMessageId.messageId,
      );
      if (!deletedMessage) {
        return res.status(500).json({ message: "Failed to delete message" });
      }

      emitConversationMessageUpdate(io, deletedMessage);
      await emitSidebarUsers(io, [deletedMessage.senderId, deletedMessage.receiverId]);
      res.json({ message: deletedMessage });
    } catch (error) {
      next(error);
    }
  };
}

function createToggleMessageReactionController(io: SocketIOServer) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsedMessageId = parseMessageId(req.params);
      if ("error" in parsedMessageId) {
        return res.status(400).json({ message: parsedMessageId.error });
      }

      const payload = messageReactionSchema.parse(req.body);
      const existingMessage = await storage.getConversationMessage(
        parsedMessageId.messageId,
        req.jwtUser!.userId,
      );

      if (!existingMessage) {
        return res.status(404).json({ message: "Message not found" });
      }

      if (existingMessage.deletedAt) {
        return res
          .status(400)
          .json({ message: "Deleted messages cannot be reacted to" });
      }

      const updatedMessage = await storage.toggleConversationReaction(
        parsedMessageId.messageId,
        req.jwtUser!.userId,
        payload.emoji,
      );
      if (!updatedMessage) {
        return res.status(500).json({ message: "Failed to update reaction" });
      }

      emitConversationMessageUpdate(io, updatedMessage);
      res.json({ message: updatedMessage });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input data" });
      }

      next(error);
    }
  };
}

export function registerChatRoutes(app: Express, io: SocketIOServer) {
  app.get("/api/conversations/stats", jwtAuth, getConversationStatsController);
  app.get("/api/messages", jwtAuth, getRecentMessagesController);
  app.get("/api/messages/:userId/history", jwtAuth, getMessageHistoryController);
  app.put("/api/messages/:messageId", jwtAuth, createEditMessageController(io));
  app.delete(
    "/api/messages/item/:messageId",
    jwtAuth,
    createDeleteMessageController(io),
  );
  app.post(
    "/api/messages/:messageId/reactions",
    jwtAuth,
    createToggleMessageReactionController(io),
  );
  app.delete(
    "/api/messages/:userId",
    jwtAuth,
    createClearConversationController(io),
  );
  app.delete(
    "/api/messages/:userId/attachments",
    jwtAuth,
    createClearConversationAttachmentsController(io),
  );
  app.get("/api/global-messages", jwtAuth, (req, res, next) =>
    getGlobalMessagesController(req, res, next, io),
  );
}
