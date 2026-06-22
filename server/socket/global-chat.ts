import type { Server as SocketIOServer, Socket } from "socket.io";
import { insertGlobalMessageSchema } from "@shared/schema";
import { storage } from "../storage";
import { SOCKET_CONFIG } from "./types";
import type { GlobalMessagePayload } from "./types";

export let lastGlobalChatCleanupAt = 0;
export let pendingGlobalChatCleanup: Promise<void> | null = null;

export async function handleGlobalMessage(
  socket: Socket,
  io: SocketIOServer,
  data: GlobalMessagePayload,
): Promise<void> {
  try {
    if (!socket.userId || !data.message) {
      return;
    }

    const validatedMessage = insertGlobalMessageSchema.parse({
      senderId: socket.userId,
      message: data.message,
    });

    const savedMessage = await storage.createGlobalMessage(validatedMessage);
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[Socket] Created global message: ${savedMessage.id} from user ${socket.userId}`,
      );
    }

    io.emit("global_message", { message: savedMessage });
    
    // Trigger cleanup asynchronously
    cleanupExpiredGlobalMessagesIfNeeded(io).catch(console.error);
  } catch (error) {
    console.error("Socket.IO global_message error:", error);
  }
}

export async function cleanupExpiredGlobalMessagesIfNeeded(
  io: SocketIOServer,
): Promise<void> {
  const now = Date.now();

  if (
    lastGlobalChatCleanupAt > 0 &&
    now - lastGlobalChatCleanupAt < 3600000 // 1 hour debounce
  ) {
    return;
  }

  if (pendingGlobalChatCleanup) {
    await pendingGlobalChatCleanup;
    return;
  }

  pendingGlobalChatCleanup = (async () => {
    try {
      const deletedMessageIds =
        await storage.cleanupExpiredGlobalMessages(100);

      lastGlobalChatCleanupAt = Date.now();

      if (deletedMessageIds.length > 0) {
        io.emit("global_messages_deleted", {
          messageIds: deletedMessageIds,
        });
      }
    } catch (error) {
      console.error("Error cleaning up expired global messages:", error);
    } finally {
      pendingGlobalChatCleanup = null;
    }
  })();

  await pendingGlobalChatCleanup;
}
