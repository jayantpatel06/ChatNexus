import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useRef,
  useCallback,
} from "react";
import { Message } from "@shared/schema";
import { useSocket } from "./use-socket";
import { useAuth } from "./use-auth";
import { queryClient } from "@/lib/queryClient";

interface ActiveChatContextType {
  activeUserId: number | null;
  setActiveUserId: (id: number | null) => void;
  liveMessages: Message[];
  addOptimisticMessage: (
    message: Message & { clientMessageId?: string },
  ) => void;
  confirmMessage: (clientMessageId: string, confirmedMessage: Message) => void;
  removeOptimisticMessage: (clientMessageId: string) => void;
}

const ActiveChatContext = createContext<ActiveChatContextType | null>(null);

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

    // Check if message already exists in any page
    const messageExists = oldData.pages.some((page) =>
      page.messages.some((m) => m.msgId === message.msgId),
    );

    if (messageExists) return oldData;

    // Add to first page (most recent messages)
    const newPages = [...oldData.pages];
    if (newPages.length > 0) {
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

export function ActiveChatProvider({ children }: { children: ReactNode }) {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();
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
          updateMessageCache(user.userId, otherUserId, confirmedMessage);
        }
      }
    },
    [user],
  );

  useEffect(() => {
    if (!socket || !isConnected || !user) return;

    const handleNewMessage = (data: { message: Message }) => {
      const msg = data.message;
      const currentActiveId = activeUserIdRef.current;

      // Update React Query cache for persistence
      const otherUserId =
        msg.senderId === user.userId ? msg.receiverId : msg.senderId;
      updateMessageCache(user.userId, otherUserId, msg);

      // Only add to live state if it belongs to the active conversation
      const isRelevant =
        (msg.senderId === currentActiveId && msg.receiverId === user.userId) ||
        (msg.senderId === user.userId && msg.receiverId === currentActiveId);

      if (isRelevant) {
        setLiveMessages((prev) => {
          if (prev.some((m) => m.msgId === msg.msgId)) return prev;
          return [...prev, msg];
        });
      }
    };

    const handleMessageSent = (data: {
      message: Message;
      clientMessageId?: string;
    }) => {
      const msg = data.message;
      const currentActiveId = activeUserIdRef.current;

      // Update React Query cache for persistence
      updateMessageCache(user.userId, msg.receiverId, msg);

      // Resolve optimistic update if clientMessageId provided
      if (data.clientMessageId) {
        const optimistic = optimisticMessagesRef.current.get(
          data.clientMessageId,
        );
        if (optimistic) {
          optimisticMessagesRef.current.delete(data.clientMessageId);
          setLiveMessages((prev) => {
            // Remove optimistic, add confirmed
            const filtered = prev.filter((m) => m.msgId !== optimistic.msgId);
            if (filtered.some((m) => m.msgId === msg.msgId)) return filtered;
            return [...filtered, msg];
          });
          return; // Already handled
        }
      }

      // Fallback: just add if relevant to active chat
      const isRelevant =
        msg.senderId === user.userId && msg.receiverId === currentActiveId;
      if (isRelevant) {
        setLiveMessages((prev) => {
          if (prev.some((m) => m.msgId === msg.msgId)) return prev;
          return [...prev, msg];
        });
      }
    };

    socket.on("new_message", handleNewMessage);
    socket.on("message_sent", handleMessageSent);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("message_sent", handleMessageSent);
    };
  }, [socket, isConnected, user]);

  return (
    <ActiveChatContext.Provider
      value={{
        activeUserId,
        setActiveUserId,
        liveMessages,
        addOptimisticMessage,
        confirmMessage,
        removeOptimisticMessage,
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
