import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import type { Message, User } from "@shared/schema";
import { useAuth } from "@/providers/auth-provider";
import { getStoredToken, readJsonResponse } from "@/lib/queryClient";

const SOCKET_TRANSPORTS = ["websocket"];
const SOCKET_RECONNECTION_DELAY_MS = 1000;
const SOCKET_RECONNECTION_DELAY_MAX_MS = 10000;
const SOCKET_TIMEOUT_MS = 20000;

function createSocketConnection(token: string) {
  return io(window.location.origin, {
    autoConnect: true,
    transports: SOCKET_TRANSPORTS,
    auth: {
      token,
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: SOCKET_RECONNECTION_DELAY_MS,
    reconnectionDelayMax: SOCKET_RECONNECTION_DELAY_MAX_MS,
    timeout: SOCKET_TIMEOUT_MS,
    upgrade: true,
  });
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  sidebarUsers: User[];
  onlineUsers: User[];
  sendMessage: (
    receiverId: number,
    message: string,
    attachment?: { url: string; filename: string; fileType: string },
    clientMessageId?: string,
    options?: { replyToId?: number | null },
  ) => boolean;
  startTyping: (receiverId: number) => void;
  stopTyping: (receiverId: number) => void;
  toggleReaction: (messageId: number, emoji: string) => boolean;
  deleteMessage: (messageId: number) => boolean;
  typingUsers: Set<number>;
  forceReconnect: () => void;
  refreshOnlineUsers: () => Promise<void>;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sidebarUsers, setSidebarUsers] = useState<User[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<number>>(new Set());
  const lastTypingStateRef = useRef<Record<number, boolean>>({});
  const [reconnectCounter, setReconnectCounter] = useState(0);
  const onlineUsers = useMemo(
    () => sidebarUsers.filter((sidebarUser) => sidebarUser.isOnline),
    [sidebarUsers],
  );

  useEffect(() => {
    if (!socket || !token) {
      return;
    }

    socket.auth = {
      token,
    };
  }, [socket, token]);

  const refreshOnlineUsers = useCallback(async () => {
    const storedToken = getStoredToken();
    if (!storedToken) return;

    const res = await fetch("/api/users/sidebar", {
      headers: {
        Authorization: `Bearer ${storedToken}`,
      },
    });

    if (!res.ok) return;

    const users = await readJsonResponse<User[]>(res);
    setSidebarUsers(users);
  }, []);

  useEffect(() => {
    if (!user?.userId || !token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setIsConnected(false);
      if (!user?.userId) {
        setSidebarUsers([]);
        setTypingUsers(new Set());
        lastTypingStateRef.current = {};
      }
      return;
    }

    if (socket && socket.connected) {
      return;
    }

    const socketIO = createSocketConnection(token);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !socketIO.connected) {
        console.log("App became visible, attempting to reconnect...");
        socketIO.connect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    socketIO.on("connect", () => {
      setIsConnected(true);
      lastTypingStateRef.current = {};
      console.log("Socket.IO connected");
      refreshOnlineUsers().catch((error) => {
        console.error("Failed to refresh online users:", error);
      });
    });

    socketIO.on("online_users_updated", (data) => {
      setSidebarUsers(data.users);
    });

    const typingTimeouts = new Map<number, NodeJS.Timeout>();

    socketIO.on("user_typing", (data) => {
      setTypingUsers((prev) => {
        const newSet = new Set(prev);
        if (data.isTyping) {
          newSet.add(data.userId);

          const existingTimeout = typingTimeouts.get(data.userId);
          if (existingTimeout) clearTimeout(existingTimeout);

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
      lastTypingStateRef.current = {};
      typingTimeouts.forEach((timeout) => clearTimeout(timeout));
      typingTimeouts.clear();
      console.log("Socket.IO disconnected:", reason);

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
  }, [user?.userId, reconnectCounter, refreshOnlineUsers]);

  const forceReconnect = () => {
    console.log("Forcing socket reconnection...");
    setReconnectCounter((c) => c + 1);
  };

  const sendMessage = (
    receiverId: number,
    message: string,
    attachment?: { url: string; filename: string; fileType: string },
    clientMessageId?: string,
    options?: { replyToId?: number | null },
  ) => {
    if (!socket || !socket.connected || !user) return false;

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
      replyToId: options?.replyToId ?? undefined,
    });

    return true;
  };

  const startTyping = (receiverId: number) => {
    if (socket && socket.connected) {
      if (lastTypingStateRef.current[receiverId] === true) return;
      lastTypingStateRef.current[receiverId] = true;
      socket.volatile.emit("typing_start", {
        receiverId,
      });
    }
  };

  const stopTyping = (receiverId: number) => {
    if (socket && socket.connected) {
      if (lastTypingStateRef.current[receiverId] === false) return;
      lastTypingStateRef.current[receiverId] = false;
      socket.emit("typing_stop", {
        receiverId,
      });
    }
  };

  const toggleReaction = (messageId: number, emoji: string): boolean => {
    if (!socket || !socket.connected) return false;
    socket.emit("toggle_reaction", { messageId, emoji });
    return true;
  };

  const deleteMessage = (messageId: number): boolean => {
    if (!socket || !socket.connected) return false;
    socket.emit("delete_message", { messageId });
    return true;
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        sidebarUsers,
        onlineUsers,
        sendMessage,
        startTyping,
        stopTyping,
        toggleReaction,
        deleteMessage,
        typingUsers,
        forceReconnect,
        refreshOnlineUsers,
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
