import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./use-auth";
import { User, Message } from "@shared/schema";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: User[];
  sendMessage: (receiverId: number, message: string, attachment?: { url: string, filename: string, fileType: string }) => void;
  startTyping: (receiverId: number) => void;
  stopTyping: (receiverId: number) => void;
  messages: Message[];
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  typingUsers: Set<number>;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<number>>(new Set());

  // Track last typing state per receiver to avoid redundant events
  const lastTypingStateRef = useRef<Record<number, boolean>>({});

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setIsConnected(false);
      setOnlineUsers([]);
      setMessages([]);
      setTypingUsers(new Set());
      lastTypingStateRef.current = {};
      return;
    }

    const socketIO = io(window.location.origin, {
      withCredentials: true,
      autoConnect: true,
      // Prefer WebSocket transport to avoid long polling where possible
      transports: ["websocket"],
    });

    // Micro-batching buffer for incoming messages
    let incomingBuffer: Message[] = [];
    let flushTimeout: any = null;

    const flushIncoming = () => {
      if (!incomingBuffer.length) return;
      const batch = incomingBuffer;
      incomingBuffer = [];
      flushTimeout = null;

      setMessages(prev => {
        if (!batch.length) return prev;
        const existingIds = new Set(prev.map(m => m.msgId));
        const deduped = batch.filter(m => !existingIds.has(m.msgId));
        return deduped.length ? [...prev, ...deduped] : prev;
      });
    };

    socketIO.on('connect', () => {
      setIsConnected(true);
      console.log('Socket.IO connected');
    });

    socketIO.on('online_users_updated', (data) => {
      setOnlineUsers(data.users);
    });

    socketIO.on('new_message', (data) => {
      incomingBuffer.push(data.message);
      if (!flushTimeout) {
        flushTimeout = setTimeout(flushIncoming, 5);
      }
    });

    socketIO.on('message_sent', (data) => {
      const { message, clientMessageId } = data as any;

      // First reconcile optimistic message, then batch final message if needed
      setMessages(prev => {
        // If we have an optimistic message with the same clientMessageId, replace it
        if (clientMessageId) {
          let replaced = false;
          const next = prev.map(m => {
            const mAny = m as any;
            if (mAny.clientMessageId && mAny.clientMessageId === clientMessageId) {
              replaced = true;
              return { ...message } as Message;
            }
            return m;
          });

          if (replaced) {
            return next;
          }
        }

        // Fallback: Check if message already exists to prevent duplicates
        const exists = prev.some(msg => msg.msgId === message.msgId);
        if (exists) {
          return prev;
        }
        return [...prev, message];
      });

      // Also push to buffer so any listeners relying purely on message list get consistent view
      incomingBuffer.push(message);
      if (!flushTimeout) {
        flushTimeout = setTimeout(flushIncoming, 5);
      }
    });

    socketIO.on('user_typing', (data) => {
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        if (data.isTyping) {
          newSet.add(data.userId);
        } else {
          newSet.delete(data.userId);
        }
        return newSet;
      });
    });

    socketIO.on('disconnect', () => {
      setIsConnected(false);
      console.log('Socket.IO disconnected');
    });

    socketIO.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
      setIsConnected(false);
    });

    setSocket(socketIO);

    return () => {
      if (flushTimeout) clearTimeout(flushTimeout);
      socketIO.disconnect();
    };
  }, [user?.userId]);

  const sendMessage = (receiverId: number, message: string, attachment?: { url: string, filename: string, fileType: string }) => {
    if (!socket || !socket.connected || !user) return;

    const clientMessageId = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
      ? globalThis.crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    // Optimistic local message so the UI updates instantly
    const optimistic = {
      msgId: -Date.now(),
      senderId: user.userId,
      receiverId,
      message: message || "Sent an attachment",
      timestamp: new Date(),
      clientMessageId,
      status: "pending",
    } as any as Message;

    setMessages(prev => [...prev, optimistic]);

    socket.emit('private_message', {
      receiverId,
      message,
      attachment,
      clientMessageId,
    });
  };

  const startTyping = (receiverId: number) => {
    if (socket && socket.connected) {
      if (lastTypingStateRef.current[receiverId] === true) return;
      lastTypingStateRef.current[receiverId] = true;
      socket.emit('typing_start', {
        receiverId
      });
    }
  };

  const stopTyping = (receiverId: number) => {
    if (socket && socket.connected) {
      if (lastTypingStateRef.current[receiverId] === false) return;
      lastTypingStateRef.current[receiverId] = false;
      socket.emit('typing_stop', {
        receiverId
      });
    }
  };

  const addMessage = (message: Message) => {
    setMessages(prev => [...prev, message]);
  };

  const clearMessages = () => {
    setMessages([]);
  };

  return (
    <SocketContext.Provider value={{
      socket,
      isConnected,
      onlineUsers,
      sendMessage,
      startTyping,
      stopTyping,
      messages,
      addMessage,
      clearMessages,
      typingUsers
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}
