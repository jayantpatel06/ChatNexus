import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { User, Message } from "@shared/schema";
import { Phone, Video, MoreVertical, Paperclip, Smile, Send, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
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

// Helper functions moved outside component to prevent recreation on render
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

// Helper component to render message content with media previews
const MessageContent = ({ content }: { content: string }) => {
  // Regex to detect URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  // Split content by URLs
  const parts = content.split(urlRegex);
  
  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          const isImage = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(part);
          const isVideo = /\.(mp4|webm)(\?.*)?$/i.test(part);
          
          if (isImage) {
            return (
              <div key={i} className="my-2 max-w-sm rounded-lg overflow-hidden border border-border">
                <img 
                  src={part} 
                  alt="Preview" 
                  className="w-full h-auto max-h-60 object-contain bg-black/5 cursor-pointer"
                  onClick={() => window.open(part, '_blank')}
                  loading="lazy"
                />
              </div>
            );
          }
          
          if (isVideo) {
            return (
              <div key={i} className="my-2 max-w-sm rounded-lg overflow-hidden border border-border">
                <video 
                  src={part} 
                  controls 
                  className="w-full h-auto max-h-60 bg-black"
                />
              </div>
            );
          }

          return (
            <a 
              key={i} 
              href={part} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-500 hover:underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
};

interface ChatAreaProps {
  selectedUser: User | null;
  onBack?: () => void;
  showBackButton?: boolean;
}

export function ChatArea({ selectedUser, onBack, showBackButton = false }: ChatAreaProps) {
  const { user } = useAuth();
  const { sendMessage, startTyping, stopTyping, messages, isConnected, typingUsers } = useSocket();
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

  // Fetch message history when user is selected
  const { data: messageHistory } = useQuery<Message[]>({
    queryKey: ["/api/messages", selectedUser?.userId],
    enabled: !!selectedUser?.userId,
  });

  // Memoize sorted messages calculation
  const sortedMessages = useMemo(() => {
    // Combine fetched messages with real-time messages and deduplicate
    const relevantRealtimeMessages = messages.filter(m => 
      (m.senderId === user?.userId && m.receiverId === selectedUser?.userId) ||
      (m.senderId === selectedUser?.userId && m.receiverId === user?.userId)
    );
    
    // Create a map to deduplicate messages by msgId
    const messageMap = new Map<number, Message>();
    
    // Add fetched messages first
    (messageHistory || []).forEach(msg => {
      messageMap.set(msg.msgId, msg);
    });
    
    // Add real-time messages, but only if they're not already in the map
    relevantRealtimeMessages.forEach(msg => {
      if (!messageMap.has(msg.msgId)) {
        messageMap.set(msg.msgId, msg);
      }
    });
    
    // Convert map back to array and sort by timestamp
    return Array.from(messageMap.values()).sort((a, b) => 
      new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
    );
  }, [messages, messageHistory, user?.userId, selectedUser?.userId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [sortedMessages]);

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

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      
      // Send message with attachment directly via socket
      sendMessage(selectedUser.userId, "", {
        url: base64,
        filename: file.name,
        fileType: file.type
      });
      
      // Clear input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      toast({
        title: "Read failed",
        description: "Failed to read file. Please try again.",
        variant: "destructive",
      });
    };
    reader.readAsDataURL(file);
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
        {/* System Message */}
        <div className="flex justify-center my-4">
          <div className="bg-accent text-muted-foreground text-xs px-3 py-1 rounded-full flex items-center gap-1">
            <div className="w-3 h-3 gap-1 flex items-center justify-center text-accent">
              🔒
            </div>
            Messages are end-to-end encrypted
          </div>
        </div>

        {sortedMessages.map((message) => {
          const isOwnMessage = message.senderId === user?.userId;
          const sender = isOwnMessage ? user : selectedUser;
          const attachments = (message as any).attachments || [];

          return (
            <div
              key={message.msgId}
              className={`flex items-start gap-3 ${isOwnMessage ? 'justify-end' : ''} message-bubble`}
              data-testid={`message-${message.msgId}`}
            >
              {!isOwnMessage && (
                <div className={`w-8 h-8 ${sender?.isGuest ? 'bg-gray-500' : `bg-gradient-to-br ${getAvatarColor(sender?.username || '')}`} text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0`}>
                  {sender?.isGuest ? 'G' : getUserInitials(sender?.username || '')}
                </div>
              )}
              
              <div className={`flex flex-col gap-1 max-w-xs lg:max-w-md ${isOwnMessage ? 'items-end' : ''}`}>
                <div className={`${isOwnMessage ? 'bg-primary text-primary-foreground rounded-lg rounded-tr-none' : 'bg-card border border-border rounded-lg rounded-tl-none shadow-sm'} p-3`}>
                  {attachments.length > 0 ? (
                    <div className="space-y-2">
                      {attachments.map((att: any) => (
                        <div key={att.id} className="relative group">
                          {att.fileType.startsWith('image/') ? (
                            <div className="relative">
                              <img 
                                src={att.url} 
                                alt={att.filename} 
                                className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
                                onClick={() => window.open(att.url, '_blank')}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="text-xs italic opacity-70">Image expired or deleted</span>';
                                }}
                              />
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <Button
                                  variant="secondary"
                                  size="icon"
                                  className="h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(att.url, '_blank');
                                  }}
                                  title="Open in new tab"
                                >
                                  <MoreVertical className="w-4 h-4 rotate-90" />
                                </Button>
                                <a 
                                  href={att.url} 
                                  download={att.filename}
                                  className="h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Download"
                                >
                                  <ArrowLeft className="w-4 h-4 rotate-[-90deg]" />
                                </a>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 p-2 bg-background/20 rounded border border-border/50">
                              <Paperclip className="w-4 h-4" />
                              <span className="text-sm truncate flex-1">{att.filename}</span>
                              <a 
                                href={att.url} 
                                download={att.filename}
                                className="p-1 hover:bg-black/10 rounded"
                                title="Download"
                              >
                                <ArrowLeft className="w-4 h-4 rotate-[-90deg]" />
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                      {message.message && message.message !== "Sent an attachment" && (
                        <div className={`text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                          <MessageContent content={message.message} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={`text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                      <MessageContent content={message.message} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>
                    {formatMessageTime(message.timestamp)}
                  </span>
                  {isOwnMessage && (
                    <span className="flex items-center text-muted-foreground">
                        ✓
                    </span>
                  )}
                </div>
              </div>

              {isOwnMessage && (
                <div className={`w-8 h-8 ${user?.isGuest ? 'bg-gray-500' : 'bg-primary'} text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0`}>
                  {user?.isGuest ? 'G' : getUserInitials(user?.username || '')}
                </div>
              )}
            </div>
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
