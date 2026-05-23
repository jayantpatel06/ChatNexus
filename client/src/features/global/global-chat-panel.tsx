import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import EmojiPicker, {
  EmojiClickData,
  Theme as EmojiPickerTheme,
} from "emoji-picker-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Globe,
  Loader2,
  MoonStar,
  MoreVertical,
  Send,
  Smile,
  SunMedium,
} from "lucide-react";
import type { GlobalMessageWithSender } from "@shared/schema";
import {
  BubbleAppendix,
  MessageContent,
} from "@/features/shared/chat-message-components";
import { GifPicker } from "@/features/shared/gif-picker";
import {
  isStandaloneMediaUrl,
  sanitizeExternalUrl,
} from "@/features/shared/chat-message-utils";
import { useThemeToggleState } from "@/components/site-nav";
import { NewMessageIndicator } from "@/features/shared/new-message-indicator";
import { Seo } from "@/components/seo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const { socket, onlineUsers, isConnected } = useSocket();
  const { isDark, toggleTheme } = useThemeToggleState();
  const [messageInput, setMessageInput] = useState("");
  const [activeComposerPicker, setActiveComposerPicker] = useState<
    "emoji" | "gif" | null
  >(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const composerPickerRef = useRef<HTMLDivElement>(null);
  const composerPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const lastGifSendRef = useRef<{ url: string; timestamp: number } | null>(
    null,
  );
  const hasDraftText = messageInput.trim().length > 0;
  const isComposerPickerOpen = activeComposerPicker !== null;
  const composerPickerHeight = 320;
  const onlineUserCount =
    user &&
    isConnected &&
    !onlineUsers.some((item) => item.userId === user.userId)
      ? onlineUsers.length + 1
      : onlineUsers.length;
  const ThemeIcon = isDark ? SunMedium : MoonStar;
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
      const target = event.target;
      if (
        target instanceof Node &&
        (composerPickerRef.current?.contains(target) ||
          composerPickerTriggerRef.current?.contains(target))
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

  const handleSendMessage = useCallback(() => {
    const trimmedMessage = messageInput.trim();
    if (!trimmedMessage || !socket) {
      return;
    }

    markUserSentMessage();
    socket.emit("global_message", {
      message: trimmedMessage,
    });

    setMessageInput("");
    closeComposerPicker();
  }, [closeComposerPicker, markUserSentMessage, messageInput, socket]);

  const sendGifMessage = useCallback(
    (gifUrl: string) => {
      const normalizedGifUrl = gifUrl.trim();
      if (!normalizedGifUrl || !socket) {
        return false;
      }

      const lastGifSend = lastGifSendRef.current;
      const isDuplicateGifSelection =
        lastGifSend?.url === normalizedGifUrl &&
        Date.now() - lastGifSend.timestamp < 1200;

      if (isDuplicateGifSelection) {
        return false;
      }

      lastGifSendRef.current = {
        url: normalizedGifUrl,
        timestamp: Date.now(),
      };

      markUserSentMessage();
      socket.emit("global_message", {
        message: normalizedGifUrl,
      });
      closeComposerPicker();
      return true;
    },
    [closeComposerPicker, markUserSentMessage, socket],
  );

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputFocus = () => {
    closeComposerPicker();
    if (isMobile) {
      setTimeout(() => {
        scrollToBottom();
      }, 300);
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessageInput((prev) => prev + emojiData.emoji);
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
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          isMobile ? "h-full bg-background" : "bg-background",
        )}
      >
        <div className="z-40 flex flex-shrink-0 items-center justify-between bg-card p-2.5 md:border-b md:border-border/70 md:px-5 md:py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="flex-shrink-0 p-2"
              title="Back to global chat"
              onClick={onBack}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="relative flex-shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand-grad-start)] to-[var(--brand-grad-end)] font-semibold text-black shadow-sm">
                <Globe className="h-5 w-5" />
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-foreground">
                Global Chat
              </h3>
              <div className="flex items-center gap-1 text-xs">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="font-medium text-foreground">
                  {onlineUserCount}  online
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title="Global chat options"
                  aria-label="Global chat options"
                  data-testid="button-global-chat-options"
                >
                  <MoreVertical className="h-5 w-5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={toggleTheme}>
                  <ThemeIcon className="mr-2 h-4 w-4" />
                  Change theme
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div
          ref={messagesContainerRef}
          className="relative -mb-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-background px-4 scrollbar-none overscroll-contain md:px-8"
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label="Global chatroom messages"
        >
        {isLoading && (
          <div className="flex min-h-full flex-col items-center justify-center gap-3 px-4 pb-8 text-center">
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
          <div className="flex min-h-full flex-col items-center justify-center gap-3 px-4 pb-8 text-center">
            <Globe className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          </div>
        )}

        {!isLoading && !error && messages.length > 0 && (
          <>
            {messages.map((message, index) => {
              const previousMessage = messages[index - 1];
              const currentDateKey = format(
                new Date(message.timestamp),
                "yyyy-MM-dd",
              );
              const previousDateKey = previousMessage
                ? format(new Date(previousMessage.timestamp), "yyyy-MM-dd")
                : null;
              const shouldShowDatePill = currentDateKey !== previousDateKey;

              return (
                <Fragment key={message.id}>
                  {shouldShowDatePill && (
                    <div className="flex justify-center py-2">
                      <span className="inline-flex items-center rounded-full border border-border/60 bg-card/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
                        {getTimelineDatePillLabel(message.timestamp)}
                      </span>
                    </div>
                  )}
                  <MessageListItem
                    messageId={message.id}
                    message={message.message}
                    timestamp={message.timestamp}
                    senderUsername={message.sender?.username || "Unknown"}
                    isCurrentUser={message.senderId === user?.userId}
                  />
                </Fragment>
              );
            })}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {showNewMessageIndicator && (
        <NewMessageIndicator onClick={() => scrollToBottom("smooth")} />
      )}

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
                "absolute bottom-[calc(100%)] z-40 overflow-hidden rounded-sm border border-border bg-card-muted font-sans backdrop-blur-xl",
                isMobile
                  ? "left-3 right-3"
                  : "right-3 w-[24rem] max-w-[calc(100%-1.5rem)]",
              )}
            >
              <div className="border-b border-border/70 px-3 py-2">
                <div className="mx-auto grid w-full grid-cols-2 overflow-hidden rounded-full border-border">
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
                    onEmojiClick={handleEmojiClick}
                    width="100%"
                    height={composerPickerHeight}
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
                    "rounded-none border-0 bg-transparent shadow-none",
                    isMobile ? "h-[320px]" : "h-[320px]",
                  )}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="px-2 pt-2 pb-1 md:pb-1">
          <div className="relative rounded-[1rem] border border-border bg-card px-6 shadow-sm">
            <Textarea
              ref={messageInputRef}
              placeholder="Message..."
              aria-label="Message global chatroom"
              className={cn(
                "min-h-[40px] max-h-32 rounded-none border-0 bg-card px-0 py-3 text-sm text-foreground placeholder:text-muted-foreground shadow-none resize-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                hasDraftText ? "pr-12" : "pr-14",
              )}
              rows={1}
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              data-testid="textarea-message-input"
            />
            <div className="absolute bottom-2 right-1.5 flex items-center">
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
                  className={cn(
                    "h-8 w-8 rounded-full text-muted-foreground hover:text-foreground",
                    isComposerPickerOpen && "bg-muted text-foreground",
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
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function getTimelineDatePillLabel(timestamp: Date | string): string {
  const date = new Date(timestamp);

  if (isToday(date)) {
    return "Today";
  }

  if (isYesterday(date)) {
    return "Yesterday";
  }

  return format(date, "MMMM d, yyyy");
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
  const formattedTimestamp = format(new Date(timestamp), "h:mm a");
  const displayName = senderUsername || "Unknown";
  const standaloneMediaUrl = getStandaloneMediaMessageUrl(message);
  const isMediaOnlyMessage = Boolean(standaloneMediaUrl);
  const bubbleFillColor = isCurrentUser
    ? "var(--brand-msg-sent)"
    : "var(--brand-msg-received)";
  const bubbleTextClass = isCurrentUser
    ? "text-brand-msg-sent-text"
    : "text-brand-msg-received-text";
  const bubbleShapeClass = isCurrentUser
    ? "rounded-[15px] rounded-br-none"
    : "rounded-[15px] rounded-bl-none";
  const renderInlineTimestamp = () => (
    <span className="relative top-[3px] float-right ml-[7px] mr-[-6px] inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium leading-[21px] opacity-55">
      {formattedTimestamp}
    </span>
  );

  return (
    <div
      className={cn(
        "message-bubble flex items-start",
        isCurrentUser && "justify-end",
      )}
      data-testid={`global-message-${messageId}`}
    >
      <div
        className={cn(
          "flex min-w-0 max-w-[75%] flex-col gap-1 sm:max-w-xs lg:max-w-md",
          isCurrentUser && "items-end",
        )}
      >
        {isMediaOnlyMessage ? (
          <div className={cn("relative", !isCurrentUser && "ml-8")}>
            {!isCurrentUser && (
              <div
                className="absolute bottom-2 left-[-2rem] flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-black shadow-sm"
                style={{ background: getAvatarColor(displayName) }}
                title={displayName}
                aria-hidden="true"
              >
                {getUserInitials(displayName)}
              </div>
            )}
            {!isCurrentUser && (
              <div className="min-w-0 truncate pl-1 text-[11px] font-semibold leading-4 tracking-[0.11em] text-rose-500">
                {displayName}
              </div>
            )}
            <div className="-my-1">
              <MessageContent
                content={standaloneMediaUrl!}
                onImagePreview={() => undefined}
              />
            </div>
          </div>
        ) : (
        <div className={cn("relative", !isCurrentUser && "ml-8")}>
          {!isCurrentUser && (
            <div
              className="absolute bottom-1.5 left-[-2rem] flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-black shadow-sm"
              style={{ background: getAvatarColor(displayName) }}
              title={displayName}
              aria-hidden="true"
            >
              {getUserInitials(displayName)}
            </div>
          )}
          <div
            className={cn(
              "relative min-w-0 max-w-full overflow-visible px-3 py-1.5 text-base leading-5 shadow-sm",
              bubbleShapeClass,
              bubbleTextClass,
            )}
            style={{ backgroundColor: bubbleFillColor }}
          >
            {!isCurrentUser && (
              <div className="mb-0.5 min-w-0 truncate text-[11px] font-semibold leading-4 tracking-[0.11em] text-rose-500">
                {displayName}
              </div>
            )}
            <MessageContent
              content={message}
              onImagePreview={() => undefined}
              metadata={renderInlineTimestamp()}
            />
            <BubbleAppendix
              isOwnMessage={isCurrentUser}
              fillColor={bubbleFillColor}
            />
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function getStandaloneMediaMessageUrl(content: string): string | null {
  const normalizedContent = content.trim();

  if (!normalizedContent || !/^https?:\/\/[^\s]+$/i.test(normalizedContent)) {
    return null;
  }

  const safeUrl = sanitizeExternalUrl(normalizedContent);

  return safeUrl && isStandaloneMediaUrl(safeUrl) ? safeUrl : null;
}

export default function GlobalChatRoomPage() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const handleBack = () => {
    setLocation("/global");
  };

  return (
    <>
      <Seo
        title="Global Chat Room | ChatNexus"
        description="Live global chat room inside ChatNexus."
        path="/global/chat"
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
