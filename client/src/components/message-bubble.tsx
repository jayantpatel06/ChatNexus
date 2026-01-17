import { memo } from "react";
import { User, Message } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Paperclip, MoreVertical, ArrowLeft } from "lucide-react";
import { format } from "date-fns";

// Helper functions (duplicated from chat-area for now, or could move to utils)
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

const MessageContent = ({ content }: { content: string }) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
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

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  sender: User | null;
}

function MessageBubbleComponent({ message, isOwnMessage, sender }: MessageBubbleProps) {
  const attachments = (message as any).attachments || [];
  
  const formatMessageTime = (timestamp: Date | string | null) => {
    if (!timestamp) return '';
    return format(new Date(timestamp), "h:mm a");
  };

  return (
    <div
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
        <div className={`w-8 h-8 ${sender?.isGuest ? 'bg-gray-500' : 'bg-primary'} text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0`}>
          {sender?.isGuest ? 'G' : getUserInitials(sender?.username || '')}
        </div>
      )}
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
