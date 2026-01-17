import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { Message } from "@shared/schema";
import { useSocket } from "./use-socket";
import { useAuth } from "./use-auth";

interface ActiveChatContextType {
  activeUserId: number | null;
  setActiveUserId: (id: number | null) => void;
  liveMessages: Message[];
}

const ActiveChatContext = createContext<ActiveChatContextType | null>(null);

export function ActiveChatProvider({ children }: { children: ReactNode }) {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  
  // Keep track of activeUserId in a ref for event handlers
  const activeUserIdRef = useRef(activeUserId);

  useEffect(() => {
    activeUserIdRef.current = activeUserId;
    // Clear live messages when switching chats
    // We rely on React Query to fetch history, so "live" is just what comes in *after* mount/switch
    setLiveMessages([]);
  }, [activeUserId]);

  useEffect(() => {
    if (!socket || !isConnected || !user) return;

    const handleNewMessage = (data: { message: Message }) => {
      const msg = data.message;
      const currentActiveId = activeUserIdRef.current;

      // Only add to live state if it belongs to the active conversation
      const isRelevant = 
        (msg.senderId === currentActiveId && msg.receiverId === user.userId) ||
        (msg.senderId === user.userId && msg.receiverId === currentActiveId);

      if (isRelevant) {
        setLiveMessages(prev => {
           // Dedup based on msgId
           if (prev.some(m => m.msgId === msg.msgId)) return prev;
           return [...prev, msg];
        });
      }
    };

    const handleMessageSent = (data: { message: Message, clientMessageId?: string }) => {
      const msg = data.message;
      const currentActiveId = activeUserIdRef.current;

      // Only add to live state if it belongs to the active conversation
      const isRelevant = 
        (msg.senderId === user.userId && msg.receiverId === currentActiveId);

      if (isRelevant) {
        setLiveMessages(prev => {
           // 1. Resolve optimistic updates (if we had them in this store - currently ChatArea handles optimistic, 
           // but we can just push the confirmed one and let ChatArea dedup/merge or we can handle it here).
           // Simpler: Just append. ChatArea de-dups against history. 
           // We do check for duplicates in liveMessages itself.
           if (prev.some(m => m.msgId === msg.msgId)) return prev;
           return [...prev, msg];
        });
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('message_sent', handleMessageSent);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_sent', handleMessageSent);
    };
  }, [socket, isConnected, user]);

  return (
    <ActiveChatContext.Provider value={{
      activeUserId,
      setActiveUserId,
      liveMessages
    }}>
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
