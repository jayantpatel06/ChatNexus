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
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { Seo } from "@/components/seo";
import { useToast } from "@/hooks/use-toast";
import { NewMessageIndicator } from "@/chat/new-message-indicator";
import { UsersSidebar } from "@/chat/users-sidebar";
import { useSocket } from "@/providers/socket-provider";
import { getAvatarColor, getUserInitials } from "@/lib/utils";

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

    socket.on("global_message", handleNewMessage);
    socket.on("global_message_error", handleGlobalMessageError);

    return () => {
      socket.off("global_message", handleNewMessage);
      socket.off("global_message_error", handleGlobalMessageError);
    };
  }, [socket, queryClient, toast]);

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
    if (isMobile) {
      setTimeout(() => {
        scrollToBottom();
      }, 300);
    }
  };

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
          <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="bg-brand-sidebar border-b border-brand-border p-4 flex items-center justify-between flex-shrink-0 z-40">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-2 text-brand-muted hover:text-brand-text hover:bg-brand-card transition-colors"
                  title="Back to Dashboard"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="relative">
                <div 
                   className="w-10 h-10 text-black rounded-full flex items-center justify-center font-bold shadow-[0_0_15px_var(--brand-glow-primary)]"
                   style={{ background: 'var(--brand-grad-start)' }}
                >
                  <Globe className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-brand-text tracking-tight">Global Chat</h3>
              </div>
            </div>
          </div>
          {/* Messages Area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto scrollbar-none overscroll-contain p-4 space-y-4 bg-brand-bg min-h-0 relative"
            onScroll={handleScroll}
          >
            {/* System Message */}
            <div className="flex justify-center my-4">
              <div className="bg-brand-card/50 border border-brand-border text-brand-muted text-[10px] px-4 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-sm">
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
              <div className="space-y-3">
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
            className="bg-brand-sidebar border-t border-brand-border p-4 flex-shrink-0 backdrop-blur-md"
            style={{ paddingBottom: "16px" }}
          >
            <div className="flex items-end gap-3 max-w-4xl mx-auto w-full">
              <div className="flex-1 relative">
                <Textarea
                  placeholder="Type a message..."
                  className="min-h-[44px] h-[44px] bg-brand-card border-brand-border text-brand-text placeholder:text-brand-muted focus:ring-brand-primary/20 text-sm py-3 px-4 rounded-xl resize-none transition-all"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={handleInputFocus}
                  data-testid="textarea-message-input"
                />
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 bottom-1 h-10 w-10 flex items-center justify-center"
                    title="Add Emoji"
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
                        lazyLoadEmojis={true}
                      />
                    </div>
                  )}
                </div>
              </div>
              <Button
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleSendMessage}
                disabled={!messageInput.trim()}
                className="h-10 w-10 flex-shrink-0"
                size="icon"
                title="Send Message"
              >
                <Send className="w-4 h-4" />
              </Button>
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
      <div className="h-[100dvh] bg-background flex flex-col">
      {/* Chat Header */}
      <div className="bg-card border-b border-border p-4 flex items-center justify-between flex-shrink-0 z-40">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button
              variant="ghost"
              size="sm"
              className="p-2"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="relative">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-full flex items-center justify-center font-medium">
              <Globe className="w-5 h-5" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Global Chat</h3>
          </div>
        </div>
      </div>
      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto scrollbar-none overscroll-contain p-4 space-y-4 bg-background min-h-0 relative"
        onScroll={handleScroll}
      >
        {/* System Message */}
        <div className="flex justify-center my-4">
          <div className="bg-accent text-muted-foreground text-xs px-3 py-1 rounded-full flex items-center gap-1">
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
          <div className="space-y-3">
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
        className="bg-card border-t border-border p-3 flex-shrink-0"
        style={{ paddingBottom: "12px" }}
      >
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <Textarea
              placeholder="Type a message..."
              className="min-h-[44px] max-h-32 px-4 py-3 pr-12 bg-input text-foreground placeholder:text-muted-foreground border border-border resize-none rounded-lg"
              rows={1}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
            />
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 bottom-1 h-10 w-10 flex items-center justify-center"
                title="Add Emoji"
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
                    lazyLoadEmojis={true}
                  />
                </div>
              )}
            </div>
          </div>
          <Button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSendMessage}
            disabled={!messageInput.trim()}
            className="h-10 w-10 flex-shrink-0"
            size="icon"
            title="Send Message"
          >
            <Send className="w-4 h-4" />
          </Button>
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
      className={`flex items-start gap-2 rounded-lg px-2 py-1 transition-colors ${
        isCurrentUser
          ? "border border-brand-primary/10 bg-brand-primary/5"
          : "hover:bg-brand-card/50"
      }`}
    >
      <div
        className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black"
        style={{ background: getAvatarColor(senderUsername) }}
      >
        {getUserInitials(senderUsername)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-xs font-bold ${
              isCurrentUser ? "text-brand-primary" : "text-brand-text"
            }`}
          >
            {isCurrentUser ? "Me" : senderUsername}
          </span>
        </div>
        <div className="flex items-end gap-2">
          <span className="min-w-0 flex-1 break-words text-sm text-brand-text/90">
            {message}
          </span>
          <span className="whitespace-nowrap text-[10px] text-brand-muted opacity-60">
            {format(new Date(timestamp), "HH:mm")}
          </span>
        </div>
      </div>
    </div>
  );
}
