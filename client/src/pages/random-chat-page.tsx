import {
  useCallback,
  useEffect,
  useId,
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
  ChevronRight,
  Compass,
  Loader2,
  Mars,
  MessageCircleMore,
  Search,
  Send,
  Shuffle,
  Smile,
  SkipForward,
  UserRound,
  Venus,
  VenusAndMars,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { navigateWithinAppShell } from "@/app/app-shell-navigation";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ChatDesktopShellPlaceholder } from "@/chat/chat-desktop-shell-placeholder";
import { ChatPageHeader } from "@/chat/chat-page-header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { cn, getAvatarColor, getUserInitials } from "@/lib/utils";
import type { User } from "@shared/schema";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

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
  maxWaitDurationSeconds: number;
  genderPreference: RandomGenderPreference;
};

type RandomChatMatchPreferences = Pick<
  RandomChatPreferences,
  "interests" | "interestsMatchingEnabled" | "maxWaitDurationSeconds"
>;

type RandomMatchState = "connecting" | "idle" | "matched" | "searching";
type RandomFooterActionState = "confirm" | "skip" | "start";
type RandomGenderPreference = "any" | "female" | "male";

const RANDOM_CHAT_PREFERENCES_KEY = "chatnexus_random_chat_preferences";
const IDLE_RANDOM_CHAT_STATUS = "Set your interests and press Start Chat.";
const RANDOM_CHAT_CONFIRM_STATUS =
  "Press Confirm to end this chat.";
const DEFAULT_RANDOM_CHAT_MAX_WAIT_DURATION_SECONDS = 15;
const RANDOM_CHAT_SEARCHING_STATUS = "Searching for user...";
const RANDOM_CHAT_MAX_WAIT_OPTIONS = [
  { label: "5 sec", value: 5 },
  { label: "10 sec", value: 10 },
  { label: "30 sec", value: 30 },
  { label: "Forever", value: 0 },
] as const;

function sanitizeRandomChatMaxWaitDurationSeconds(value: unknown): number {
  const parsedValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_RANDOM_CHAT_MAX_WAIT_DURATION_SECONDS;
  }

  if (parsedValue === 0) {
    return 0;
  }

  return Math.min(120, Math.max(5, Math.round(parsedValue)));
}

function sanitizeRandomGenderPreference(
  value: unknown,
): RandomGenderPreference {
  if (value === "male" || value === "female") {
    return value;
  }

  return "any";
}

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
      maxWaitDurationSeconds: DEFAULT_RANDOM_CHAT_MAX_WAIT_DURATION_SECONDS,
      genderPreference: "any",
    };
  }

  try {
    const stored = localStorage.getItem(RANDOM_CHAT_PREFERENCES_KEY);
    if (!stored) {
      return {
        interests: [],
        interestsMatchingEnabled: true,
        maxWaitDurationSeconds: DEFAULT_RANDOM_CHAT_MAX_WAIT_DURATION_SECONDS,
        genderPreference: "any",
      };
    }

    const parsed = JSON.parse(stored) as Partial<RandomChatPreferences>;
    return {
      interests: sanitizeInterestList(
        Array.isArray(parsed.interests) ? parsed.interests : [],
      ),
      interestsMatchingEnabled: parsed.interestsMatchingEnabled !== false,
      maxWaitDurationSeconds: sanitizeRandomChatMaxWaitDurationSeconds(
        parsed.maxWaitDurationSeconds,
      ),
      genderPreference: sanitizeRandomGenderPreference(parsed.genderPreference),
    };
  } catch {
    return {
      interests: [],
      interestsMatchingEnabled: true,
      maxWaitDurationSeconds: DEFAULT_RANDOM_CHAT_MAX_WAIT_DURATION_SECONDS,
      genderPreference: "any",
    };
  }
}

