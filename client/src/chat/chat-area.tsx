import { memo, useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { getStoredToken } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { User, Message, FriendRequest } from "@shared/schema";
import {
  Heart,
  Phone,
  Video,
  MoreVertical,
  Paperclip,
  Smile,
  Send,
  ArrowLeft,
  Expand,
  Loader2,
  Clock,
  Handshake,
  Search,
  TrendingUp,
  UserPlus,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { NewMessageIndicator } from "./new-message-indicator";
import { useIsMobile } from "@/hooks/use-mobile";
import { useActiveChat } from "./use-active-chat";
import { useSocket } from "@/providers/socket-provider";
import { cn, getUserInitials, getAvatarColor } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AnimatePresence, motion } from "framer-motion";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";
import { getStoredTheme } from "@/lib/theme";
import EmojiPicker, {
  EmojiClickData,
  Theme as EmojiPickerTheme,
} from "emoji-picker-react";

const getMessageHistoryQueryKey = (userId: number) =>
  ["/api/messages/history", userId] as const;

const TENOR_API_KEY = "AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ";
const TENOR_BASE_URL = "https://tenor.googleapis.com/v2";
const TENOR_CLIENT_KEY = "chatnexus";
const TENOR_MEDIA_URL_PATTERN = /^https?:\/\/media\.tenor\.com\//i;
const IMAGE_MEDIA_URL_PATTERN = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
const VIDEO_MEDIA_URL_PATTERN = /\.(mp4|webm)(\?.*)?$/i;

function isImageMessageUrl(url: string): boolean {
  return IMAGE_MEDIA_URL_PATTERN.test(url) || TENOR_MEDIA_URL_PATTERN.test(url);
}

function isVideoMessageUrl(url: string): boolean {
  return VIDEO_MEDIA_URL_PATTERN.test(url);
}

function getStandaloneMediaMessageUrl(content: string): string | null {
  const normalizedContent = content.trim();

  if (!normalizedContent || !/^https?:\/\/[^\s]+$/i.test(normalizedContent)) {
    return null;
  }

  return isImageMessageUrl(normalizedContent) || isVideoMessageUrl(normalizedContent)
    ? normalizedContent
    : null;
}

// Optimistic message type for instant UI feedback
interface OptimisticMessage extends Message {
  isOptimistic?: boolean;
  isSending?: boolean;
  clientMessageId?: string;
}

// Pending attachment type for upload previews
interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: "uploading" | "sending" | "error";
}

type MessageWithAttachments = Message & {
  attachments?: Array<{
    id: number;
    url: string;
    filename: string;
    fileType: string;
  }>;
};

type FriendRequestRecord = FriendRequest & {
  createdAt: Date | string;
  respondedAt: Date | string | null;
};

type FriendshipStatusResponse = {
  isFriend: boolean;
  friendship: unknown | null;
  pendingRequest: FriendRequestRecord | null;
  pendingDirection: "incoming" | "outgoing" | null;
};

type ChatAttachment = NonNullable<MessageWithAttachments["attachments"]>[number];

type ImagePreviewState = {
  url: string;
};

function stripConversationAttachments(messages: Message[]): Message[] {
  return messages.flatMap((message) => {
    const withAttachments = message as MessageWithAttachments;
    const attachments = withAttachments.attachments ?? [];

    if (attachments.length === 0) {
      return [message];
    }

    if (!message.message || message.message === "Sent an attachment") {
      return [];
    }

    return [
      {
        ...withAttachments,
        attachments: [],
      } as Message,
    ];
  });
}

interface ChatAreaProps {
  selectedUser: User | null;
  onBack?: () => void;
  showBackButton?: boolean;
}

