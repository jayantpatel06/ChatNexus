import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { User, Message } from "@shared/schema";
import { Phone, Video, MoreVertical, Paperclip, Smile, Send, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

interface ChatAreaProps {
  selectedUser: User | null;
  onBack?: () => void;
  showBackButton?: boolean;
}

export function ChatArea({ selectedUser, onBack, showBackButton = false }: ChatAreaProps) {
  const { user } = useAuth();
  const { sendMessage, startTyping, stopTyping, messages, isConnected, typingUsers } = useSocket();
  const isMobile = useIsMobile();
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch message history when user is selected
  const { data: messageHistory } = useQuery<Message[]>({
    queryKey: ["/api/messages", selectedUser?.userId],
    enabled: !!selectedUser?.userId,
  });

  // Combine fetched messages with real-time messages
  const allMessages = [...(messageHistory || []), ...messages.filter(m => 
    (m.senderId === user?.userId && m.receiverId === selectedUser?.userId) ||
    (m.senderId === selectedUser?.userId && m.receiverId === user?.userId)
  )];

  // Sort messages by timestamp
  const sortedMessages = allMessages.sort((a, b) => 
    new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [sortedMessages]);

  const handleSendMessage = () => {
    if (!selectedUser || !messageText.trim()) return;

    sendMessage(selectedUser.userId, messageText.trim());
    setMessageText("");
    
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
          <h3 className="text-lg font-semibold text-foreground mb-2">Select a user to start chatting</h3>
          <p className="text-muted-foreground">Choose someone from the online users list to begin a conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Chat Header */}
      <div className="bg-card border-b border-border p-4 flex items-center justify-between">
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
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-card rounded-full"></div>
          </div>
          <div>
            <h3 className="font-semibold text-foreground" data-testid={`text-chat-username-${selectedUser.userId}`}>
              {selectedUser.username}
            </h3>
            <div className="flex items-center gap-1 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-black font-medium">Online</span>
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
          <Button variant="ghost" size="sm" title="More Options" data-testid="button-more-options">
            <MoreVertical className="w-5 h-5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background" data-testid="chat-messages-area">
        {/* Date Divider */}
        <div className="flex items-center justify-center my-4">
          <div className="bg-secondary text-muted-foreground text-xs px-3 py-1 rounded-full">
            Today
          </div>
        </div>

        {sortedMessages.map((message) => {
          const isOwnMessage = message.senderId === user?.userId;
          const sender = isOwnMessage ? user : selectedUser;

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
                  <p className={`text-sm ${isOwnMessage ? 'text-primary-foreground' : 'text-foreground'}`}>
                    {message.message}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {formatMessageTime(message.timestamp)}
                  </span>
                  {isOwnMessage && (
                    <div className="flex">
                      <div className="w-3 h-3 text-accent">
                        ✓
                      </div>
                      <div className="w-3 h-3 text-accent -ml-1">
                        ✓
                      </div>
                    </div>
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

        {/* System Message */}
        <div className="flex justify-center my-4">
          <div className="bg-muted/50 text-muted-foreground text-xs px-3 py-1 rounded-full flex items-center gap-1">
            <div className="w-3 h-3">
              🔒
            </div>
            Messages are end-to-end encrypted
          </div>
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Area */}
      <div className="bg-card border-t border-border p-4">
        <div className="flex items-end gap-3">
          {/* Attachment Button */}
          <Button variant="ghost" size="sm" title="Attach File" data-testid="button-attach-file">
            <Paperclip className="w-5 h-5 text-muted-foreground" />
          </Button>
          
          {/* Message Input */}
          <div className="flex-1 relative">
            <Textarea
              placeholder="Type a message..."
              className="min-h-[44px] max-h-32 px-4 py-3 pr-12 bg-gray-200 text-black placeholder:text-muted-foreground border border-border resize-none"
              rows={1}
              value={messageText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              data-testid="textarea-message-input"
            />
            
            {/* Emoji Button */}
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-3 bottom-3"
              title="Add Emoji"
              data-testid="button-emoji"
            >
              <Smile className="w-5 h-5 text-muted-foreground" />
            </Button>
          </div>
          
          {/* Send Button */}
          <Button 
            onClick={handleSendMessage}
            disabled={!messageText.trim()}
            title="Send Message"
            data-testid="button-send-message"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
        
        {/* Status Indicators */}
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 ${isConnected ? 'bg-green-500' : 'bg-destructive'} rounded-full`}></div>
            <span data-testid="text-connection-status">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span>Press Enter to send, Shift+Enter for new line</span>
          </div>
        </div>
      </div>
    </div>
  );
}
