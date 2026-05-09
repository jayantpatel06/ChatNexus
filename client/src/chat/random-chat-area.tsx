import {
  useState,
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import EmojiPicker, {
  type EmojiClickData,
  Theme as EmojiPickerTheme,
} from "emoji-picker-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  Send,
  Smile,
} from "lucide-react";
import type { User } from "@shared/schema";
import type { Message } from "@shared/schema";
import { BubbleAppendix, MessageBubble } from "@/chat/chat-message-components";
import { GifPicker } from "@/chat/gif-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type RandomChatPartner = Pick<
  User,
  "age" | "gender" | "isGuest" | "userId" | "username"
>;

export type RandomChatSocketMessage = {
  id: string;
  message: string;
  senderId: number;
  timestamp: string;
};

export type RandomFooterActionState = "confirm" | "skip" | "start";

type RandomChatAreaProps = {
  currentPartner: RandomChatPartner | null;
  currentUserId: number | null;
  footerActionState: RandomFooterActionState;
  hasDraftText: boolean;
  isDarkTheme: boolean;
  isMobile: boolean;
  isPartnerTyping: boolean;
  messageInput: string;
  messages: RandomChatSocketMessage[];
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onEmojiClick: (emojiData: EmojiClickData) => void;
  onGifClick: (gifUrl: string) => boolean;
  onConfirmChatEnd: () => void;
  onInputChange: (value: string) => void;
  onInputKeyDown: (event: KeyboardEvent) => void;
  onSendMessage: () => void;
  onSkip: () => void;
  onStartChat: () => void;
  setShowEmojiPicker: Dispatch<SetStateAction<boolean>>;
  statusMessage: string;
  showEmojiPicker: boolean;
  composerPickerRef: RefObject<HTMLDivElement | null>;
  composerPickerTriggerRef: RefObject<HTMLButtonElement | null>;
};

function getRandomMessageNumberId(messageId: string): number {
  const numericId = Number(messageId.replace(/\D/g, ""));
  if (Number.isSafeInteger(numericId) && numericId > 0) {
    return numericId;
  }

  let hash = 0;
  for (let index = 0; index < messageId.length; index += 1) {
    hash = (hash * 31 + messageId.charCodeAt(index)) >>> 0;
  }

  return hash || 1;
}

function getRandomMessageSender(
  message: RandomChatSocketMessage,
  currentUserId: number | null,
  currentPartner: RandomChatPartner | null,
): User | null {
  if (message.senderId === currentUserId) {
    return null;
  }

  if (!currentPartner) {
    return null;
  }

  return {
    ...currentPartner,
    isOnline: true,
  };
}

function toPrivateMessageShape(
  message: RandomChatSocketMessage,
  currentUserId: number | null,
  currentPartner: RandomChatPartner | null,
): Message {
  const isOwnMessage = message.senderId === currentUserId;
  const partnerId = currentPartner?.userId ?? 0;
  const fallbackCurrentUserId = currentUserId ?? 0;

  return {
    msgId: getRandomMessageNumberId(message.id),
    senderId: message.senderId,
    receiverId: isOwnMessage ? partnerId : fallbackCurrentUserId,
    conversationId: null,
    replyToId: null,
    message: message.message,
    editedAt: null,
    deletedAt: null,
    timestamp: new Date(message.timestamp),
    attachments: [],
    reactions: [],
    replyTo: null,
  };
}

