import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useActiveChat } from "@/hooks/use-active-chat";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { User, Message } from "@shared/schema";
import { Phone, Video, MoreVertical, Paperclip, Smile, Send, ArrowLeft } from "lucide-react";
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

export function ChatArea({ selectedUser, onBack, showBackButton = false }: ChatAreaProps) {
  const { user } = useAuth();
  const { sendMessage, startTyping, stopTyping, isConnected, typingUsers } = useSocket();
  const { liveMessages } = useActiveChat();
  const isMobile = useIsMobile();
  const { keyboardHeight, isKeyboardVisible } = useKeyboardHeight();
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const { getThemeForUser, setThemeForUser, availableThemes } = useChatTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const currentTheme: ChatTheme = getThemeForUser(selectedUser?.userId ?? null);
  const themeClass = `chat-theme-${currentTheme}`;

  // Fetch message history when user is selected (cursor-based)
  const {
    data: pagedMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<{ messages: Message[]; nextCursor: string | null}>(
    {
      queryKey: ["/api/messages/history", selectedUser?.userId],
      enabled: !!selectedUser?.userId,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }) => {
        if (!selectedUser?.userId) {
          return { messages: [], nextCursor: null };
        }
        const cursorParam = pageParam ? `&cursor=${pageParam}` : "";
        const res = await fetch(
          `/api/messages/${selectedUser.userId}/history?limit=40${cursorParam}`,
          { credentials: "include" }
        );
        if (!res.ok) {
          throw new Error("Failed to fetch messages");
        }
        return res.json();
      },
    }
  );

  // Sort history once (ascending) when pages change
  const historyAsc: Message[] = useMemo(() => {
    const flat = pagedMessages?.pages.flatMap((p) => p.messages) ?? [];
    return [...flat].sort((a, b) =>
      new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
    );
  }, [pagedMessages]);

  // Live messages from ActiveChatContext (already filtered for this conversation)
  const liveMessagesForConv: Message[] = liveMessages;

  // Combine history and live into a single ordered list
  const combinedMessages: Message[] = useMemo(
    () => [...historyAsc, ...liveMessagesForConv],
    [historyAsc, liveMessagesForConv]
  );

  // Windowing: only render the last N messages to keep DOM light for huge histories
  const MESSAGE_WINDOW_SIZE = 200;
  const displayedMessages: Message[] = useMemo(() => {
    if (combinedMessages.length <= MESSAGE_WINDOW_SIZE) return combinedMessages;
    return combinedMessages.slice(combinedMessages.length - MESSAGE_WINDOW_SIZE);
  }, [combinedMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [displayedMessages]);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessageText((prev) => prev + emojiData.emoji);
    // Keep picker open for multiple emojis
  };

  const handleSendMessage = () => {
    if (!selectedUser || !messageText.trim()) return;

    sendMessage(selectedUser.userId, messageText.trim());
    setMessageText("");
    setShowEmojiPicker(false); // Close picker on send
    
    if (isTyping && selectedUser) {
      stopTyping(selectedUser.userId);
      setIsTyping(false);
    }
  };

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
    if (!timestamp) return '';
    return format(new Date(timestamp), "h:mm a");
  };

  if (!selectedUser) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Send className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Select a User to start chatting</h3>
          <p className="text-muted-foreground">Choose someone from the online users list to begin a conversation</p>
        </div>
      </div>
    );
  }




  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "File size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const uploaded = await res.json(); // { url, filename, fileType }

      // Send message with attachment via socket, referencing uploaded URL
      sendMessage(selectedUser.userId, "", {
        url: uploaded.url,
        filename: uploaded.filename,
        fileType: uploaded.fileType,
      });

      // Clear input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Attachment upload failed", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={cn("flex-1 flex flex-col h-full", themeClass)}>
      {/* Chat Header */}
      <div className="bg-card border-b border-border p-4 flex items-center justify-between flex-shrink-0"
        style={{
          position: 'sticky' as any,
          top: 0,
          zIndex: 40,
          // Ensure header is opaque when layered above messages
          backdropFilter: 'saturate(180%) blur(4px)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Back button for mobile */}
          {(showBackButton || isMobile) && onBack && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onBack}
              className="p-2"
              title="Back to users"
              data-testid="button-back-to-users"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          
          <div className="relative">
            <div className={`w-10 h-10 ${selectedUser.isGuest ? 'bg-gray-500' : 'bg-gradient-to-br ' + getAvatarColor(selectedUser.username)} text-white rounded-full flex items-center justify-center font-medium`}>
              {selectedUser.isGuest ? 'G' : getUserInitials(selectedUser.username)}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-foreground" data-testid={`text-chat-username-${selectedUser.userId}`}>
              {selectedUser.username}
            </h3>
            <div className="flex items-center gap-1 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-foreground font-medium">Online</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" title="Voice Call" data-testid="button-voice-call">
            <Phone className="w-5 h-5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="sm" title="Video Call" data-testid="button-video-call">
            <Video className="w-5 h-5 text-muted-foreground" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" title="More Options" data-testid="button-more-options">
                <MoreVertical className="w-5 h-5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Chat Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={currentTheme}
                onValueChange={(val) => setThemeForUser(selectedUser?.userId ?? null, val as ChatTheme)}
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
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-background min-h-0"
        style={{
          // When keyboard is visible on mobile, add padding equal to keyboard height plus
          // the input bar area so messages are not hidden. Previously code subtracted a
          // magic number which caused excessive empty space. Use addition to avoid that.
          // paddingBottom: isMobile && isKeyboardVisible ? `${Math.max(keyboardHeight , 0)}px` : '0px',
        }}
        data-testid="chat-messages-area"
      >
        {/* Load older messages */}
        {hasNextPage && (
          <div className="flex justify-center my-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? "Loading older messages..." : "Load older messages"}
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
          const attachments = (message as any).attachments || [];

          return (
            <MessageBubble 
              key={message.msgId}
              message={message}
              isOwnMessage={isOwnMessage}
              sender={sender}
            />
          );
        })}

        {/* Typing Indicator */}
        {typingUsers.has(selectedUser.userId) && (
          <div className="flex items-start gap-3 message-bubble">
            <div className={`w-8 h-8 ${selectedUser.isGuest ? 'bg-gray-500' : `bg-gradient-to-br ${getAvatarColor(selectedUser.username)}`} text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0`}>
              {selectedUser.isGuest ? 'G' : getUserInitials(selectedUser.username)}
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

      {/* Message Input Area */}
      <div
        className="bg-card border-t border-border p-3 flex-shrink-0"
        style={{
          paddingBottom: isMobile && isKeyboardVisible ? `72px` : '12px',
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
                    theme={["midnight", "forest", "sunset"].includes(currentTheme) ? 'dark' as any : 'light' as any}
                    lazyLoadEmojis={true}
                  />
                </div>
              )}
            </div>
          </div>
          
          {/* Send Button */}
          <Button 
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
