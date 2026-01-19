import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./use-auth";
import { User, Message } from "@shared/schema";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: User[];
  sendMessage: (
    receiverId: number,
    message: string,
    attachment?: { url: string; filename: string; fileType: string },
  ) => void;
  startTyping: (receiverId: number) => void;
  stopTyping: (receiverId: number) => void;
  typingUsers: Set<number>;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
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
      setTypingUsers(new Set());
      lastTypingStateRef.current = {};
      return;
    }

    const socketIO = io(window.location.origin, {
      withCredentials: true,
      autoConnect: true,
      // Prefer WebSocket transport to avoid long polling where possible
      transports: ["websocket"],
      auth: {
        token,
      },
      // Reconnection optimizations
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // Reduce ping interval for faster disconnect detection
      timeout: 10000,
    });

    socketIO.on("connect", () => {
      setIsConnected(true);
      console.log("Socket.IO connected");
    });

    socketIO.on("online_users_updated", (data) => {
      setOnlineUsers(data.users);
    });

    socketIO.on("user_typing", (data) => {
      setTypingUsers((prev) => {
        const newSet = new Set(prev);
        if (data.isTyping) {
          newSet.add(data.userId);
        } else {
          newSet.delete(data.userId);
        }
        return newSet;
      });
    });

    socketIO.on("disconnect", () => {
      setIsConnected(false);
      console.log("Socket.IO disconnected");
    });

    socketIO.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error);
      setIsConnected(false);
    });

    setSocket(socketIO);

    return () => {
      socketIO.disconnect();
    };
  }, [user?.userId]);

  const sendMessage = (
    receiverId: number,
    message: string,
    attachment?: { url: string; filename: string; fileType: string },
  ) => {
    if (!socket || !socket.connected || !user) return;

    const clientMessageId =
      globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    socket.emit("private_message", {
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
      // Use volatile for typing - OK to drop if network busy
      socket.volatile.emit("typing_start", {
        receiverId,
      });
    }
  };

  const stopTyping = (receiverId: number) => {
    if (socket && socket.connected) {
      if (lastTypingStateRef.current[receiverId] === false) return;
      lastTypingStateRef.current[receiverId] = false;
      // Use volatile for typing - OK to drop if network busy
      socket.volatile.emit("typing_stop", {
        receiverId,
      });
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        onlineUsers,
        sendMessage,
        startTyping,
        stopTyping,
        typingUsers,
      }}
    >
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
