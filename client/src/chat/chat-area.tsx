import { Fragment, useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { getStoredToken } from "@/lib/auth-storage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  User,
  Message,
  FriendRequest,
  MessageReactionWithUser,
} from "@shared/schema";
import {
  Ban,
  Heart,
  Phone,
  Video,
  MoreVertical,
  Image as ImageIcon,
  Camera,
  Smile,
  Send,
  ArrowLeft,
  Loader2,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import {
  apiRequest,
  fetchWithTimeout,
  readJsonResponse,
} from "@/lib/api-client";
import { queryClient } from "@/lib/queryClient";
import { getStoredTheme } from "@/lib/theme";
import EmojiPicker, {
  EmojiClickData,
  Theme as EmojiPickerTheme,
} from "emoji-picker-react";
import { GifPicker } from "./gif-picker";
import {
  getReplyPreviewText,
  stripConversationAttachments,
} from "./chat-message-utils";
import { FriendRequestCard, MessageBubble } from "./chat-message-components";

const getMessageHistoryQueryKey = (userId: number) =>
  ["/api/messages/history", userId] as const;

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_INPUT_ACCEPT = "image/*,video/mp4,video/webm";
const CONVERSATION_STATS_QUERY_KEY = ["conversations-stats"] as const;
const IS_DEV = import.meta.env.DEV;
const EXACT_BOTTOM_THRESHOLD_PX = 24;
const AUTO_SCROLL_NEAR_BOTTOM_THRESHOLD_PX = 160;
const BUBBLE_APPENDIX_PATH =
  "M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z";

function isUploadableAttachmentType(fileType: string): boolean {
  return (
    fileType.startsWith("image/") ||
    fileType === "video/mp4" ||
    fileType === "video/webm"
  );
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

type ImagePreviewState = {
  url: string;
};

function invalidateConversationStatsQueries() {
  void queryClient.invalidateQueries({
    queryKey: CONVERSATION_STATS_QUERY_KEY,
  });
}

function getTimelineDatePillLabel(timestamp: number): string {
  const date = new Date(timestamp);

  if (isToday(date)) {
    return "Today";
  }

  if (isYesterday(date)) {
    return "Yesterday";
  }

  return format(date, "MMMM d, yyyy");
}

function getDistanceFromBottom(container: HTMLDivElement): number {
  return container.scrollHeight - container.scrollTop - container.clientHeight;
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
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const isNearBottomRef = useRef(true);

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
      const cursorParam = pageParam ? `&cursor=${pageParam}` : "";
      const res = await apiRequest(
        "GET",
        `/api/messages/${selectedUser.userId}/history?limit=40${cursorParam}`,
      );
      return readJsonResponse<{
        messages: Message[];
        nextCursor: string | null;
      }>(res);
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
    enabled: !!selectedUser?.userId && !!user,
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
      void queryClient.invalidateQueries({
        queryKey: ["/api/users/friends"],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ["/api/users/friends"],
      });
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
      invalidateConversationStatsQueries();
      void queryClient.invalidateQueries({
        queryKey: ["/api/users/history"],
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
      invalidateConversationStatsQueries();
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
      void queryClient.invalidateQueries({
        queryKey: ["/api/users/friends"],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ["/api/users/friends"],
      });
      void refreshOnlineUsers();
      setReplyTarget(null);
      setEditTarget(null);
      toast({
        title: "User blocked",
        description: data.friendshipStatus.blockedByUser
          ? `You blocked ${selectedUser.username}. ${selectedUser.username} has also blocked you.`
          : `You blocked ${selectedUser.username}.`,
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
      void queryClient.invalidateQueries({
        queryKey: ["/api/users/friends"],
      });
      void refreshOnlineUsers();
      toast({
        title: "User unblocked",
        description: data.friendshipStatus.blockedByUser
          ? `You unblocked ${selectedUser.username}, but ${selectedUser.username} still has you blocked.`
          : `You unblocked ${selectedUser.username}.`,
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

      if (
        data.reason === "block_user" &&
        nextStatus.blockedByUser &&
        !nextStatus.blockedByMe
      ) {
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
  const showEmptyConversationState =
    timelineItems.length === 0 && !typingUsers.has(selectedUser?.userId ?? -1);

  // Smart scroll - only scroll to bottom for new messages, not when loading history
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messagesContainerRef.current;

    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }

    setShowNewMessageIndicator(false);
    setIsAtBottom(true);
    isNearBottomRef.current = true;
  }, []);

  // Track scroll position to determine if user is at bottom (Instagram-style)
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const distanceFromBottom = getDistanceFromBottom(container);
    const atBottom = distanceFromBottom <= EXACT_BOTTOM_THRESHOLD_PX;
    const isNearBottom =
      distanceFromBottom <= AUTO_SCROLL_NEAR_BOTTOM_THRESHOLD_PX;

    setIsAtBottom(atBottom);
    isNearBottomRef.current = isNearBottom;

    // Hide new message indicator when user scrolls to bottom
    if (isNearBottom) {
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
    isNearBottomRef.current = true;
    setIsAtBottom(true);
    setShowNewMessageIndicator(false);
  }, [selectedUser?.userId]);

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
      const shouldAutoScroll = isNearBottomRef.current;

      if (shouldAutoScroll) {
        requestAnimationFrame(() => {
          scrollToBottom(userSentMessageRef.current ? "smooth" : "auto");
        });
      } else {
        setShowNewMessageIndicator(true);
      }

      userSentMessageRef.current = false;
    }

    prevMessageCountRef.current = currentCount;
    prevLastMessageIdRef.current = lastMessageId;
  }, [displayedMessages, scrollToBottom]);

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
      typingTimeoutRef.current = null;
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

  const handleBlockedSendAttempt = useCallback(() => {
    const blockedByMe = friendshipStatusQuery.data?.blockedByMe ?? false;
    const blockedByUser = friendshipStatusQuery.data?.blockedByUser ?? false;
    const description = blockedByMe
      ? blockedByUser
        ? `You and ${selectedUser?.username ?? "this user"} have blocked each other.`
        : "Unblock this user to send messages."
      : `${selectedUser?.username ?? "This user"} has blocked you.`;

    toast({
      title: "Message not sent",
      description,
      variant: "destructive",
    });
  }, [
    friendshipStatusQuery.data?.blockedByMe,
    friendshipStatusQuery.data?.blockedByUser,
    selectedUser,
    toast,
  ]);

  const canSendPrivateMessage = useCallback(() => {
    if (friendshipStatusQuery.data?.isBlocked) {
      handleBlockedSendAttempt();
      return false;
    }

    if (socket?.connected && isConnected && user) {
      return true;
    }

    handleSendUnavailable("Reconnect and try again.");
    return false;
  }, [
    friendshipStatusQuery.data?.isBlocked,
    socket,
    isConnected,
    user,
    handleBlockedSendAttempt,
    handleSendUnavailable,
  ]);

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
        const res = await fetchWithTimeout("/api/upload", {
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
        if (IS_DEV) {
          console.error("Attachment upload failed", error);
        }

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
          ? isBlockedByUser
            ? "You and this user have blocked each other. Unblock them first."
            : "Unblock this user first."
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

  const isFriend = friendshipStatusQuery.data?.isFriend ?? false;
  const pendingDirection = friendshipStatusQuery.data?.pendingDirection ?? null;
  const isChatBlocked = friendshipStatusQuery.data?.isBlocked ?? false;
  const isBlockedByMe = friendshipStatusQuery.data?.blockedByMe ?? false;
  const isBlockedByUser = friendshipStatusQuery.data?.blockedByUser ?? false;
  const isMutualBlock = isBlockedByMe && isBlockedByUser;
  const selectedUsername = selectedUser?.username ?? "this user";
  const friendshipActionLabel = removeFriendMutation.isPending
    ? "Removing Friend..."
    : addFriendMutation.isPending
      ? "Sending Request..."
      : isFriend
        ? "Remove Friend"
        : pendingDirection === "outgoing"
          ? "Request Sent"
          : pendingDirection === "incoming"
            ? "Respond in Chat"
            : "Add Friend";
  const isFriendshipActionDisabled =
    friendshipStatusQuery.isLoading ||
    addFriendMutation.isPending ||
    removeFriendMutation.isPending ||
    isChatBlocked ||
    pendingDirection === "incoming" ||
    pendingDirection === "outgoing";
  const blockedNotice = isMutualBlock
    ? `You blocked ${selectedUsername}. ${selectedUsername} has also blocked you.`
    : isBlockedByMe
      ? `You blocked ${selectedUsername}.`
      : isBlockedByUser
        ? `${selectedUsername} has blocked you.`
        : "";
  const confirmDialogTitle =
    confirmDialogAction === "chat"
      ? "Clear chat"
      : confirmDialogAction === "attachments"
        ? "Clear attachments"
        : confirmDialogAction === "removeFriend"
          ? "Remove friend"
          : confirmDialogAction === "blockUser"
            ? "Block user"
            : confirmDialogAction === "unblockUser"
              ? "Unblock user"
              : "";
  const confirmDialogDescription =
    confirmDialogAction === "chat"
      ? `This will permanently delete the entire chat with ${selectedUsername} for both users.`
      : confirmDialogAction === "attachments"
        ? `This will permanently delete all attachments exchanged with ${selectedUsername} for both users.`
        : confirmDialogAction === "removeFriend"
          ? `This will remove ${selectedUsername} from your friends list.`
          : confirmDialogAction === "blockUser"
            ? isBlockedByUser
              ? `This will also block ${selectedUsername}. You and ${selectedUsername} will no longer be able to message each other.`
              : `This will block ${selectedUsername}, remove any friendship, and stop future direct messages.`
            : confirmDialogAction === "unblockUser"
              ? isBlockedByUser
                ? `This will unblock ${selectedUsername}, but ${selectedUsername} still has you blocked. Direct messages will remain unavailable until they unblock you.`
                : `This will unblock ${selectedUsername} and allow direct messages again.`
              : "";
  const blockMenuLabel = isBlockedByMe ? "Unblock user" : "Block user";

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

  const handleFriendshipAction = () => {
    if (isFriend) {
      handleRemoveFriend();
      return;
    }

    handleAddFriend();
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
      <div className="flex min-w-0 flex-1">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.14),transparent_40%)] dark:bg-[radial-gradient(circle_at_top,rgba(71,85,105,0.3),transparent_44%)]" />
          <div className="relative flex h-full flex-col">
            <div className="flex flex-1 items-center justify-center p-6 lg:p-10">
              <div className="w-full max-w-3xl p-8 text-center lg:p-10">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-primary/10 text-primary">
                  <Send className="h-8 w-8" />
                </div>
                <p className="text-xl font-semibold tracking-tight text-foreground mt-6">
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
              className="h-auto w-auto min-w-[min(82vw,28rem)] max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] rounded-2xl object-contain shadow-2xl outline-none"
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
            <AlertDialogTitle>{confirmDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialogDescription}</AlertDialogDescription>
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
            : "flex min-w-0 overflow-hidden",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden",
            isMobile
              ? "h-full bg-background"
              : "bg-background",
          )}
        >
          {/* Chat Header */}
          <div className="z-40 flex flex-shrink-0 items-center justify-between bg-card p-2.5 md:border-b md:border-border/70 md:px-5 md:py-2.5">
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
                        ? isBlockedByUser
                          ? "Blocked"
                          : "Blocked"
                        : "Blocked you"
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Voice calls coming soon"
                      aria-label="Voice calls coming soon"
                      disabled
                      data-testid="button-voice-call"
                    >
                      <Phone className="w-5 h-5 text-muted-foreground" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Voice calls are coming soon.</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Video calls coming soon"
                      aria-label="Video calls coming soon"
                      disabled
                      data-testid="button-video-call"
                    >
                      <Video className="w-5 h-5 text-muted-foreground" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Video calls are coming soon.</TooltipContent>
              </Tooltip>
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
                    onClick={handleFriendshipAction}
                    disabled={isFriendshipActionDisabled}
                  >
                    {isFriend ? (
                      <UserMinus className="mr-2 h-4 w-4" />
                    ) : (
                      <Heart className="mr-2 h-4 w-4" />
                    )}
                    {friendshipActionLabel}
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
                        : blockMenuLabel
                      : blockUserMutation.isPending
                        ? "Blocking user..."
                        : blockMenuLabel}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleClearAttachments}
                    disabled={clearAttachmentsMutation.isPending}
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    {clearAttachmentsMutation.isPending
                      ? "Clearing attachments..."
                      : "Clear attachments"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleClearChat}
                    disabled={clearChatMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
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
            className="relative min-h-0 flex-1 overflow-y-auto space-y-1.5 bg-background px-4 -mb-1 scrollbar-none overscroll-contain md:px-8"
            onScroll={handleScroll}
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-label={`Conversation with ${selectedUser.username}`}
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

            {showEmptyConversationState && (
              <div className="flex min-h-full items-center justify-center py-6">
                <div className="relative w-full max-w-[21rem] overflow-hidden rounded-[2rem] border border-border/60 bg-card px-6 py-6 text-center">
                  <div className="relative">
                    <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">
                      No messages here yet
                    </h3>
                    <p className="mt-3 text-[.8rem] text-muted-foreground">
                      Send a message and Start the conversation with {selectedUser.username}!
                    </p>
                  </div>
                </div>
              </div>
            )}

            {timelineItems.map((item, index) => {
              const previousItem = timelineItems[index - 1];
              const currentDateKey = format(
                new Date(item.timestamp),
                "yyyy-MM-dd",
              );
              const previousDateKey = previousItem
                ? format(new Date(previousItem.timestamp), "yyyy-MM-dd")
                : null;
              const shouldShowDatePill = currentDateKey !== previousDateKey;
              const itemKey =
                item.type === "friendRequest"
                  ? `friend-request-${item.request.id}`
                  : String(
                      (item.message as OptimisticMessage).clientMessageId ||
                        item.message.msgId,
                    );

              return (
                <Fragment key={itemKey}>
                  {shouldShowDatePill && (
                    <div className="flex justify-center py-2">
                      <span className="inline-flex items-center rounded-full border border-border/60 bg-card/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
                        {getTimelineDatePillLabel(item.timestamp)}
                      </span>
                    </div>
                  )}

                  {item.type === "friendRequest" ? (
                    <FriendRequestCard
                      request={item.request}
                      direction={item.direction}
                      otherUsername={selectedUser.username}
                      isPendingAction={respondToFriendRequestMutation.isPending}
                      onAccept={handleAcceptFriendRequest}
                      onReject={handleRejectFriendRequest}
                    />
                  ) : (
                    <MessageBubble
                      message={item.message}
                      isOwnMessage={item.message.senderId === user?.userId}
                      sender={
                        item.message.senderId === user?.userId
                          ? user
                          : selectedUser
                      }
                      currentUserId={user?.userId ?? null}
                      isOptimistic={
                        (item.message as OptimisticMessage).isOptimistic
                      }
                      pendingAttachment={
                        (item.message as OptimisticMessage).clientMessageId
                          ? pendingAttachments.find(
                              (p) =>
                                p.id ===
                                (item.message as OptimisticMessage)
                                  .clientMessageId,
                            )
                          : null
                      }
                      onImagePreview={setImagePreview}
                      onReply={handleReplyToMessage}
                      onEdit={handleEditMessageStart}
                      onDelete={handleDeleteSingleMessage}
                      onReact={handleToggleReactionSafe}
                      onKeepComposerFocus={focusMessageInput}
                    />
                  )}
                </Fragment>
              );
            })}

            {/* Typing Indicator */}
            {typingUsers.has(selectedUser.userId) && (
              <div className="flex items-start message-bubble">
                <div className="flex flex-col gap-1 max-w-xs lg:max-w-md">
                  <div className="relative overflow-visible rounded-[15px] rounded-bl-none bg-brand-msg-received p-3 text-brand-msg-received-text shadow-sm">
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"></div>
                      <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce delay-75"></div>
                      <div className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce delay-150"></div>
                    </div>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 9 18"
                      className="pointer-events-none absolute bottom-[-1px] left-[-9px] h-[18px] w-[9px]"
                      style={{ transform: "scaleX(-1)" }}
                    >
                      <defs>
                        <filter
                          id="typing-bubble-appendix-shadow"
                          x="-40%"
                          y="-30%"
                          width="180%"
                          height="180%"
                          colorInterpolationFilters="sRGB"
                        >
                          <feGaussianBlur
                            in="SourceAlpha"
                            stdDeviation="0.55"
                            result="blur"
                          />
                          <feOffset in="blur" dy="0.8" result="offset" />
                          <feComponentTransfer in="offset" result="shadow">
                            <feFuncA type="linear" slope="0.2" />
                          </feComponentTransfer>
                          <feMerge>
                            <feMergeNode in="shadow" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      <path
                        d={BUBBLE_APPENDIX_PATH}
                        fill="var(--brand-msg-received)"
                        filter="url(#typing-bubble-appendix-shadow)"
                      />
                    </svg>
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
              paddingBottom: "2px",
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
            <div className="px-2 pt-2 pb-1 md:pb-1">
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
                  <div className="relative rounded-[1rem] border bg-card border-border bg-card px-6 shadow-sm">
                    {(replyTarget || editTarget) && (
                      <div className="flex items-start justify-between gap-3 border-b border-border/70 py-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {editTarget ? "Editing message" : "Replying to"}
                          </p>
                          <p
                            className="min-w-0 whitespace-pre-wrap break-words text-sm text-foreground"
                            style={{
                              wordBreak: "break-word",
                              overflowWrap: "anywhere",
                            }}
                          >
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
                      aria-label={
                        editTarget
                          ? `Edit message to ${selectedUser.username}`
                          : `Message ${selectedUser.username}`
                      }
                      className={cn(
                        "min-h-[40px] max-h-32 rounded-none border-0 bg-card px-0 py-3 text-sm text-foreground placeholder:text-muted-foreground shadow-none resize-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                        hasDraftText || editTarget
                          ? "pr-12"
                          : "pl-6 pr-14 sm:pr-16",
                      )}
                      rows={1}
                      value={messageText}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      onFocus={handleInputFocus}
                      data-testid="textarea-message-input"
                    />
                    {!hasDraftText && !editTarget && (
                      <div className="absolute bottom-2 left-1.5 flex items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                          title="Take Photo"
                          aria-label="Take photo"
                          data-testid="button-camera"
                          onClick={() => {
                            closeComposerPicker();
                            cameraInputRef.current?.click();
                          }}
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    <div className="absolute bottom-2 right-1.5 flex items-center">
                      {hasDraftText || editTarget ? (
                        <Button
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={handleSendMessage}
                          disabled={!canSendDraft}
                          className="h-8 w-8 rounded-2xl"
                          size="icon"
                          title={editTarget ? "Save changes" : "Send Message"}
                          aria-label={editTarget ? "Save edited message" : "Send message"}
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
                            title="Attach File"
                            aria-label="Attach file"
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
                            aria-label={
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
