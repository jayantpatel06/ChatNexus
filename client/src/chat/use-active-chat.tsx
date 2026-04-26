import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { Message, MessageReactionWithUser } from "@shared/schema";
import { stripConversationAttachments } from "@/chat/chat-message-utils";
import { useAuth } from "@/providers/auth-provider";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/providers/socket-provider";

interface ActiveChatContextType {
  activeUserId: number | null;
  setActiveUserId: (id: number | null) => void;
  liveMessages: Message[];
  addOptimisticMessage: (
    message: Message & { clientMessageId?: string },
  ) => void;
  confirmMessage: (clientMessageId: string, confirmedMessage: Message) => void;
  removeOptimisticMessage: (clientMessageId: string) => void;
  removeMessageById: (messageId: number) => void;
  replaceMessageLocally: (message: Message) => void;
  clearConversationMessages: () => void;
  clearConversationAttachments: () => void;
}

const ActiveChatContext = createContext<ActiveChatContextType | null>(null);
const CONVERSATION_STATS_QUERY_KEY = ["conversations-stats"] as const;
const HISTORY_USERS_QUERY_KEY = ["/api/users/history"] as const;

// Helper to update React Query cache for a conversation
function updateMessageCache(
  userId: number,
  otherUserId: number,
  message: Message,
) {
  const queryKey = ["/api/messages/history", otherUserId];

  queryClient.setQueryData<
    { pages: { messages: Message[]; nextCursor: string | null }[] } | undefined
  >(queryKey, (oldData) => {
    if (!oldData?.pages) return oldData;

    const newPages = [...oldData.pages];
    let messageUpdated = false;

    for (let pageIndex = 0; pageIndex < newPages.length; pageIndex += 1) {
      const page = newPages[pageIndex];
      const messageIndex = page.messages.findIndex(
        (m) => m.msgId === message.msgId,
      );

      if (messageIndex >= 0) {
        const nextMessages = [...page.messages];
        nextMessages[messageIndex] = message;
        newPages[pageIndex] = {
          ...page,
          messages: nextMessages,
        };
        messageUpdated = true;
      }
    }

    if (!messageUpdated && newPages.length > 0) {
      newPages[0] = {
        ...newPages[0],
        messages: [...newPages[0].messages, message].sort(
          (a, b) =>
            new Date(a.timestamp || 0).getTime() -
            new Date(b.timestamp || 0).getTime(),
        ),
      };
    }

    return { ...oldData, pages: newPages };
  });
}

function scheduleMessageCacheUpdate(
  userId: number,
  otherUserId: number,
  message: Message,
) {
  if (typeof window === "undefined") {
    updateMessageCache(userId, otherUserId, message);
    return;
  }

  window.requestAnimationFrame(() => {
    updateMessageCache(userId, otherUserId, message);
  });
}

function invalidateConversationStatsQueries() {
  void queryClient.invalidateQueries({
    queryKey: CONVERSATION_STATS_QUERY_KEY,
  });
}

function invalidateHistoryUsersQuery() {
  void queryClient.invalidateQueries({
    queryKey: HISTORY_USERS_QUERY_KEY,
  });
}

function replaceMessageInActiveCache(otherUserId: number, message: Message) {
  const queryKey = ["/api/messages/history", otherUserId];

  queryClient.setQueryData<
    { pages: { messages: Message[]; nextCursor: string | null }[] } | undefined
  >(queryKey, (oldData) => {
    if (!oldData?.pages) return oldData;

    let messageUpdated = false;
    const nextPages = oldData.pages.map((page) => {
      let pageUpdated = false;
      const nextMessages = page.messages.map((existingMessage) => {
        if (existingMessage.msgId !== message.msgId) {
          return existingMessage;
        }

        messageUpdated = true;
        pageUpdated = true;
        return message;
      });

      return pageUpdated
        ? {
            ...page,
            messages: nextMessages,
          }
        : page;
    });

    return messageUpdated ? { ...oldData, pages: nextPages } : oldData;
  });
}