export default function RandomChatPage() {
  const { user, logoutMutation } = useAuth();
  const { socket, isConnected } = useSocket();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [preferences, setPreferences] = useState<RandomChatPreferences>(() =>
    readStoredRandomChatPreferences(),
  );
  const [interestDraft, setInterestDraft] = useState("");
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
  const [isInterestsExpanded, setIsInterestsExpanded] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerPickerRef = useRef<HTMLDivElement>(null);
  const composerPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const matchPreferencesRef = useRef<RandomChatMatchPreferences>({
    interests: preferences.interests,
    interestsMatchingEnabled: preferences.interestsMatchingEnabled,
    maxWaitDurationSeconds: preferences.maxWaitDurationSeconds,
  });
  const pendingMatchMessageRef = useRef(RANDOM_CHAT_SEARCHING_STATUS);
  const localTypingActiveRef = useRef(false);
  const localTypingTimeoutRef = useRef<number | null>(null);
  const partnerTypingTimeoutRef = useRef<number | null>(null);
  const broadenSearchTimeoutRef = useRef<number | null>(null);
  const hasBroadenedCurrentSearchRef = useRef(false);
  const socketRef = useRef(socket);
  const isDarkTheme =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  const activeNavigationItem: ChatNavigationItem = "random";
  const hasDraftText = messageInput.trim().length > 0;
  const interests = preferences.interests;
  const interestMatchingEnabled = preferences.interestsMatchingEnabled;
  const maxWaitDurationSeconds = preferences.maxWaitDurationSeconds;
  const hasInterests = interests.length > 0;
  const isIdle = matchState === "idle";
  const isMatched = matchState === "matched";
  const isFindingMatch =
    matchState === "connecting" || matchState === "searching";
  const matchPreferences = useMemo(
    () => ({
      interests: sanitizeInterestList(interests),
      interestsMatchingEnabled: interestMatchingEnabled,
      maxWaitDurationSeconds: maxWaitDurationSeconds,
    }),
    [interestMatchingEnabled, interests, maxWaitDurationSeconds],
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
      if (broadenSearchTimeoutRef.current !== null) {
        window.clearTimeout(broadenSearchTimeoutRef.current);
        broadenSearchTimeoutRef.current = null;
      }
      hasBroadenedCurrentSearchRef.current = false;
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
    (message = RANDOM_CHAT_SEARCHING_STATUS) => {
      pendingMatchMessageRef.current = message;
      hasBroadenedCurrentSearchRef.current = false;

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
    (message = RANDOM_CHAT_SEARCHING_STATUS) => {
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
    try {
      localStorage.setItem(
        RANDOM_CHAT_PREFERENCES_KEY,
        JSON.stringify(preferences),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [preferences]);

  useEffect(() => {
    matchPreferencesRef.current = matchPreferences;

    if (socket && isConnected) {
      socket.emit("random_chat_update_preferences", matchPreferences);
    }
  }, [isConnected, matchPreferences, socket]);

  useEffect(() => {
    if (isFindingMatch) {
      hasBroadenedCurrentSearchRef.current = false;
    }
  }, [isFindingMatch, matchPreferences]);

  useEffect(() => {
    if (
      matchState !== "searching" ||
      !matchIntentActive ||
      !interestMatchingEnabled ||
      !hasInterests ||
      maxWaitDurationSeconds === 0 ||
      hasBroadenedCurrentSearchRef.current
    ) {
      if (broadenSearchTimeoutRef.current !== null) {
        window.clearTimeout(broadenSearchTimeoutRef.current);
        broadenSearchTimeoutRef.current = null;
      }
      return;
    }

    broadenSearchTimeoutRef.current = window.setTimeout(() => {
      if (
        hasBroadenedCurrentSearchRef.current ||
        !socket ||
        !isConnected ||
        matchState !== "searching"
      ) {
        return;
      }

      hasBroadenedCurrentSearchRef.current = true;
      const expandedSearchMessage =
        "No interest match yet. Expanding search to everyone...";
      setStatusMessage(expandedSearchMessage);
      socket.emit("random_chat_update_preferences", {
        ...matchPreferencesRef.current,
        preserveQueuePosition: true,
        searchMessage: expandedSearchMessage,
      });
    }, maxWaitDurationSeconds * 1000);

    return () => {
      if (broadenSearchTimeoutRef.current !== null) {
        window.clearTimeout(broadenSearchTimeoutRef.current);
        broadenSearchTimeoutRef.current = null;
      }
    };
  }, [
    interestMatchingEnabled,
    hasInterests,
    isConnected,
    matchIntentActive,
    matchState,
    maxWaitDurationSeconds,
    socket,
  ]);

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
      setStatusMessage(data.message ?? RANDOM_CHAT_SEARCHING_STATUS);
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

      if (broadenSearchTimeoutRef.current !== null) {
        window.clearTimeout(broadenSearchTimeoutRef.current);
      }

      localTypingActiveRef.current = false;
      socketRef.current?.emit("random_chat_leave");
    };
  }, []);

  const handleNavigationSelect = (item: ChatNavigationItem) => {
    if (item === "settings") {
      if (location !== "/settings") {
        navigateWithinAppShell(location, "/settings", setLocation);
      }
      return;
    }

    if (item === "chat") {
      if (location !== "/dashboard") {
        navigateWithinAppShell(location, "/dashboard", setLocation);
      }
      return;
    }

    if (item === "global") {
      if (location !== "/global-chat") {
        navigateWithinAppShell(location, "/global-chat", setLocation);
      }
      return;
    }

    if (item === "logout") {
      logoutMutation.mutate();
      return;
    }

    if (location !== "/random-chat") {
      navigateWithinAppShell(location, "/random-chat", setLocation);
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessageInput((prev) => prev + emojiData.emoji);
  };

  const handleAddInterest = () => {
    const normalizedInterest = interestDraft.trim().slice(0, 24);
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
      currentPartner={currentPartner}
      genderPreference={preferences.genderPreference}
      interestMatchingEnabled={interestMatchingEnabled}
      interestDraft={interestDraft}
      interests={interests}
      isInterestsExpanded={isInterestsExpanded}
      isFindingMatch={isFindingMatch}
      isMatched={isMatched}
      onAddInterest={handleAddInterest}
      onGenderPreferenceChange={(genderPreference) =>
        setPreferences((prev) => ({
          ...prev,
          genderPreference,
        }))
      }
      onInterestDraftChange={setInterestDraft}
      onInterestMatchingChange={(checked) =>
        setPreferences((prev) => ({
          ...prev,
          interestsMatchingEnabled: checked,
        }))
      }
      onInterestsExpandedChange={setIsInterestsExpanded}
      onMaxWaitDurationChange={(value) =>
        setPreferences((prev) => ({
          ...prev,
          maxWaitDurationSeconds: sanitizeRandomChatMaxWaitDurationSeconds(value),
        }))
      }
      onRemoveInterest={handleRemoveInterest}
      onStartChat={() => beginMatchmaking(RANDOM_CHAT_SEARCHING_STATUS)}
      onStopChat={leaveRandomChat}
      onLogout={() => logoutMutation.mutate()}
      logoutPending={logoutMutation.isPending}
      startChatDisabled={isFindingMatch}
      startChatLabel={
        currentPartner
          ? "Find New Chat"
          : isFindingMatch
            ? "Searching..."
            : "Start Chat"
      }
      maxWaitDurationSeconds={maxWaitDurationSeconds}
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
      onStartChat={() => beginMatchmaking(RANDOM_CHAT_SEARCHING_STATUS)}
      setShowEmojiPicker={setShowEmojiPicker}
      sharedInterests={sharedInterests}
      statusMessage={statusMessage}
      showEmojiPicker={showEmojiPicker}
      composerPickerRef={composerPickerRef}
      composerPickerTriggerRef={composerPickerTriggerRef}
    />
  );
  const shouldShowDesktopConversation = matchIntentActive;

  const sharedSidebarPanel = (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground md:overflow-hidden">
      <div
        className={cn(
          "min-h-0 flex-1 px-4 pb-0 pt-4 md:px-4 md:pb-4 md:pt-4",
          isMobile
            ? "overflow-visible"
            : "overflow-hidden",
        )}
      >
        <div className="mx-auto flex h-full w-full max-w-[26rem] flex-col">
          {sidebarContent}
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    if (isMatched || isFindingMatch) {
      return (
        <>
          <Seo
            title="Random Chat | ChatNexus"
            description="Protected random chat inside ChatNexus."
            path="/random-chat"
            robots="noindex, nofollow"
          />
          <div
            className="flex h-[100dvh] flex-col bg-brand-bg"
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
          className="flex h-[100dvh] flex-col bg-brand-bg"
          data-testid="random-chat-mobile-layout"
        >
          <div className="flex-1 min-h-0 overflow-hidden bg-background">
            {sharedSidebarPanel}
          </div>
          <MobileBottomNav />
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
        className="flex h-screen overflow-hidden bg-background text-foreground"
        data-testid="random-chat-desktop-layout"
      >
        <div className="h-full w-full overflow-hidden bg-background md:w-[26rem] md:shrink-0 md:border-r md:border-border">
          <div className="flex h-full w-full overflow-hidden bg-background">
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

        <div className="flex min-w-0 flex-1">
          {shouldShowDesktopConversation ? (
            conversationPanel
          ) : (
            <ChatDesktopShellPlaceholder
              icon={Compass}
              title="Click Start Chat to find a random chat partner"
            />
          )}
        </div>
      </div>
    </>
  );
}

function RandomSearchOrbitalAnimation() {
  const shouldReduceMotion = useReducedMotion();
  const idPrefix = useId().replace(/:/g, "");
  const glowId = `${idPrefix}-random-search-glow`;
  const sweepId = `${idPrefix}-random-search-sweep`;

  const rings = [
    { radius: 43, opacity: 0.34, duration: 4.8, offset: 0 },
    { radius: 68, opacity: 0.24, duration: 5.8, offset: 0.18 },
    { radius: 91, opacity: 0.16, duration: 6.8, offset: 0.34 },
  ];
  const orbitDots = [
    { radius: 43, size: 3.4, duration: 6.5, delay: 0 },
    { radius: 68, size: 4, duration: 8.4, delay: 0.8 },
    { radius: 91, size: 3.7, duration: 10.2, delay: 1.4 },
  ];
  const spinAnimation = shouldReduceMotion ? { rotate: 0 } : { rotate: 360 };
  const centerSpinStyle = {
    transformBox: "view-box",
    transformOrigin: "center",
  } as const;

  return (
    <div
      className="relative mx-auto flex h-[16.5rem] w-full items-center justify-center overflow-visible text-primary md:h-[12.75rem]"
      aria-hidden="true"
    >
      <motion.svg
        viewBox="0 0 240 240"
        className="absolute h-[17.5rem] w-[17.5rem] overflow-visible md:h-[13.5rem] md:w-[13.5rem]"
        fill="none"
        initial={false}
      >
        <defs>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="58%" stopColor="currentColor" stopOpacity="0.08" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={sweepId} x1="120" y1="28" x2="206" y2="96">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.84" />
            <stop offset="58%" stopColor="currentColor" stopOpacity="0.24" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        <motion.circle
          cx="120"
          cy="120"
          r="106"
          fill={`url(#${glowId})`}
          animate={
            shouldReduceMotion
              ? { opacity: 0.7 }
              : { opacity: [0.45, 0.82, 0.45], scale: [0.98, 1.04, 0.98] }
          }
          transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "120px 120px" }}
        />

        {rings.map((ring) => (
          <motion.circle
            key={ring.radius}
            cx="120"
            cy="120"
            r={ring.radius}
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.35"
            initial={false}
            animate={
              shouldReduceMotion
                ? { opacity: ring.opacity, pathLength: 0.82 }
                : {
                    opacity: [
                      ring.opacity * 0.55,
                      ring.opacity,
                      ring.opacity * 0.55,
                    ],
                    pathLength: [0.28, 0.88, 0.28],
                    pathOffset: [
                      ring.offset,
                      ring.offset + 0.18,
                      ring.offset + 0.36,
                    ],
                  }
            }
            transition={{
              duration: ring.duration,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}

        <motion.g
          animate={spinAnimation}
          transition={{ duration: 7.5, repeat: Infinity, ease: "linear" }}
          style={centerSpinStyle}
        >
          <path
            d="M120 120 L120 27 A93 93 0 0 1 205 82 Z"
            fill={`url(#${sweepId})`}
            opacity="0.2"
          />
          <path
            d="M120 27 A93 93 0 0 1 205 82"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
            opacity="0.68"
          />
          <circle cx="120" cy="27" r="4.5" fill="currentColor" />
        </motion.g>

        {orbitDots.map((dot, index) => (
          <motion.g
            key={dot.radius}
            animate={spinAnimation}
            transition={{
              duration: dot.duration,
              repeat: Infinity,
              ease: "linear",
              delay: shouldReduceMotion ? 0 : dot.delay,
            }}
            style={centerSpinStyle}
          >
            <motion.circle
              cx="120"
              cy={120 - dot.radius}
              r={dot.size}
              fill="currentColor"
              animate={
                shouldReduceMotion
                  ? { opacity: 0.78 }
                  : {
                      opacity: [0.35, 0.95, 0.35],
                      scale: [0.85, 1.15, 0.85],
                    }
              }
              transition={{
                duration: 2.8 + index * 0.35,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{ transformOrigin: `120px ${120 - dot.radius}px` }}
            />
          </motion.g>
        ))}

        <motion.g
          animate={
            shouldReduceMotion
              ? { scale: 1 }
              : { scale: [1, 1.04, 1], opacity: [0.9, 1, 0.9] }
          }
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "120px 120px" }}
        >
          <circle
            cx="120"
            cy="120"
            r="35"
            fill="var(--card)"
            stroke="currentColor"
            strokeOpacity="0.5"
            strokeWidth="1.5"
          />
          <foreignObject x="100" y="100" width="40" height="40">
            <div className="flex h-full w-full items-center justify-center text-primary">
              <UserRound className="h-8 w-8" />
            </div>
          </foreignObject>
        </motion.g>
      </motion.svg>
    </div>
  );
}

function RandomMatchControlsPanel({
  currentPartner,
  genderPreference,
  interestMatchingEnabled,
  interestDraft,
  interests,
  isInterestsExpanded,
  isFindingMatch,
  isMatched,
  onAddInterest,
  onGenderPreferenceChange,
  onInterestDraftChange,
  onInterestMatchingChange,
  onInterestsExpandedChange,
  onMaxWaitDurationChange,
  onRemoveInterest,
  onStartChat,
  onStopChat,
  onLogout,
  logoutPending,
  startChatDisabled,
  startChatLabel,
  maxWaitDurationSeconds,
}: {
  currentPartner: RandomChatPartner | null;
  genderPreference: RandomGenderPreference;
  interestMatchingEnabled: boolean;
  interestDraft: string;
  interests: string[];
  isInterestsExpanded: boolean;
  isFindingMatch: boolean;
  isMatched: boolean;
  onAddInterest: () => void;
  onGenderPreferenceChange: (preference: RandomGenderPreference) => void;
  onInterestDraftChange: Dispatch<SetStateAction<string>>;
  onInterestMatchingChange: (checked: boolean) => void;
  onInterestsExpandedChange: (open: boolean) => void;
  onMaxWaitDurationChange: (value: number | string) => void;
  onRemoveInterest: (interest: string) => void;
  onStartChat: () => void;
  onStopChat: () => void;
  onLogout: () => void;
  logoutPending?: boolean;
  startChatDisabled?: boolean;
  startChatLabel: string;
  maxWaitDurationSeconds: number;
}) {
  const genderOptions: Array<{
    icon: typeof VenusAndMars;
    label: string;
    value: RandomGenderPreference;
  }> = [
    { value: "any", label: "Any", icon: VenusAndMars },
    { value: "male", label: "Male", icon: Mars },
    { value: "female", label: "Female", icon: Venus },
  ];
  const selectedGenderOption =
    genderOptions.find((option) => option.value === genderPreference) ??
    genderOptions[0];
  const primaryActionLabel = isFindingMatch ? "Stop Searching" : startChatLabel;
  const primaryActionHandler = isFindingMatch ? onStopChat : onStartChat;
  const primaryActionDisabled = isFindingMatch ? false : startChatDisabled;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ChatPageHeader
        icon={Shuffle}
        title="Random Chat"
        onLogout={onLogout}
        logoutPending={logoutPending}
      />

      <div className="flex min-h-0 flex-1 flex-col pb-[calc(5.4rem+env(safe-area-inset-bottom))] pt-0 md:pb-4">
        <div className="mx-auto flex h-full w-full max-w-[24rem] flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center pb-6 pt-8 md:pb-0 md:pt-0">
            <div className="relative flex w-full flex-col items-center gap-3 text-center">
              <RandomSearchOrbitalAnimation />
            </div>
          </div>

          <div className="mt-auto w-full space-y-4 md:space-y-2">
          <div className="relative w-full rounded-[1.5rem] border border-border/70 bg-card shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <DropdownMenu>
              <div className="flex w-full items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <VenusAndMars className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Gender Preference
                    </p>
                  </div>
                </div>
                <DropdownMenuTrigger asChild>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-full px-1.5 py-1 text-sm font-medium text-primary transition-colors hover:bg-muted/45"
                      aria-label="Open gender preference menu"
                    >
                      {selectedGenderOption.label}
                      <ChevronRight className="h-4 w-4 -rotate-90 text-muted-foreground" />
                    </button>
                  </div>
                </DropdownMenuTrigger>
              </div>
              <DropdownMenuContent
                side="top"
                align="end"
                sideOffset={8}
                className="w-38 rounded-2xl border border-border/70 bg-card p-2"
              >
                {genderOptions.map((option) => {
                  const OptionIcon = option.icon;
                  const isSelected = genderPreference === option.value;

                  return (
                    <DropdownMenuItem
                      key={option.value}
                      onSelect={() => onGenderPreferenceChange(option.value)}
                      className={cn(
                        "flex min-h-11 items-center justify-between rounded-xl px-3",
                        isSelected && "bg-accent text-accent-foreground",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary",
                            isSelected && "bg-background/70 text-foreground",
                          )}
                        >
                          <OptionIcon className="h-4 w-4" />
                        </div>
                        <span>{option.label}</span>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="border-t border-border/60" />

            <div className="relative px-4 py-3">
              <AnimatePresence initial={false}>
                {isInterestsExpanded ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="absolute inset-x-0 bottom-full z-30"
                  >
                    <div className="rounded-[1.2rem] border border-border/70 bg-card p-2 shadow-[0_24px_48px_rgba(15,23,42,0.22)]">
                      <div className="space-y-2">
                        <div className="rounded-[1rem] border border-border/70 bg-background/65 px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {interests.map((interest) => (
                              <span
                                key={interest}
                                className="inline-flex h-9 items-center gap-2 rounded-full bg-card px-3 text-xs font-medium text-foreground"
                              >
                                <span className="truncate">{interest}</span>
                                <button
                                  type="button"
                                  onClick={() => onRemoveInterest(interest)}
                                  className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
                                  aria-label={`Remove ${interest}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ))}

                            <Input
                              type="text"
                              placeholder="Add an interest..."
                              className="h-9 min-w-[8rem] flex-1 border-0 bg-card px-3 text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                              value={interestDraft}
                              onChange={(event) =>
                                onInterestDraftChange(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  onAddInterest();
                                }
                              }}
                              data-testid="input-random-interest"
                            />
                          </div>
                        </div>

                        <div className="rounded-[1rem] border border-border/70 bg-background/65 p-3">
                          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                            Max Wait Duration
                          </p>
                          <div className="mt-2 grid grid-cols-4 gap-2">
                            {RANDOM_CHAT_MAX_WAIT_OPTIONS.map((option) => {
                              const isSelected =
                                maxWaitDurationSeconds === option.value;

                              return (
                                <button
                                  key={option.label}
                                  type="button"
                                  onClick={() => onMaxWaitDurationChange(option.value)}
                                  className={cn(
                                    "h-9 rounded-[0.8rem] border px-1 text-[11px] font-medium transition-colors",
                                    isSelected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border/70 bg-background text-foreground hover:bg-muted/45",
                                  )}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Search className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Interests
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={interestMatchingEnabled}
                    onCheckedChange={onInterestMatchingChange}
                    aria-label="Toggle interest matching"
                  />
                  <button
                    type="button"
                    onClick={() => onInterestsExpandedChange(!isInterestsExpanded)}
                    className="flex items-center gap-2 rounded-full px-1.5 py-1 text-sm font-medium text-primary transition-colors hover:bg-muted/45"
                    aria-label={
                      isInterestsExpanded
                        ? "Collapse interests panel"
                        : "Expand interests panel"
                    }
                  >
                    <span>{interestMatchingEnabled ? "ON" : "OFF"}</span>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        isInterestsExpanded ? "-rotate-90" : "rotate-90",
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>

          </div>

          <div className="w-full">
            <Button
              type="button"
              onClick={primaryActionHandler}
              disabled={primaryActionDisabled}
              className="h-12 w-full rounded-[1.1rem] text-sm font-semibold md:h-10 md:rounded-[1rem]"
            >
              {isFindingMatch ? (
                <X className="mr-2 h-4 w-4" />
              ) : primaryActionDisabled ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MessageCircleMore className="mr-2 h-4 w-4" />
              )}
              {primaryActionLabel}
            </Button>
          </div>
          </div>
        </div>
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
  messagesContainerRef: RefObject<HTMLDivElement | null>;
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
  composerPickerRef: RefObject<HTMLDivElement | null>;
  composerPickerTriggerRef: RefObject<HTMLButtonElement | null>;
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
            : statusMessage;
  const handleInputFocus = () => {
    setShowEmojiPicker(false);
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
      <div className="z-40 flex flex-shrink-0 items-center justify-between bg-card p-2.5 md:border-b md:border-border/70 md:px-5 md:py-3.5">
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
            <Shuffle className="h-5 w-5" />
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
    </div>
  );
}
