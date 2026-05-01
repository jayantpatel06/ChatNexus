import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import EmojiPicker, {
  EmojiClickData,
  Theme as EmojiPickerTheme,
} from "emoji-picker-react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Globe, Loader2, Send, Smile } from "lucide-react";
import type { GlobalMessageWithSender } from "@shared/schema";
import { NewMessageIndicator } from "@/chat/new-message-indicator";
import { Seo } from "@/components/seo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn, getAvatarColor, getUserInitials } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useSocket } from "@/providers/socket-provider";
import { useLocation } from "wouter";

const GLOBAL_MESSAGES_QUERY_KEY = ["/api/global-messages"] as const;

type GlobalChatRoomPanelProps = {
  isMobile: boolean;
  onBack: () => void;
};

export function GlobalChatRoomPanel({
  isMobile,
  onBack,
}: GlobalChatRoomPanelProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messageInput, setMessageInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const composerPickerRef = useRef<HTMLDivElement>(null);
  const composerPickerTriggerRef = useRef<HTMLButtonElement>(null);
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
        (oldMessages) => {
          if (!oldMessages) {
            return [data.message];
          }

          if (oldMessages.some((message) => message.id === data.message.id)) {
            return oldMessages;
          }

          return [...oldMessages, data.message];
        },
      );
    };

    const handleExpiredMessagesDeleted = (data: { messageIds?: number[] }) => {
      removeGlobalMessagesFromCache(data.messageIds ?? []);
    };

    socket.on("global_message", handleNewMessage);
    socket.on("global_messages_deleted", handleExpiredMessagesDeleted);

    return () => {
      socket.off("global_message", handleNewMessage);
      socket.off("global_messages_deleted", handleExpiredMessagesDeleted);
    };
  }, [queryClient, removeGlobalMessagesFromCache, socket]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    handleMessagesChange(messages, lastMessage?.id);
  }, [handleMessagesChange, messages]);

  useEffect(() => {
    if (!showEmojiPicker) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (composerPickerRef.current?.contains(target) ||
          composerPickerTriggerRef.current?.contains(target))
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

  const handleSendMessage = useCallback(() => {
    if (!messageInput.trim() || !socket) {
      return;
    }

    markUserSentMessage();
    socket.emit("global_message", {
      message: messageInput,
    });

    setMessageInput("");
    setShowEmojiPicker(false);
  }, [markUserSentMessage, messageInput, socket]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
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

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessageInput((prev) => prev + emojiData.emoji);
  };

  const pickerClassName = isMobile
    ? "absolute bottom-[calc(100%+0.4rem)] left-3 right-3 z-40 overflow-hidden rounded-sm border border-border bg-card-muted font-sans backdrop-blur-xl"
    : "absolute bottom-[calc(100%+0.4rem)] right-3 z-40 w-[24rem] max-w-[calc(100%-1.5rem)] overflow-hidden rounded-sm border border-border bg-card-muted font-sans backdrop-blur-xl";
  const pickerAnimation = isMobile
    ? {
        initial: { height: 0, opacity: 0 },
        animate: { height: "auto", opacity: 1 },
        exit: { height: 0, opacity: 0 },
      }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 10 },
      };

  return (
    <div
      className={cn(
        "relative flex-1",
        isMobile
          ? "flex h-full flex-col overflow-hidden"
          : "flex min-w-0 overflow-hidden",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="z-40 flex flex-shrink-0 items-center justify-between bg-card p-2.5 md:border-b md:border-border/70 md:px-5 md:py-3.5">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="p-2 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            title="Back to Global Chat"
            onClick={onBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand-grad-start)] to-[var(--brand-grad-end)] font-semibold text-black">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Global Chat</h3>
            <p className="text-xs text-muted-foreground">Public room</p>
          </div>
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        className="relative min-h-0 flex-1 overflow-y-auto bg-background p-4 space-y-1 overscroll-contain scrollbar-none"
        onScroll={handleScroll}
      >
        <div className="my-2 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card-muted/80 px-4 py-1.5 text-[11px] text-muted-foreground">
            <Globe className="h-3 w-3" />
            Everyone can see these messages
          </div>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <p className="text-sm text-destructive">Failed to load messages</p>
          </div>
        )}

        {!isLoading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Globe className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          </div>
        )}

        {!isLoading && !error && messages.length > 0 && (
          <div className="space-y-1">
            {messages.map((message) => (
              <MessageListItem
                key={message.id}
                messageId={message.id}
                message={message.message}
                timestamp={message.timestamp}
                senderUsername={message.sender?.username || "Unknown"}
                isCurrentUser={message.senderId === user?.userId}
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
        style={{
          paddingBottom: isMobile
            ? "max(env(safe-area-inset-bottom), 6px)"
            : "6px",
        }}
      >
        <AnimatePresence initial={false}>
          {showEmojiPicker && (
            <motion.div
              ref={composerPickerRef}
              initial={pickerAnimation.initial}
              animate={pickerAnimation.animate}
              exit={pickerAnimation.exit}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={pickerClassName}
            >
              <div className="overflow-hidden font-sans">
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
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
                  className={cn(
                    "font-sans [--epr-bg-color:transparent] [--epr-picker-border-color:transparent] [--epr-picker-border-radius:0px] [--epr-emoji-padding:4px] [--epr-horizontal-padding:8px] [&_.epr-header-overlay]:pb-0",
                    isMobile
                      ? "[--epr-emoji-size:22px] [--epr-search-input-height:30px] [--epr-search-input-border-radius:9999px] [--epr-category-navigation-button-size:26px] [--epr-category-label-height:26px]"
                      : "[--epr-emoji-size:24px] [--epr-search-input-height:32px] [--epr-search-input-border-radius:9999px] [--epr-category-navigation-button-size:28px] [--epr-category-label-height:28px]",
                  )}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={isMobile ? "p-2" : "p-2 pb-1"}>
          <div className="relative rounded-[1rem] border border-border bg-card px-6 shadow-sm">
            <Textarea
              placeholder="Message..."
              className={cn(
                "min-h-[40px] max-h-32 rounded-none border-0 px-0 py-3 text-sm text-foreground placeholder:text-muted-foreground shadow-none resize-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                isMobile ? "bg-transparent" : "bg-card",
                hasDraftText ? "pr-12" : "pr-14",
              )}
              rows={1}
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              data-testid="textarea-message-input"
            />
            <div className="absolute inset-y-0 right-1.5 flex items-center">
              {hasDraftText ? (
                <Button
                  onMouseDown={(event) => event.preventDefault()}
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
                  ref={composerPickerTriggerRef}
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
  const formattedTimestamp = format(new Date(timestamp), "HH:mm");

  return (
    <div
      key={messageId}
      className={cn(
        "flex w-full",
        isCurrentUser ? "justify-end" : "justify-start",
      )}
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
          <div className="flex items-center gap-2 text-[11px]">
            <span
              className={cn(
                "truncate font-semibold text-red-500",
                isCurrentUser ? "text-current/90" : "text-red-500",
              )}
            >
              {isCurrentUser ? "You" : senderUsername}
            </span>
            <span className="whitespace-nowrap opacity-70">
              {formattedTimestamp}
            </span>
          </div>
          <div className="min-w-0 whitespace-pre-wrap break-words">
            {message}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GlobalChatRoomPage() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const handleBack = () => {
    setLocation("/global-chat");
  };

  return (
    <>
      <Seo
        title="Global Chat Room | ChatNexus"
        description="Live global chat room inside ChatNexus."
        path="/global-chat/room"
        robots="noindex, nofollow"
      />
      <div
        className={cn(
          "flex overflow-hidden",
          isMobile && "safe-top-shell",
          isMobile ? "h-[100dvh]" : "h-screen",
        )}
      >
        <GlobalChatRoomPanel isMobile={isMobile} onBack={handleBack} />
      </div>
    </>
  );
}
