import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useActiveChat } from "@/hooks/use-active-chat";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getStoredToken } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { User, Message } from "@shared/schema";
import {
  Phone,
  Video,
  MoreVertical,
  Paperclip,
  Smile,
  Send,
  ArrowLeft,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { MessageBubble } from "./message-bubble";
import { useIsMobile } from "@/hooks/use-mobile";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import { useChatTheme, ChatTheme } from "@/hooks/use-chat-theme";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";

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

// Helper functions moved to message-bubble component
const getUserInitials = (username: string) => {
  return username.slice(0, 2).toUpperCase();
};

const getAvatarColor = (username: string) => {
  const colors = [
    "from-blue-500 to-purple-500",
    "from-green-500 to-teal-500",
    "from-orange-500 to-red-500",
    "from-purple-500 to-pink-500",
    "from-indigo-500 to-blue-500",
    "from-yellow-500 to-orange-500",
  ];
  const index = username.length % colors.length;
  return colors[index];
};

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
  const { user } = useAuth();
  const {
    sendMessage,
    startTyping,
    stopTyping,
    isConnected,
    typingUsers,
    onlineUsers,
  } = useSocket();
  const { liveMessages, addOptimisticMessage, removeOptimisticMessage } =
    useActiveChat();
  const isMobile = useIsMobile();
  const { keyboardHeight, isKeyboardVisible } = useKeyboardHeight();
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const { getThemeForUser, setThemeForUser, availableThemes } = useChatTheme();
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

  const currentTheme: ChatTheme = getThemeForUser(selectedUser?.userId ?? null);
  const themeClass = `chat-theme-${currentTheme}`;

  // Fetch message history when user is selected (cursor-based) with caching
  const {
    data: pagedMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery<{ messages: Message[]; nextCursor: string | null }>({
    queryKey: ["/api/messages/history", selectedUser?.userId],
    enabled: !!selectedUser?.userId,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    // Refetch when user returns to the chat (staleTime: 0 means always stale)
    staleTime: 0,
    // Keep cached data for 30 minutes (prevents flicker on re-render)
    gcTime: 30 * 60 * 1000,
    // Refetch on mount to get latest messages when returning to chat
    refetchOnMount: true,
    // Don't refetch on window focus for better UX
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

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessageText((prev) => prev + emojiData.emoji);
    // Keep picker open for multiple emojis
  };

  // Generate unique client-side ID for optimistic updates
  const generateClientMessageId = useCallback(() => {
    return globalThis.crypto &&
      typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }, []);

  const handleSendMessage = useCallback(() => {
    if (!selectedUser || !messageText.trim() || !user) return;

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

    // Send via socket with the SAME clientMessageId for matching
    sendMessage(
      selectedUser.userId,
      trimmedMessage,
      undefined,
      clientMessageId,
    );

    setMessageText("");
    setShowEmojiPicker(false);

    if (isTyping && selectedUser) {
      stopTyping(selectedUser.userId);
      setIsTyping(false);
    }
  }, [
    selectedUser,
    messageText,
    user,
    sendMessage,
    stopTyping,
    isTyping,
    generateClientMessageId,
    addOptimisticMessage,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);

    if (!selectedUser) return;

    // Handle typing indicators
    if (e.target.value.trim() && !isTyping) {
      setIsTyping(true);
      startTyping(selectedUser.userId);
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping && selectedUser) {
        setIsTyping(false);
        stopTyping(selectedUser.userId);
      }
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
      sendMessage(
        selectedUser.userId,
        "",
        {
          url: uploaded.url,
          filename: uploaded.filename,
          fileType: uploaded.fileType,
        },
        attachmentId,
      );

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

  return (
    <div
      className={cn(
        "flex-1 flex flex-col h-full relative overflow-hidden",
        themeClass,
      )}
    >
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
              <DropdownMenuLabel>Chat Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={currentTheme}
                onValueChange={(val) =>
                  setThemeForUser(
                    selectedUser?.userId ?? null,
                    val as ChatTheme,
                  )
                }
              >
                {availableThemes.map((t) => (
                  <DropdownMenuRadioItem key={t.id} value={t.id}>
                    {t.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-background min-h-0 relative overscroll-contain"
        onScroll={handleScroll}
        style={
          {
            // When keyboard is visible on mobile, add padding equal to keyboard height plus
            // the input bar area so messages are not hidden. Previously code subtracted a
            // magic number which caused excessive empty space. Use addition to avoid that.
            // paddingBottom: isMobile && isKeyboardVisible ? `${Math.max(keyboardHeight , 0)}px` : '0px',
          }
        }
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

        {displayedMessages.map((message) => {
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
        <div className="absolute bottom-28 left-1/2 transform -translate-x-1/2 z-50">
          <Button
            onClick={() => scrollToBottom("smooth")}
            className="rounded-full px-4 py-2 shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
            size="sm"
          >
            <ChevronDown className="w-4 h-4" />
            New message
          </Button>
        </div>
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
              className="min-h-[44px] max-h-32 px-4 py-3 pr-12 bg-input text-foreground placeholder:text-muted-foreground border border-border resize-none rounded-lg"
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
                className="absolute right-1 bottom-1 h-10 w-10 flex items-center justify-center"
                title="Add Emoji"
                data-testid="button-emoji"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
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
                      ["midnight", "forest", "sunset"].includes(currentTheme)
                        ? ("dark" as any)
                        : ("light" as any)
                    }
                    lazyLoadEmojis={true}
                  />
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
  );
}
