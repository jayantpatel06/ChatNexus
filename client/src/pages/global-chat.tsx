import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GlobalMessageWithSender } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, ArrowLeft, Globe, Smile, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSmartScroll } from "@/hooks/use-smart-scroll";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { QUERY_KEYS } from "@/lib/utils";
import { MessageListItem } from "@/components/message-list-item";
import { NewMessageIndicator } from "@/components/new-message-indicator";

export default function GlobalChat() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { socket } = useSocket();
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
    queryKey: [QUERY_KEYS.GLOBAL_MESSAGES],
  });

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (data: { message: GlobalMessageWithSender }) => {
      queryClient.setQueryData<GlobalMessageWithSender[]>(
        [QUERY_KEYS.GLOBAL_MESSAGES],
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

  return (
    <div className="h-[100dvh] bg-background flex flex-col">
      {/* Chat Header */}
      <div className="bg-card border-b border-border p-4 flex items-center justify-between flex-shrink-0 z-40">
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
        className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 bg-background min-h-0 relative"
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

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-destructive">Failed to load messages</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Globe className="w-12 h-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          </div>
        )}

        {/* Messages */}
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
