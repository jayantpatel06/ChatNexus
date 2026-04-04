import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { GlobalMessageWithSender, User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, ArrowLeft, Globe, Smile, Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import EmojiPicker, {
  EmojiClickData,
  Theme as EmojiPickerTheme,
} from "emoji-picker-react";
import { Seo } from "@/components/seo";
import { useToast } from "@/hooks/use-toast";
import { NewMessageIndicator } from "@/chat/new-message-indicator";
import { UsersSidebar } from "@/chat/users-sidebar";
import { useSocket } from "@/providers/socket-provider";
import { cn, getAvatarColor, getUserInitials } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

const PENDING_PRIVATE_CHAT_KEY = "chatnexus_pending_private_chat";
const GLOBAL_MESSAGES_QUERY_KEY = ["/api/global-messages"] as const;

export default function GlobalChat() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [messageInput, setMessageInput] = useState("");
  const isMobile = useIsMobile();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const composerPickerRef = useRef<HTMLDivElement>(null);
  const hasDraftText = messageInput.trim().length > 0;
  const isDarkTheme =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const removeGlobalMessagesFromCache = useCallback(
    (messageIds: number[]) => {
      if (messageIds.length === 0) {
        return;
      }

      const expiredIds = new Set(messageIds);
      queryClient.setQueryData<GlobalMessageWithSender[]>(
        GLOBAL_MESSAGES_QUERY_KEY,
        (oldMessages) =>
          oldMessages?.filter((message) => !expiredIds.has(message.id)) ?? [],
      );
    },
    [queryClient],
  );

  // Use shared smart scroll hook
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    showNewMessageIndicator,
    markUserSentMessage,
    scrollToBottom,
    handleScroll,
    handleMessagesChange,
  } = useSmartScroll({ currentUserId: user?.userId });

  const {
    data: messages = [],
    isLoading,
    error,
  } = useQuery<GlobalMessageWithSender[]>({
    queryKey: GLOBAL_MESSAGES_QUERY_KEY,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (data: { message: GlobalMessageWithSender }) => {
      queryClient.setQueryData<GlobalMessageWithSender[]>(
        GLOBAL_MESSAGES_QUERY_KEY,
        (old) => {
          if (!old) return [data.message];
          // Check if message already exists to prevent duplicates
          if (old.some((m) => m.id === data.message.id)) return old;
          return [...old, data.message];
        },
      );
    };

    const handleGlobalMessageError = (data: {
      error?: string;
    }) => {
      toast({
        title: "Message not sent",
        description: data.error ?? "Unable to send the message right now.",
        variant: "destructive",
      });
    };

    const handleExpiredMessagesDeleted = (data: { messageIds?: number[] }) => {
      removeGlobalMessagesFromCache(data.messageIds ?? []);
    };

    socket.on("global_message", handleNewMessage);
    socket.on("global_message_error", handleGlobalMessageError);
    socket.on("global_messages_deleted", handleExpiredMessagesDeleted);

    return () => {
      socket.off("global_message", handleNewMessage);
      socket.off("global_message_error", handleGlobalMessageError);
      socket.off("global_messages_deleted", handleExpiredMessagesDeleted);
    };
  }, [socket, queryClient, removeGlobalMessagesFromCache, toast]);

  // Handle scroll behavior when messages change
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    handleMessagesChange(messages, lastMessage?.id);
  }, [messages, handleMessagesChange]);

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessageInput((prev) => prev + emojiData.emoji);
  };

  const handleSendMessage = useCallback(() => {
    if (!messageInput.trim() || !socket) return;

    markUserSentMessage();
    socket.emit("global_message", {
      message: messageInput,
    });

    setMessageInput("");
    setShowEmojiPicker(false);
  }, [messageInput, socket]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputFocus = () => {
    setShowEmojiPicker(false);
    if (isMobile) {
      setTimeout(() => {
        scrollToBottom();
      }, 300);
    }
  };

  useEffect(() => {
    if (!showEmojiPicker) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        composerPickerRef.current?.contains(target)
      ) {
        return;
      }

      setShowEmojiPicker(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [showEmojiPicker]);

  const handlePrivateUserSelect = useCallback(
    (selectedUser: User) => {
      sessionStorage.setItem(
        PENDING_PRIVATE_CHAT_KEY,
        JSON.stringify(selectedUser),
      );
      setLocation("/dashboard");
    },
    [setLocation],
  );

  // Desktop: sidebar + global chat, Mobile: only global chat
  if (!isMobile) {
    return (
      <>
        <Seo
          title="Global Chat | ChatNexus"
          description="Protected global chat inside ChatNexus."
          path="/global-chat"
          robots="noindex, nofollow"
        />
        <div
          className="h-screen bg-brand-bg flex text-brand-text"
          data-testid="global-chat-desktop-layout"
        >
          <UsersSidebar
            selectedUser={null}
            onUserSelect={handlePrivateUserSelect}
          />
          <div className="flex-1 flex flex-col bg-background">
          {/* Chat Header */}
          <div className="bg-card  p-2.5 flex items-center justify-between flex-shrink-0 z-40">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                  title="Back to Dashboard"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--brand-grad-start)] to-[var(--brand-grad-end)] text-black flex items-center justify-center font-semibold">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Global Chat</h3>
                <p className="text-xs text-muted-foreground">Public room</p>
              </div>
            </div>
          </div>
          {/* Messages Area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto scrollbar-none overscroll-contain p-4 space-y-1 bg-background min-h-0 relative"
            onScroll={handleScroll}
          >
            {/* System Message */}
            <div className="flex justify-center my-2">
              <div className="rounded-full border border-border bg-card-muted/80 px-4 py-1.5 text-[11px] text-muted-foreground flex items-center gap-2">
                <div className="w-3 h-3 flex items-center justify-center grayscale">
                  🌍
                </div>
                Everyone can see these messages
              </div>
            </div>
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Loading messages...
                </p>
              </div>
            )}
            {error && !isLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <p className="text-sm text-destructive">
                  Failed to load messages
                </p>
              </div>
            )}
            {!isLoading && !error && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Globe className="w-12 h-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No messages yet. Start the conversation!
                </p>
              </div>
            )}
            {!isLoading && !error && messages.length > 0 && (
              <div className="space-y-1">
                {messages.map((msg) => (
                  <MessageListItem
                    key={msg.id}
                    messageId={msg.id}
                    message={msg.message}
                    timestamp={msg.timestamp}
                    senderUsername={msg.sender?.username || "Unknown"}
                    isCurrentUser={msg.senderId === user?.userId}
                  />
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          {showNewMessageIndicator && (
            <NewMessageIndicator onClick={() => scrollToBottom("smooth")} />
          )}
          <div
            className="relative overflow-visible bg-card-muted flex-shrink-0"
            style={{ paddingBottom: "6px" }}
          >
            <AnimatePresence initial={false}>
              {showEmojiPicker && (
                <motion.div
                  ref={composerPickerRef}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="absolute bottom-[calc(100%+0.4rem)] right-3 z-40 w-[24rem] max-w-[calc(100%-1.5rem)] overflow-hidden rounded-sm border border-border bg-card-muted font-sans backdrop-blur-xl"
                >
                  <div className="overflow-hidden font-sans">
                    <EmojiPicker
                      onEmojiClick={onEmojiClick}
                      width="100%"
                      height={320}
                      theme={
                        isDarkTheme
                          ? (EmojiPickerTheme.DARK as any)
                          : (EmojiPickerTheme.LIGHT as any)
                      }
                      autoFocusSearch={false}
                      searchPlaceholder="Search emoji"
                      lazyLoadEmojis={true}
                      previewConfig={{ showPreview: false }}
                      className="font-sans [--epr-bg-color:transparent] [--epr-picker-border-color:transparent] [--epr-picker-border-radius:0px] [--epr-emoji-size:24px] [--epr-emoji-padding:4px] [--epr-horizontal-padding:8px] [--epr-search-input-height:32px] [--epr-search-input-border-radius:9999px] [--epr-category-navigation-button-size:28px] [--epr-category-label-height:28px] [&_.epr-header-overlay]:pb-0"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="p-2">
              <div className="relative rounded-[1rem] border border-border bg-card px-6 shadow-sm">
                <Textarea
                  placeholder="Message..."
                  className={cn(
                    "min-h-[40px] max-h-32 rounded-none border-0 bg-card px-0 py-3 text-sm text-foreground placeholder:text-muted-foreground shadow-none resize-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                    hasDraftText ? "pr-12" : "pr-14",
                  )}
                  rows={1}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={handleInputFocus}
                  data-testid="textarea-message-input"
                />
                <div className="absolute inset-y-0 right-1.5 flex items-center">
                  {hasDraftText ? (
                    <Button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleSendMessage}
                      disabled={!hasDraftText}
                      className="h-8 w-8 rounded-2xl"
                      size="icon"
                      title="Send Message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                      title="Open emoji picker"
                      onClick={() => setShowEmojiPicker((prev) => !prev)}
                    >
                      <Smile className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </>
    );
  }

  // Mobile: original layout
  return (
    <>
      <Seo
        title="Global Chat | ChatNexus"
        description="Protected global chat inside ChatNexus."
        path="/global-chat"
        robots="noindex, nofollow"
      />
      <div className="h-[100dvh] bg-brand-bg flex flex-col">
      {/* Chat Header */}
      <div className="bg-card border-b border-border p-2.5 flex items-center justify-between flex-shrink-0 z-40">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button
              variant="ghost"
              size="sm"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--brand-grad-start)] to-[var(--brand-grad-end)] text-black flex items-center justify-center font-semibold">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Global Chat</h3>
            <p className="text-xs text-muted-foreground">Public room</p>
          </div>
        </div>
      </div>
      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto scrollbar-none overscroll-contain p-4 space-y-1 bg-background min-h-0 relative"
        onScroll={handleScroll}
      >
        {/* System Message */}
        <div className="flex justify-center my-2">
          <div className="rounded-full border border-border bg-card-muted/80 px-4 py-1.5 text-[11px] text-muted-foreground flex items-center gap-2">
            <div className="w-3 h-3 gap-1 flex items-center justify-center text-accent">
              🌍
            </div>
            Everyone can see these messages
          </div>
        </div>
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          </div>
        )}
        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-destructive">Failed to load messages</p>
          </div>
        )}
        {!isLoading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Globe className="w-12 h-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          </div>
        )}
        {!isLoading && !error && messages.length > 0 && (
          <div className="space-y-1">
            {messages.map((msg) => (
              <MessageListItem
                key={msg.id}
                messageId={msg.id}
                message={msg.message}
                timestamp={msg.timestamp}
                senderUsername={msg.sender?.username || "Unknown"}
                isCurrentUser={msg.senderId === user?.userId}
              />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {showNewMessageIndicator && (
        <NewMessageIndicator onClick={() => scrollToBottom("smooth")} />
      )}
      <div
        className="relative overflow-visible bg-card-muted flex-shrink-0"
        style={{ paddingBottom: "6px" }}
      >
        <AnimatePresence initial={false}>
          {showEmojiPicker && (
            <motion.div
              ref={composerPickerRef}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="absolute bottom-[calc(100%+0.4rem)] left-3 right-3 z-40 overflow-hidden rounded-sm border border-border bg-card-muted font-sans backdrop-blur-xl"
            >
              <div className="overflow-hidden font-sans">
                <EmojiPicker
                  onEmojiClick={onEmojiClick}
                  width="100%"
                  height={320}
                  theme={
                    isDarkTheme
                      ? (EmojiPickerTheme.DARK as any)
                      : (EmojiPickerTheme.LIGHT as any)
                  }
                  autoFocusSearch={false}
                  searchPlaceholder="Search emoji"
                  lazyLoadEmojis={true}
                  previewConfig={{ showPreview: false }}
                  className="font-sans [--epr-bg-color:transparent] [--epr-picker-border-color:transparent] [--epr-picker-border-radius:0px] [--epr-emoji-size:22px] [--epr-emoji-padding:4px] [--epr-horizontal-padding:8px] [--epr-search-input-height:30px] [--epr-search-input-border-radius:9999px] [--epr-category-navigation-button-size:26px] [--epr-category-label-height:26px] [&_.epr-header-overlay]:pb-0"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="p-2">
          <div className="relative rounded-[1rem] border border-border bg-card px-6 shadow-sm">
            <Textarea
              placeholder="Message..."
              className={cn(
                "min-h-[40px] max-h-32 rounded-none border-0 bg-transparent px-0 py-3 text-sm text-foreground placeholder:text-muted-foreground shadow-none resize-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                hasDraftText ? "pr-12" : "pr-14",
              )}
              rows={1}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              data-testid="textarea-message-input"
            />
            <div className="absolute inset-y-0 right-1.5 flex items-center">
              {hasDraftText ? (
                <Button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSendMessage}
                  disabled={!hasDraftText}
                  className="h-8 w-8 rounded-2xl"
                  size="icon"
                  title="Send Message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                  title="Open emoji picker"
                  onClick={() => setShowEmojiPicker((prev) => !prev)}
                >
                  <Smile className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

function useSmartScroll(
  options: {
    bottomThreshold?: number;
    currentUserId?: number;
  } = {},
) {
  const { bottomThreshold = 150, currentUserId } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const userSentMessageRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  const prevLastMessageIdRef = useRef<number | string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    endRef.current?.scrollIntoView({ behavior });
    setShowNewMessageIndicator(false);
    setIsAtBottom(true);
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom < bottomThreshold;

    setIsAtBottom(atBottom);

    if (atBottom) {
      setShowNewMessageIndicator(false);
    }
  }, [bottomThreshold]);

  const markUserSentMessage = useCallback(() => {
    userSentMessageRef.current = true;
  }, []);

  const handleMessagesChange = useCallback(
    (
      messages: Array<{ senderId?: number }>,
      lastMessageId?: number | string | null,
    ) => {
      const currentCount = messages.length;
      const prevCount = prevMessageCountRef.current;
      const lastMessage = messages[messages.length - 1];
      const prevLastMessageId = prevLastMessageIdRef.current;

      const isNewMessage =
        currentCount > prevCount && lastMessageId !== prevLastMessageId;

      if (prevCount === 0 && currentCount > 0) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            scrollToBottom("auto");
          }, 50);
        });
      } else if (isNewMessage) {
        const isOwnMessage = lastMessage?.senderId === currentUserId;

        if (userSentMessageRef.current || isOwnMessage) {
          requestAnimationFrame(() => {
            scrollToBottom("smooth");
          });
          userSentMessageRef.current = false;
        } else if (isAtBottom) {
          scrollToBottom("smooth");
        } else {
          setShowNewMessageIndicator(true);
        }
      }

      prevMessageCountRef.current = currentCount;
      prevLastMessageIdRef.current = lastMessageId ?? null;
    },
    [currentUserId, isAtBottom, scrollToBottom],
  );

  return {
    containerRef,
    endRef,
    showNewMessageIndicator,
    markUserSentMessage,
    scrollToBottom,
    handleScroll,
    handleMessagesChange,
  };
}

function MessageListItem({
  message,
  timestamp,
  senderUsername,
  isCurrentUser,
  messageId,
}: {
  message: string;
  timestamp: Date | string;
  senderUsername: string;
  isCurrentUser: boolean;
  messageId: number | string;
}) {
  return (
    <div
      key={messageId}
      className={cn("flex w-full", isCurrentUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "flex max-w-[min(82%,40rem)] items-end gap-2",
          isCurrentUser && "justify-end",
        )}
      >
        {!isCurrentUser && (
          <div
            className="mb-4 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black"
            style={{ background: getAvatarColor(senderUsername) }}
          >
            {getUserInitials(senderUsername)}
          </div>
        )}
        <div
          className={cn(
            "min-w-0 rounded-[0.95rem] px-3 py-1.5 text-base leading-5 shadow-sm",
            isCurrentUser
              ? "bg-brand-msg-sent text-brand-msg-sent-text"
              : "bg-brand-msg-received text-brand-msg-received-text",
          )}
        >
          {!isCurrentUser && (
            <span className="block text-[11px] font-semibold text-red-500 text-brand-primary/80">
              {senderUsername}
            </span>
          )}
          <div className="flex items-end gap-2">
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
              {message}
            </span>
            <span className="whitespace-nowrap text-[11px] opacity-70">
              {format(new Date(timestamp), "HH:mm")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
