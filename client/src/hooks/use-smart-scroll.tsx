import { useState, useRef, useCallback, useEffect, RefObject } from "react";

interface UseSmartScrollOptions {
  /** Distance from bottom (in px) to consider "at bottom" */
  bottomThreshold?: number;
  /** Current user ID to detect own messages */
  currentUserId?: number;
}

interface UseSmartScrollReturn {
  /** Ref to attach to the messages container */
  containerRef: RefObject<HTMLDivElement>;
  /** Ref to attach to the scroll anchor element at the bottom */
  endRef: RefObject<HTMLDivElement>;
  /** Whether user is currently at/near the bottom */
  isAtBottom: boolean;
  /** Whether to show the "new message" indicator */
  showNewMessageIndicator: boolean;
  /** Call this when user sends a message (to force scroll) */
  markUserSentMessage: () => void;
  /** Scroll to bottom programmatically */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Attach to container's onScroll */
  handleScroll: () => void;
  /** Call this in useEffect when messages change */
  handleMessagesChange: (
    messages: { senderId?: number }[],
    lastMessageId?: number | string | null,
  ) => void;
}

/**
 * Instagram-style smart scroll hook for chat interfaces.
 * - Auto-scrolls on initial load
 * - Auto-scrolls when user sends a message
 * - Auto-scrolls when at bottom and new message arrives
 * - Shows indicator when scrolled up and new message arrives
 */
export function useSmartScroll(
  options: UseSmartScrollOptions = {},
): UseSmartScrollReturn {
  const { bottomThreshold = 150, currentUserId } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const userSentMessageRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  const prevLastMessageIdRef = useRef<number | string | null>(null);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    endRef.current?.scrollIntoView({ behavior });
    setShowNewMessageIndicator(false);
    setIsAtBottom(true);
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom < bottomThreshold;

    setIsAtBottom(atBottom);

    if (atBottom) {
      setShowNewMessageIndicator(false);
    }
  }, [bottomThreshold]);

  const markUserSentMessage = useCallback(() => {
    userSentMessageRef.current = true;
  }, []);

  const handleMessagesChange = useCallback(
    (
      messages: { senderId?: number }[],
      lastMessageId?: number | string | null,
    ) => {
      const currentCount = messages.length;
      const prevCount = prevMessageCountRef.current;
      const lastMessage = messages[messages.length - 1];
      const prevLastMessageId = prevLastMessageIdRef.current;

      const isNewMessage =
        currentCount > prevCount && lastMessageId !== prevLastMessageId;

      if (prevCount === 0 && currentCount > 0) {
        // Initial load - scroll to bottom after DOM updates
        requestAnimationFrame(() => {
          setTimeout(() => {
            scrollToBottom("auto");
          }, 50);
        });
      } else if (isNewMessage) {
        const isOwnMessage = lastMessage?.senderId === currentUserId;

        if (userSentMessageRef.current || isOwnMessage) {
          // User sent a message - always scroll to bottom
          requestAnimationFrame(() => {
            scrollToBottom("smooth");
          });
          userSentMessageRef.current = false;
        } else if (isAtBottom) {
          // Received message while at bottom - auto scroll
          scrollToBottom("smooth");
        } else {
          // Received message while scrolled up - show indicator
          setShowNewMessageIndicator(true);
        }
      }

      prevMessageCountRef.current = currentCount;
      prevLastMessageIdRef.current = lastMessageId ?? null;
    },
    [currentUserId, isAtBottom, scrollToBottom],
  );

  return {
    containerRef,
    endRef,
    isAtBottom,
    showNewMessageIndicator,
    markUserSentMessage,
    scrollToBottom,
    handleScroll,
    handleMessagesChange,
  };
}
