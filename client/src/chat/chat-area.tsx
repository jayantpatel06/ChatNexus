import { memo, useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { getStoredToken } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  User,
  Message,
  FriendRequest,
  type MessageReactionWithUser,
} from "@shared/schema";
import {
  Ban,
  Heart,
  Phone,
  Video,
  MoreVertical,
  Image as ImageIcon,
  Camera,
  Paperclip,
  Smile,
  Send,
  ArrowLeft,
  Expand,
  Loader2,
  Handshake,
  Reply,
  Search,
  Pencil,
  TrendingUp,
  Trash2,
  UserPlus,
  UserMinus,
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
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_INPUT_ACCEPT = "image/*,video/mp4,video/webm";

function isImageMessageUrl(url: string): boolean {
  return IMAGE_MEDIA_URL_PATTERN.test(url) || TENOR_MEDIA_URL_PATTERN.test(url);
}

function isVideoMessageUrl(url: string): boolean {
  return VIDEO_MEDIA_URL_PATTERN.test(url);
}

function isUploadableAttachmentType(fileType: string): boolean {
  return (
    fileType.startsWith("image/") ||
    fileType === "video/mp4" ||
    fileType === "video/webm"
  );
}

function isVideoAttachmentType(fileType: string): boolean {
  return fileType.startsWith("video/");
}

function getVideoMimeTypeFromUrl(url: string): string | undefined {
  if (VIDEO_MEDIA_URL_PATTERN.test(url)) {
    return url.toLowerCase().includes(".webm") ? "video/webm" : "video/mp4";
  }

  return undefined;
}

function getStandaloneMediaMessageUrl(content: string): string | null {
  const normalizedContent = content.trim();

  if (!normalizedContent || !/^https?:\/\/[^\s]+$/i.test(normalizedContent)) {
    return null;
  }

  return isImageMessageUrl(normalizedContent) ||
    isVideoMessageUrl(normalizedContent)
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
  isBlocked: boolean;
  block: {
    id: number;
    blockerId: number;
    blockedId: number;
    createdAt: Date | string;
  } | null;
  blockedByMe: boolean;
  blockedByUser: boolean;
};

type ChatAttachment = NonNullable<
  MessageWithAttachments["attachments"]
>[number];

type ImagePreviewState = {
  url: string;
};

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏"] as const;

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

function getReplyPreviewText(message: Message | null | undefined): string {
  if (!message) {
    return "";
  }

  if (message.deletedAt) {
    return "Message deleted";
  }

  const replyMessage = message.message?.trim() ?? "";
  if (!replyMessage || replyMessage === "Sent an attachment") {
    const attachments = (message as MessageWithAttachments).attachments ?? [];
    return attachments.length > 0 ? "Attachment" : "Message";
  }

  return replyMessage;
}

function toggleReactionForMessage(
  message: Message,
  currentUser: User,
  emoji: string,
): Message {
  const reactions = message.reactions ?? [];
  const existingReaction = reactions.find(
    (reaction) => reaction.userId === currentUser.userId,
  );

  let nextReactions: MessageReactionWithUser[];

  if (!existingReaction) {
    nextReactions = [
      ...reactions,
      {
        id: -Date.now(),
        messageId: message.msgId,
        userId: currentUser.userId,
        emoji,
        createdAt: new Date(),
        user: currentUser,
      },
    ];
  } else if (existingReaction.emoji === emoji) {
    nextReactions = reactions.filter(
      (reaction) => reaction.userId !== currentUser.userId,
    );
  } else {
    nextReactions = reactions.map((reaction) =>
      reaction.userId === currentUser.userId
        ? {
            ...reaction,
            emoji,
          }
        : reaction,
    );
  }

  return {
    ...message,
    reactions: nextReactions,
  };
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
    toggleReaction,
    deleteMessage: socketDeleteMessage,
    typingUsers,
    onlineUsers,
    forceReconnect,
    refreshOnlineUsers,
  } = useSocket();
  const {
    liveMessages,
    addOptimisticMessage,
    removeOptimisticMessage,
    removeMessageById,
    replaceMessageLocally,
    clearConversationMessages,
    clearConversationAttachments,
  } = useActiveChat();
  const isMobile = useIsMobile();
  const [messageText, setMessageText] = useState("");
  const isTypingRef = useRef(false);
  const messageTextRef = useRef("");
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const composerPickerRef = useRef<HTMLDivElement>(null);
  const composerPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const { toast } = useToast();

  // Track scroll position for loading older messages
  const isLoadingOlderRef = useRef(false);
  const previousScrollHeightRef = useRef(0);
  const pendingReactionRollbackRef = useRef(new Map<number, Message>());
  const pendingDeleteRollbackRef = useRef(new Map<number, Message>());

  // Instagram-style scroll tracking
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false);
  const userSentMessageRef = useRef(false); // Track if user just sent a message

  // Pending attachments for upload preview
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [confirmDialogAction, setConfirmDialogAction] = useState<
    "chat" | "attachments" | "removeFriend" | "blockUser" | "unblockUser" | null
  >(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [editTarget, setEditTarget] = useState<Message | null>(null);
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
        (getStoredTheme() ??
          (document.documentElement.classList.contains("dark")
            ? "dark"
            : "light")) === "dark",
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
    enabled:
      !!selectedUser?.userId &&
      !!user &&
      !selectedUser.isGuest &&
      !user.isGuest,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/users/${selectedUser!.userId}/friendship`,
      );
      return readJsonResponse<FriendshipStatusResponse>(res);
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    setReplyTarget(null);
    setEditTarget(null);
    setMessageText("");
    messageTextRef.current = "";
  }, [selectedUser?.userId]);

  useEffect(() => {
    pendingReactionRollbackRef.current.clear();
    pendingDeleteRollbackRef.current.clear();
  }, [selectedUser?.userId]);

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

      queryClient.setQueryData(
        ["friendship-status", selectedUser.userId],
        data,
      );
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

      const res = await apiRequest(
        "DELETE",
        `/api/messages/${selectedUser.userId}`,
      );
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

  const removeFriendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) {
        throw new Error("No user selected");
      }

      const res = await apiRequest(
        "DELETE",
        `/api/users/${selectedUser.userId}/friendship`,
      );
      return readJsonResponse<{
        removed: boolean;
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
        title: data.removed ? "Friend removed" : "No friendship found",
        description: data.removed
          ? `${selectedUser.username} has been removed from your friends list.`
          : `${selectedUser.username} is not currently in your friends list.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove friend",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const blockUserMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) {
        throw new Error("No user selected");
      }

      const res = await apiRequest(
        "POST",
        `/api/users/${selectedUser.userId}/block`,
      );
      return readJsonResponse<{ friendshipStatus: FriendshipStatusResponse }>(
        res,
      );
    },
    onSuccess: (data) => {
      if (!selectedUser) return;

      queryClient.setQueryData(
        ["friendship-status", selectedUser.userId],
        data.friendshipStatus,
      );
      void refreshOnlineUsers();
      setReplyTarget(null);
      setEditTarget(null);
      toast({
        title: "User blocked",
        description: `You blocked ${selectedUser.username}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to block user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unblockUserMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) {
        throw new Error("No user selected");
      }

      const res = await apiRequest(
        "DELETE",
        `/api/users/${selectedUser.userId}/block`,
      );
      return readJsonResponse<{ friendshipStatus: FriendshipStatusResponse }>(
        res,
      );
    },
    onSuccess: (data) => {
      if (!selectedUser) return;

      queryClient.setQueryData(
        ["friendship-status", selectedUser.userId],
        data.friendshipStatus,
      );
      void refreshOnlineUsers();
      toast({
        title: "User unblocked",
        description: `You unblocked ${selectedUser.username}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to unblock user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: async ({
      messageId,
      message,
    }: {
      messageId: number;
      message: string;
    }) => {
      const res = await apiRequest("PUT", `/api/messages/${messageId}`, {
        message,
      });
      return readJsonResponse<{ message: Message }>(res);
    },
    onSuccess: () => {
      setEditTarget(null);
      setMessageText("");
      messageTextRef.current = "";
      toast({
        title: "Message updated",
        description: "Your message has been edited.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to edit message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fast delete via socket with optimistic removal
  const handleDeleteMessage = useCallback(
    (message: Message) => {
      const messageId = message.msgId;

      // Clear edit/reply targets if they reference this message
      if (editTarget?.msgId === messageId) {
        setEditTarget(null);
        setMessageText("");
        messageTextRef.current = "";
      }
      if (replyTarget?.msgId === messageId) {
        setReplyTarget(null);
      }

      pendingDeleteRollbackRef.current.set(messageId, message);

      // Optimistically remove from UI immediately
      removeMessageById(messageId);

      // Send delete via socket
      const sent = socketDeleteMessage(messageId);
      if (!sent) {
        pendingDeleteRollbackRef.current.delete(messageId);
        replaceMessageLocally(message);
        toast({
          title: "Failed to delete message",
          description: "Not connected. Please try again.",
          variant: "destructive",
        });
      }
    },
    [
      editTarget,
      replyTarget,
      socketDeleteMessage,
      removeMessageById,
      replaceMessageLocally,
      toast,
    ],
  );

  // Fast reaction toggle via socket with optimistic update
  const handleToggleReaction = useCallback(
    (message: Message, emoji: string) => {
      if (!user) return;

      // Optimistically update the reaction
      const optimisticMessage = toggleReactionForMessage(message, user, emoji);
      pendingReactionRollbackRef.current.set(message.msgId, message);
      replaceMessageLocally(optimisticMessage);

      // Send via socket
      const sent = toggleReaction(message.msgId, emoji);
      if (!sent) {
        // Revert on failure
        pendingReactionRollbackRef.current.delete(message.msgId);
        replaceMessageLocally(message);
        toast({
          title: "Failed to update reaction",
          description: "Not connected. Please try again.",
          variant: "destructive",
        });
      }
    },
    [user, toggleReaction, replaceMessageLocally, toast],
  );

  // Keep the HTTP mutation as fallback (for edit which doesn't have socket yet)
  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const res = await apiRequest("DELETE", `/api/messages/item/${messageId}`);
      return readJsonResponse<{ message: Message }>(res);
    },
    onSuccess: (data) => {
      if (editTarget?.msgId === data.message.msgId) {
        setEditTarget(null);
        setMessageText("");
        messageTextRef.current = "";
      }

      if (replyTarget?.msgId === data.message.msgId) {
        setReplyTarget(null);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Keep for compatibility but prefer handleToggleReaction
  const toggleReactionMutation = useMutation({
    mutationFn: async ({
      messageId,
      emoji,
    }: {
      messageId: number;
      emoji: string;
      optimisticMessage: Message;
      previousMessage: Message;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/messages/${messageId}/reactions`,
        { emoji },
      );
      return readJsonResponse<{ message: Message }>(res);
    },
    onMutate: ({ optimisticMessage, previousMessage }) => {
      replaceMessageLocally(optimisticMessage);
      return { previousMessage };
    },
    onSuccess: (data) => {
      replaceMessageLocally(data.message);
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousMessage) {
        replaceMessageLocally(context.previousMessage);
      }

      toast({
        title: "Failed to update reaction",
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
        (data.senderId === user.userId &&
          data.receiverId === selectedUser.userId) ||
        (data.senderId === selectedUser.userId &&
          data.receiverId === user.userId);

      if (!isRelevantConversation) {
        return;
      }

      const nextStatus =
        data.senderId === user.userId ? data.senderStatus : data.receiverStatus;
      queryClient.setQueryData(
        ["friendship-status", selectedUser.userId],
        nextStatus,
      );
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

    const handleRelationshipStatusUpdated = (data: {
      userAId: number;
      userBId: number;
      reason:
        | "friend_request"
        | "remove_friend"
        | "block_user"
        | "unblock_user";
      userAStatus: FriendshipStatusResponse;
      userBStatus: FriendshipStatusResponse;
    }) => {
      const isRelevantConversation =
        (data.userAId === user.userId &&
          data.userBId === selectedUser.userId) ||
        (data.userAId === selectedUser.userId && data.userBId === user.userId);

      if (!isRelevantConversation) {
        return;
      }

      const nextStatus =
        data.userAId === user.userId ? data.userAStatus : data.userBStatus;
      queryClient.setQueryData(
        ["friendship-status", selectedUser.userId],
        nextStatus,
      );
      void refreshOnlineUsers();

      if (data.reason === "block_user" && nextStatus.blockedByUser) {
        toast({
          title: "You were blocked",
          description: `You can no longer message ${selectedUser.username}.`,
          variant: "destructive",
        });
      }
    };

    socket.on("friend_request_updated", handleFriendRequestUpdated);
    socket.on("relationship_status_updated", handleRelationshipStatusUpdated);

    return () => {
      socket.off("friend_request_updated", handleFriendRequestUpdated);
      socket.off(
        "relationship_status_updated",
        handleRelationshipStatusUpdated,
      );
    };
  }, [socket, user, selectedUser, toast, refreshOnlineUsers]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleReactionsUpdated = (data: { messageId: number }) => {
      pendingReactionRollbackRef.current.delete(data.messageId);
    };

    const handleReactionError = (data: {
      messageId?: number;
      error?: string;
    }) => {
      if (data.messageId) {
        const previousMessage = pendingReactionRollbackRef.current.get(
          data.messageId,
        );
        if (previousMessage) {
          replaceMessageLocally(previousMessage);
          pendingReactionRollbackRef.current.delete(data.messageId);
        }
      }

      toast({
        title: "Failed to update reaction",
        description: data.error ?? "Unable to update the reaction right now.",
        variant: "destructive",
      });
    };

    const handleMessageDeleted = (data: { messageId: number }) => {
      pendingDeleteRollbackRef.current.delete(data.messageId);
    };

    const handleDeleteError = (data: {
      messageId?: number;
      error?: string;
    }) => {
      if (data.messageId) {
        const previousMessage = pendingDeleteRollbackRef.current.get(
          data.messageId,
        );
        if (previousMessage) {
          replaceMessageLocally(previousMessage);
          pendingDeleteRollbackRef.current.delete(data.messageId);
        }
      }

      toast({
        title: "Failed to delete message",
        description: data.error ?? "Unable to delete the message right now.",
        variant: "destructive",
      });
    };

    socket.on("message_reactions_updated", handleReactionsUpdated);
    socket.on("reaction_error", handleReactionError);
    socket.on("message_deleted", handleMessageDeleted);
    socket.on("delete_error", handleDeleteError);

    return () => {
      socket.off("message_reactions_updated", handleReactionsUpdated);
      socket.off("reaction_error", handleReactionError);
      socket.off("message_deleted", handleMessageDeleted);
      socket.off("delete_error", handleDeleteError);
    };
  }, [socket, replaceMessageLocally, toast]);

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

  const pendingFriendRequest =
    friendshipStatusQuery.data?.pendingRequest ?? null;
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
    > = displayedMessages
      .filter((message) => !message.deletedAt) // Exclude deleted messages - they should vanish completely
      .map((message) => ({
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

  const [activeComposerPicker, setActiveComposerPicker] = useState<
    "emoji" | "gif" | null
  >(null);

  const setLocalTypingState = useCallback((typing: boolean) => {
    isTypingRef.current = typing;
  }, []);

  useEffect(() => {
    messageTextRef.current = messageText;
  }, [messageText]);

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

  const syncTypingForDraft = useCallback(
    (nextValue: string) => {
      if (!selectedUser) {
        return;
      }

      const trimmedValue = nextValue.trim();

      if (trimmedValue && !isTypingRef.current) {
        setLocalTypingState(true);
        startTyping(selectedUser.userId);
      }

      clearTypingTimeout();

      if (!trimmedValue) {
        stopLocalTyping(selectedUser.userId);
        return;
      }

      typingTimeoutRef.current = setTimeout(() => {
        stopLocalTyping(selectedUser.userId);
      }, 1000);
    },
    [
      clearTypingTimeout,
      selectedUser,
      setLocalTypingState,
      startTyping,
      stopLocalTyping,
    ],
  );

  const focusMessageInput = useCallback(() => {
    requestAnimationFrame(() => {
      const input = messageInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    });
  }, []);

  const closeComposerPicker = useCallback(() => {
    setActiveComposerPicker(null);
  }, []);

  const handlePickerSwitch = useCallback(() => {
    if (activeComposerPicker) {
      closeComposerPicker();
      focusMessageInput();
      return;
    }

    messageInputRef.current?.blur();
    setActiveComposerPicker("gif");
  }, [activeComposerPicker, closeComposerPicker, focusMessageInput]);

  const handlePickerTabChange = useCallback(
    (tab: "emoji" | "gif") => {
      if (activeComposerPicker === tab) {
        closeComposerPicker();
        focusMessageInput();
        return;
      }

      messageInputRef.current?.blur();
      setActiveComposerPicker(tab);
    },
    [activeComposerPicker, closeComposerPicker, focusMessageInput],
  );

  useEffect(() => {
    if (!activeComposerPicker) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (!target) {
        return;
      }

      if (
        composerPickerRef.current?.contains(target) ||
        composerPickerTriggerRef.current?.contains(target)
      ) {
        return;
      }

      closeComposerPicker();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [activeComposerPicker, closeComposerPicker]);

  const onEmojiClick = useCallback(
    (emojiData: EmojiClickData) => {
      const nextValue = `${messageTextRef.current}${emojiData.emoji}`;
      messageTextRef.current = nextValue;
      setMessageText(nextValue);
      syncTypingForDraft(nextValue);
    },
    [syncTypingForDraft],
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

  const resetFileInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  }, []);

  const sendAttachmentFile = useCallback(
    async (file: File) => {
      if (!selectedUser || !user) return false;

      if (!canSendPrivateMessage()) {
        return false;
      }

      if (!isUploadableAttachmentType(file.type)) {
        toast({
          title: "Unsupported file type",
          description: "Only images, MP4, and WebM files are allowed.",
          variant: "destructive",
        });
        return false;
      }

      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        toast({
          title: "File too large",
          description: "File size must be less than 5MB",
          variant: "destructive",
        });
        return false;
      }

      const previewUrl = URL.createObjectURL(file);
      const attachmentId = generateClientMessageId();

      const pendingAttachment: PendingAttachment = {
        id: attachmentId,
        file,
        previewUrl,
        progress: 0,
        status: "uploading",
      };
      setPendingAttachments((prev) => [...prev, pendingAttachment]);

      const optimisticMessage: OptimisticMessage = {
        msgId: -Date.now(),
        senderId: user.userId,
        receiverId: selectedUser.userId,
        conversationId: null,
        editedAt: null,
        deletedAt: null,
        message: "",
        replyTo: replyTarget
          ? {
              msgId: replyTarget.msgId,
              senderId: replyTarget.senderId,
              message: replyTarget.message,
              deletedAt: replyTarget.deletedAt,
              sender:
                replyTarget.senderId === user.userId ? user : selectedUser,
            }
          : null,
        replyToId: replyTarget?.msgId ?? null,
        timestamp: new Date(),
        isOptimistic: true,
        isSending: true,
        clientMessageId: attachmentId,
      };
      addOptimisticMessage(optimisticMessage);
      userSentMessageRef.current = true;

      try {
        const formData = new FormData();
        formData.append("file", file);

        setPendingAttachments((prev) =>
          prev.map((pending) =>
            pending.id === attachmentId
              ? { ...pending, progress: 50 }
              : pending,
          ),
        );

        const token = getStoredToken();
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) {
          let message = "Upload failed";
          try {
            const data = (await res.json()) as { message?: string };
            if (data.message) {
              message = data.message;
            }
          } catch {
            // Fallback to default message for non-JSON responses.
          }
          throw new Error(message);
        }

        const uploaded = (await res.json()) as {
          url: string;
          filename: string;
          fileType: string;
        };

        setPendingAttachments((prev) =>
          prev.map((pending) =>
            pending.id === attachmentId
              ? { ...pending, progress: 90, status: "sending" }
              : pending,
          ),
        );

        const didSend = sendMessage(
          selectedUser.userId,
          "",
          {
            url: uploaded.url,
            filename: uploaded.filename,
            fileType: uploaded.fileType,
          },
          attachmentId,
          { replyToId: replyTarget?.msgId ?? null },
        );

        if (!didSend) {
          setPendingAttachments((prev) =>
            prev.map((pending) =>
              pending.id === attachmentId
                ? { ...pending, status: "error" }
                : pending,
            ),
          );

          setTimeout(() => {
            setPendingAttachments((prev) =>
              prev.filter((pending) => pending.id !== attachmentId),
            );
            removeOptimisticMessage(attachmentId);
            URL.revokeObjectURL(previewUrl);
          }, 2000);

          userSentMessageRef.current = false;
          handleSendUnavailable(
            "Attachment not sent. Reconnect and try again.",
          );
          return false;
        }

        setTimeout(() => {
          setPendingAttachments((prev) =>
            prev.filter((pending) => pending.id !== attachmentId),
          );
          URL.revokeObjectURL(previewUrl);
        }, 500);

        setReplyTarget(null);

        return true;
      } catch (error) {
        console.error("Attachment upload failed", error);

        setPendingAttachments((prev) =>
          prev.map((pending) =>
            pending.id === attachmentId
              ? { ...pending, status: "error" }
              : pending,
          ),
        );

        setTimeout(() => {
          setPendingAttachments((prev) =>
            prev.filter((pending) => pending.id !== attachmentId),
          );
          removeOptimisticMessage(attachmentId);
          URL.revokeObjectURL(previewUrl);
        }, 2000);

        userSentMessageRef.current = false;
        toast({
          title: "Upload failed",
          description:
            error instanceof Error
              ? error.message
              : "Failed to upload file. Please try again.",
          variant: "destructive",
        });
        return false;
      }
    },
    [
      selectedUser,
      user,
      canSendPrivateMessage,
      toast,
      generateClientMessageId,
      addOptimisticMessage,
      sendMessage,
      removeOptimisticMessage,
      handleSendUnavailable,
      replyTarget,
    ],
  );

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
        editedAt: null,
        deletedAt: null,
        message: normalizedGifUrl,
        replyTo: replyTarget
          ? {
              msgId: replyTarget.msgId,
              senderId: replyTarget.senderId,
              message: replyTarget.message,
              deletedAt: replyTarget.deletedAt,
              sender:
                replyTarget.senderId === user.userId ? user : selectedUser,
            }
          : null,
        replyToId: replyTarget?.msgId ?? null,
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
        { replyToId: replyTarget?.msgId ?? null },
      );
      if (!didSend) {
        removeOptimisticMessage(clientMessageId);
        userSentMessageRef.current = false;
        handleSendUnavailable("GIF not sent. Reconnect and try again.");
        return false;
      }

      closeComposerPicker();
      setReplyTarget(null);
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
      closeComposerPicker,
      handleSendUnavailable,
      replyTarget,
    ],
  );

  const handleSendMessage = useCallback(() => {
    if (!selectedUser || !messageText.trim() || !user) return;

    const trimmedMessage = messageText.trim();

    if (editTarget) {
      editMessageMutation.mutate({
        messageId: editTarget.msgId,
        message: trimmedMessage,
      });
      stopLocalTyping(selectedUser.userId);
      return;
    }

    if (!canSendPrivateMessage()) {
      return;
    }

    const clientMessageId = generateClientMessageId();

    // Create optimistic message for instant UI feedback (Instagram-style)
    const optimisticMessage: OptimisticMessage = {
      msgId: -Date.now(), // Negative temp ID to avoid collision with real IDs
      senderId: user.userId,
      receiverId: selectedUser.userId,
      conversationId: null,
      editedAt: null,
      deletedAt: null,
      message: trimmedMessage,
      replyTo: replyTarget
        ? {
            msgId: replyTarget.msgId,
            senderId: replyTarget.senderId,
            message: replyTarget.message,
            deletedAt: replyTarget.deletedAt,
            sender: replyTarget.senderId === user.userId ? user : selectedUser,
          }
        : null,
      replyToId: replyTarget?.msgId ?? null,
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
      { replyToId: replyTarget?.msgId ?? null },
    );
    if (!didSend) {
      removeOptimisticMessage(clientMessageId);
      userSentMessageRef.current = false;
      handleSendUnavailable("Message not sent. Reconnect and try again.");
      return;
    }

    setMessageText("");
    messageTextRef.current = "";
    closeComposerPicker();
    setReplyTarget(null);

    stopLocalTyping(selectedUser.userId);
  }, [
    selectedUser,
    messageText,
    user,
    editTarget,
    editMessageMutation,
    canSendPrivateMessage,
    sendMessage,
    generateClientMessageId,
    addOptimisticMessage,
    removeOptimisticMessage,
    closeComposerPicker,
    handleSendUnavailable,
    stopLocalTyping,
    replyTarget,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    messageTextRef.current = nextValue;
    setMessageText(nextValue);
    syncTypingForDraft(nextValue);
  };

  const handleInputFocus = () => {
    closeComposerPicker();

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    resetFileInput();

    if (!file) return;

    await sendAttachmentFile(file);
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

    if (friendshipStatusQuery.data?.isBlocked) {
      toast({
        title: "Action unavailable",
        description: isBlockedByMe
          ? "Unblock this user first."
          : "This user has blocked you.",
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

  const handleReplyToMessage = useCallback(
    (message: Message) => {
      setEditTarget(null);
      setReplyTarget(message);
      closeComposerPicker();
      focusMessageInput();
    },
    [closeComposerPicker, focusMessageInput],
  );

  const handleEditMessageStart = useCallback(
    (message: Message) => {
      if (message.deletedAt) {
        return;
      }

      setReplyTarget(null);
      setEditTarget(message);
      setMessageText(
        message.message === "Sent an attachment" ? "" : message.message,
      );
      messageTextRef.current =
        message.message === "Sent an attachment" ? "" : message.message;
      closeComposerPicker();
      focusMessageInput();
    },
    [closeComposerPicker, focusMessageInput],
  );

  const handleDeleteSingleMessage = useCallback(
    (message: Message) => {
      handleDeleteMessage(message);
    },
    [handleDeleteMessage],
  );

  // Wrapper to check for optimistic/deleted before calling socket-based reaction
  const handleToggleReactionSafe = useCallback(
    (message: Message, emoji: string) => {
      if (
        (message as OptimisticMessage).isOptimistic ||
        message.deletedAt ||
        !user
      ) {
        return;
      }

      handleToggleReaction(message, emoji);
    },
    [handleToggleReaction, user],
  );

  const addFriendMenuLabel = friendshipStatusQuery.data?.isFriend
    ? "Already friends"
    : friendshipStatusQuery.data?.pendingDirection === "outgoing"
      ? "Request sent"
      : friendshipStatusQuery.data?.pendingDirection === "incoming"
        ? "Respond in chat"
        : addFriendMutation.isPending
          ? "Sending request..."
          : "Add friend";

  const isChatBlocked = friendshipStatusQuery.data?.isBlocked ?? false;
  const isBlockedByMe = friendshipStatusQuery.data?.blockedByMe ?? false;
  const isBlockedByUser = friendshipStatusQuery.data?.blockedByUser ?? false;
  const selectedUsername = selectedUser?.username ?? "this user";
  const blockedNotice = isBlockedByMe
    ? `You blocked ${selectedUsername}.`
    : isBlockedByUser
      ? `${selectedUsername} has blocked you.`
      : "";

  const handleClearAttachments = () => {
    if (!selectedUser) return;
    setConfirmDialogAction("attachments");
  };

  const handleClearChat = () => {
    if (!selectedUser) return;
    setConfirmDialogAction("chat");
  };

  const handleRemoveFriend = () => {
    if (!selectedUser) return;
    setConfirmDialogAction("removeFriend");
  };

  const handleBlockUser = () => {
    if (!selectedUser) return;
    setConfirmDialogAction("blockUser");
  };

  const handleUnblockUser = () => {
    if (!selectedUser) return;
    setConfirmDialogAction("unblockUser");
  };

  const handleConfirmDialogAction = () => {
    if (confirmDialogAction === "attachments") {
      clearAttachmentsMutation.mutate();
    }

    if (confirmDialogAction === "chat") {
      clearChatMutation.mutate();
    }

    if (confirmDialogAction === "removeFriend") {
      removeFriendMutation.mutate();
    }

    if (confirmDialogAction === "blockUser") {
      blockUserMutation.mutate();
    }

    if (confirmDialogAction === "unblockUser") {
      unblockUserMutation.mutate();
    }

    setConfirmDialogAction(null);
  };

  const isConfirmDialogPending =
    clearChatMutation.isPending ||
    clearAttachmentsMutation.isPending ||
    removeFriendMutation.isPending ||
    blockUserMutation.isPending ||
    unblockUserMutation.isPending;
  const isLightboxOpen = imagePreview !== null;
  const lightboxSrc = imagePreview?.url ?? "";
  const isComposerPickerOpen = activeComposerPicker !== null;
  const composerPickerHeight = isMobile ? 320 : 320;
  const hasDraftText = messageText.length > 0;
  const canSendDraft =
    messageText.trim().length > 0 &&
    !editMessageMutation.isPending &&
    !isChatBlocked;

  useEffect(() => {
    if (!isMobile || (!replyTarget && !editTarget)) {
      return;
    }

    focusMessageInput();
  }, [editTarget, focusMessageInput, isMobile, replyTarget]);

  if (!selectedUser) {
    if (isMobile) {
      return (
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Send className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              Select a User to start chatting
            </h3>
            <p className="text-muted-foreground">
              Choose someone from the online users list to begin a conversation
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-w-0 flex-1 pr-2 pt-2 pb-2">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-sm border border-border/70 bg-background shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.14),transparent_40%)] dark:bg-[radial-gradient(circle_at_top,rgba(71,85,105,0.3),transparent_44%)]" />
          <div className="relative flex h-full flex-col">
            <div className="flex flex-1 items-center justify-center p-6 lg:p-10">
              <div className="w-full max-w-3xl rounded-[2rem]  p-8 text-center shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur lg:p-10">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-primary/10 text-primary">
                  <Send className="h-8 w-8" />
                </div>
                <p className="text-xl font-semibold tracking-tight text-foreground">
                  Select a chat to start messaging
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                : confirmDialogAction === "attachments"
                  ? "Clear attachments"
                  : confirmDialogAction === "removeFriend"
                    ? "Remove friend"
                    : confirmDialogAction === "blockUser"
                      ? "Block user"
                      : "Unblock user"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialogAction === "chat"
                ? `This will permanently delete the entire chat with ${selectedUser.username} for both users.`
                : confirmDialogAction === "attachments"
                  ? `This will permanently delete all attachments exchanged with ${selectedUser.username} for both users.`
                  : confirmDialogAction === "removeFriend"
                    ? `This will remove ${selectedUser.username} from your friends list.`
                    : confirmDialogAction === "blockUser"
                      ? `This will block ${selectedUser.username}, remove any friendship, and stop future direct messages.`
                      : `This will unblock ${selectedUser.username} and allow direct messages again.`}
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

      <div
        className={cn(
          "relative flex-1",
          isMobile
            ? "flex h-full flex-col overflow-hidden"
            : "flex min-w-0 overflow-hidden pr-2 pt-2 pb-2",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden",
            isMobile
              ? "h-full bg-background"
              : "rounded-sm border border-border/70 bg-background shadow-[0_24px_60px_rgba(15,23,42,0.12)]",
          )}
        >
          {/* Chat Header */}
          <div className="z-40 flex flex-shrink-0 items-center justify-between bg-card p-2.5 md:border-b md:border-border/70 md:px-5 md:py-3.5">
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
                  className="flex h-10 w-10 items-center justify-center rounded-full font-medium text-black shadow-sm"
                  style={{
                    background: selectedUser.isGuest
                      ? "var(--brand-muted)"
                      : getAvatarColor(selectedUser.username),
                  }}
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
                    className={`w-2 h-2 ${
                      isChatBlocked
                        ? "bg-amber-500"
                        : onlineUsers.some(
                              (u) => u.userId === selectedUser.userId,
                            )
                          ? "bg-green-500"
                          : "bg-gray-400"
                    } rounded-full`}
                  ></div>
                  <span className="text-foreground font-medium">
                    {isChatBlocked
                      ? isBlockedByMe
                        ? "Blocked"
                        : "Restricted"
                      : onlineUsers.some(
                            (u) => u.userId === selectedUser.userId,
                          )
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
                      isChatBlocked ||
                      !!friendshipStatusQuery.data?.isFriend ||
                      friendshipStatusQuery.data?.pendingDirection ===
                        "incoming" ||
                      friendshipStatusQuery.data?.pendingDirection ===
                        "outgoing"
                    }
                  >
                    <Heart className="mr-2 h-4 w-4" />
                    {addFriendMenuLabel}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleRemoveFriend}
                    disabled={
                      removeFriendMutation.isPending ||
                      !friendshipStatusQuery.data?.isFriend ||
                      isChatBlocked
                    }
                  >
                    <UserMinus className="mr-2 h-4 w-4" />
                    {removeFriendMutation.isPending
                      ? "Removing friend..."
                      : "Remove friend"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={
                      isBlockedByMe ? handleUnblockUser : handleBlockUser
                    }
                    disabled={
                      blockUserMutation.isPending ||
                      unblockUserMutation.isPending
                    }
                  >
                    <Ban className="mr-2 h-4 w-4" />
                    {isBlockedByMe
                      ? unblockUserMutation.isPending
                        ? "Unblocking user..."
                        : "Unblock user"
                      : blockUserMutation.isPending
                        ? "Blocking user..."
                        : "Block user"}
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
                    {clearChatMutation.isPending
                      ? "Clearing chat..."
                      : "Clear chat"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Messages Area */}
          <div
            ref={messagesContainerRef}
            className="relative min-h-0 flex-1 overflow-y-auto space-y-1.5 bg-background p-4 scrollbar-none overscroll-contain md:px-6 md:py-5"
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
                    (p) =>
                      p.id === (message as OptimisticMessage).clientMessageId,
                  )
                : null;

              return (
                <MessageBubble
                  key={
                    (message as OptimisticMessage).clientMessageId ||
                    message.msgId
                  }
                  message={message}
                  isOwnMessage={isOwnMessage}
                  sender={sender}
                  currentUserId={user?.userId ?? null}
                  isOptimistic={isOptimistic}
                  pendingAttachment={pendingAttachment}
                  onImagePreview={setImagePreview}
                  onReply={handleReplyToMessage}
                  onEdit={handleEditMessageStart}
                  onDelete={handleDeleteSingleMessage}
                  onReact={handleToggleReactionSafe}
                  onKeepComposerFocus={focusMessageInput}
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
            className="relative overflow-visible bg-card-muted flex-shrink-0"
            style={{
              paddingBottom: "6px",
            }}
          >
            <AnimatePresence initial={false}>
              {isComposerPickerOpen && (
                <motion.div
                  ref={composerPickerRef}
                  key="composer-picker"
                  initial={
                    isMobile ? { height: 0, opacity: 0 } : { opacity: 0, y: 10 }
                  }
                  animate={
                    isMobile
                      ? { height: "auto", opacity: 1 }
                      : { opacity: 1, y: 0 }
                  }
                  exit={
                    isMobile ? { height: 0, opacity: 0 } : { opacity: 0, y: 10 }
                  }
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className={cn(
                    "absolute bottom-[calc(100%+0.4rem)] z-40 overflow-hidden rounded-sm border border-border bg-card-muted font-sans backdrop-blur-xl",
                    isMobile
                      ? "left-3 right-3"
                      : "right-3 w-[24rem] max-w-[calc(100%-1.5rem)]",
                  )}
                >
                  <div className="border-b border-border/70 px-3 py-2">
                    <div className="mx-auto grid w-full grid-cols-2 overflow-hidden rounded-full  border-border ">
                      <button
                        type="button"
                        className={cn(
                          "inline-flex h-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                          activeComposerPicker === "emoji"
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => handlePickerTabChange("emoji")}
                        aria-label="Emoji picker"
                      >
                        <Smile className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex h-8 items-center justify-center rounded-full text-xs font-semibold tracking-[0.18em] transition-colors",
                          activeComposerPicker === "gif"
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => handlePickerTabChange("gif")}
                        aria-label="GIF picker"
                      >
                        GIF
                      </button>
                    </div>
                  </div>
                  {activeComposerPicker === "emoji" ? (
                    <div className="overflow-hidden font-sans">
                      <EmojiPicker
                        onEmojiClick={onEmojiClick}
                        width="100%"
                        height={composerPickerHeight}
                        theme={
                          isDark
                            ? (EmojiPickerTheme.DARK as any)
                            : (EmojiPickerTheme.LIGHT as any)
                        }
                        autoFocusSearch={false}
                        searchPlaceholder="Search emoji"
                        lazyLoadEmojis={true}
                        previewConfig={{ showPreview: false }}
                        className={cn(
                          "font-sans [--epr-bg-color:transparent] [--epr-picker-border-color:transparent] [--epr-picker-border-radius:0px] [--epr-emoji-size:24px] [--epr-emoji-padding:4px] [--epr-horizontal-padding:8px] [--epr-search-input-height:32px] [--epr-search-input-border-radius:9999px] [--epr-category-navigation-button-size:28px] [--epr-category-label-height:28px] [&_.epr-header-overlay]:pb-0",
                          isMobile &&
                            "[--epr-emoji-size:22px] [--epr-search-input-height:30px] [--epr-category-navigation-button-size:26px] [--epr-category-label-height:26px]",
                        )}
                      />
                    </div>
                  ) : (
                    <GifPicker
                      onGifClick={sendGifMessage}
                      autoFocusSearch={false}
                      showCategories={false}
                      showStatus={false}
                      showFooter={false}
                      className={cn(
                        " rounded-none border-0 bg-transparent shadow-none",
                        isMobile ? "h-[320px]" : "h-[320px]",
                      )}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="p-2 md:pb-1">
              {isChatBlocked ? (
                <div className="rounded-[1rem] border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                  {blockedNotice}
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                    accept={ATTACHMENT_INPUT_ACCEPT}
                  />
                  <input
                    type="file"
                    ref={cameraInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                    accept="image/*"
                    capture="environment"
                  />
                  <div className="relative rounded-[1rem] border bg-card border-border bg-input/70 px-6 shadow-sm">
                    {(replyTarget || editTarget) && (
                      <div className="flex items-start justify-between gap-3 border-b border-border/70 py-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {editTarget ? "Editing message" : "Replying to"}
                          </p>
                          <p className="truncate text-sm text-foreground">
                            {getReplyPreviewText(editTarget ?? replyTarget)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-muted-foreground"
                          onClick={() => {
                            setReplyTarget(null);
                            setEditTarget(null);
                            if (editTarget) {
                              setMessageText("");
                              messageTextRef.current = "";
                            }
                          }}
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    <Textarea
                      ref={messageInputRef}
                      placeholder={
                        editTarget ? "Edit message..." : "Message..."
                      }
                      className={cn(
                        "min-h-[40px] max-h-32 rounded-none border-0 bg-transparent px-0 py-3 text-sm text-foreground placeholder:text-muted-foreground shadow-none resize-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                        hasDraftText || editTarget ? "pr-12" : "pr-20 sm:pr-24",
                      )}
                      rows={1}
                      value={messageText}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      onFocus={handleInputFocus}
                      data-testid="textarea-message-input"
                    />
                    <div className="absolute bottom-2 right-1.5 flex items-center">
                      {hasDraftText || editTarget ? (
                        <Button
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={handleSendMessage}
                          disabled={!canSendDraft}
                          className="h-8 w-8 rounded-2xl"
                          size="icon"
                          title={editTarget ? "Save changes" : "Send Message"}
                          data-testid="button-send-message"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                            title="Take Photo"
                            data-testid="button-camera"
                            onClick={() => {
                              closeComposerPicker();
                              cameraInputRef.current?.click();
                            }}
                          >
                            <Camera className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                            title="Attach File"
                            data-testid="button-attach-file"
                            onClick={() => {
                              closeComposerPicker();
                              fileInputRef.current?.click();
                            }}
                          >
                            <ImageIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            ref={composerPickerTriggerRef}
                            className={cn(
                              "h-8 w-8 rounded-full text-muted-foreground hover:text-foreground",
                              isComposerPickerOpen &&
                                "bg-muted text-foreground",
                            )}
                            title={
                              isComposerPickerOpen
                                ? "Show keyboard"
                                : "Open GIF and emoji picker"
                            }
                            data-testid="button-picker-switch"
                            onClick={handlePickerSwitch}
                          >
                            <Smile className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
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
      className="min-w-0 whitespace-pre-wrap break-words overflow-hidden"
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
          return <InlineVideoPreview key={index} url={part} />;
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

function InlineVideoPreview({ url }: { url: string }) {
  const [hasError, setHasError] = useState(false);
  const mimeType = getVideoMimeTypeFromUrl(url);

  if (hasError) {
    return (
      <div className="my-2 flex max-w-[16rem] flex-col gap-2 rounded-2xl border border-brand-border bg-muted/30 p-3 text-left">
        <span className="text-xs text-muted-foreground">
          Video preview blocked by host
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-xs text-blue-500 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          Open video link
        </a>
      </div>
    );
  }

  return (
    <div className="my-2 max-w-sm overflow-hidden rounded-2xl border border-brand-border bg-black shadow-sm">
      <video
        controls
        playsInline
        preload="metadata"
        className="h-auto max-h-72 w-full bg-black"
        onError={() => setHasError(true)}
      >
        <source src={url} type={mimeType} />
      </video>
    </div>
  );
}

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

function VideoAttachmentCard({
  src,
  title,
  mimeType,
  showOverlay = false,
  overlayLabel,
}: {
  src: string;
  title: string;
  mimeType?: string;
  showOverlay?: boolean;
  overlayLabel?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const resolvedMimeType = mimeType ?? getVideoMimeTypeFromUrl(src);

  if (hasError && !showOverlay) {
    return (
      <div className="flex max-w-[16rem] flex-col gap-2 rounded-2xl border border-brand-border bg-muted/30 p-3 text-left">
        <span className="text-xs text-muted-foreground">
          Video preview unavailable
        </span>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-xs text-blue-500 hover:underline"
        >
          Open video link
        </a>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-border bg-black shadow-sm">
      <video
        controls={!showOverlay}
        muted={showOverlay}
        playsInline
        preload="metadata"
        className="max-h-72 w-full min-w-[14rem] bg-black object-contain sm:min-w-[16rem]"
        title={title}
        onError={() => setHasError(true)}
      >
        <source src={src} type={resolvedMimeType} />
      </video>
      {showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35">
          <div className="flex flex-col items-center gap-2 text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">{overlayLabel ?? "Uploading..."}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  message,
  isOwnMessage,
  sender,
  currentUserId,
  isOptimistic,
  pendingAttachment,
  onImagePreview,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onKeepComposerFocus,
}: {
  message: Message;
  isOwnMessage: boolean;
  sender: User | null;
  currentUserId: number | null;
  isOptimistic?: boolean;
  pendingAttachment?: PendingAttachment | null;
  onImagePreview: (preview: ImagePreviewState) => void;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onReact: (message: Message, emoji: string) => void;
  onKeepComposerFocus?: () => void;
}) {
  const shouldRestoreComposerFocusRef = useRef(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const attachments = (message as MessageWithAttachments).attachments || [];
  const reactions = message.reactions ?? [];
  const isDeleted = Boolean(message.deletedAt);
  const normalizedMessage = isDeleted
    ? "Message deleted"
    : message.message && message.message !== "Sent an attachment"
      ? message.message
      : "";
  const isMediaOnlyMessage = Boolean(
    !isDeleted &&
    normalizedMessage &&
    getStandaloneMediaMessageUrl(normalizedMessage),
  );
  const hasTextBubble = Boolean(normalizedMessage && !isMediaOnlyMessage);
  const canReply = !isOptimistic;
  const canReact = !isOptimistic && !isDeleted;
  const canEdit =
    isOwnMessage && !isOptimistic && !isDeleted && Boolean(normalizedMessage);
  const canDelete = isOwnMessage && !isOptimistic && !isDeleted;

  const groupedReactions = Array.from(
    reactions
      .reduce<
        Map<
          string,
          { emoji: string; count: number; reactedByCurrentUser: boolean }
        >
      >((map, reaction) => {
        const existing = map.get(reaction.emoji) ?? {
          emoji: reaction.emoji,
          count: 0,
          reactedByCurrentUser: false,
        };
        existing.count += 1;
        if (reaction.userId === currentUserId) {
          existing.reactedByCurrentUser = true;
        }
        map.set(reaction.emoji, existing);
        return map;
      }, new Map())
      .values(),
  ).sort(
    (left, right) =>
      QUICK_REACTIONS.indexOf(left.emoji as (typeof QUICK_REACTIONS)[number]) -
      QUICK_REACTIONS.indexOf(right.emoji as (typeof QUICK_REACTIONS)[number]),
  );

  const formatBubbleTime = (timestamp: Date | string | null) => {
    if (!timestamp) return "";
    return format(new Date(timestamp), "h:mm a");
  };

  const renderInlineTimestamp = () => (
    <div className="flex shrink-0 items-center gap-1 text-[11px] font-medium opacity-55">
      {message.editedAt && !message.deletedAt && <span>edited</span>}
      <span>{formatBubbleTime(message.timestamp)}</span>
    </div>
  );

  const renderReplyPreview = () => {
    if (!message.replyTo) {
      return null;
    }

    const replyAuthor =
      message.replyTo.senderId === currentUserId
        ? "You"
        : message.replyTo.sender.username;
    const replyPreviewText = message.replyTo.deletedAt
      ? "Message deleted"
      : message.replyTo.message || "Message";

    return (
      <div
        className={cn(
          "mb-2 rounded-xl border px-3 py-2 text-left",
          isOwnMessage
            ? "border-black/10 bg-black/10 text-brand-msg-sent-text/80"
            : "border-black/10 bg-black/5 text-brand-msg-received-text/80",
        )}
      >
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] opacity-75">
          {replyAuthor}
        </p>
        <p className="truncate text-sm">{replyPreviewText}</p>
      </div>
    );
  };

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    longPressOriginRef.current = null;
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  const handleMessagePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") {
        return;
      }

      clearLongPress();
      longPressOriginRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      longPressTimerRef.current = setTimeout(() => {
        setIsActionMenuOpen(true);
        longPressTimerRef.current = null;
      }, 450);
    },
    [clearLongPress],
  );

  const handleMessagePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!longPressOriginRef.current || longPressTimerRef.current === null) {
        return;
      }

      const movedX = Math.abs(event.clientX - longPressOriginRef.current.x);
      const movedY = Math.abs(event.clientY - longPressOriginRef.current.y);

      if (movedX > 8 || movedY > 8) {
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  return (
    <div
      className={`message-bubble flex items-start gap-2 ${
        isOwnMessage ? "justify-end" : ""
      } ${isOptimistic ? "opacity-70" : ""}`}
      data-testid={`message-${message.msgId}`}
    >
      {!isOwnMessage && (
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-black shadow-sm"
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
        <div
          className={cn(
            "group/message relative flex items-start gap-1",
            isOwnMessage && "flex-row-reverse",
          )}
          onPointerDown={handleMessagePointerDown}
          onPointerMove={handleMessagePointerMove}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
          onPointerLeave={clearLongPress}
        >
          <div
            className={cn(
              "relative overflow-visible transition-all duration-300",
              groupedReactions.length > 0 && "pb-3",
            )}
          >
            {pendingAttachment && (
              <div className="flex flex-wrap gap-2">
                <div
                  className={cn(
                    "relative overflow-hidden rounded-2xl border border-brand-border bg-muted/30 shadow-sm",
                    isVideoAttachmentType(pendingAttachment.file.type)
                      ? "w-full max-w-xs sm:max-w-sm"
                      : "h-28 w-28 sm:h-32 sm:w-32",
                  )}
                >
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
                  ) : isVideoAttachmentType(pendingAttachment.file.type) ? (
                    <VideoAttachmentCard
                      src={pendingAttachment.previewUrl}
                      title={pendingAttachment.file.name}
                      mimeType={pendingAttachment.file.type}
                      showOverlay
                      overlayLabel={
                        pendingAttachment.status === "uploading"
                          ? "Uploading..."
                          : "Sending..."
                      }
                    />
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
                    ) : isVideoAttachmentType(attachment.fileType) ? (
                      <VideoAttachmentCard
                        src={attachment.url}
                        title={attachment.filename}
                        mimeType={attachment.fileType}
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
                {(message.message &&
                  message.message !== "Sent an attachment") ||
                message.replyTo ? (
                  <div
                    className={`rounded-[0.95rem] px-3 py-1.5 text-base leading-5 shadow-sm ${
                      isOwnMessage
                        ? "bg-brand-msg-sent text-brand-msg-sent-text"
                        : "bg-brand-msg-received text-brand-msg-received-text"
                    }`}
                  >
                    {renderReplyPreview()}
                    {message.message &&
                      message.message !== "Sent an attachment" && (
                        <div className="flex items-end gap-2">
                          <div className="min-w-0 flex-1">
                            <MessageContent
                              content={message.message}
                              onImagePreview={onImagePreview}
                            />
                          </div>
                          {renderInlineTimestamp()}
                        </div>
                      )}
                  </div>
                ) : null}
              </div>
            ) : (
              !pendingAttachment && (
                <div
                  className={
                    isMediaOnlyMessage
                      ? ""
                      : `rounded-[0.95rem] px-3 py-1.5 text-base leading-5 shadow-sm ${
                          isOwnMessage
                            ? "bg-brand-msg-sent text-brand-msg-sent-text"
                            : "bg-brand-msg-received text-brand-msg-received-text"
                        }`
                  }
                >
                  {!isMediaOnlyMessage && renderReplyPreview()}
                  {isMediaOnlyMessage ? (
                    <MessageContent
                      content={message.message}
                      onImagePreview={onImagePreview}
                    />
                  ) : (
                    <div className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <MessageContent
                          content={normalizedMessage}
                          onImagePreview={onImagePreview}
                        />
                      </div>
                      {renderInlineTimestamp()}
                    </div>
                  )}
                </div>
              )
            )}

            {groupedReactions.length > 0 && (
              <div
                className={cn(
                  "absolute -bottom-1 z-10",
                  isOwnMessage ? "right-2" : "right-2",
                )}
              >
                <div className="inline-flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 overflow-x-auto rounded-full bg-muted px-0.5 py-0.5 shadow-sm scrollbar-none">
                  {groupedReactions.map((reaction) => (
                    <button
                      key={reaction.emoji}
                      type="button"
                      onClick={() => onReact(message, reaction.emoji)}
                      className={cn(
                        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[11px] font-medium leading-none transition-colors",
                        reaction.reactedByCurrentUser
                          ? "border-primary/25 bg-primary/10 text-primary"
                          : "border-border/60 bg-card/95 text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <span>{reaction.emoji}</span>
                      <span
                        className={cn(
                          "inline-flex min-w-[1rem] items-center justify-center rounded-sm px-1 py-[1px] text-[10px] font-semibold",
                          reaction.reactedByCurrentUser
                            ? "bg-primary/15 text-primary"
                            : "bg-background/90 text-foreground/80",
                        )}
                      >
                        {reaction.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!isOptimistic && (
            <div
              className={cn(
                "overflow-hidden transition-all duration-150",
                isActionMenuOpen
                  ? "w-7 opacity-100"
                  : "w-0 opacity-0 pointer-events-none md:group-hover/message:w-7 md:group-hover/message:opacity-100 md:group-hover/message:pointer-events-auto md:group-focus-within/message:w-7 md:group-focus-within/message:opacity-100 md:group-focus-within/message:pointer-events-auto",
              )}
            >
              <DropdownMenu
                open={isActionMenuOpen}
                onOpenChange={setIsActionMenuOpen}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                    title="Message actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align={isOwnMessage ? "start" : "end"}
                  onCloseAutoFocus={(event) => {
                    if (!shouldRestoreComposerFocusRef.current) {
                      return;
                    }

                    event.preventDefault();
                    shouldRestoreComposerFocusRef.current = false;
                    requestAnimationFrame(() => {
                      onKeepComposerFocus?.();
                    });
                  }}
                >
                  {canReply && (
                    <DropdownMenuItem
                      onClick={() => {
                        shouldRestoreComposerFocusRef.current = true;
                        onReply(message);
                      }}
                    >
                      <Reply className="mr-2 h-4 w-4" />
                      Reply
                    </DropdownMenuItem>
                  )}
                  {canEdit && (
                    <DropdownMenuItem
                      onClick={() => {
                        shouldRestoreComposerFocusRef.current = true;
                        onEdit(message);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <DropdownMenuItem onClick={() => onDelete(message)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                  {canReact && (
                    <div className="px-2 pb-2 pt-1">
                      <div className="flex items-center gap-1">
                        {QUICK_REACTIONS.map((emoji) => (
                          <DropdownMenuItem
                            key={emoji}
                            className="h-9 w-9 justify-center rounded-full p-0 text-base leading-none"
                            onSelect={() => onReact(message, emoji)}
                          >
                            {emoji}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        {!hasTextBubble && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {message.editedAt && !message.deletedAt && <span>edited</span>}
            <span>{formatBubbleTime(message.timestamp)}</span>
          </div>
        )}
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
  autoFocusSearch = true,
  showSearch = true,
  showCategories = true,
  showStatus = true,
  showFooter = true,
  className,
}: {
  onGifClick: (url: string) => void;
  autoFocusSearch?: boolean;
  showSearch?: boolean;
  showCategories?: boolean;
  showStatus?: boolean;
  showFooter?: boolean;
  className?: string;
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
    if (!autoFocusSearch || !showSearch) {
      return;
    }

    const timeout = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timeout);
  }, [autoFocusSearch, showSearch]);

  useEffect(() => {
    void fetchCategories();
  }, []);

  const fetchTrending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${TENOR_BASE_URL}/featured?key=${TENOR_API_KEY}&client_key=${TENOR_CLIENT_KEY}&limit=30&media_filter=tinygif,gif`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as {
        results?: TenorGif[];
        next?: string;
      };
      setGifs(data.results || []);
      nextPosRef.current = data.next || "";
    } catch {
      setError("Failed to load GIFs");
    } finally {
      setLoading(false);
    }
  }, []);

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

  const searchGifs = useCallback(
    async (query: string) => {
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
        const data = (await res.json()) as {
          results?: TenorGif[];
          next?: string;
        };
        setGifs(data.results || []);
        nextPosRef.current = data.next || "";
      } catch {
        setError("Search failed. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [fetchTrending],
  );

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const delay = searchTerm.trim() ? 400 : 0;
    searchTimeoutRef.current = setTimeout(() => {
      void searchGifs(searchTerm);
    }, delay);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, [searchTerm, searchGifs]);

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
      className={cn(
        "flex h-[20rem] w-full max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl font-sans",
        className,
      )}
    >
      {showSearch && (
        <div className="flex-shrink-0 px-3 pb-2 pt-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-input px-3 py-2">
            <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search GIFs..."
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  inputRef.current?.focus();
                }}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {showCategories && !searchTerm && categories.length > 0 && (
        <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto border-b border-border px-3 py-2 no-scrollbar">
          {categories.map((category) => (
            <button
              key={category.searchterm}
              onClick={() => {
                setSearchTerm(category.searchterm);
              }}
              className="whitespace-nowrap rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {category.searchterm}
            </button>
          ))}
        </div>
      )}

      {showStatus && (
        <div className="flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          <span className="text-[10px] font-medium uppercase tracking-wider">
            {searchTerm ? `Results for "${searchTerm}"` : "Trending"}
          </span>
        </div>
      )}

      <div
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden px-2",
          showFooter ? "pb-2" : "pb-3",
          showSearch || showCategories || showStatus ? "pt-0" : "pt-2",
        )}
        style={{ scrollbarWidth: "none" }}
      >
        {loading && gifs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Loading GIFs...
              </span>
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
                className="group relative mb-1.5 block w-full cursor-pointer overflow-hidden rounded transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card"
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

      {showFooter && (
        <div className="flex flex-shrink-0 items-center justify-center border-t border-border px-3 py-1.5">
          <span className="text-[9px] text-muted-foreground">
            Powered by Tenor
          </span>
        </div>
      )}
    </div>
  );
}
