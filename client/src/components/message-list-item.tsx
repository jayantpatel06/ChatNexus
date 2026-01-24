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
      className="flex items-start gap-2 py-1 hover:bg-muted/50 px-2 rounded"
    >
      <div
        className={`w-6 h-6 bg-gradient-to-br ${getAvatarColor(senderUsername)} text-white rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5`}
      >
        {getUserInitials(senderUsername)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-semibold text-sm ${isCurrentUser ? "text-primary" : "text-foreground"}`}
          >
            {isCurrentUser ? "Me" : senderUsername}
          </span>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-sm break-words min-w-0 flex-1 text-foreground">
            {message}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {format(new Date(timestamp), "HH:mm")}
          </span>
        </div>
      </div>
    </div>
  );
}
