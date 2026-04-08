import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { format } from "date-fns";
import EmojiPicker, {
  EmojiClickData,
  Theme as EmojiPickerTheme,
} from "emoji-picker-react";
import {
  ArrowLeft,
  Compass,
  Loader2,
  Lock,
  LogOut,
  MessageCircleMore,
  Plus,
  Search,
  Send,
  Smile,
  SkipForward,
  VenetianMask,
  VenusAndMars,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Seo } from "@/components/seo";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/providers/socket-provider";
import {
  ChatNavigationMenu,
  type ChatNavigationItem,
} from "@/chat/chat-navigation-menu";
import { UserSettingsModal } from "@/chat/users-sidebar";
import { cn, getAvatarColor, getUserInitials } from "@/lib/utils";
import type { User } from "@shared/schema";
import { AnimatePresence, motion } from "framer-motion";

type RandomChatPartner = Pick<
  User,
  "age" | "gender" | "isGuest" | "userId" | "username"
>;

type RandomChatSocketMessage = {
  id: string;
  message: string;
  senderId: number;
  timestamp: string;
};

type RandomChatPreferences = {
  interests: string[];
  interestsMatchingEnabled: boolean;
};

type RandomMatchState = "connecting" | "idle" | "matched" | "searching";
type RandomFooterActionState = "confirm" | "skip" | "start";

const RANDOM_CHAT_PREFERENCES_KEY = "chatnexus_random_chat_preferences";
const IDLE_RANDOM_CHAT_STATUS = "Set your interests and press Start Chat.";
const RANDOM_CHAT_CONFIRM_STATUS =
  "Press Confirm to end this chat.";

function sanitizeInterestList(interests: string[]): string[] {
  return Array.from(
    new Set(
      interests.map((interest) => interest.trim().slice(0, 24)).filter(Boolean),
    ),
  ).slice(0, 10);
}

function readStoredRandomChatPreferences(): RandomChatPreferences {
  if (typeof window === "undefined") {
    return {
      interests: [],
      interestsMatchingEnabled: true,
    };
  }

  try {
    const stored = localStorage.getItem(RANDOM_CHAT_PREFERENCES_KEY);
    if (!stored) {
      return {
        interests: [],
        interestsMatchingEnabled: true,
      };
    }

    const parsed = JSON.parse(stored) as Partial<RandomChatPreferences>;
    return {
      interests: sanitizeInterestList(
        Array.isArray(parsed.interests) ? parsed.interests : [],
      ),
      interestsMatchingEnabled: parsed.interestsMatchingEnabled !== false,
    };
  } catch {
    return {
      interests: [],
      interestsMatchingEnabled: true,
    };
  }
}

