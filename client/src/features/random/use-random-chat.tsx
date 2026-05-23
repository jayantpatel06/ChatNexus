import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { EmojiClickData } from "emoji-picker-react";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/providers/socket-provider";
import type {
  RandomChatPartner,
  RandomChatSocketMessage,
  RandomFooterActionState,
} from "./random-chat-panel";
import {
  readStoredRandomChatPreferences,
  sanitizeInterestList,
  type RandomChatPreferences,
  type RandomMatchState,
  RANDOM_CHAT_SEARCHING_STATUS,
  RANDOM_CHAT_PREFERENCES_KEY,
  IDLE_RANDOM_CHAT_STATUS,
  RANDOM_CHAT_CONFIRM_STATUS,
} from "./random-sidebar";

export function useRandomChat() {
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const { toast } = useToast();
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
  const [disconnectedPartnerName, setDisconnectedPartnerName] = useState<
    string | null
  >(null);
  const [sharedInterests, setSharedInterests] = useState<string[]>([]);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [isInterestsExpanded, setIsInterestsExpanded] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerPickerRef = useRef<HTMLDivElement>(null);
  const composerPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const lastGifSendRef = useRef<{ url: string; timestamp: number } | null>(
    null,
  );
  const matchPreferencesRef = useRef({
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

  const hasDraftText = messageInput.trim().length > 0;
  const interests = preferences.interests;
  const interestMatchingEnabled = preferences.interestsMatchingEnabled;
  const maxWaitDurationSeconds = preferences.maxWaitDurationSeconds;
  const autoSearchOnDisconnect = preferences.autoSearchOnDisconnect;
  const hasInterests = interests.length > 0;
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
      setDisconnectedPartnerName(null);
      setSharedInterests([]);
      clearPartnerTypingState();
      setMatchState(nextState);
      setStatusMessage(nextStatus);
    },
    [clearPartnerTypingState, stopLocalTyping],
  );

  const endRandomChatSessionInPanel = useCallback(
    (nextStatus: string) => {
      stopLocalTyping();
      if (broadenSearchTimeoutRef.current !== null) {
        window.clearTimeout(broadenSearchTimeoutRef.current);
        broadenSearchTimeoutRef.current = null;
      }
      hasBroadenedCurrentSearchRef.current = false;
      setShowEmojiPicker(false);
      setMessageInput("");
      setSharedInterests([]);
      clearPartnerTypingState();
      setMatchIntentActive(true);
      setFooterActionState("start");
      setMatchState("idle");
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
      socket.emit("random_chat_request_match", {
        ...matchPreferencesRef.current,
        searchMessage: message,
      });
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
      setMatchIntentActive(true);
      setFooterActionState("start");
      resetRandomChatState("idle", "💔 You skipped the chat.");

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
    endRandomChatSessionInPanel("💔 You ended the chat.");

    if (socket && isConnected) {
      socket.emit("random_chat_leave");
    }
  }, [endRandomChatSessionInPanel, isConnected, socket]);

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
      setDisconnectedPartnerName(null);
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
      setDisconnectedPartnerName(null);
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
        setDisconnectedPartnerName(null);
        setStatusMessage(
          sharedInterests.length > 0
            ? `Matched through ${sharedInterests.join(", ")}`
            : `Connected to ${currentPartner?.username ?? "your partner"}`,
        );
      }
    };

    const handleSessionEnded = (_data: {
      message?: string;
      requeued?: boolean;
    }) => {
      const partnerName = currentPartner?.username ?? "The user";
      if (autoSearchOnDisconnect) {
        beginMatchmaking(`${partnerName} disconnected. Searching for new user...`);
        return;
      }

      setDisconnectedPartnerName(partnerName);
      endRandomChatSessionInPanel("");
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
  }, [
    autoSearchOnDisconnect,
    beginMatchmaking,
    clearPartnerTypingState,
    currentPartner,
    endRandomChatSessionInPanel,
    footerActionState,
    sharedInterests,
    socket,
    toast,
  ]);

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

  return {
    user,
    currentPartner,
    preferences,
    setPreferences,
    interestDraft,
    setInterestDraft,
    isInterestsExpanded,
    setIsInterestsExpanded,
    isFindingMatch,
    isMatched,
    handleAddInterest,
    handleRemoveInterest,
    beginMatchmaking,
    leaveRandomChat,
    messages,
    messageInput,
    showEmojiPicker,
    setShowEmojiPicker,
    statusMessage,
    disconnectedPartnerName,
    sharedInterests,
    isPartnerTyping,
    messagesContainerRef,
    composerPickerRef,
    composerPickerTriggerRef,
    handleEmojiClick,
    handleSendGif,
    handleConfirmChatEnd,
    handleMessageInputChange,
    handleKeyDown,
    handleSendMessage,
    handleSkipChat,
    footerActionState,
    hasDraftText,
    isDarkTheme,
  };
}
