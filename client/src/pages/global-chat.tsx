import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GlobalMessageWithSender } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, ArrowLeft, Globe, ChevronDown, Smile } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";

// Helper functions
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

export default function GlobalChat() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Instagram-style scroll tracking
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false);
  const userSentMessageRef = useRef(false);

  const { data: messages = [] } = useQuery<GlobalMessageWithSender[]>({
    queryKey: ["/api/global-messages"],
  });

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (data: { message: GlobalMessageWithSender }) => {
      queryClient.setQueryData<GlobalMessageWithSender[]>(
        ["/api/global-messages"],
        (old) => {
          if (!old) return [data.message];
          // Check if message already exists to prevent duplicates
          if (old.some((m) => m.id === data.message.id)) return old;
          return [...old, data.message];
        },
      );
    };

    socket.on("global_message", handleNewMessage);

    return () => {
      socket.off("global_message", handleNewMessage);
    };
  }, [socket, queryClient]);

  // Smart scroll - only scroll to bottom for new messages
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setShowNewMessageIndicator(false);
    setIsAtBottom(true);
  }, []);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom < 150;

    setIsAtBottom(atBottom);

    if (atBottom) {
      setShowNewMessageIndicator(false);
    }
  }, []);

  // Instagram-style scroll behavior for new messages
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    const currentCount = messages.length;
    const prevCount = prevMessageCountRef.current;
    const lastMessage = messages[messages.length - 1];

    const isNewMessage = currentCount > prevCount;

    if (prevCount === 0 && currentCount > 0) {
      // Initial load - scroll to bottom
      requestAnimationFrame(() => {
        setTimeout(() => {
          scrollToBottom("auto");
        }, 50);
      });
    } else if (isNewMessage) {
      const isOwnMessage = lastMessage?.senderId === user?.userId;

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
  }, [messages, scrollToBottom, isAtBottom, user?.userId]);

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessageInput((prev) => prev + emojiData.emoji);
  };

  const handleSendMessage = useCallback(() => {
    if (!messageInput.trim() || !socket) return;

    userSentMessageRef.current = true;

    socket.emit("global_message", {
      message: messageInput,
      receiverId: 0,
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

  return (
    <div className="h-[100dvh] bg-background flex flex-col">
      {/* Chat Header */}
      <div
        className="bg-card border-b border-border p-4 flex items-center justify-between flex-shrink-0"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          backdropFilter: "saturate(180%) blur(4px)",
        }}
      >
        <div className="flex items-center gap-3">
          <Link href="/">
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
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-background min-h-0 relative"
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

        <div className="space-y-3">
          {messages.map((msg) => {
            const isMe = msg.senderId === user?.userId;
            const sender = msg.sender;
            return (
              <div
                key={msg.id}
                className="flex items-start gap-2 py-1 hover:bg-muted/50 px-2 rounded"
              >
                <div
                  className={`w-6 h-6 bg-gradient-to-br ${getAvatarColor(sender?.username || "")} text-white rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5`}
                >
                  {getUserInitials(sender?.username || "")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`font-semibold text-sm ${isMe ? "text-primary" : "text-foreground"}`}
                    >
                      {isMe ? "Me" : sender?.username}
                    </span>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-sm break-words min-w-0 flex-1 text-foreground">
                      {msg.message}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(msg.timestamp), "HH:mm")}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

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
          {/* Message Input */}
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

            {/* Emoji Button */}
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

          {/* Send Button */}
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
  );
}