export function ChatArea({
  selectedUser,
  onBack,
  showBackButton = false,
}: ChatAreaProps) {
  // Dark/light mode state
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return (
        (getStoredTheme() ??
          (document.documentElement.classList.contains("dark")
            ? "dark"
            : "light")) === "dark"
      );
    }
    return false;
  });
  const { user } = useAuth();
  const {
    socket,
    isConnected,
    sendMessage,
    startTyping,
    stopTyping,
    typingUsers,
    onlineUsers,
    forceReconnect,
    refreshOnlineUsers,
  } =
    useSocket();
  const {
    liveMessages,
    addOptimisticMessage,
    removeOptimisticMessage,
    clearConversationMessages,
    clearConversationAttachments,
  } = useActiveChat();
  const isMobile = useIsMobile();
  const [messageText, setMessageText] = useState("");
  const isTypingRef = useRef(false);
  const lastGifSendRef = useRef<{
    receiverId: number;
    url: string;
    timestamp: number;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const lastTypingUserIdRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Track scroll position for loading older messages
  const isLoadingOlderRef = useRef(false);
  const previousScrollHeightRef = useRef(0);

  // Instagram-style scroll tracking
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false);
  const userSentMessageRef = useRef(false); // Track if user just sent a message

  // Pending attachments for upload preview
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [confirmDialogAction, setConfirmDialogAction] = useState<
    "chat" | "attachments" | null
  >(null);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(
    null,
  );

  // Fetch message history when user is selected (cursor-based) with caching
  const {
    data: pagedMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<{ messages: Message[]; nextCursor: string | null }>({
    queryKey: ["/api/messages/history", selectedUser?.userId],
    enabled: !!selectedUser?.userId,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam }) => {
      if (!selectedUser?.userId) {
        return { messages: [], nextCursor: null };
      }
      const token = getStoredToken();
      const cursorParam = pageParam ? `&cursor=${pageParam}` : "";
      const res = await fetch(
        `/api/messages/${selectedUser.userId}/history?limit=40${cursorParam}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!res.ok) {
        throw new Error("Failed to fetch messages");
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncTheme = () => {
      setIsDark(
        ((getStoredTheme() ??
          (document.documentElement.classList.contains("dark")
            ? "dark"
            : "light")) === "dark"),
      );
    };

    syncTheme();
    window.addEventListener("focus", syncTheme);
    window.addEventListener("chatnexus-theme-change", syncTheme);
    return () => {
      window.removeEventListener("focus", syncTheme);
      window.removeEventListener("chatnexus-theme-change", syncTheme);
    };
  }, []);

  const friendshipStatusQuery = useQuery({
    queryKey: ["friendship-status", selectedUser?.userId],
    enabled: !!selectedUser?.userId && !!user && !selectedUser.isGuest && !user.isGuest,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/users/${selectedUser!.userId}/friendship`,
      );
      return readJsonResponse<FriendshipStatusResponse>(res);
    },
    staleTime: 15_000,
  });

  const addFriendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) {
        throw new Error("No user selected");
      }

      const res = await apiRequest(
        "POST",
        `/api/users/${selectedUser.userId}/friendship`,
      );
      return readJsonResponse<FriendshipStatusResponse>(res);
    },
    onSuccess: (data) => {
      if (!selectedUser) return;

      queryClient.setQueryData(["friendship-status", selectedUser.userId], data);
      void refreshOnlineUsers();
      toast({
        title: "Friend request sent",
        description: `Waiting for ${selectedUser.username} to respond.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to send friend request",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const respondToFriendRequestMutation = useMutation({
    mutationFn: async ({
      requestId,
      action,
    }: {
      requestId: number;
      action: "accept" | "reject";
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/friend-requests/${requestId}/respond`,
        { action },
      );
      return readJsonResponse<{
        action: "accept" | "reject";
        request: FriendRequestRecord;
        friendshipStatus: FriendshipStatusResponse;
      }>(res);
    },
    onSuccess: (data) => {
      if (!selectedUser) return;

      queryClient.setQueryData(
        ["friendship-status", selectedUser.userId],
        data.friendshipStatus,
      );
      void refreshOnlineUsers();
      toast({
        title:
          data.action === "accept"
            ? "Friend request accepted"
            : "Friend request rejected",
        description:
          data.action === "accept"
            ? `You are now friends with ${selectedUser.username}.`
            : `You rejected ${selectedUser.username}'s friend request.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update friend request",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearChatMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) {
        throw new Error("No user selected");
      }

      const res = await apiRequest("DELETE", `/api/messages/${selectedUser.userId}`);
      return readJsonResponse<{ deletedMessages: number }>(res);
    },
    onSuccess: (data) => {
      if (!selectedUser) return;

      clearConversationMessages();
      queryClient.setQueryData(getMessageHistoryQueryKey(selectedUser.userId), {
        pages: [{ messages: [], nextCursor: null }],
        pageParams: [null],
      });
      void refreshOnlineUsers();
      toast({
        title: "Chat cleared",
        description:
          data.deletedMessages > 0
            ? `Deleted ${data.deletedMessages} message${data.deletedMessages === 1 ? "" : "s"} for both users.`
            : "There were no messages to delete.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to clear chat",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearAttachmentsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) {
        throw new Error("No user selected");
      }

      const res = await apiRequest(
        "DELETE",
        `/api/messages/${selectedUser.userId}/attachments`,
      );
      return readJsonResponse<{ deletedAttachments: number }>(res);
    },
    onSuccess: (data) => {
      if (!selectedUser) return;

      clearConversationAttachments();
      queryClient.setQueryData<any>(
        getMessageHistoryQueryKey(selectedUser.userId),
        (oldData: any) => {
          if (!oldData?.pages) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              messages: stripConversationAttachments(page.messages ?? []),
            })),
          };
        },
      );
      void refreshOnlineUsers();
      toast({
        title: "Attachments cleared",
        description:
          data.deletedAttachments > 0
            ? `Deleted ${data.deletedAttachments} attachment${data.deletedAttachments === 1 ? "" : "s"} for both users.`
            : "There were no attachments to delete.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to clear attachments",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!socket || !user || !selectedUser) return;

    const handleFriendRequestUpdated = (data: {
      requestId: number;
      senderId: number;
      receiverId: number;
      status: "pending" | "accepted" | "rejected";
      senderStatus: FriendshipStatusResponse;
      receiverStatus: FriendshipStatusResponse;
    }) => {
      const isRelevantConversation =
        (data.senderId === user.userId && data.receiverId === selectedUser.userId) ||
        (data.senderId === selectedUser.userId && data.receiverId === user.userId);

      if (!isRelevantConversation) {
        return;
      }

      const nextStatus =
        data.senderId === user.userId ? data.senderStatus : data.receiverStatus;
      queryClient.setQueryData(["friendship-status", selectedUser.userId], nextStatus);
      void refreshOnlineUsers();

      if (data.senderId === user.userId && data.status === "accepted") {
        toast({
          title: "Friend request accepted",
          description: `${selectedUser.username} accepted your friend request.`,
        });
      }

      if (data.senderId === user.userId && data.status === "rejected") {
        toast({
          title: "Friend request rejected",
          description: `${selectedUser.username} rejected your friend request.`,
          variant: "destructive",
        });
      }
    };

    socket.on("friend_request_updated", handleFriendRequestUpdated);

    return () => {
      socket.off("friend_request_updated", handleFriendRequestUpdated);
    };
  }, [socket, user, selectedUser, toast, refreshOnlineUsers]);

  // Sort history once (ascending) when pages change
  const historyAsc: Message[] = useMemo(() => {
    const flat = pagedMessages?.pages.flatMap((p) => p.messages) ?? [];
    return [...flat].sort(
      (a, b) =>
        new Date(a.timestamp || 0).getTime() -
        new Date(b.timestamp || 0).getTime(),
    );
  }, [pagedMessages]);

  // Live messages from ActiveChatContext (includes optimistic messages)
  const liveMessagesForConv: Message[] = liveMessages;

  // Combine history and live messages with deduplication using Map
  // Live messages include both confirmed server messages and optimistic messages
  const combinedMessages: OptimisticMessage[] = useMemo(() => {
    const messageMap = new Map<number | string, OptimisticMessage>();

    // Add history messages (from React Query cache)
    historyAsc.forEach((msg) => {
      messageMap.set(msg.msgId, msg);
    });

    // Add live messages (real-time + optimistic, may override history duplicates)
    liveMessagesForConv.forEach((msg) => {
      // For optimistic messages with negative IDs, use clientMessageId as key
      const key =
        msg.msgId < 0 && (msg as OptimisticMessage).clientMessageId
          ? (msg as OptimisticMessage).clientMessageId!
          : msg.msgId;
      messageMap.set(key, msg as OptimisticMessage);
    });

    // Sort by timestamp
    return Array.from(messageMap.values()).sort(
      (a, b) =>
        new Date(a.timestamp || 0).getTime() -
        new Date(b.timestamp || 0).getTime(),
    );
  }, [historyAsc, liveMessagesForConv]);

  // Windowing: only render the last N messages to keep DOM light for huge histories
  const MESSAGE_WINDOW_SIZE = 200;
  const displayedMessages: OptimisticMessage[] = useMemo(() => {
    if (combinedMessages.length <= MESSAGE_WINDOW_SIZE) return combinedMessages;
    return combinedMessages.slice(
      combinedMessages.length - MESSAGE_WINDOW_SIZE,
    );
  }, [combinedMessages]);

  const pendingFriendRequest = friendshipStatusQuery.data?.pendingRequest ?? null;
  const pendingFriendRequestDirection =
    friendshipStatusQuery.data?.pendingDirection ?? null;

  const timelineItems = useMemo(() => {
    const items: Array<
      | { type: "message"; timestamp: number; message: OptimisticMessage }
      | {
          type: "friendRequest";
          timestamp: number;
          request: FriendRequestRecord;
          direction: "incoming" | "outgoing";
        }
    > = displayedMessages.map((message) => ({
      type: "message",
      timestamp: new Date(message.timestamp || 0).getTime(),
      message,
    }));

    if (pendingFriendRequest && pendingFriendRequestDirection) {
      items.push({
        type: "friendRequest",
        timestamp: new Date(pendingFriendRequest.createdAt).getTime(),
        request: pendingFriendRequest,
        direction: pendingFriendRequestDirection,
      });
    }

    return items.sort((a, b) => a.timestamp - b.timestamp);
  }, [displayedMessages, pendingFriendRequest, pendingFriendRequestDirection]);

  // Smart scroll - only scroll to bottom for new messages, not when loading history
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setShowNewMessageIndicator(false);
    setIsAtBottom(true);
  }, []);

  // Track scroll position to determine if user is at bottom (Instagram-style)
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Consider "at bottom" if within 150px of the bottom
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom < 150;

    setIsAtBottom(atBottom);

    // Hide new message indicator when user scrolls to bottom
    if (atBottom) {
      setShowNewMessageIndicator(false);
    }
  }, []);

  // Preserve scroll position when loading older messages
  const handleLoadOlderMessages = useCallback(async () => {
    if (!messagesContainerRef.current || isFetchingNextPage) return;

    isLoadingOlderRef.current = true;
    previousScrollHeightRef.current = messagesContainerRef.current.scrollHeight;

    await fetchNextPage();
  }, [fetchNextPage, isFetchingNextPage]);

  // Restore scroll position after loading older messages
  useEffect(() => {
    if (
      isLoadingOlderRef.current &&
      messagesContainerRef.current &&
      !isFetchingNextPage
    ) {
      const newScrollHeight = messagesContainerRef.current.scrollHeight;
      const scrollDiff = newScrollHeight - previousScrollHeightRef.current;
      messagesContainerRef.current.scrollTop = scrollDiff;
      isLoadingOlderRef.current = false;
    }
  }, [pagedMessages, isFetchingNextPage]);

  // Instagram-style scroll behavior for new messages
  const prevMessageCountRef = useRef(0);
  const prevLastMessageIdRef = useRef<number | null>(null);

  useEffect(() => {
    const currentCount = displayedMessages.length;
    const prevCount = prevMessageCountRef.current;
    const lastMessage = displayedMessages[displayedMessages.length - 1];
    const lastMessageId = lastMessage?.msgId ?? null;
    const prevLastMessageId = prevLastMessageIdRef.current;

    // Detect if this is a new message (not just initial load or history load)
    const isNewMessage =
      currentCount > prevCount &&
      !isLoadingOlderRef.current &&
      lastMessageId !== prevLastMessageId;

    if (prevCount === 0 && currentCount > 0) {
      // Initial load or first message in new chat - scroll to bottom after DOM updates
      // Use requestAnimationFrame + setTimeout to ensure DOM has painted
      requestAnimationFrame(() => {
        setTimeout(() => {
          scrollToBottom("auto");
        }, 50);
      });
    } else if (isNewMessage) {
      // New message received or sent
      const isOwnMessage = lastMessage?.senderId === user?.userId;

      if (userSentMessageRef.current || isOwnMessage) {
        // User sent a message - always scroll to bottom (Instagram behavior)
        // Use slight delay to ensure message is rendered
        requestAnimationFrame(() => {
          scrollToBottom("smooth");
        });
        userSentMessageRef.current = false;
      } else if (isAtBottom) {
        // Received message while at bottom - auto scroll smoothly
        scrollToBottom("smooth");
      } else {
        // Received message while scrolled up - show indicator (Instagram behavior)
        setShowNewMessageIndicator(true);
      }
    }

    prevMessageCountRef.current = currentCount;
    prevLastMessageIdRef.current = lastMessageId;
  }, [displayedMessages, scrollToBottom, isAtBottom, user?.userId]);

  // Auto-scroll when typing indicator appears (so user can see it)
  useEffect(() => {
    if (selectedUser && typingUsers.has(selectedUser.userId) && isAtBottom) {
      scrollToBottom("smooth");
    }
  }, [typingUsers, selectedUser, isAtBottom, scrollToBottom]);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessageText((prev) => prev + emojiData.emoji);
    // Keep picker open for multiple emojis
  };

  const setLocalTypingState = useCallback((typing: boolean) => {
    isTypingRef.current = typing;
  }, []);

  const clearTypingTimeout = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = undefined;
    }
  }, []);

  const stopLocalTyping = useCallback(
    (userId: number | null | undefined) => {
      clearTypingTimeout();

      if (userId && isTypingRef.current) {
        stopTyping(userId);
      }

      setLocalTypingState(false);
    },
    [clearTypingTimeout, setLocalTypingState, stopTyping],
  );

  useEffect(() => {
    const previousUserId = lastTypingUserIdRef.current;
    const nextUserId = selectedUser?.userId ?? null;

    if (previousUserId && previousUserId !== nextUserId) {
      stopLocalTyping(previousUserId);
    }

    lastTypingUserIdRef.current = nextUserId;
  }, [selectedUser?.userId, stopLocalTyping]);

  useEffect(() => {
    if (isConnected) {
      return;
    }

    stopLocalTyping(lastTypingUserIdRef.current);
  }, [isConnected, stopLocalTyping]);

  useEffect(() => {
    return () => {
      clearTypingTimeout();

      if (lastTypingUserIdRef.current && isTypingRef.current) {
        stopTyping(lastTypingUserIdRef.current);
      }
    };
  }, [clearTypingTimeout, stopTyping]);

  const handleSendUnavailable = useCallback(
    (description: string) => {
      forceReconnect();
      toast({
        title: "Message not sent",
        description,
        variant: "destructive",
      });
    },
    [forceReconnect, toast],
  );

  const canSendPrivateMessage = useCallback(() => {
    if (socket?.connected && isConnected && user) {
      return true;
    }

    handleSendUnavailable("Reconnect and try again.");
    return false;
  }, [socket, isConnected, user, handleSendUnavailable]);

  // Generate unique client-side ID for optimistic updates
  const generateClientMessageId = useCallback(() => {
    return globalThis.crypto &&
      typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }, []);

  const sendGifMessage = useCallback(
    (gifUrl: string) => {
      const normalizedGifUrl = gifUrl.trim();
      if (!selectedUser || !user || !normalizedGifUrl) {
        return false;
      }

      if (!canSendPrivateMessage()) {
        return false;
      }

      const lastGifSend = lastGifSendRef.current;
      const isDuplicateGifSelection =
        lastGifSend?.receiverId === selectedUser.userId &&
        lastGifSend.url === normalizedGifUrl &&
        Date.now() - lastGifSend.timestamp < 1200;

      if (isDuplicateGifSelection) {
        return false;
      }

      lastGifSendRef.current = {
        receiverId: selectedUser.userId,
        url: normalizedGifUrl,
        timestamp: Date.now(),
      };

      const clientMessageId = generateClientMessageId();
      const optimisticMessage: OptimisticMessage = {
        msgId: -Date.now(),
        senderId: user.userId,
        receiverId: selectedUser.userId,
        conversationId: null,
        message: normalizedGifUrl,
        timestamp: new Date(),
        isOptimistic: true,
        isSending: true,
        clientMessageId,
      };

      addOptimisticMessage(optimisticMessage);
      userSentMessageRef.current = true;
      const didSend = sendMessage(
        selectedUser.userId,
        normalizedGifUrl,
        undefined,
        clientMessageId,
      );
      if (!didSend) {
        removeOptimisticMessage(clientMessageId);
        userSentMessageRef.current = false;
        handleSendUnavailable("GIF not sent. Reconnect and try again.");
        return false;
      }

      setShowGifPicker(false);
      return true;
    },
    [
      selectedUser,
      user,
      canSendPrivateMessage,
      generateClientMessageId,
      addOptimisticMessage,
      sendMessage,
      removeOptimisticMessage,
      handleSendUnavailable,
    ],
  );

  const handleSendMessage = useCallback(() => {
    if (!selectedUser || !messageText.trim() || !user) return;

    if (!canSendPrivateMessage()) {
      return;
    }

    const clientMessageId = generateClientMessageId();
    const trimmedMessage = messageText.trim();

    // Create optimistic message for instant UI feedback (Instagram-style)
    const optimisticMessage: OptimisticMessage = {
      msgId: -Date.now(), // Negative temp ID to avoid collision with real IDs
      senderId: user.userId,
      receiverId: selectedUser.userId,
      conversationId: null,
      message: trimmedMessage,
      timestamp: new Date(),
      isOptimistic: true,
      isSending: true,
      clientMessageId,
    };

    // Add to centralized state (will be replaced when server confirms)
    addOptimisticMessage(optimisticMessage);

    // Mark that user just sent a message - always scroll to bottom
    userSentMessageRef.current = true;

    const didSend = sendMessage(
      selectedUser.userId,
      trimmedMessage,
      undefined,
      clientMessageId,
    );
    if (!didSend) {
      removeOptimisticMessage(clientMessageId);
      userSentMessageRef.current = false;
      handleSendUnavailable("Message not sent. Reconnect and try again.");
      return;
    }

    setMessageText("");
    setShowEmojiPicker(false);
    setShowGifPicker(false);

    stopLocalTyping(selectedUser.userId);
  }, [
    selectedUser,
    messageText,
    user,
    canSendPrivateMessage,
    sendMessage,
    generateClientMessageId,
    addOptimisticMessage,
    removeOptimisticMessage,
    handleSendUnavailable,
    stopLocalTyping,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    setMessageText(nextValue);

    if (!selectedUser) return;

    const trimmedValue = nextValue.trim();

    // Handle typing indicators
    if (trimmedValue && !isTypingRef.current) {
      setLocalTypingState(true);
      startTyping(selectedUser.userId);
    }

    // Clear previous timeout
    clearTypingTimeout();

    if (!trimmedValue) {
      stopLocalTyping(selectedUser.userId);
      return;
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      stopLocalTyping(selectedUser.userId);
    }, 1000);
  };

  const handleInputFocus = () => {
    // Scroll to bottom when input is focused to ensure visibility
    if (isMobile) {
      setTimeout(() => {
        scrollToBottom();
      }, 300); // Small delay to allow keyboard to appear
    }
  };

  const formatMessageTime = (timestamp: Date | string | null) => {
    if (!timestamp) return "";
    return format(new Date(timestamp), "h:mm a");
  };

  if (!selectedUser) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Send className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Select a User to start chatting
          </h3>
          <p className="text-muted-foreground">
            Choose someone from the online users list to begin a conversation
          </p>
        </div>
      </div>
    );
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser || !user) return;

    if (!canSendPrivateMessage()) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "File size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    // Create preview URL for immediate display
    const previewUrl = URL.createObjectURL(file);
    const attachmentId = generateClientMessageId();

    // Add pending attachment for loading preview
    const pendingAttachment: PendingAttachment = {
      id: attachmentId,
      file,
      previewUrl,
      progress: 0,
      status: "uploading",
    };
    setPendingAttachments((prev) => [...prev, pendingAttachment]);

    // Create optimistic message with attachment preview
    const optimisticMessage: OptimisticMessage = {
      msgId: -Date.now(), // Negative temp ID
      senderId: user.userId,
      receiverId: selectedUser.userId,
      conversationId: null, // Will be set by server
      message: "", // Use 'message' to match Prisma schema
      timestamp: new Date(),
      isOptimistic: true,
      isSending: true,
      clientMessageId: attachmentId,
    };
    addOptimisticMessage(optimisticMessage);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Update progress to show uploading
      setPendingAttachments((prev) =>
        prev.map((p) => (p.id === attachmentId ? { ...p, progress: 50 } : p)),
      );

      const token = getStoredToken();
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const uploaded = await res.json(); // { url, filename, fileType }

      // Update status to sending
      setPendingAttachments((prev) =>
        prev.map((p) =>
          p.id === attachmentId ? { ...p, progress: 90, status: "sending" } : p,
        ),
      );

      // Send message with attachment via socket, with clientMessageId for tracking
      const didSend = sendMessage(
        selectedUser.userId,
        "",
        {
          url: uploaded.url,
          filename: uploaded.filename,
          fileType: uploaded.fileType,
        },
        attachmentId,
      );
      if (!didSend) {
        setPendingAttachments((prev) =>
          prev.map((p) =>
            p.id === attachmentId ? { ...p, status: "error" } : p,
          ),
        );

        setTimeout(() => {
          setPendingAttachments((prev) =>
            prev.filter((p) => p.id !== attachmentId),
          );
          removeOptimisticMessage(attachmentId);
          URL.revokeObjectURL(previewUrl);
        }, 2000);

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }

        handleSendUnavailable("Attachment not sent. Reconnect and try again.");
        return;
      }

      // Remove pending attachment and optimistic message after short delay
      setTimeout(() => {
        setPendingAttachments((prev) =>
          prev.filter((p) => p.id !== attachmentId),
        );
        // Clean up the preview URL
        URL.revokeObjectURL(previewUrl);
      }, 500);

      // Clear input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Attachment upload failed", error);

      // Update status to error
      setPendingAttachments((prev) =>
        prev.map((p) =>
          p.id === attachmentId ? { ...p, status: "error" } : p,
        ),
      );

      // Remove after showing error briefly
      setTimeout(() => {
        setPendingAttachments((prev) =>
          prev.filter((p) => p.id !== attachmentId),
        );
        removeOptimisticMessage(attachmentId);
        URL.revokeObjectURL(previewUrl);
      }, 2000);

      toast({
        title: "Upload failed",
        description: "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAddFriend = () => {
    if (!selectedUser || !user) return;

    if (friendshipStatusQuery.data?.isFriend) {
      toast({
        title: "Already friends",
        description: `${selectedUser.username} is already in your friends list.`,
      });
      return;
    }

    if (user.isGuest) {
      toast({
        title: "Register required",
        description: "Register an account to add friends.",
        variant: "destructive",
      });
      return;
    }

    if (selectedUser.isGuest) {
      toast({
        title: "Guest account",
        description: "Guest accounts cannot be added as friends.",
        variant: "destructive",
      });
      return;
    }

    if (friendshipStatusQuery.data?.pendingDirection === "incoming") {
      toast({
        title: "Pending request",
        description: `Respond to ${selectedUser.username}'s friend request in the chat area.`,
      });
      return;
    }

    if (friendshipStatusQuery.data?.pendingDirection === "outgoing") {
      toast({
        title: "Request already sent",
        description: `Waiting for ${selectedUser.username} to respond.`,
      });
      return;
    }

    addFriendMutation.mutate();
  };

  const handleAcceptFriendRequest = () => {
    const requestId = friendshipStatusQuery.data?.pendingRequest?.id;
    if (!requestId) return;

    respondToFriendRequestMutation.mutate({
      requestId,
      action: "accept",
    });
  };

  const handleRejectFriendRequest = () => {
    const requestId = friendshipStatusQuery.data?.pendingRequest?.id;
    if (!requestId) return;

    respondToFriendRequestMutation.mutate({
      requestId,
      action: "reject",
    });
  };

  const addFriendMenuLabel = friendshipStatusQuery.data?.isFriend
    ? "Already friends"
    : friendshipStatusQuery.data?.pendingDirection === "outgoing"
      ? "Request sent"
      : friendshipStatusQuery.data?.pendingDirection === "incoming"
        ? "Respond in chat"
        : addFriendMutation.isPending
          ? "Sending request..."
          : "Add friend";

  const handleClearAttachments = () => {
    if (!selectedUser) return;
    setConfirmDialogAction("attachments");
  };

  const handleClearChat = () => {
    if (!selectedUser) return;
    setConfirmDialogAction("chat");
  };

  const handleConfirmDialogAction = () => {
    if (confirmDialogAction === "attachments") {
      clearAttachmentsMutation.mutate();
    }

    if (confirmDialogAction === "chat") {
      clearChatMutation.mutate();
    }

    setConfirmDialogAction(null);
  };

  const isConfirmDialogPending =
    clearChatMutation.isPending || clearAttachmentsMutation.isPending;
  const isLightboxOpen = imagePreview !== null;
  const lightboxSrc = imagePreview?.url ?? "";

  return (
    <>
      <AnimatePresence>
        {isLightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm sm:p-8"
            onClick={() => setImagePreview(null)}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
              onClick={() => setImagePreview(null)}
            >
              <X className="h-8 w-8" />
            </Button>
            <motion.img
              src={lightboxSrc}
              alt="Preview"
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl outline-none"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              referrerPolicy="no-referrer"
              onClick={(event) => event.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AlertDialog
        open={confirmDialogAction !== null}
        onOpenChange={(open) => {
          if (!open && !isConfirmDialogPending) {
            setConfirmDialogAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialogAction === "chat"
                ? "Clear chat"
                : "Clear attachments"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialogAction === "chat"
                ? `This will permanently delete the entire chat with ${selectedUser.username} for both users.`
                : `This will permanently delete all attachments exchanged with ${selectedUser.username} for both users.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConfirmDialogPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDialogAction}
              disabled={isConfirmDialogPending}
            >
              {isConfirmDialogPending ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className={cn("flex-1 flex flex-col h-full relative overflow-hidden")}>
        {/* Chat Header */}
        <div className="bg-card border-b border-border p-4 flex items-center justify-between flex-shrink-0 z-40">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Back button for mobile */}
          {(showBackButton || isMobile) && onBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="p-2 flex-shrink-0"
              title="Back to users"
              data-testid="button-back-to-users"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}

          <div className="relative flex-shrink-0">
            <div
              className={`w-10 h-10 ${selectedUser.isGuest ? "bg-gray-500" : "bg-gradient-to-br " + getAvatarColor(selectedUser.username)} text-white rounded-full flex items-center justify-center font-medium`}
            >
              {selectedUser.isGuest
                ? "G"
                : getUserInitials(selectedUser.username)}
            </div>
          </div>
          <div className="min-w-0">
            <h3
              className="font-semibold text-foreground truncate"
              data-testid={`text-chat-username-${selectedUser.userId}`}
            >
              {selectedUser.username}
            </h3>
            <div className="flex items-center gap-1 text-xs">
              <div
                className={`w-2 h-2 ${onlineUsers.some((u) => u.userId === selectedUser.userId) ? "bg-green-500" : "bg-gray-400"} rounded-full`}
              ></div>
              <span className="text-foreground font-medium">
                {onlineUsers.some((u) => u.userId === selectedUser.userId)
                  ? "Online"
                  : "Offline"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            title="Voice Call"
            data-testid="button-voice-call"
          >
            <Phone className="w-5 h-5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Video Call"
            data-testid="button-video-call"
          >
            <Video className="w-5 h-5 text-muted-foreground" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                title="More Options"
                data-testid="button-more-options"
              >
                <MoreVertical className="w-5 h-5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleAddFriend}
                disabled={
                  addFriendMutation.isPending ||
                  friendshipStatusQuery.isLoading ||
                  !!friendshipStatusQuery.data?.isFriend ||
                  friendshipStatusQuery.data?.pendingDirection === "incoming" ||
                  friendshipStatusQuery.data?.pendingDirection === "outgoing"
                }
              >
                <Heart className="mr-2 h-4 w-4" />
                {addFriendMenuLabel}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleClearAttachments}
                disabled={clearAttachmentsMutation.isPending}
              >
                {clearAttachmentsMutation.isPending
                  ? "Clearing attachments..."
                  : "Clear attachments"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleClearChat}
                disabled={clearChatMutation.isPending}
              >
                {clearChatMutation.isPending ? "Clearing chat..." : "Clear chat"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4 bg-background min-h-0 relative overscroll-contain"
        onScroll={handleScroll}
        data-testid="chat-messages-area"
      >
        {/* Load older messages */}
        {hasNextPage && (
          <div className="flex justify-center my-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadOlderMessages}
              disabled={isFetchingNextPage}
              className="bg-primary text-primary-foreground hover:bg-primary hover:text-white text-white"
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading older messages...
                </>
              ) : (
                "Load More..."
              )}
            </Button>
          </div>
        )}

        {/* System Message */}
        <div className="flex justify-center my-4">
          <div className="bg-accent text-muted-foreground text-xs px-3 py-1 rounded-full flex items-center gap-1">
            <div className="w-3 h-3 gap-1 flex items-center justify-center text-accent">
              🔒
            </div>
            Messages are end-to-end encrypted
          </div>
        </div>

        {timelineItems.map((item) => {
          if (item.type === "friendRequest") {
            return (
              <FriendRequestCard
                key={`friend-request-${item.request.id}`}
                request={item.request}
                direction={item.direction}
                otherUsername={selectedUser.username}
                isPendingAction={respondToFriendRequestMutation.isPending}
                onAccept={handleAcceptFriendRequest}
                onReject={handleRejectFriendRequest}
              />
            );
          }

          const message = item.message;
          const isOwnMessage = message.senderId === user?.userId;
          const sender = isOwnMessage ? user : selectedUser;
          const isOptimistic = (message as OptimisticMessage).isOptimistic;
          const pendingAttachment = (message as OptimisticMessage)
            .clientMessageId
            ? pendingAttachments.find(
                (p) => p.id === (message as OptimisticMessage).clientMessageId,
              )
            : null;

          return (
            <MessageBubble
              key={
                (message as OptimisticMessage).clientMessageId || message.msgId
              }
              message={message}
              isOwnMessage={isOwnMessage}
              sender={sender}
              isOptimistic={isOptimistic}
              pendingAttachment={pendingAttachment}
              onImagePreview={setImagePreview}
            />
          );
        })}

        {/* Typing Indicator */}
        {typingUsers.has(selectedUser.userId) && (
          <div className="flex items-start gap-3 message-bubble">
            <div
              className={`w-8 h-8 ${selectedUser.isGuest ? "bg-gray-500" : `bg-gradient-to-br ${getAvatarColor(selectedUser.username)}`} text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0`}
            >
              {selectedUser.isGuest
                ? "G"
                : getUserInitials(selectedUser.username)}
            </div>
            <div className="flex flex-col gap-1 max-w-xs lg:max-w-md">
              <div className="bg-card border border-border rounded-lg rounded-tl-none p-3 shadow-sm">
                <div className="flex items-center gap-1">
                  <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"></div>
                  <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce delay-75"></div>
                  <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce delay-150"></div>
                </div>
              </div>
              <span className="text-xs text-muted-foreground ml-1">
                {selectedUser.username} is typing...
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* New Message Indicator - Instagram style */}
      {showNewMessageIndicator && (
        <NewMessageIndicator onClick={() => scrollToBottom("smooth")} />
      )}

      {/* Message Input Area */}
      <div
        className="bg-card border-t border-border p-3 flex-shrink-0"
        style={{
          paddingBottom: "12px",
        }}
      >
        <div className="flex items-end gap-2">
          {/* Attachment Button */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 flex-shrink-0"
            title="Attach File"
            data-testid="button-attach-file"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-4 h-4 text-muted-foreground" />
          </Button>

          {/* Message Input */}
          <div className="flex-1 relative">
            <Textarea
              placeholder="Type a message..."
              className="min-h-[44px] max-h-32 px-4 py-3 pr-12 bg-input text-foreground placeholder:text-muted-foreground border border-border resize-none rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus:border-border"
              rows={1}
              value={messageText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              data-testid="textarea-message-input"
            />

            {/* Emoji Button */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-12 bottom-1 h-10 w-10 flex items-center justify-center hover:bg-muted"
                title={
                  "Add GIF"
                }
                data-testid="button-gif"
                onClick={() => {
                  setShowGifPicker(!showGifPicker);
                  if (!showGifPicker) setShowEmojiPicker(false);
                }}
              >
                <span className="font-bold text-[10px] text-muted-foreground rounded px-1 min-w-[30px] h-5 flex items-center justify-center">GIF</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 bottom-1 h-10 w-10 flex items-center justify-center"
                title="Add Emoji"
                data-testid="button-emoji"
                onClick={() => {
                  setShowEmojiPicker(!showEmojiPicker);
                  if (!showEmojiPicker) setShowGifPicker(false);
                }}
              >
                <Smile className="w-4 h-4 text-muted-foreground" />
              </Button>
              {showEmojiPicker && (
                <div className="absolute bottom-12 right-0 z-50 shadow-xl rounded-xl border border-border">
                  <EmojiPicker
                    onEmojiClick={onEmojiClick}
                    width={300}
                    height={400}
                    theme={
                      isDark
                        ? (EmojiPickerTheme.DARK as any)
                        : (EmojiPickerTheme.LIGHT as any)
                    }
                    lazyLoadEmojis={true}
                  />
                </div>
              )}
              {showGifPicker && (
                <div className="absolute bottom-12 right-0 z-50">
                  <GifPicker onGifClick={sendGifMessage} />
                </div>
              )}
            </div>
          </div>

          {/* Send Button */}
          <Button
            onMouseDown={(e) => e.preventDefault()} // Prevent blur on textarea to keep keyboard open
            onClick={handleSendMessage}
            disabled={!messageText.trim()}
            className="h-10 w-10 flex-shrink-0"
            size="icon"
            title="Send Message"
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        </div>
      </div>
    </>
  );
}

const MessageContent = ({
  content,
  onImagePreview,
}: {
  content: string;
  onImagePreview: (preview: ImagePreviewState) => void;
}) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = content.split(urlRegex);

  return (
    <div
      className="whitespace-pre-wrap break-words overflow-hidden"
      style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
    >
      {parts.map((part, index) => {
        if (!part.match(urlRegex)) {
          return <span key={index}>{part}</span>;
        }

        const isImage = isImageMessageUrl(part);
        const isVideo = isVideoMessageUrl(part);

        if (isImage) {
          return (
            <InlineImagePreview
              key={index}
              url={part}
              onImagePreview={onImagePreview}
            />
          );
        }

        if (isVideo) {
          return (
            <div
              key={index}
              className="my-2 max-w-sm overflow-hidden rounded-sm border border-border"
            >
              <video
                src={part}
                controls
                className="h-auto max-h-60 w-full bg-black"
              />
            </div>
          );
        }

        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="break-all text-blue-500 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      })}
    </div>
  );
};

function InlineImagePreview({
  url,
  onImagePreview,
}: {
  url: string;
  onImagePreview: (preview: ImagePreviewState) => void;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="my-2 flex max-w-[14rem] flex-col gap-2 rounded-2xl border border-brand-border bg-muted/30 p-3 text-left">
        <span className="text-xs text-muted-foreground">
          Preview blocked by host
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="break-all text-xs text-blue-500 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          Open image link
        </a>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="my-2 block w-full max-w-[11rem] overflow-hidden rounded-2xl border border-brand-border bg-muted/30 text-left transition-transform duration-200 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={() => onImagePreview({ url })}
    >
      <img
        src={url}
        alt="Preview"
        className="h-28 w-full object-cover sm:h-32"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
    </button>
  );
}

function FriendRequestCard({
  request,
  direction,
  otherUsername,
  isPendingAction = false,
  onAccept,
  onReject,
}: {
  request: FriendRequestRecord;
  direction: "incoming" | "outgoing";
  otherUsername: string;
  isPendingAction?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
}) {
  return (
    <div className="flex justify-center">
      <div className="w-full max-w-md rounded-2xl border border-brand-border bg-brand-card/80 p-4 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary">
          {direction === "incoming" ? (
            <Handshake className="h-5 w-5" />
          ) : (
            <UserPlus className="h-5 w-5" />
          )}
        </div>
        <p className="text-sm font-medium text-foreground">
          {direction === "incoming"
            ? `${otherUsername} sent you a friend request.`
            : `Friend request sent to ${otherUsername}.`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {format(new Date(request.createdAt), "h:mm a")}
        </p>

        {direction === "incoming" ? (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              size="sm"
              onClick={onAccept}
              disabled={isPendingAction}
              data-testid={`button-accept-friend-request-${request.id}`}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              disabled={isPendingAction}
              data-testid={`button-reject-friend-request-${request.id}`}
            >
              Reject
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            Waiting for {otherUsername} to respond.
          </p>
        )}
      </div>
    </div>
  );
}

function AttachmentThumbnail({
  attachment,
  onPreview,
}: {
  attachment: ChatAttachment;
  onPreview: (preview: ImagePreviewState) => void;
}) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="w-28 sm:w-32">
      <div className="group relative h-28 w-28 overflow-hidden rounded-2xl border border-brand-border bg-muted/30 shadow-sm sm:h-32 sm:w-32">
        {hasError ? (
          <div className="flex h-full w-full items-center justify-center p-3 text-center text-[11px] text-muted-foreground">
            Image unavailable
          </div>
        ) : (
          <>
            <button
              type="button"
              className="h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => onPreview({ url: attachment.url })}
              title="Preview attachment"
            >
              <img
                src={attachment.url}
                alt="Preview"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setHasError(true)}
              />
              <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/65 via-black/10 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white">
                  <Expand className="h-3 w-3" />
                  Preview
                </span>
              </div>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  message,
  isOwnMessage,
  sender,
  isOptimistic,
  pendingAttachment,
  onImagePreview,
}: {
  message: Message;
  isOwnMessage: boolean;
  sender: User | null;
  isOptimistic?: boolean;
  pendingAttachment?: PendingAttachment | null;
  onImagePreview: (preview: ImagePreviewState) => void;
}) {
  const attachments = (message as MessageWithAttachments).attachments || [];
  const normalizedMessage =
    message.message && message.message !== "Sent an attachment"
      ? message.message
      : "";
  const isMediaOnlyMessage = Boolean(
    normalizedMessage && getStandaloneMediaMessageUrl(normalizedMessage),
  );

  const formatBubbleTime = (timestamp: Date | string | null) => {
    if (!timestamp) return "";
    return format(new Date(timestamp), "h:mm a");
  };

  return (
    <div
      className={`message-bubble flex items-start gap-3 ${
        isOwnMessage ? "justify-end" : ""
      } ${isOptimistic ? "opacity-70" : ""}`}
      data-testid={`message-${message.msgId}`}
    >
      {!isOwnMessage && (
        <div
          className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-black shadow-sm"
          style={{
            background: sender?.isGuest
              ? "var(--brand-muted)"
              : getAvatarColor(sender?.username || ""),
          }}
        >
          {sender?.isGuest ? "G" : getUserInitials(sender?.username || "")}
        </div>
      )}

      <div
        className={`min-w-0 max-w-[75%] flex flex-col gap-1 sm:max-w-xs lg:max-w-md ${
          isOwnMessage ? "items-end" : ""
        }`}
      >
        <div className="overflow-hidden transition-all duration-300">
          {pendingAttachment && (
            <div className="flex flex-wrap gap-2">
              <div className="relative h-28 w-28 overflow-hidden rounded-2xl border border-brand-border bg-muted/30 shadow-sm sm:h-32 sm:w-32">
                {pendingAttachment.file.type.startsWith("image/") ? (
                  <div className="relative">
                    <img
                      src={pendingAttachment.previewUrl}
                      alt={pendingAttachment.file.name}
                      className="h-28 w-28 object-cover opacity-60 sm:h-32 sm:w-32"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="flex flex-col items-center gap-2 text-white">
                        {pendingAttachment.status === "error" ? (
                          <span className="text-sm text-red-400">
                            Upload failed
                          </span>
                        ) : (
                          <>
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span className="text-xs">
                              {pendingAttachment.status === "uploading"
                                ? "Uploading..."
                                : "Sending..."}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center gap-2 px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="flex-1 truncate text-sm">
                      {pendingAttachment.file.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {pendingAttachment.status === "uploading"
                        ? "Uploading..."
                        : "Sending..."}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {!pendingAttachment && attachments.length > 0 ? (
            <div className="space-y-2">
              {attachments.map((attachment) => (
                <div key={attachment.id}>
                  {attachment.fileType.startsWith("image/") ? (
                    <AttachmentThumbnail
                      attachment={attachment}
                      onPreview={onImagePreview}
                    />
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <Paperclip className="h-4 w-4" />
                      <span className="flex-1 truncate text-sm">
                        {attachment.filename}
                      </span>
                      <a
                        href={attachment.url}
                        download={attachment.filename}
                        className="rounded p-1 hover:bg-black/10"
                        title="Download"
                      >
                        <ArrowLeft className="h-4 w-4 rotate-[-90deg]" />
                      </a>
                    </div>
                  )}
                </div>
              ))}
              {message.message && message.message !== "Sent an attachment" && (
                <div
                  className={`rounded-2xl px-3 py-2 text-sm leading-snug shadow-sm ${
                    isOwnMessage
                      ? "rounded-tr-none bg-brand-msg-sent text-brand-msg-sent-text"
                      : "rounded-tl-none border border-brand-border bg-brand-msg-received text-brand-msg-received-text"
                  }`}
                >
                  <MessageContent
                    content={message.message}
                    onImagePreview={onImagePreview}
                  />
                </div>
              )}
            </div>
          ) : (
            !pendingAttachment && (
              <div
                className={
                  isMediaOnlyMessage
                    ? ""
                    : `rounded-2xl px-3 py-2 text-sm leading-snug shadow-sm ${
                        isOwnMessage
                          ? "rounded-tr-none bg-brand-msg-sent text-brand-msg-sent-text"
                          : "rounded-tl-none border border-brand-border bg-brand-msg-received text-brand-msg-received-text"
                      }`
                }
              >
                <MessageContent
                  content={message.message}
                  onImagePreview={onImagePreview}
                />
              </div>
            )
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{formatBubbleTime(message.timestamp)}</span>
          {isOwnMessage && (
            <span className="flex items-center text-muted-foreground">
              {isOptimistic ? <Clock className="h-3 w-3" /> : "✓"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

type TenorGif = {
  id: string;
  title: string;
  media_formats: {
    tinygif?: { url: string; dims: [number, number] };
    gif?: { url: string; dims: [number, number] };
    nanogif?: { url: string; dims: [number, number] };
    mediumgif?: { url: string; dims: [number, number] };
  };
  content_description: string;
};

type TenorCategory = {
  searchterm: string;
  image: string;
};

function GifPicker({
  onGifClick,
}: {
  onGifClick: (url: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<TenorCategory[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextPosRef = useRef("");

  useEffect(() => {
    const timeout = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    void fetchTrending();
    void fetchCategories();
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const fetchTrending = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${TENOR_BASE_URL}/featured?key=${TENOR_API_KEY}&client_key=${TENOR_CLIENT_KEY}&limit=30&media_filter=tinygif,gif`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as { results?: TenorGif[]; next?: string };
      setGifs(data.results || []);
      nextPosRef.current = data.next || "";
    } catch {
      setError("Failed to load GIFs");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(
        `${TENOR_BASE_URL}/categories?key=${TENOR_API_KEY}&client_key=${TENOR_CLIENT_KEY}&type=trending`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { tags?: TenorCategory[] };
      setCategories((data.tags || []).slice(0, 8));
    } catch {
      // Categories are optional.
    }
  };

  const searchGifs = useCallback(async (query: string) => {
    if (!query.trim()) {
      await fetchTrending();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${TENOR_BASE_URL}/search?key=${TENOR_API_KEY}&client_key=${TENOR_CLIENT_KEY}&q=${encodeURIComponent(query)}&limit=30&media_filter=tinygif,gif`,
      );
      if (!res.ok) throw new Error("Failed to search");
      const data = (await res.json()) as { results?: TenorGif[]; next?: string };
      setGifs(data.results || []);
      nextPosRef.current = data.next || "";
    } catch {
      setError("Search failed. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearchInput = (value: string) => {
    setSearchTerm(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      void searchGifs(value);
    }, 400);
  };

  const getGifUrl = (gif: TenorGif) =>
    gif.media_formats.gif?.url ||
    gif.media_formats.mediumgif?.url ||
    gif.media_formats.tinygif?.url ||
    gif.media_formats.nanogif?.url ||
    "";

  const getPreviewUrl = (gif: TenorGif) =>
    gif.media_formats.tinygif?.url ||
    gif.media_formats.nanogif?.url ||
    gif.media_formats.gif?.url ||
    "";

  return (
    <div
      className="flex h-[420px] w-[320px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl"
    >
      <div className="flex-shrink-0 border-b border-border px-3 pb-2 pt-3">
        <div
          className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2"
        >
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="Search GIFs..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm("");
                void fetchTrending();
                inputRef.current?.focus();
              }}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {!searchTerm && categories.length > 0 && (
        <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto border-b border-border px-3 py-2 no-scrollbar">
          {categories.map((category) => (
            <button
              key={category.searchterm}
              onClick={() => {
                setSearchTerm(category.searchterm);
                void searchGifs(category.searchterm);
              }}
              className="whitespace-nowrap rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {category.searchterm}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-muted-foreground">
        <TrendingUp className="h-3 w-3" />
        <span className="text-[10px] font-medium uppercase tracking-wider">
          {searchTerm ? `Results for "${searchTerm}"` : "Trending"}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2"
        style={{ scrollbarWidth: "none" }}
      >
        {loading && gifs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading GIFs...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 px-4 text-center">
              <span className="text-sm text-muted-foreground">{error}</span>
              <button
                onClick={() => {
                  if (searchTerm) {
                    void searchGifs(searchTerm);
                  } else {
                    void fetchTrending();
                  }
                }}
                className="rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-muted-foreground">No GIFs found</span>
          </div>
        ) : (
          <div className="columns-2 gap-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => {
                  const url = getGifUrl(gif);
                  if (url) {
                    onGifClick(url);
                  }
                }}
                className="group relative mb-1.5 block w-full cursor-pointer overflow-hidden rounded-lg transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card"
                title={gif.content_description || gif.title}
              >
                <img
                  src={getPreviewUrl(gif)}
                  alt={gif.content_description || gif.title || "GIF"}
                  className="block h-auto w-full bg-muted"
                  loading="lazy"
                  style={{
                    minHeight: "60px",
                  }}
                />
                <div className="absolute inset-0 rounded-lg bg-black/0 transition-colors group-hover:bg-black/10" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center justify-center border-t border-border px-3 py-1.5">
        <span className="text-[9px] text-muted-foreground">Powered by Tenor</span>
      </div>
    </div>
  );
}
