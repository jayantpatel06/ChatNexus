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
    clientMessageId?: string,
  ) => void;
  startTyping: (receiverId: number) => void;
  stopTyping: (receiverId: number) => void;
  typingUsers: Set<number>;
  forceReconnect: () => void;
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

  // Counter to force socket reconnection (incremented by forceReconnect)
  const [reconnectCounter, setReconnectCounter] = useState(0);

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

    // Don't connect if we don't have a token (JWT required)
    if (!token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setIsConnected(false);
      return;
    }

    const socketIO = io(window.location.origin, {
      autoConnect: true,
      // Prefer WebSocket transport to avoid long polling where possible
      transports: ["websocket"],
      auth: {
        token, // JWT token for authentication
      },
      // Reconnection optimizations for mobile (phone sleep/wake)
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep trying indefinitely
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000, // Max 10 seconds between retries
      // Reduce ping interval for faster disconnect detection
      timeout: 20000, // Increase timeout for slow network on wake
      // Allow transport fallback
      upgrade: true,
    });

    // Handle visibility change (phone screen on/off)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !socketIO.connected) {
        console.log("App became visible, attempting to reconnect...");
        socketIO.connect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    socketIO.on("connect", () => {
      setIsConnected(true);
      console.log("Socket.IO connected");
    });

    socketIO.on("online_users_updated", (data) => {
      setOnlineUsers(data.users);
    });

    // Track typing timeouts to auto-clear stale indicators
    const typingTimeouts = new Map<number, NodeJS.Timeout>();

    socketIO.on("user_typing", (data) => {
      setTypingUsers((prev) => {
        const newSet = new Set(prev);
        if (data.isTyping) {
          newSet.add(data.userId);

          // Clear any existing timeout for this user
          const existingTimeout = typingTimeouts.get(data.userId);
          if (existingTimeout) clearTimeout(existingTimeout);

          // Auto-clear typing indicator after 3 seconds (safety net)
          const timeout = setTimeout(() => {
            setTypingUsers((current) => {
              const updated = new Set(current);
              updated.delete(data.userId);
              return updated;
            });
            typingTimeouts.delete(data.userId);
          }, 3000);
          typingTimeouts.set(data.userId, timeout);
        } else {
          newSet.delete(data.userId);
          // Clear timeout when we receive explicit stop
          const existingTimeout = typingTimeouts.get(data.userId);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
            typingTimeouts.delete(data.userId);
          }
        }
        return newSet;
      });
    });

    socketIO.on("disconnect", (reason) => {
      setIsConnected(false);
      // Clear all typing timeouts on disconnect
      typingTimeouts.forEach((timeout) => clearTimeout(timeout));
      typingTimeouts.clear();
      console.log("Socket.IO disconnected:", reason);

      // If server disconnected us, try to reconnect
      if (reason === "io server disconnect") {
        socketIO.connect();
      }
    });

    socketIO.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error);
      setIsConnected(false);
    });

    setSocket(socketIO);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      socketIO.disconnect();
    };
  }, [user?.userId, token, reconnectCounter]); // Reconnect when token changes or forceReconnect is called

  // Function to force socket reconnection (e.g., after username change)
  const forceReconnect = () => {
    console.log("Forcing socket reconnection...");
    setReconnectCounter((c) => c + 1);
  };

  const sendMessage = (
    receiverId: number,
    message: string,
    attachment?: { url: string; filename: string; fileType: string },
    clientMessageId?: string,
  ) => {
    if (!socket || !socket.connected || !user) return;

    // Use provided clientMessageId or generate one
    const msgClientId =
      clientMessageId ??
      (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(16).slice(2)}`);

    socket.emit("private_message", {
      receiverId,
      message,
      attachment,
      clientMessageId: msgClientId,
    });
  };

  const startTyping = (receiverId: number) => {
    if (socket && socket.connected) {
      if (lastTypingStateRef.current[receiverId] === true) return;
      lastTypingStateRef.current[receiverId] = true;
      // Use volatile for typing_start - OK to drop if network busy
      socket.volatile.emit("typing_start", {
        receiverId,
      });
    }
  };

  const stopTyping = (receiverId: number) => {
    if (socket && socket.connected) {
      if (lastTypingStateRef.current[receiverId] === false) return;
      lastTypingStateRef.current[receiverId] = false;
      // Use reliable emit for typing_stop - must be delivered
      socket.emit("typing_stop", {
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
        forceReconnect,
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
