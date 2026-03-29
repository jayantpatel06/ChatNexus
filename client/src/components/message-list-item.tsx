import { format } from "date-fns";
import { getUserInitials, getAvatarColor } from "@/lib/utils";

interface MessageListItemProps {
  message: string;
  timestamp: Date | string;
  senderUsername: string;
  isCurrentUser: boolean;
  messageId: number | string;
}

/**
 * Compact message list item used in global chat.
 * Shows avatar, username, message, and timestamp in a horizontal layout.
 */
export function MessageListItem({
  message,
  timestamp,
  senderUsername,
  isCurrentUser,
  messageId,
}: MessageListItemProps) {
  return (
    <div
      key={messageId}
      className={`flex items-start gap-2 py-1 transition-colors px-2 rounded-lg ${isCurrentUser ? 'bg-brand-primary/5 border border-brand-primary/10' : 'hover:bg-brand-card/50'}`}
    >
      <div
        className={`w-6 h-6 text-black rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5`}
        style={{ background: getAvatarColor(senderUsername) }}
      >
        {getUserInitials(senderUsername)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-bold text-xs ${isCurrentUser ? "text-brand-primary" : "text-brand-text"}`}
          >
            {isCurrentUser ? "Me" : senderUsername}
          </span>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-sm break-words min-w-0 flex-1 text-brand-text/90">
            {message}
          </span>
          <span className="text-[10px] text-brand-muted whitespace-nowrap opacity-60">
            {format(new Date(timestamp), "HH:mm")}
          </span>
        </div>
      </div>
    </div>
  );
}