export default function RandomChatPage() {
  const { user, logoutMutation } = useAuth();
  const { socket, isConnected, onlineUsers } = useSocket();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<RandomChatPreferences>(() =>
    readStoredRandomChatPreferences(),
  );
  const [interestDraft, setInterestDraft] = useState("");
  const [isManagingInterests, setIsManagingInterests] = useState(false);
  const [matchIntentActive, setMatchIntentActive] = useState(false);
  const [footerActionState, setFooterActionState] =
    useState<RandomFooterActionState>("start");
  const [currentPartner, setCurrentPartner] =
    useState<RandomChatPartner | null>(null);
  const [messages, setMessages] = useState<RandomChatSocketMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [matchState, setMatchState] = useState<RandomMatchState>("idle");
  const [statusMessage, setStatusMessage] = useState(IDLE_RANDOM_CHAT_STATUS);
  const [sharedInterests, setSharedInterests] = useState<string[]>([]);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerPickerRef = useRef<HTMLDivElement>(null);
  const composerPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const matchPreferencesRef = useRef<RandomChatPreferences>(preferences);
  const pendingMatchMessageRef = useRef("Looking for a new conversation...");
  const localTypingActiveRef = useRef(false);
  const localTypingTimeoutRef = useRef<number | null>(null);
  const partnerTypingTimeoutRef = useRef<number | null>(null);
  const socketRef = useRef(socket);
  const isDarkTheme =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  const activeNavigationItem: ChatNavigationItem = "random";
  const hasDraftText = messageInput.trim().length > 0;
  const interests = preferences.interests;
  const interestMatchingEnabled = preferences.interestsMatchingEnabled;
  const isIdle = matchState === "idle";
  const isMatched = matchState === "matched";
  const isFindingMatch =
    matchState === "connecting" || matchState === "searching";
  const matchPreferences = useMemo(
    () => ({
      interests: sanitizeInterestList(interests),
      interestsMatchingEnabled: interestMatchingEnabled,
    }),
    [interestMatchingEnabled, interests],
  );

  const stopLocalTyping = useCallback(() => {
    if (localTypingTimeoutRef.current !== null) {
      window.clearTimeout(localTypingTimeoutRef.current);
      localTypingTimeoutRef.current = null;
    }

    if (!localTypingActiveRef.current || !socket) {
      localTypingActiveRef.current = false;
      return;
    }

    localTypingActiveRef.current = false;
    socket.emit("random_chat_typing_stop");
  }, [socket]);

  const clearPartnerTypingState = useCallback(() => {
    if (partnerTypingTimeoutRef.current !== null) {
      window.clearTimeout(partnerTypingTimeoutRef.current);
      partnerTypingTimeoutRef.current = null;
    }

    setIsPartnerTyping(false);
  }, []);

  const resetRandomChatState = useCallback(
    (nextState: RandomMatchState, nextStatus: string) => {
      stopLocalTyping();
      setShowEmojiPicker(false);
      setMessageInput("");
      setMessages([]);
      setCurrentPartner(null);
      setSharedInterests([]);
      clearPartnerTypingState();
      setMatchState(nextState);
      setStatusMessage(nextStatus);
    },
    [clearPartnerTypingState, stopLocalTyping],
  );

  const requestMatch = useCallback(
    (message = "Looking for a new conversation...") => {
      pendingMatchMessageRef.current = message;

      if (!socket || !isConnected) {
        resetRandomChatState("connecting", "Connecting to random chat...");
        return;
      }

      resetRandomChatState("searching", message);
      socket.emit("random_chat_request_match", matchPreferencesRef.current);
    },
    [isConnected, resetRandomChatState, socket],
  );

  const beginMatchmaking = useCallback(
    (message = "Looking for a new conversation...") => {
      setMatchIntentActive(true);
      setFooterActionState("skip");
      requestMatch(message);
    },
    [requestMatch],
  );

  const leaveRandomChat = useCallback(() => {
    setMatchIntentActive(false);
    setFooterActionState("start");
    resetRandomChatState("idle", IDLE_RANDOM_CHAT_STATUS);

    if (socket && isConnected) {
      socket.emit("random_chat_leave");
    }
  }, [isConnected, resetRandomChatState, socket]);

  const handleSkipChat = useCallback(() => {
    if (isFindingMatch) {
      setMatchIntentActive(false);
      setFooterActionState("start");
      resetRandomChatState("idle", IDLE_RANDOM_CHAT_STATUS);

      if (socket && isConnected) {
        socket.emit("random_chat_leave");
      }
      return;
    }

    if (isMatched) {
      setFooterActionState("confirm");
      setStatusMessage(RANDOM_CHAT_CONFIRM_STATUS);
    }
  }, [
    isConnected,
    isFindingMatch,
    isMatched,
    resetRandomChatState,
    socket,
  ]);

  const handleConfirmChatEnd = useCallback(() => {
    stopLocalTyping();
    setMatchIntentActive(false);
    setFooterActionState("start");
    resetRandomChatState("idle", IDLE_RANDOM_CHAT_STATUS);

    if (socket && isConnected) {
      socket.emit("random_chat_leave");
    }
  }, [isConnected, resetRandomChatState, socket, stopLocalTyping]);

  useEffect(() => {
    matchPreferencesRef.current = matchPreferences;

    try {
      localStorage.setItem(
        RANDOM_CHAT_PREFERENCES_KEY,
        JSON.stringify(matchPreferences),
      );
    } catch {
      // Ignore storage errors.
    }

    if (socket && isConnected) {
      socket.emit("random_chat_update_preferences", matchPreferences);
    }
  }, [isConnected, matchPreferences, socket]);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, [messages, isFindingMatch]);

  useEffect(() => {
    if (!showEmojiPicker) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (composerPickerRef.current?.contains(target) ||
          composerPickerTriggerRef.current?.contains(target))
      ) {
        return;
      }

      setShowEmojiPicker(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [showEmojiPicker]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleSearching = (data: { message?: string }) => {
      setMatchIntentActive(true);
      setFooterActionState("skip");
      setMatchState("searching");
      setCurrentPartner(null);
      setSharedInterests([]);
      setMessages([]);
      clearPartnerTypingState();
      setStatusMessage(data.message ?? "Looking for a new conversation...");
    };

    const handleMatched = (data: {
      partner?: RandomChatPartner;
      sharedInterests?: string[];
    }) => {
      if (!data.partner) {
        return;
      }

      const nextSharedInterests = Array.isArray(data.sharedInterests)
        ? data.sharedInterests
        : [];

      setCurrentPartner(data.partner);
      setSharedInterests(nextSharedInterests);
      setMessages([]);
      clearPartnerTypingState();
      setMatchIntentActive(true);
      setFooterActionState("skip");
      setMatchState("matched");
      setStatusMessage(
        nextSharedInterests.length > 0
          ? `Matched through ${nextSharedInterests.join(", ")}`
          : `Connected to ${data.partner.username}`,
      );
    };

    const handleMessage = (data: { message?: RandomChatSocketMessage }) => {
      const nextMessage = data.message;
      if (!nextMessage) {
        return;
      }

      setMessages((prev) => [...prev, nextMessage]);
      clearPartnerTypingState();
      if (footerActionState === "confirm") {
        setFooterActionState("skip");
        setStatusMessage(
          sharedInterests.length > 0
            ? `Matched through ${sharedInterests.join(", ")}`
            : `Connected to ${currentPartner?.username ?? "your partner"}`,
        );
      }
    };

    const handleSessionEnded = (data: {
      message?: string;
      requeued?: boolean;
    }) => {
      setCurrentPartner(null);
      setSharedInterests([]);
      setMessages([]);
      clearPartnerTypingState();
      setMatchIntentActive(false);
      setFooterActionState("start");
      setMatchState("idle");
      setStatusMessage(
        data.message ?? IDLE_RANDOM_CHAT_STATUS,
      );
    };

    const handleTyping = (data: { isTyping?: boolean; userId?: number }) => {
      if (!currentPartner || data.userId !== currentPartner.userId) {
        return;
      }

      if (partnerTypingTimeoutRef.current !== null) {
        window.clearTimeout(partnerTypingTimeoutRef.current);
        partnerTypingTimeoutRef.current = null;
      }

      if (data.isTyping) {
        setIsPartnerTyping(true);
        partnerTypingTimeoutRef.current = window.setTimeout(() => {
          setIsPartnerTyping(false);
          partnerTypingTimeoutRef.current = null;
        }, 3000);
        return;
      }

      setIsPartnerTyping(false);
    };

    const handleError = (data: { message?: string }) => {
      toast({
        title: "Random chat error",
        description: data.message ?? "Something went wrong.",
        variant: "destructive",
      });
    };

    socket.on("random_chat_searching", handleSearching);
    socket.on("random_chat_matched", handleMatched);
    socket.on("random_chat_message", handleMessage);
    socket.on("random_chat_session_ended", handleSessionEnded);
    socket.on("random_chat_typing", handleTyping);
    socket.on("random_chat_error", handleError);

    return () => {
      socket.off("random_chat_searching", handleSearching);
      socket.off("random_chat_matched", handleMatched);
      socket.off("random_chat_message", handleMessage);
      socket.off("random_chat_session_ended", handleSessionEnded);
      socket.off("random_chat_typing", handleTyping);
      socket.off("random_chat_error", handleError);
    };
  }, [clearPartnerTypingState, currentPartner, footerActionState, sharedInterests, socket, toast]);

  useEffect(() => {
    if (!socket || !isConnected) {
      resetRandomChatState(
        matchIntentActive ? "connecting" : "idle",
        matchIntentActive
          ? "Connecting to random chat..."
          : IDLE_RANDOM_CHAT_STATUS,
      );
      return;
    }

    if (matchIntentActive && matchState === "connecting") {
      requestMatch(pendingMatchMessageRef.current);
      return;
    }

    if (!matchIntentActive && matchState !== "idle") {
      resetRandomChatState("idle", IDLE_RANDOM_CHAT_STATUS);
    }
  }, [
    isConnected,
    matchIntentActive,
    matchState,
    requestMatch,
    resetRandomChatState,
    socket,
  ]);

  useEffect(() => {
    return () => {
      if (localTypingTimeoutRef.current !== null) {
        window.clearTimeout(localTypingTimeoutRef.current);
      }

      if (partnerTypingTimeoutRef.current !== null) {
        window.clearTimeout(partnerTypingTimeoutRef.current);
      }

      localTypingActiveRef.current = false;
      socketRef.current?.emit("random_chat_leave");
    };
  }, []);

  const handleNavigationSelect = (item: ChatNavigationItem) => {
    if (item === "settings") {
      setSettingsOpen(true);
      return;
    }

    if (item === "chat") {
      if (location !== "/dashboard") {
        setLocation("/dashboard");
      }
      return;
    }

    if (item === "history") {
      if (location !== "/history") {
        setLocation("/history");
      }
      return;
    }

    if (item === "global") {
      if (location !== "/global-chat") {
        setLocation("/global-chat");
      }
      return;
    }

    if (location !== "/random-chat") {
      setLocation("/random-chat");
    }
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessageInput((prev) => prev + emojiData.emoji);
  };

  const handleAddInterest = () => {
    const normalizedInterest = interestDraft.trim();
    if (!normalizedInterest) {
      return;
    }

    if (
      interests.some(
        (interest) =>
          interest.toLowerCase() === normalizedInterest.toLowerCase(),
      )
    ) {
      toast({
        title: "Interest already added",
        description: "Pick something new to influence the next match.",
      });
      return;
    }

    setPreferences((prev) => ({
      ...prev,
      interests: [...prev.interests, normalizedInterest],
    }));
    setInterestDraft("");
  };

  const handleRemoveInterest = (interestToRemove: string) => {
    setPreferences((prev) => ({
      ...prev,
      interests: prev.interests.filter(
        (interest) => interest !== interestToRemove,
      ),
    }));
  };

  const handlePrototypeGenderClick = (target: string) => {
    toast({
      title: "Premium filter preview",
      description: `${target} matching is visual only for now and will be wired later.`,
    });
  };

  const handleSendMessage = () => {
    const trimmedMessage = messageInput.trim();
    if (!trimmedMessage || !currentPartner || !socket || isFindingMatch) {
      return;
    }

    stopLocalTyping();
    socket.emit("random_chat_send_message", {
      message: trimmedMessage,
    });
    setMessageInput("");
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleMessageInputChange = (value: string) => {
    setMessageInput(value);

    if (!socket || !isConnected || matchState !== "matched") {
      return;
    }

    if (value.trim().length === 0) {
      stopLocalTyping();
      return;
    }

    if (!localTypingActiveRef.current) {
      socket.emit("random_chat_typing_start");
      localTypingActiveRef.current = true;
    }

    if (localTypingTimeoutRef.current !== null) {
      window.clearTimeout(localTypingTimeoutRef.current);
    }

    localTypingTimeoutRef.current = window.setTimeout(() => {
      stopLocalTyping();
    }, 1200);
  };

  const sidebarContent = (
    <RandomMatchControlsPanel
      interestMatchingEnabled={interestMatchingEnabled}
      interests={interests}
      isManagingInterests={isManagingInterests}
      onInterestMatchingChange={(checked) =>
        setPreferences((prev) => ({
          ...prev,
          interestsMatchingEnabled: checked,
        }))
      }
      onManageInterestsToggle={() => setIsManagingInterests((prev) => !prev)}
      onRemoveInterest={handleRemoveInterest}
      onPrototypeGenderClick={handlePrototypeGenderClick}
      onStartChat={() => beginMatchmaking("Looking for a new conversation...")}
      startChatDisabled={isFindingMatch}
      startChatLabel={
        currentPartner
          ? "Find New Chat"
          : isFindingMatch
            ? "Searching..."
            : "Start Chat"
      }
      statusMessage={statusMessage}
      hidePrototypeNotes
    />
  );

  const conversationPanel = (
    <RandomChatConversationPanel
      currentPartner={currentPartner}
      currentUserId={user?.userId ?? null}
      footerActionState={footerActionState}
      hasDraftText={hasDraftText}
      isDarkTheme={isDarkTheme}
      isIdle={isIdle}
      isFindingMatch={isFindingMatch}
      isMobile={isMobile}
      isPartnerTyping={isPartnerTyping}
      messageInput={messageInput}
      messages={messages}
      messagesContainerRef={messagesContainerRef}
      onBack={leaveRandomChat}
      onEmojiClick={handleEmojiClick}
      onConfirmChatEnd={handleConfirmChatEnd}
      onInputChange={handleMessageInputChange}
      onInputKeyDown={handleKeyDown}
      onSendMessage={handleSendMessage}
      onSkip={handleSkipChat}
      onStartChat={() => beginMatchmaking("Looking for a new conversation...")}
      setShowEmojiPicker={setShowEmojiPicker}
      sharedInterests={sharedInterests}
      statusMessage={statusMessage}
      showEmojiPicker={showEmojiPicker}
      composerPickerRef={composerPickerRef}
      composerPickerTriggerRef={composerPickerTriggerRef}
    />
  );

  const sharedSidebarPanel = (
    <div className="relative flex min-w-0 flex-1 flex-col bg-background text-foreground md:overflow-hidden md:rounded-sm md:border md:border-border/70 md:bg-card md:shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
      <div className="px-3 pb-2 pt-2 md:px-3 md:pb-2 md:pt-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate px-2 text-2xl font-semibold leading-none tracking-tight text-foreground">
              ChatNexus
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium shadow-sm",
                isConnected
                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                  : "bg-rose-500/12 text-rose-700 dark:text-rose-300",
              )}
            >
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full animate-ping rounded-full opacity-35",
                    isConnected ? "bg-emerald-500" : "bg-rose-500",
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex h-2.5 w-2.5 rounded-full",
                    isConnected ? "bg-emerald-500" : "bg-rose-500",
                  )}
                />
              </span>
              <span>{onlineUsers.length} online</span>
            </span>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              title="Logout"
              data-testid="button-random-logout"
              className="h-11 w-11 rounded-full text-muted-foreground shadow-[0_12px_28px_rgba(15,23,42,0.08)] hover:bg-accent hover:text-foreground"
            >
              {logoutMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <LogOut className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-3 md:mt-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Add an interest"
              className="h-11 rounded-full border-border bg-card pl-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 md:bg-muted"
              value={interestDraft}
              onChange={(event) => setInterestDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddInterest();
                }
              }}
              data-testid="input-random-interest"
            />
          </div>

          <Button
            type="button"
            onClick={handleAddInterest}
            size="icon"
            className="h-9 w-9 rounded-full shrink-0"
            title="Add interest"
            data-testid="button-add-random-interest"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+94px)] pt-10 scrollbar-none md:px-3 md:pb-4">
        {sidebarContent}
      </div>
    </div>
  );

  if (isMobile) {
    if (matchIntentActive) {
      return (
        <>
          <Seo
            title="Random Chat | ChatNexus"
            description="Protected random chat inside ChatNexus."
            path="/random-chat"
            robots="noindex, nofollow"
          />
          <div
            className="h-[100dvh] bg-brand-bg flex flex-col"
            data-testid="random-chat-mobile-layout"
          >
            {conversationPanel}
          </div>
        </>
      );
    }

    return (
      <>
        <Seo
          title="Random Chat | ChatNexus"
          description="Protected random chat inside ChatNexus."
          path="/random-chat"
          robots="noindex, nofollow"
        />
        <div
          className="h-[100dvh] bg-brand-bg"
          data-testid="random-chat-mobile-layout"
        >
          <div className="relative h-full w-full overflow-hidden bg-background">
            {sharedSidebarPanel}

            <div className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+12px)] md:hidden">
              <ChatNavigationMenu
                activeItem={activeNavigationItem}
                onSelect={handleNavigationSelect}
                variant="bottom"
              />
            </div>
          </div>
        </div>

        <UserSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      </>
    );
  }

  return (
    <>
      <Seo
        title="Random Chat | ChatNexus"
        description="Protected random chat inside ChatNexus."
        path="/random-chat"
        robots="noindex, nofollow"
      />
      <div
        className="flex h-screen overflow-hidden bg-brand-bg text-brand-text"
        data-testid="random-chat-desktop-layout"
      >
        <div className="h-full w-full overflow-hidden bg-background md:w-[28rem] md:bg-muted/10 md:p-2">
          <div className="flex h-full w-full overflow-hidden bg-background md:gap-2 md:bg-transparent">
            <div className="hidden md:flex md:shrink-0">
              <ChatNavigationMenu
                activeItem={activeNavigationItem}
                onSelect={handleNavigationSelect}
                variant="rail"
                className="h-full"
              />
            </div>

            {sharedSidebarPanel}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 pb-2 pr-2 pt-2">
          {conversationPanel}
        </div>
      </div>

      <UserSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

function RandomMatchControlsPanel({
  interestMatchingEnabled,
  interests,
  isManagingInterests,
  onInterestMatchingChange,
  onManageInterestsToggle,
  onRemoveInterest,
  onPrototypeGenderClick,
  onStartChat,
  startChatDisabled,
  startChatLabel,
  statusMessage,
  hidePrototypeNotes,
}: {
  interestMatchingEnabled: boolean;
  interests: string[];
  isManagingInterests: boolean;
  onInterestMatchingChange: (checked: boolean) => void;
  onManageInterestsToggle: () => void;
  onRemoveInterest: (interest: string) => void;
  onPrototypeGenderClick: (target: string) => void;
  onStartChat: () => void;
  startChatDisabled?: boolean;
  startChatLabel: string;
  statusMessage: string;
  hidePrototypeNotes?: boolean;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-sm border border-border/70 bg-background p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-semibold text-foreground">
                Interest Matching
              </h4>
              <Switch
                checked={interestMatchingEnabled}
                onCheckedChange={onInterestMatchingChange}
                aria-label="Toggle interest matching"
              />
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={onManageInterestsToggle}
          >
            {isManagingInterests ? "Done" : "Manage"}
          </Button>
        </div>

        <div className="mt-3 rounded-[1.2rem] border border-dashed border-border/70 bg-muted/20 p-3">
          <div className="flex flex-wrap gap-2">
            {interests.length > 0 ? (
              interests.map((interest) => (
                <span
                  key={interest}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                >
                  {interest}
                  {isManagingInterests && (
                    <button
                      type="button"
                      onClick={() => onRemoveInterest(interest)}
                      className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={`Remove ${interest}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))
            ) : (
              <p className="flex justify-center text-xs text-muted-foreground">
                You have no interests yet
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-sm border border-border/70 bg-background p-3.5 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-2">
          <h4 className="text-base font-semibold text-foreground">
            Gender Filter
          </h4>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2.5 py-1 text-[11px] font-semibold text-amber-600">
            <Lock className="h-3 w-3" />
            Paid
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {[
            { label: "Male", icon: VenetianMask },
            { label: "Both", icon: VenusAndMars },
            { label: "Female", icon: VenetianMask },
          ].map((option, index) => {
            const Icon = option.icon;
            const isHighlighted = index === 1;

            return (
              <button
                key={option.label}
                type="button"
                onClick={() => onPrototypeGenderClick(option.label)}
                className={cn(
                  "rounded-[1.1rem] border px-2.5 py-3 text-center transition-colors",
                  isHighlighted
                    ? "border-primary/50 bg-primary/8"
                    : "border-border/70 bg-card hover:bg-muted/40",
                )}
              >
                <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <p className="text-xs font-semibold text-foreground">
                  {option.label}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      
        <div className="flex flex-col items-center gap-3 text-center">
          <Button
            type="button"
            onClick={onStartChat}
            disabled={startChatDisabled}
            className="h-10 w-full rounded-full text-base font-semibold"
          >
            {startChatDisabled ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MessageCircleMore className="mr-2 h-4 w-4" />
            )}
            {startChatLabel}
          </Button>
        </div>
    </div>
  );
}

function RandomChatConversationPanel({
  currentPartner,
  currentUserId,
  footerActionState,
  hasDraftText,
  isDarkTheme,
  isIdle,
  isFindingMatch,
  isMobile,
  isPartnerTyping,
  messageInput,
  messages,
  messagesContainerRef,
  onBack,
  onEmojiClick,
  onConfirmChatEnd,
  onInputChange,
  onInputKeyDown,
  onSendMessage,
  onSkip,
  onStartChat,
  setShowEmojiPicker,
  sharedInterests,
  statusMessage,
  showEmojiPicker,
  composerPickerRef,
  composerPickerTriggerRef,
}: {
  currentPartner: RandomChatPartner | null;
  currentUserId: number | null;
  footerActionState: RandomFooterActionState;
  hasDraftText: boolean;
  isDarkTheme: boolean;
  isIdle: boolean;
  isFindingMatch: boolean;
  isMobile: boolean;
  isPartnerTyping: boolean;
  messageInput: string;
  messages: RandomChatSocketMessage[];
  messagesContainerRef: RefObject<HTMLDivElement>;
  onBack: () => void;
  onEmojiClick: (emojiData: EmojiClickData) => void;
  onConfirmChatEnd: () => void;
  onInputChange: (value: string) => void;
  onInputKeyDown: (event: KeyboardEvent) => void;
  onSendMessage: () => void;
  onSkip: () => void;
  onStartChat: () => void;
  setShowEmojiPicker: Dispatch<SetStateAction<boolean>>;
  sharedInterests: string[];
  statusMessage: string;
  showEmojiPicker: boolean;
  composerPickerRef: RefObject<HTMLDivElement>;
  composerPickerTriggerRef: RefObject<HTMLButtonElement>;
}) {
  const isComposerDisabled = isIdle || isFindingMatch;
  const hasEndedChatNotice =
    isIdle && statusMessage !== IDLE_RANDOM_CHAT_STATUS;
  const shouldShowStatusChip =
    !isIdle || footerActionState === "confirm" || hasEndedChatNotice;
  const footerActionLabel =
    footerActionState === "confirm"
      ? "Confirm"
      : footerActionState === "skip"
        ? "Skip"
        : "Start";
  const FooterActionIcon = footerActionState === "confirm"
    ? X
    : footerActionState === "skip"
      ? SkipForward
      : MessageCircleMore;
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
  const headerSubtitle =
    isPartnerTyping && currentPartner
      ? `${currentPartner.username} is typing...`
      : sharedInterests.length > 0
        ? `Shared interests: ${sharedInterests.join(", ")}`
        : isFindingMatch
          ? "Searching for a stranger"
          : currentPartner
            ? "Private room"
            : "Private room";
  const handleInputFocus = () => {
    setShowEmojiPicker(false);
  };

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-background",
        !isMobile &&
          "overflow-hidden rounded-sm border border-border/70 shadow-[0_24px_60px_rgba(15,23,42,0.12)]",
      )}
    >
      <div className="z-40 flex flex-shrink-0 items-center justify-between border-b border-border/70 bg-card p-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="p-2 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            onClick={onBack}
            title="Back to random chat controls"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand-grad-start)] to-[var(--brand-grad-end)] font-semibold text-black"
          >
            <Compass className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <h3 className="truncate font-semibold text-foreground">
              {currentPartner?.username ?? "Random Chat"}
            </h3>
            <p className="truncate text-xs text-muted-foreground">{headerSubtitle}</p>
          </div>
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        className="relative min-h-0 flex-1 overflow-y-auto bg-background p-4 space-y-1 overscroll-contain scrollbar-none"
      >
        <div className="space-y-1">
          {shouldShowStatusChip ? (
            <div className="my-2 flex justify-center">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card-muted/80 px-4 py-1.5 text-[11px] text-muted-foreground">
                <Compass className="h-3.5 w-3.5" />
                {statusMessage}
              </div>
            </div>
          ) : null}

          {isIdle ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Compass className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {footerActionState === "confirm"
                  ? "Confirm the reset, then start a new chat."
                  : hasEndedChatNotice
                    ? "Press Start to connect with someone new."
                  : "Start chat from the sidebar to begin."}
              </p>
            </div>
          ) : isFindingMatch ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="max-w-sm text-sm text-muted-foreground">
                Looking for someone to connect you with...
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Compass className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                You are now chatting with {currentPartner?.username ?? "a stranger"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                No messages yet. Start the conversation!
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {messages.map((message) => {
                const isCurrentUser = message.senderId === currentUserId;
                const senderName = isCurrentUser ? "You" : (currentPartner?.username ?? "Stranger");

                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex w-full",
                      isCurrentUser ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "flex max-w-[min(82%,40rem)] items-end gap-2",
                        isCurrentUser && "justify-end",
                      )}
                    >
                      {!isCurrentUser && (
                        <div
                          className="mb-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black"
                          style={{
                            background: getAvatarColor(
                              currentPartner?.username ?? senderName,
                            ),
                          }}
                        >
                          {getUserInitials(
                            currentPartner?.username ?? senderName,
                          )}
                        </div>
                      )}

                      <div
                        className={cn(
                          "min-w-0 rounded-[0.95rem] px-3 py-1.5 text-base leading-5 shadow-sm",
                          isCurrentUser
                            ? "bg-brand-msg-sent text-brand-msg-sent-text"
                            : "bg-brand-msg-received text-brand-msg-received-text",
                        )}
                      >
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="truncate font-semibold text-current/90">
                            {senderName}
                          </span>
                          <span className="whitespace-nowrap opacity-70">
                            {format(new Date(message.timestamp), "HH:mm")}
                          </span>
                        </div>
                        <div className="min-w-0 whitespace-pre-wrap break-words">
                          {message.message}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {isPartnerTyping && (
                <div className="flex w-full justify-start">
                  <div className="flex max-w-[min(82%,40rem)] items-end gap-2">
                    <div
                      className="mb-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black opacity-60"
                      style={{
                        background: getAvatarColor(
                          currentPartner?.username ?? "Stranger",
                        ),
                      }}
                    >
                      {getUserInitials(currentPartner?.username ?? "Stranger")}
                    </div>
                    <div className="min-w-0 rounded-[0.95rem] px-3 py-1.5 text-base leading-5 shadow-sm bg-brand-msg-received text-brand-msg-received-text opacity-80">
                      <span className="text-[11px] font-semibold text-current/70">
                        {currentPartner?.username ?? "Stranger"}
                      </span>
                      <div className="min-w-0 whitespace-pre-wrap break-words italic opacity-70">
                        typing...
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className="relative overflow-visible bg-card-muted flex-shrink-0"
        style={{ paddingBottom: "6px" }}
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
            </motion.div>
          )}
        </AnimatePresence>

        <div className={isMobile ? "p-2" : "p-2 pb-1"}>
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full px-4"
            onClick={handleFooterAction}
          >
            <FooterActionIcon className="mr-2 h-4 w-4" />
            {footerActionLabel}
          </Button>

          <div className="relative flex-1 rounded-[1rem] border border-border bg-card px-6 shadow-sm">
            <Textarea
              placeholder={
                isIdle
                  ? "Start a chat to begin messaging"
                  : isFindingMatch
                    ? "Waiting for the next match..."
                    : "Message..."
              }
              className={cn(
                "min-h-[40px] max-h-32 rounded-none border-0 px-0 py-3 text-sm text-foreground placeholder:text-muted-foreground shadow-none resize-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                isMobile ? "bg-transparent" : "bg-card",
                hasDraftText ? "pr-12" : "pr-14",
              )}
              rows={1}
              value={messageInput}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={onInputKeyDown}
              onFocus={handleInputFocus}
              disabled={isComposerDisabled}
            />
            <div className="absolute inset-y-0 right-1.5 flex items-center">
              {hasDraftText ? (
                <Button
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onSendMessage}
                  disabled={!hasDraftText || isComposerDisabled}
                  className="h-8 w-8 rounded-2xl"
                  size="icon"
                  title="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  ref={composerPickerTriggerRef}
                  className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                  title="Open emoji picker"
                  onClick={() => setShowEmojiPicker((prev) => !prev)}
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
  );
}