export function RandomChatArea({
  currentPartner,
  currentUserId,
  footerActionState,
  hasDraftText,
  isDarkTheme,
  isMobile,
  isPartnerTyping,
  messageInput,
  messages,
  messagesContainerRef,
  onBack,
  onEmojiClick,
  onGifClick,
  onConfirmChatEnd,
  onInputChange,
  onInputKeyDown,
  onSendMessage,
  onSkip,
  onStartChat,
  setShowEmojiPicker,
  statusMessage,
  showEmojiPicker,
  composerPickerRef,
  composerPickerTriggerRef,
}: RandomChatAreaProps) {
  const [activeComposerPicker, setActiveComposerPicker] = useState<
    "emoji" | "gif"
  >("gif");
  const isComposerDisabled = !currentPartner;
  const footerActionLabel =
    footerActionState === "confirm"
      ? "Confirm"
      : footerActionState === "skip"
        ? "Skip"
        : "Start";
  const handleFooterAction =
    footerActionState === "confirm"
      ? onConfirmChatEnd
      : footerActionState === "skip"
        ? onSkip
        : onStartChat;
  const pickerClassName = isMobile
    ? "absolute bottom-[calc(100%+0.4rem)] left-3 right-3 z-40 overflow-hidden rounded-sm border border-border bg-card-muted font-sans backdrop-blur-xl"
    : "absolute bottom-[calc(100%+0.4rem)] right-3 z-40 w-[24rem] max-w-[calc(100%-1.5rem)] overflow-hidden rounded-sm border border-border bg-card-muted font-sans backdrop-blur-xl";
  const pickerAnimation = isMobile
    ? {
        initial: { height: 0, opacity: 0 },
        animate: { height: "auto", opacity: 1 },
        exit: { height: 0, opacity: 0 },
      }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 10 },
      };
  const isComposerPickerOpen = showEmojiPicker;
  const bottomStatus = currentPartner && messages.length === 0 ? (
    <>You are now chatting with <span className="text-violet-500 font-semibold tracking-wide">{currentPartner.username}</span></>
  ) : statusMessage ? (
    <>{statusMessage}</>
  ) : null;
  const noopMessageAction = () => {};

  const handleInputFocus = () => {
    setShowEmojiPicker(false);
  };
  const handlePickerSwitch = () => {
    if (showEmojiPicker) {
      setShowEmojiPicker(false);
      return;
    }

    setActiveComposerPicker("gif");
    setShowEmojiPicker(true);
  };
  const handlePickerTabChange = (tab: "emoji" | "gif") => {
    if (showEmojiPicker && activeComposerPicker === tab) {
      setShowEmojiPicker(false);
      return;
    }

    setActiveComposerPicker(tab);
    setShowEmojiPicker(true);
  };

  return (
    <div
      className={cn(
        "relative flex-1",
        isMobile
          ? "flex h-full flex-col overflow-hidden"
          : "flex min-w-0 overflow-hidden",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="z-40 flex shrink-0 items-center justify-between bg-card p-2.5 md:border-b md:border-border/70 md:px-5 md:py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 p-2 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              onClick={onBack}
              title="Back to random chat controls"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-foreground">
                {currentPartner?.username ?? "New Chat"}
              </h3>
            </div>
          </div>
        </div>

        <div
          ref={messagesContainerRef}
          className="relative min-h-0 flex-1 space-y-1 overflow-y-auto bg-background p-4 overscroll-contain scrollbar-none"
        >
          {messages.length === 0 ? null : (
            <div className="space-y-1">
              {messages.map((message) => {
                const isCurrentUser = message.senderId === currentUserId;
                const privateMessage = toPrivateMessageShape(
                  message,
                  currentUserId,
                  currentPartner,
                );

                return (
                  <MessageBubble
                    key={message.id}
                    message={privateMessage}
                    isOwnMessage={isCurrentUser}
                    sender={getRandomMessageSender(
                      message,
                      currentUserId,
                      currentPartner,
                    )}
                    currentUserId={currentUserId}
                    isMobile={isMobile}
                    onImagePreview={() => {}}
                    onReply={noopMessageAction}
                    onEdit={noopMessageAction}
                    onDelete={noopMessageAction}
                    onReact={noopMessageAction}
                  />
                );
              })}
              {isPartnerTyping && (
                <div className="flex items-start message-bubble">
                  <div className="flex flex-col gap-1 max-w-xs lg:max-w-md">
                    <div className="relative overflow-visible rounded-[15px] rounded-bl-none bg-brand-msg-received p-3 text-brand-msg-received-text shadow-sm">
                      <div className="flex items-center gap-1">
                        <div className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground" />
                        <div className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground delay-75" />
                        <div className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground delay-150" />
                      </div>
                      <BubbleAppendix
                        isOwnMessage={false}
                        fillColor="var(--brand-msg-received)"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {bottomStatus ? (
          <div className="shrink-0 bg-transparent px-4 pb-1 text-sm font-medium text-muted-foreground">
            <p className="truncate">{bottomStatus}</p>
          </div>
        ) : null}

        <div
          className="relative shrink-0 overflow-visible bg-transparent"
          style={{ paddingBottom: "2px" }}
        >
          <AnimatePresence initial={false}>
            {showEmojiPicker && (
              <motion.div
                ref={composerPickerRef}
                initial={pickerAnimation.initial}
                animate={pickerAnimation.animate}
                exit={pickerAnimation.exit}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={pickerClassName}
              >
                <div className="border-b border-border/70 px-3 py-2">
                  <div className="mx-auto grid w-full grid-cols-2 overflow-hidden rounded-full border-border">
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                        activeComposerPicker === "emoji"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => handlePickerTabChange("emoji")}
                      aria-label="Emoji picker"
                    >
                      <Smile className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-8 items-center justify-center rounded-full text-xs font-semibold tracking-[0.18em] transition-colors",
                        activeComposerPicker === "gif"
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => handlePickerTabChange("gif")}
                      aria-label="GIF picker"
                    >
                      GIF
                    </button>
                  </div>
                </div>
                {activeComposerPicker === "emoji" ? (
                  <div className="overflow-hidden font-sans">
                    <EmojiPicker
                      onEmojiClick={onEmojiClick}
                      width="100%"
                      height={320}
                      theme={
                        isDarkTheme
                          ? (EmojiPickerTheme.DARK as unknown as EmojiPickerTheme)
                          : (EmojiPickerTheme.LIGHT as unknown as EmojiPickerTheme)
                      }
                      autoFocusSearch={false}
                      searchPlaceholder="Search emoji"
                      lazyLoadEmojis={true}
                      previewConfig={{ showPreview: false }}
                      className={cn(
                        "font-sans [--epr-bg-color:transparent] [--epr-picker-border-color:transparent] [--epr-picker-border-radius:0px] [--epr-emoji-padding:4px] [--epr-horizontal-padding:8px] [&_.epr-header-overlay]:pb-0",
                        isMobile
                          ? "[--epr-emoji-size:22px] [--epr-search-input-height:30px] [--epr-search-input-border-radius:9999px] [--epr-category-navigation-button-size:26px] [--epr-category-label-height:26px]"
                          : "[--epr-emoji-size:24px] [--epr-search-input-height:32px] [--epr-search-input-border-radius:9999px] [--epr-category-navigation-button-size:28px] [--epr-category-label-height:28px]",
                      )}
                    />
                  </div>
                ) : (
                  <GifPicker
                    onGifClick={onGifClick}
                    autoFocusSearch={false}
                    showCategories={false}
                    showStatus={false}
                    showFooter={false}
                    className="h-[320px] rounded-none border-0 bg-transparent shadow-none"
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="px-2 pt-2 pb-1 md:pb-1">
            <div className="flex items-end gap-1">
              <Button
                type="button"
                className="h-10 shrink-0 rounded-[.75rem] bg-primary/90 px-3 text-xs font-semibold uppercase tracking-normal text-primary-foreground hover:bg-primary/60"
                onClick={handleFooterAction}
              >
                {footerActionLabel}
              </Button>

              <div className="relative min-w-0 flex-1 rounded-[.75rem] border border-border bg-card px-6 shadow-sm">
                <Textarea
                  placeholder={
                    currentPartner ? "Message..." : "Send a message"
                  }
                  aria-label="Message random chat"
                  className={cn(
                    "min-h-[38px] max-h-32 resize-none rounded-none border-0 bg-card px-0 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                    hasDraftText ? "pr-12" : "pr-14",
                  )}
                  rows={1}
                  value={messageInput}
                  onChange={(event) => onInputChange(event.target.value)}
                  onKeyDown={onInputKeyDown}
                  onFocus={handleInputFocus}
                  disabled={isComposerDisabled}
                  data-testid="textarea-message-input"
                />
                <div className="absolute bottom-1 right-2 flex items-center">
                  {hasDraftText ? (
                    <Button
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={onSendMessage}
                      disabled={!hasDraftText || isComposerDisabled}
                      className="h-8 w-8 rounded-2xl bg-primary/90"
                      size="icon"
                      title="Send message"
                      aria-label="Send message"
                      data-testid="button-send-message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      ref={composerPickerTriggerRef}
                      className={cn(
                        "h-8 w-8 rounded-full text-muted-foreground hover:text-foreground",
                        isComposerPickerOpen && "bg-muted text-foreground",
                      )}
                      title={
                        isComposerPickerOpen
                          ? "Show keyboard"
                          : "Open GIF and emoji picker"
                      }
                      aria-label={
                        isComposerPickerOpen
                          ? "Show keyboard"
                          : "Open GIF and emoji picker"
                      }
                      data-testid="button-picker-switch"
                      onClick={handlePickerSwitch}
                      disabled={isComposerDisabled}
                    >
                      <Smile className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
