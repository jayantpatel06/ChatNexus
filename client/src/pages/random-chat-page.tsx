import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import type { EmojiClickData } from "emoji-picker-react";
import {
  ChevronRight,
  VenetianMask,
  Loader2,
  Mars,
  MessageCircleMore,
  Search,
  Shuffle,
  Venus,
  VenusAndMars,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { navigateWithinAppShell } from "@/app/app-shell-navigation";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
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
import {
  RandomChatArea,
  type RandomChatPartner,
  type RandomChatSocketMessage,
  type RandomFooterActionState,
} from "@/chat/random-chat-area";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { cn } from "@/lib/utils";

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
  const lastGifSendRef = useRef<{ url: string; timestamp: number } | null>(
    null,
  );
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

  const handleSendGif = useCallback(
    (gifUrl: string) => {
      const normalizedGifUrl = gifUrl.trim();
      if (!normalizedGifUrl || !currentPartner || !socket || isFindingMatch) {
        return false;
      }

      const lastGifSend = lastGifSendRef.current;
      const isDuplicateGifSelection =
        lastGifSend?.url === normalizedGifUrl &&
        Date.now() - lastGifSend.timestamp < 1200;

      if (isDuplicateGifSelection) {
        return false;
      }

      lastGifSendRef.current = {
        url: normalizedGifUrl,
        timestamp: Date.now(),
      };

      stopLocalTyping();
      socket.emit("random_chat_send_message", {
        message: normalizedGifUrl,
      });
      setShowEmojiPicker(false);
      return true;
    },
    [currentPartner, isFindingMatch, socket, stopLocalTyping],
  );

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setShowEmojiPicker(false);
      leaveRandomChat();
      return;
    }

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
    <RandomChatArea
      currentPartner={currentPartner}
      currentUserId={user?.userId ?? null}
      footerActionState={footerActionState}
      hasDraftText={hasDraftText}
      isDarkTheme={isDarkTheme}
      isMobile={isMobile}
      isPartnerTyping={isPartnerTyping}
      messageInput={messageInput}
      messages={messages}
      messagesContainerRef={messagesContainerRef}
      onBack={leaveRandomChat}
      onEmojiClick={handleEmojiClick}
      onGifClick={handleSendGif}
      onConfirmChatEnd={handleConfirmChatEnd}
      onInputChange={handleMessageInputChange}
      onInputKeyDown={handleKeyDown}
      onSendMessage={handleSendMessage}
      onSkip={handleSkipChat}
      onStartChat={() => beginMatchmaking(RANDOM_CHAT_SEARCHING_STATUS)}
      setShowEmojiPicker={setShowEmojiPicker}
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
            className="safe-top-shell flex h-[100dvh] flex-col bg-brand-bg"
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
          className="safe-top-shell flex h-[100dvh] flex-col bg-brand-bg"
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
            <ChatDesktopShellPlaceholder enableCommandCenter />
          )}
        </div>
      </div>
    </>
  );
}

function RandomSearchOrbitalAnimation() {
  return (
    <div
      className="relative mx-auto flex h-[16.5rem] w-full items-center justify-center text-primary md:h-[12.75rem]"
      aria-hidden="true"
    >
      <div className="flex h-24 w-24 items-center justify-center rounded-full border border-violet-500 bg-primary/10 text-violet-500 shadow-[0_0_88px_rgba(56,69,248,0.36)] md:h-20 md:w-20">
        <VenetianMask className="h-12 w-12 md:h-10 md:w-10" strokeWidth={1.7} />
      </div>
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
  const sidebarDrawerScopeClass =
    "md:left-[54px] md:right-auto md:w-[calc(26rem-54px)] mb-20 md:mb-0";

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

          <div className="relative -mx-4 mt-auto w-[calc(100%+2rem)] rounded-t-[2.5rem] bg-gradient-to-b from-muted/80 via-muted/48 to-transparent px-3 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-4 md:-mb-4 md:px-4">
            <div className="relative mx-auto w-[90%] max-w-[22rem]">
              <DropdownMenu>
                <div className="flex w-full items-center justify-between gap-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <VenusAndMars className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Gender Filter
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

              <div className="relative px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Search className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-medium text-foreground">
                          Your Interests
                        </p>
                      </div>
                    </div>
                  </div>

                  <Drawer
                    open={isInterestsExpanded}
                    onOpenChange={onInterestsExpandedChange}
                  >
                    <DrawerTrigger asChild>
                      <button
                        type="button"
                        className="flex shrink-0 items-center gap-2 rounded-full px-1.5 py-1 text-sm font-medium text-primary transition-colors hover:bg-muted/45"
                        aria-label="Open interest matching drawer"
                      >
                        <span>{interestMatchingEnabled ? "ON" : "OFF"}</span>
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 -rotate-90 text-muted-foreground transition-transform",
                          )}  
                        />
                      </button>
                    </DrawerTrigger>

                    <DrawerContent
                      overlayClassName={sidebarDrawerScopeClass}
                      className={cn(
                        sidebarDrawerScopeClass,
                        "border-x-0 border-b-0 bg-muted p-0 shadow-[0_-24px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl md:max-w-none",
                      )}
                    >
                      <div className="space-y-2 pt-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-xl font-semibold text-foreground/70">
                            Match with interests
                          </span>
                          <Switch
                            checked={interestMatchingEnabled}
                            onCheckedChange={onInterestMatchingChange}
                            aria-label="Toggle interest matching"
                          />
                        </div>

                        <div className="px-2 py-2 bg-background/70 rounded-[0.85rem]">
                          <div className="flex flex-wrap items-center gap-2">
                            {interests.map((interest) => (
                              <span
                                key={interest}
                                className="inline-flex h-9 items-center gap-2 rounded-[0.85rem] bg-card px-3 text-xs font-medium text-foreground"
                              >
                                <span className="max-w-[8rem] truncate">
                                  {interest}
                                </span>
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
                              className="h-9 min-w-[7.5rem] flex-1 border-0 rounded-[0.85rem] bg-card px-3 text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
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

                        <div className="rounded-[0.85rem] bg-background/70 p-3">
                          <p className="text-sm font-medium text-muted-foreground/80">
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
                                  onClick={() =>
                                    onMaxWaitDurationChange(option.value)
                                  }
                                  className={cn(
                                    "h-9 rounded-[0.7rem] px-1 text-[11px] font-semibold transition-colors",
                                    isSelected
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-foreground hover:bg-muted/80",
                                  )}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <Button
                          type="button"
                          onClick={() => onInterestsExpandedChange(false)}
                          className="h-10 w-full rounded-[0.7rem] bg-background text-sm font-semibold text-foreground hover:bg-card"
                        >
                          Done
                        </Button>
                      </div>
                    </DrawerContent>
                  </Drawer>
                </div>
              </div>

              <div className="pt-4 pb-3 flex items-center justify-center">
                <Button
                  type="button"
                  onClick={primaryActionHandler}
                  disabled={primaryActionDisabled}
                  variant="outline"
                  className="h-12 w-[80%] rounded-full border-primary/25 bg-muted/80 text-sm font-semibold text-primary shadow-none hover:bg-primary/10 hover:text-primary md:h-10 md:rounded-[1rem]"
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
    </div>
  );
}