function updateMessageReactionsInActiveCache(
  otherUserId: number,
  messageId: number,
  reactions: MessageReactionWithUser[],
) {
  const queryKey = ["/api/messages/history", otherUserId];

  queryClient.setQueryData<
    { pages: { messages: Message[]; nextCursor: string | null }[] } | undefined
  >(queryKey, (oldData) => {
    if (!oldData?.pages) return oldData;

    let messageUpdated = false;
    const nextPages = oldData.pages.map((page) => {
      let pageUpdated = false;
      const nextMessages = page.messages.map((message) => {
        if (message.msgId !== messageId) {
          return message;
        }

        messageUpdated = true;
        pageUpdated = true;
        return {
          ...message,
          reactions,
        };
      });

      return pageUpdated
        ? {
            ...page,
            messages: nextMessages,
          }
        : page;
    });

    return messageUpdated ? { ...oldData, pages: nextPages } : oldData;
  });
}

function removeMessageFromActiveCache(otherUserId: number, messageId: number) {
  const queryKey = ["/api/messages/history", otherUserId];

  queryClient.setQueryData<
    { pages: { messages: Message[]; nextCursor: string | null }[] } | undefined
  >(queryKey, (oldData) => {
    if (!oldData?.pages) return oldData;

    return {
      ...oldData,
      pages: oldData.pages.map((page) => ({
        ...page,
        messages: page.messages.filter((message) => message.msgId !== messageId),
      })),
    };
  });
}

