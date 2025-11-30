import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
      return;
    }

    const socketIO = io(window.location.origin, {
      withCredentials: true,
      autoConnect: true,
    });

    socketIO.on('connect', () => {
      setIsConnected(true);
      console.log('Socket.IO connected');
    });

    socketIO.on('online_users_updated', (data) => {
      setOnlineUsers(data.users);
    });

    socketIO.on('new_message', (data) => {
      setMessages(prev => {
        // Check if message already exists to prevent duplicates
        const exists = prev.some(msg => msg.msgId === data.message.msgId);
        if (exists) {
          return prev;
        }
        return [...prev, data.message];
      });
    });

    socketIO.on('message_sent', (data) => {
      setMessages(prev => {
        // Check if message already exists to prevent duplicates
        const exists = prev.some(msg => msg.msgId === data.message.msgId);
        if (exists) {
          return prev;
        }
        return [...prev, data.message];
      });
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
      socketIO.disconnect();
    };
  }, [user?.userId]);

  const sendMessage = (receiverId: number, message: string, attachment?: { url: string, filename: string, fileType: string }) => {
    if (socket && socket.connected) {
      socket.emit('private_message', {
        receiverId,
        message,
        attachment
      });
    }
  };

  const startTyping = (receiverId: number) => {
    if (socket && socket.connected) {
      socket.emit('typing_start', {
        receiverId
      });
    }
  };

  const stopTyping = (receiverId: number) => {
    if (socket && socket.connected) {
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
