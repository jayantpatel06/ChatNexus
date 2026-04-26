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
import { apiRequest, readJsonResponse } from "@/lib/api-client";

const SOCKET_TRANSPORTS = ["websocket"];
const SOCKET_RECONNECTION_DELAY_MS = 1000;
const SOCKET_RECONNECTION_DELAY_MAX_MS = 10000;
const SOCKET_TIMEOUT_MS = 20000;
const IS_DEV = import.meta.env.DEV;

function logSocketDebug(message: string, detail?: unknown) {
  if (!IS_DEV) {
    return;
  }

  if (detail === undefined) {
    console.log(message);
    return;
  }

  console.log(message, detail);
}

function logSocketError(message: string, detail?: unknown) {
  if (!IS_DEV) {
    return;
  }

  if (detail === undefined) {
    console.error(message);
    return;
  }

  console.error(message, detail);
}

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
    try {
      const users = await readJsonResponse<User[]>(
        await apiRequest("GET", "/api/users/sidebar"),
      );
      setSidebarUsers(users);
    } catch (error) {
      logSocketError("Failed to refresh online users:", error);
    }
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

    // Track pending visibility state so it can be flushed on reconnect.
    // Without this, hiding the tab during a reconnect would leave the server
    // thinking the tab is visible → push notifications would be suppressed.
    let pendingHiddenState: boolean | null = null;

    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible";
      if (isVisible && !socketIO.connected) {
        logSocketDebug("App became visible, attempting to reconnect...");
        socketIO.connect();
      }

      if (socketIO.connected) {
        socketIO.emit("tab_visibility_changed", { hidden: !isVisible });
        pendingHiddenState = null;
      } else {
        // Socket is reconnecting — queue the state for when it connects
        pendingHiddenState = !isVisible;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "chatnexus:mark-read") {
        const senderId = event.data.senderId;
        if (senderId && socketIO.connected) {
          socketIO.emit("mark_read_from_notification", { senderId });
        }
      }
    };
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

    socketIO.on("connect", () => {
      setIsConnected(true);
      lastTypingStateRef.current = {};
      logSocketDebug("Socket.IO connected");

      // Emit the most recent visibility state. If a visibilitychange fired
      // while we were disconnected, flush that queued value; otherwise report
      // the current document state.
      const hiddenToEmit = pendingHiddenState ?? document.visibilityState !== "visible";
      socketIO.emit("tab_visibility_changed", { hidden: hiddenToEmit });
      pendingHiddenState = null;

      void refreshOnlineUsers();
    });

    socketIO.on("online_users_updated", (data) => {
      setSidebarUsers(data.users);
    });

    socketIO.on("missed_messages_summary", (data) => {
      if (data?.conversations?.length > 0) {
        // Invalidate state to fetch the new unread counts
        void refreshOnlineUsers();
      }
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
      logSocketDebug("Socket.IO disconnected:", reason);

      if (reason === "io server disconnect") {
        socketIO.connect();
      }
    });

    socketIO.on("connect_error", (error) => {
      logSocketError("Socket.IO connection error:", error);
      setIsConnected(false);
    });

    setSocket(socketIO);

    return () => {
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      socketIO.disconnect();
    };
  }, [user?.userId, reconnectCounter, refreshOnlineUsers]);

  const forceReconnect = () => {
    logSocketDebug("Forcing socket reconnection...");
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
