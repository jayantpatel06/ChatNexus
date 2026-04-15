import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FriendRequest, Message, User } from "@shared/schema";
import {
  ArrowLeft,
  Download,
  Expand,
  Handshake,
  Loader2,
  MoreVertical,
  Paperclip,
  Pencil,
  Reply,
  Trash2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getQuotedReplyPreviewText,
  sanitizeExternalUrl,
} from "./chat-message-utils";

const TENOR_MEDIA_URL_PATTERN = /^https?:\/\/media\.tenor\.com\//i;
const IMAGE_MEDIA_URL_PATTERN = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
const VIDEO_MEDIA_URL_PATTERN = /\.(mp4|webm)(\?.*)?$/i;
const BUBBLE_APPENDIX_PATH =
  "M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z";
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏"] as const;

type PendingAttachment = {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: "uploading" | "sending" | "error";
};

type FriendRequestRecord = FriendRequest & {
  createdAt: Date | string;
  respondedAt: Date | string | null;
};

type ChatAttachment = NonNullable<Message["attachments"]>[number];

type ImagePreviewState = {
  url: string;
};

function isImageMessageUrl(url: string): boolean {
  return IMAGE_MEDIA_URL_PATTERN.test(url) || TENOR_MEDIA_URL_PATTERN.test(url);
}

function isVideoMessageUrl(url: string): boolean {
  return VIDEO_MEDIA_URL_PATTERN.test(url);
}

function isVideoAttachmentType(fileType: string): boolean {
  return fileType.startsWith("video/");
}

function getVideoMimeTypeFromUrl(url: string): string | undefined {
  if (VIDEO_MEDIA_URL_PATTERN.test(url)) {
    return url.toLowerCase().includes(".webm") ? "video/webm" : "video/mp4";
  }

  return undefined;
}

function getStandaloneMediaMessageUrl(content: string): string | null {
  const normalizedContent = content.trim();

  if (!normalizedContent || !/^https?:\/\/[^\s]+$/i.test(normalizedContent)) {
    return null;
  }

  return isImageMessageUrl(normalizedContent) ||
    isVideoMessageUrl(normalizedContent)
    ? normalizedContent
    : null;
}