export function ActiveChatProvider({ children }: { children: ReactNode }) {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);

  // Track optimistic messages by clientMessageId
  const optimisticMessagesRef = useRef<
    Map<string, Message & { clientMessageId?: string }>
  >(new Map());

  // Keep track of activeUserId in a ref for event handlers
  const activeUserIdRef = useRef(activeUserId);

  useEffect(() => {
    activeUserIdRef.current = activeUserId;
    // Clear live messages when switching chats
    setLiveMessages([]);
    optimisticMessagesRef.current.clear();
  }, [activeUserId]);

  // Add optimistic message (called when user sends)
  const addOptimisticMessage = useCallback(
    (message: Message & { clientMessageId?: string }) => {
      if (message.clientMessageId) {
        optimisticMessagesRef.current.set(message.clientMessageId, message);
      }
      setLiveMessages((prev) => {
        if (prev.some((m) => m.msgId === message.msgId)) return prev;
        return [...prev, message];
      });
    },
    [],
  );

  // Remove optimistic message (on error/cancel)
  const removeOptimisticMessage = useCallback((clientMessageId: string) => {
    const optimistic = optimisticMessagesRef.current.get(clientMessageId);
    if (optimistic) {
      optimisticMessagesRef.current.delete(clientMessageId);
      setLiveMessages((prev) =>
        prev.filter((m) => m.msgId !== optimistic.msgId),
      );
    }
  }, []);

  const clearConversationMessages = useCallback(() => {
    optimisticMessagesRef.current.clear();
    setLiveMessages([]);
  }, []);

  const clearConversationAttachments = useCallback(() => {
    optimisticMessagesRef.current.clear();
    setLiveMessages((prev) => stripConversationAttachments(prev));
  }, []);

  const replaceMessageLocally = useCallback((message: Message) => {
    setLiveMessages((prev) => {
      const existingMessageIndex = prev.findIndex(
        (existingMessage) => existingMessage.msgId === message.msgId,
      );
      if (existingMessageIndex >= 0) {
        const nextMessages = [...prev];
        nextMessages[existingMessageIndex] = message;
        return nextMessages;
      }

      return [...prev, message].sort(
        (left, right) =>
          new Date(left.timestamp || 0).getTime() -
          new Date(right.timestamp || 0).getTime(),
      );
    });

    const currentActiveUserId = activeUserIdRef.current;
    if (currentActiveUserId) {
      replaceMessageInActiveCache(currentActiveUserId, message);
    }
  }, []);

  // Remove a message by ID (for optimistic delete)
  const removeMessageById = useCallback((messageId: number) => {
    setLiveMessages((prev) => prev.filter((m) => m.msgId !== messageId));

    const currentActiveUserId = activeUserIdRef.current;
    if (currentActiveUserId) {
      removeMessageFromActiveCache(currentActiveUserId, messageId);
    }
  }, []);

  // Confirm optimistic message with real server data
  const confirmMessage = useCallback(
    (clientMessageId: string, confirmedMessage: Message) => {
      const optimistic = optimisticMessagesRef.current.get(clientMessageId);
      if (optimistic) {
        optimisticMessagesRef.current.delete(clientMessageId);

        // Replace optimistic message with confirmed one
        setLiveMessages((prev) => {
          const filtered = prev.filter((m) => m.msgId !== optimistic.msgId);
          if (filtered.some((m) => m.msgId === confirmedMessage.msgId))
            return filtered;
          return [...filtered, confirmedMessage];
        });

        // Update React Query cache so message persists across chat switches
        if (user) {
          const otherUserId =
            confirmedMessage.senderId === user.userId
              ? confirmedMessage.receiverId
              : confirmedMessage.senderId;
          scheduleMessageCacheUpdate(
            user.userId,
            otherUserId,
            confirmedMessage,
          );
          invalidateConversationStatsQueries();
          invalidateHistoryUsersQuery();
        }
      }
    },
    [user],
  );

  useEffect(() => {
    if (!socket || !isConnected || !user) return;

    // Handle new messages (receiver gets persisted message directly)
    const handleNewMessage = (data: { message: Message }) => {
      const msg = data.message;
      const currentActiveId = activeUserIdRef.current;

      // Only add to live state if it belongs to the active conversation
      const isRelevant =
        (msg.senderId === currentActiveId && msg.receiverId === user.userId) ||
        (msg.senderId === user.userId && msg.receiverId === currentActiveId);

      if (isRelevant) {
        setLiveMessages((prev) => {
          // Skip if same msgId already exists
          if (prev.some((m) => m.msgId === msg.msgId)) return prev;
          return [...prev, msg];
        });
      }

      const otherUserId =
        msg.senderId === user.userId ? msg.receiverId : msg.senderId;
      scheduleMessageCacheUpdate(user.userId, otherUserId, msg);
      invalidateConversationStatsQueries();
      invalidateHistoryUsersQuery();
    };

    // Acknowledge server received the message (sender's optimistic stays until confirmed)
    const handleMessageSent = (_data: { clientMessageId?: string }) => {
      // Just an acknowledgment - optimistic message stays until message_confirmed
    };

    const handleMessageUpdated = (data: { message: Message }) => {
      const msg = data.message;
      const currentActiveId = activeUserIdRef.current;

      const isRelevant =
        (msg.senderId === currentActiveId && msg.receiverId === user.userId) ||
        (msg.senderId === user.userId && msg.receiverId === currentActiveId);

      if (isRelevant) {
        setLiveMessages((prev) => {
          const existingMessageIndex = prev.findIndex(
            (m) => m.msgId === msg.msgId,
          );
          if (existingMessageIndex >= 0) {
            const nextMessages = [...prev];
            nextMessages[existingMessageIndex] = msg;
            return nextMessages;
          }

          return [...prev, msg];
        });
      }

      const otherUserId =
        msg.senderId === user.userId ? msg.receiverId : msg.senderId;
      scheduleMessageCacheUpdate(user.userId, otherUserId, msg);
      invalidateConversationStatsQueries();
      invalidateHistoryUsersQuery();
    };

    const handleMessageReactionsUpdated = (data: {
      messageId: number;
      senderId: number;
      receiverId: number;
      reactions: MessageReactionWithUser[];
    }) => {
      const currentActiveId = activeUserIdRef.current;

      const isRelevant =
        (data.senderId === currentActiveId && data.receiverId === user.userId) ||
        (data.senderId === user.userId && data.receiverId === currentActiveId);

      if (isRelevant) {
        setLiveMessages((prev) =>
          prev.map((message) =>
            message.msgId === data.messageId
              ? {
                  ...message,
                  reactions: data.reactions,
                }
              : message,
          ),
        );
      }

      const otherUserId =
        data.senderId === user.userId ? data.receiverId : data.senderId;
      updateMessageReactionsInActiveCache(
        otherUserId,
        data.messageId,
        data.reactions,
      );
      invalidateConversationStatsQueries();
    };

    const handleMessageSaveError = (data: {
      clientMessageId?: string;
      error?: string;
    }) => {
      if (data.clientMessageId) {
        removeOptimisticMessage(data.clientMessageId);
      }

      toast({
        title: "Message not sent",
        description: data.error ?? "Unable to send the message right now.",
        variant: "destructive",
      });
    };

    // Handle message_confirmed: replace sender's optimistic message with persisted one
    const handleMessageConfirmed = (data: {
      message: Message;
      clientMessageId?: string;
    }) => {
      const msg = data.message;
      const currentActiveId = activeUserIdRef.current;

      // Only relevant for sender (their optimistic needs replacing)
      const isRelevant =
        msg.senderId === user.userId && msg.receiverId === currentActiveId;

      if (!isRelevant) return;

      setLiveMessages((prev) => {
        // Remove sender's optimistic message
        let filtered = prev;
        if (data.clientMessageId) {
          const optimistic = optimisticMessagesRef.current.get(data.clientMessageId);
          if (optimistic) {
            optimisticMessagesRef.current.delete(data.clientMessageId);
            filtered = prev.filter((m) => m.msgId !== optimistic.msgId);
          }
        }

        // Add confirmed message if not already present
        if (filtered.some((m) => m.msgId === msg.msgId)) return filtered;
        return [...filtered, msg];
      });

      scheduleMessageCacheUpdate(user.userId, msg.receiverId, msg);
      invalidateConversationStatsQueries();
      invalidateHistoryUsersQuery();
    };

    // Handle message_deleted: completely remove message from UI
    const handleMessageDeleted = (data: {
      messageId: number;
      senderId: number;
      receiverId: number;
    }) => {
      const currentActiveId = activeUserIdRef.current;

      const isRelevant =
        (data.senderId === currentActiveId && data.receiverId === user.userId) ||
        (data.senderId === user.userId && data.receiverId === currentActiveId);

      if (isRelevant) {
        removeMessageById(data.messageId);
      }

      invalidateConversationStatsQueries();
      invalidateHistoryUsersQuery();
    };

    socket.on("new_message", handleNewMessage);
    socket.on("message_sent", handleMessageSent);
    socket.on("message_updated", handleMessageUpdated);
    socket.on("message_reactions_updated", handleMessageReactionsUpdated);
    socket.on("message_save_error", handleMessageSaveError);
    socket.on("message_confirmed", handleMessageConfirmed);
    socket.on("message_deleted", handleMessageDeleted);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("message_sent", handleMessageSent);
      socket.off("message_updated", handleMessageUpdated);
      socket.off("message_reactions_updated", handleMessageReactionsUpdated);
      socket.off("message_save_error", handleMessageSaveError);
      socket.off("message_confirmed", handleMessageConfirmed);
      socket.off("message_deleted", handleMessageDeleted);
    };
  }, [socket, isConnected, user, removeMessageById, removeOptimisticMessage, toast]);

  return (
    <ActiveChatContext.Provider
      value={{
        activeUserId,
        setActiveUserId,
        liveMessages,
        addOptimisticMessage,
        confirmMessage,
        removeOptimisticMessage,
        removeMessageById,
        replaceMessageLocally,
        clearConversationMessages,
        clearConversationAttachments,
      }}
    >
      {children}
    </ActiveChatContext.Provider>
  );
}

export function useActiveChat() {
  const context = useContext(ActiveChatContext);
  if (!context) {
    throw new Error("useActiveChat must be used within an ActiveChatProvider");
  }
  return context;
}