const MessageContent = ({
  content,
  onImagePreview,
  metadata,
}: {
  content: string;
  onImagePreview: (preview: ImagePreviewState) => void;
  metadata?: ReactNode;
}) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = content.split(urlRegex);

  return (
    <div
      className="relative block min-w-0 whitespace-pre-wrap break-words leading-[21px]"
      style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
    >
      {metadata}
      {parts.map((part, index) => {
        if (!part.match(urlRegex)) {
          return <span key={index}>{part}</span>;
        }

        const isImage = isImageMessageUrl(part);
        const isVideo = isVideoMessageUrl(part);

        if (isImage) {
          return (
            <InlineImagePreview
              key={index}
              url={part}
              onImagePreview={onImagePreview}
            />
          );
        }

        if (isVideo) {
          return <InlineVideoPreview key={index} url={part} />;
        }

        const safeUrl = sanitizeExternalUrl(part);
        if (!safeUrl) {
          return <span key={index}>{part}</span>;
        }

        return (
          <a
            key={index}
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="break-all text-blue-500 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      })}
    </div>
  );
};

function InlineVideoPreview({ url }: { url: string }) {
  const [hasError, setHasError] = useState(false);
  const mimeType = getVideoMimeTypeFromUrl(url);

  if (hasError) {
    return (
      <div className="my-2 flex max-w-[16rem] flex-col gap-2 rounded-2xl border border-brand-border bg-muted/30 p-3 text-left">
        <span className="text-xs text-muted-foreground">
          Video preview blocked by host
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-xs text-blue-500 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          Open video link
        </a>
      </div>
    );
  }

  return (
    <div className="my-2 max-w-sm overflow-hidden rounded-2xl border border-brand-border bg-black shadow-sm">
      <video
        controls
        playsInline
        preload="metadata"
        className="h-auto max-h-72 w-full bg-black"
        onError={() => setHasError(true)}
      >
        <source src={url} type={mimeType} />
      </video>
    </div>
  );
}

function InlineImagePreview({
  url,
  onImagePreview,
}: {
  url: string;
  onImagePreview: (preview: ImagePreviewState) => void;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="my-2 flex max-w-[14rem] flex-col gap-2 rounded-2xl border border-brand-border bg-muted/30 p-3 text-left">
        <span className="text-xs text-muted-foreground">
          Preview blocked by host
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="break-all text-xs text-blue-500 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          Open image link
        </a>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="my-2 block w-full max-w-[11rem] overflow-hidden rounded-2xl border border-brand-border bg-muted/30 text-left transition-transform duration-200 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={() => onImagePreview({ url })}
    >
      <img
        src={url}
        alt="Shared image preview"
        className="h-28 w-full object-cover sm:h-32"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
    </button>
  );
}

export function FriendRequestCard({
  request,
  direction,
  otherUsername,
  isPendingAction = false,
  onAccept,
  onReject,
}: {
  request: FriendRequestRecord;
  direction: "incoming" | "outgoing";
  otherUsername: string;
  isPendingAction?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
}) {
  return (
    <div className="flex justify-center">
      <div className="w-full max-w-md rounded-2xl border border-brand-border bg-brand-card/80 p-4 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary">
          {direction === "incoming" ? (
            <Handshake className="h-5 w-5" />
          ) : (
            <UserPlus className="h-5 w-5" />
          )}
        </div>
        <p className="text-sm font-medium text-foreground">
          {direction === "incoming"
            ? `${otherUsername} sent you a friend request.`
            : `Friend request sent to ${otherUsername}.`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {format(new Date(request.createdAt), "h:mm a")}
        </p>

        {direction === "incoming" ? (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              size="sm"
              onClick={onAccept}
              disabled={isPendingAction}
              data-testid={`button-accept-friend-request-${request.id}`}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              disabled={isPendingAction}
              data-testid={`button-reject-friend-request-${request.id}`}
            >
              Reject
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            Waiting for {otherUsername} to respond.
          </p>
        )}
      </div>
    </div>
  );
}

function AttachmentThumbnail({
  attachment,
  onPreview,
}: {
  attachment: ChatAttachment;
  onPreview: (preview: ImagePreviewState) => void;
}) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="w-28 sm:w-32">
      <div className="group relative h-28 w-28 overflow-hidden rounded-2xl border border-brand-border bg-muted/30 shadow-sm sm:h-32 sm:w-32">
        {hasError ? (
          <div className="flex h-full w-full items-center justify-center p-3 text-center text-[11px] text-muted-foreground">
            Image unavailable
          </div>
        ) : (
          <button
            type="button"
            className="h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => onPreview({ url: attachment.url })}
            title="Preview attachment"
          >
            <img
              src={attachment.url}
              alt={attachment.filename || "Shared attachment preview"}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setHasError(true)}
            />
            <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/65 via-black/10 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white">
                <Expand className="h-3 w-3" />
                Preview
              </span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

function VideoAttachmentCard({
  src,
  title,
  mimeType,
  showOverlay = false,
  overlayLabel,
}: {
  src: string;
  title: string;
  mimeType?: string;
  showOverlay?: boolean;
  overlayLabel?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const resolvedMimeType = mimeType ?? getVideoMimeTypeFromUrl(src);

  if (hasError && !showOverlay) {
    return (
      <div className="flex max-w-[16rem] flex-col gap-2 rounded-2xl border border-brand-border bg-muted/30 p-3 text-left">
        <span className="text-xs text-muted-foreground">
          Video preview unavailable
        </span>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-xs text-blue-500 hover:underline"
        >
          Open video link
        </a>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-border bg-black shadow-sm">
      <video
        controls={!showOverlay}
        muted={showOverlay}
        playsInline
        preload="metadata"
        className="max-h-72 w-full min-w-[14rem] bg-black object-contain sm:min-w-[16rem]"
        title={title}
        onError={() => setHasError(true)}
      >
        <source src={src} type={resolvedMimeType} />
      </video>
      {showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35">
          <div className="flex flex-col items-center gap-2 text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">{overlayLabel ?? "Uploading..."}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function BubbleAppendix({
  isOwnMessage,
  fillColor,
}: {
  isOwnMessage: boolean;
  fillColor: string;
}) {
  const filterId = useId().replace(/:/g, "");

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 9 18"
      className={cn(
        "pointer-events-none absolute bottom-[-1px] h-[18px] w-[9px]",
        isOwnMessage ? "right-[-9px]" : "left-[-9px]",
      )}
      style={isOwnMessage ? undefined : { transform: "scaleX(-1)" }}
    >
      <defs>
        <filter
          id={filterId}
          x="-40%"
          y="-30%"
          width="180%"
          height="180%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.55" result="blur" />
          <feOffset in="blur" dy="0.8" result="offset" />
          <feComponentTransfer in="offset" result="shadow">
            <feFuncA type="linear" slope="0.2" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={BUBBLE_APPENDIX_PATH}
        fill={fillColor}
        filter={`url(#${filterId})`}
      />
    </svg>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwnMessage,
  sender,
  currentUserId,
  isOptimistic,
  pendingAttachment,
  onImagePreview,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onKeepComposerFocus,
}: {
  message: Message;
  isOwnMessage: boolean;
  sender: User | null;
  currentUserId: number | null;
  isOptimistic?: boolean;
  pendingAttachment?: PendingAttachment | null;
  onImagePreview: (preview: ImagePreviewState) => void;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onReact: (message: Message, emoji: string) => void;
  onKeepComposerFocus?: () => void;
}) {
  const shouldRestoreComposerFocusRef = useRef(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const attachments = message.attachments ?? [];
  const reactions = message.reactions ?? [];
  const isDeleted = Boolean(message.deletedAt);
  const normalizedMessage = isDeleted
    ? "Message deleted"
    : message.message && message.message !== "Sent an attachment"
      ? message.message
      : "";
  const isMediaOnlyMessage = Boolean(
    !isDeleted &&
    normalizedMessage &&
    getStandaloneMediaMessageUrl(normalizedMessage),
  );
  const hasTextBubble = Boolean(normalizedMessage && !isMediaOnlyMessage);
  const canReply = !isOptimistic;
  const canReact = !isOptimistic && !isDeleted;
  const canEdit =
    isOwnMessage && !isOptimistic && !isDeleted && Boolean(normalizedMessage);
  const canDelete = isOwnMessage && !isOptimistic && !isDeleted;
  const bubbleFillColor = isOwnMessage
    ? "var(--brand-msg-sent)"
    : "var(--brand-msg-received)";
  const bubbleTextClass = isOwnMessage
    ? "text-brand-msg-sent-text"
    : "text-brand-msg-received-text";
  const bubbleShapeClass = isOwnMessage
    ? "rounded-[15px] rounded-br-none"
    : "rounded-[15px] rounded-bl-none";

  const groupedReactions = Array.from(
    reactions
      .reduce<
        Map<
          string,
          { emoji: string; count: number; reactedByCurrentUser: boolean }
        >
      >((map, reaction) => {
        const existing = map.get(reaction.emoji) ?? {
          emoji: reaction.emoji,
          count: 0,
          reactedByCurrentUser: false,
        };
        existing.count += 1;
        if (reaction.userId === currentUserId) {
          existing.reactedByCurrentUser = true;
        }
        map.set(reaction.emoji, existing);
        return map;
      }, new Map())
      .values(),
  ).sort(
    (left, right) =>
      QUICK_REACTIONS.indexOf(left.emoji as (typeof QUICK_REACTIONS)[number]) -
      QUICK_REACTIONS.indexOf(right.emoji as (typeof QUICK_REACTIONS)[number]),
  );

  const formatBubbleTime = (timestamp: Date | string | null) => {
    if (!timestamp) return "";
    return format(new Date(timestamp), "h:mm a");
  };

  const renderInlineTimestamp = () => (
    <span className="relative top-[3px] float-right ml-[7px] mr-[-6px] inline-flex items-center gap-1 whitespace-nowrap text-[11px] leading-[21px] font-medium opacity-55">
      {message.editedAt && !message.deletedAt && <span>edited</span>}
      <span>{formatBubbleTime(message.timestamp)}</span>
    </span>
  );

  const renderReplyPreview = () => {
    if (!message.replyTo) {
      return null;
    }

    const replyAuthor =
      message.replyTo.senderId === currentUserId
        ? "You"
        : message.replyTo.sender.username;
    const replyPreviewText = getQuotedReplyPreviewText(message.replyTo);

    return (
      <div
        className={cn(
          "mb-1 -ml-2 w-[calc(100%+1rem)] min-w-0 max-w-[calc(100%+1rem)] rounded-xl border-l-2 px-3 py-1.5 text-left",
          isOwnMessage
            ? "border-l-violet-500 border-y-black/10 border-r-black/10 bg-black/10 text-brand-msg-sent-text/80"
            : "border-l-violet-500 border-y-black/10 border-r-black/10 bg-black/5 text-brand-msg-received-text/80",
        )}
        style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
      >
        <p className="min-w-0 whitespace-pre-wrap break-words text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-500">
          {replyAuthor}
        </p>
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm">
          {replyPreviewText}
        </p>
      </div>
    );
  };

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    longPressOriginRef.current = null;
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  const handleMessagePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") {
        return;
      }

      clearLongPress();
      longPressOriginRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      longPressTimerRef.current = setTimeout(() => {
        setIsActionMenuOpen(true);
        longPressTimerRef.current = null;
      }, 450);
    },
    [clearLongPress],
  );

  const handleMessagePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!longPressOriginRef.current || longPressTimerRef.current === null) {
        return;
      }

      const movedX = Math.abs(event.clientX - longPressOriginRef.current.x);
      const movedY = Math.abs(event.clientY - longPressOriginRef.current.y);

      if (movedX > 8 || movedY > 8) {
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  return (
    <div
      className={`message-bubble flex items-start ${
        isOwnMessage ? "justify-end" : ""
      } ${isOptimistic ? "opacity-70" : ""}`}
      data-testid={`message-${message.msgId}`}
    >

      <div
        className={`min-w-0 max-w-[75%] flex flex-col gap-1 sm:max-w-xs lg:max-w-md ${
          isOwnMessage ? "items-end" : ""
        }`}
      >
        <div
          className={cn(
            "group/message relative flex items-start gap-1",
            isOwnMessage && "flex-row-reverse",
          )}
          onPointerDown={handleMessagePointerDown}
          onPointerMove={handleMessagePointerMove}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
          onPointerLeave={clearLongPress}
        >
          <div
            className={cn(
              "relative overflow-visible transition-all duration-300",
              groupedReactions.length > 0 && "pb-3",
            )}
          >
            {pendingAttachment && (
              <div className="flex flex-wrap gap-2">
                <div
                  className={cn(
                    "relative overflow-hidden rounded-2xl border border-brand-border bg-muted/30 shadow-sm",
                    isVideoAttachmentType(pendingAttachment.file.type)
                      ? "w-full max-w-xs sm:max-w-sm"
                      : "h-28 w-28 sm:h-32 sm:w-32",
                  )}
                >
                  {pendingAttachment.file.type.startsWith("image/") ? (
                    <div className="relative">
                      <img
                        src={pendingAttachment.previewUrl}
                        alt={pendingAttachment.file.name}
                        className="h-28 w-28 object-cover opacity-60 sm:h-32 sm:w-32"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="flex flex-col items-center gap-2 text-white">
                          {pendingAttachment.status === "error" ? (
                            <span className="text-sm text-red-400">
                              Upload failed
                            </span>
                          ) : (
                            <>
                              <Loader2 className="h-6 w-6 animate-spin" />
                              <span className="text-xs">
                                {pendingAttachment.status === "uploading"
                                  ? "Uploading..."
                                  : "Sending..."}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : isVideoAttachmentType(pendingAttachment.file.type) ? (
                    <VideoAttachmentCard
                      src={pendingAttachment.previewUrl}
                      title={pendingAttachment.file.name}
                      mimeType={pendingAttachment.file.type}
                      showOverlay={pendingAttachment.status !== "error"}
                      overlayLabel={
                        pendingAttachment.status === "error"
                          ? "Upload failed"
                          : pendingAttachment.status === "uploading"
                            ? "Uploading..."
                            : "Sending..."
                      }
                    />
                  ) : (
                    <div className="flex h-full items-center gap-2 px-3 py-2">
                      {pendingAttachment.status === "error" ? (
                        <span className="text-sm text-red-400">
                          Upload failed
                        </span>
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      <span className="flex-1 truncate text-sm">
                        {pendingAttachment.file.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {pendingAttachment.status === "error"
                          ? "Upload failed"
                          : pendingAttachment.status === "uploading"
                            ? "Uploading..."
                            : "Sending..."}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!pendingAttachment && attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <div key={attachment.id}>
                    {attachment.fileType.startsWith("image/") ? (
                      <AttachmentThumbnail
                        attachment={attachment}
                        onPreview={onImagePreview}
                      />
                    ) : isVideoAttachmentType(attachment.fileType) ? (
                      <VideoAttachmentCard
                        src={attachment.url}
                        title={attachment.filename}
                        mimeType={attachment.fileType}
                      />
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2">
                        <Paperclip className="h-4 w-4" />
                        <span className="flex-1 truncate text-sm">
                          {attachment.filename}
                        </span>
                        <a
                          href={attachment.url}
                          download={attachment.filename}
                          className="rounded p-1 hover:bg-black/10"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
                {(message.message &&
                  message.message !== "Sent an attachment") ||
                message.replyTo ? (
                  <div
                    className={cn(
                      "relative min-w-0 max-w-full overflow-visible px-3 py-1.5 text-base leading-5 shadow-sm",
                      bubbleShapeClass,
                      bubbleTextClass,
                    )}
                    style={{ backgroundColor: bubbleFillColor }}
                  >
                    {renderReplyPreview()}
                    {message.message &&
                      message.message !== "Sent an attachment" && (
                        <MessageContent
                          content={message.message}
                          onImagePreview={onImagePreview}
                          metadata={renderInlineTimestamp()}
                        />
                      )}
                    <BubbleAppendix
                      isOwnMessage={isOwnMessage}
                      fillColor={bubbleFillColor}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              !pendingAttachment && (
                <div
                  className={
                    isMediaOnlyMessage
                      ? ""
                      : cn(
                          "relative min-w-0 max-w-full overflow-visible px-3 py-1.5 text-base leading-5 shadow-sm",
                          bubbleShapeClass,
                          bubbleTextClass,
                        )
                  }
                  style={
                    isMediaOnlyMessage
                      ? undefined
                      : { backgroundColor: bubbleFillColor }
                  }
                >
                  {!isMediaOnlyMessage && renderReplyPreview()}
                  {isMediaOnlyMessage ? (
                    <MessageContent
                      content={message.message}
                      onImagePreview={onImagePreview}
                    />
                  ) : (
                    <MessageContent
                      content={normalizedMessage}
                      onImagePreview={onImagePreview}
                      metadata={renderInlineTimestamp()}
                    />
                  )}
                  {!isMediaOnlyMessage && (
                    <BubbleAppendix
                      isOwnMessage={isOwnMessage}
                      fillColor={bubbleFillColor}
                    />
                  )}
                </div>
              )
            )}

            {groupedReactions.length > 0 && (
              <div className={cn("absolute -bottom-1 z-10", "right-2")}>
                <div className="inline-flex max-w-[calc(100%-0.2rem)] items-center gap-0.5 overflow-x-auto rounded-full bg-muted px-0.5 py-0.5 shadow-sm scrollbar-none">
                  {groupedReactions.map((reaction) => (
                    <button
                      key={reaction.emoji}
                      type="button"
                      onClick={() => onReact(message, reaction.emoji)}
                      className={cn(
                        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[11px] font-medium leading-none transition-colors",
                        reaction.reactedByCurrentUser
                          ? "border-primary/25 bg-primary/10 text-primary"
                          : "border-border/60 bg-card/95 text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <span>{reaction.emoji}</span>
                      <span
                        className={cn(
                          "inline-flex min-w-[1rem] items-center justify-center rounded-sm px-1 py-[1px] text-[10px] font-semibold",
                          reaction.reactedByCurrentUser
                            ? "bg-primary/15 text-primary"
                            : "bg-background/90 text-foreground/80",
                        )}
                      >
                        {reaction.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!isOptimistic && (
            <div
              className={cn(
                "w-0 overflow-hidden transition-opacity duration-150 md:w-7 md:shrink-0",
                isActionMenuOpen
                  ? "w-7 opacity-100"
                  : "opacity-0 pointer-events-none md:opacity-0 md:group-hover/message:opacity-100 md:group-hover/message:pointer-events-auto md:group-focus-within/message:opacity-100 md:group-focus-within/message:pointer-events-auto",
              )}
            >
              <DropdownMenu
                open={isActionMenuOpen}
                onOpenChange={setIsActionMenuOpen}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                    title="Message actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align={isOwnMessage ? "start" : "end"}
                  onCloseAutoFocus={(event) => {
                    if (!shouldRestoreComposerFocusRef.current) {
                      return;
                    }

                    event.preventDefault();
                    shouldRestoreComposerFocusRef.current = false;
                    requestAnimationFrame(() => {
                      onKeepComposerFocus?.();
                    });
                  }}
                >
                  {canReply && (
                    <DropdownMenuItem
                      onClick={() => {
                        shouldRestoreComposerFocusRef.current = true;
                        onReply(message);
                      }}
                    >
                      <Reply className="mr-2 h-4 w-4" />
                      Reply
                    </DropdownMenuItem>
                  )}
                  {canEdit && (
                    <DropdownMenuItem
                      onClick={() => {
                        shouldRestoreComposerFocusRef.current = true;
                        onEdit(message);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <DropdownMenuItem onClick={() => onDelete(message)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  )}
                  {canReact && (
                    <div className="px-2 pb-2 pt-1">
                      <div className="flex items-center gap-1">
                        {QUICK_REACTIONS.map((emoji) => (
                          <DropdownMenuItem
                            key={emoji}
                            className="h-9 w-9 justify-center rounded-full p-0 text-base leading-none"
                            onSelect={() => onReact(message, emoji)}
                          >
                            {emoji}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        {!hasTextBubble && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {message.editedAt && !message.deletedAt && <span>edited</span>}
            <span>{formatBubbleTime(message.timestamp)}</span>
          </div>
        )}
      </div>
    </div>
  );
});
