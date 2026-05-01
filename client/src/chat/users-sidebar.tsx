import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatPageHeader } from "@/chat/chat-page-header";
import type { User } from "@shared/schema";
import { apiRequest, readJsonResponse } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { cn, getAvatarColor, getUserInitials } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import {
  ChevronDown,
  History,
  MessageCircle,
  Search,
  UserRoundCheck,
  Venus,
  VenusAndMars,
  Mars,
} from "lucide-react";
import { useLocation } from "wouter";
import { navigateWithinAppShell } from "@/app/app-shell-navigation";
import { useSocket } from "@/providers/socket-provider";
import {
  ChatNavigationMenu,
  type ChatNavigationItem,
} from "@/chat/chat-navigation-menu";

// Extended user type with online status tracking
interface CachedUser extends User {
  isOnline: boolean;
  lastSeen: number; // timestamp
  isPinned: boolean;
}

// Local storage key for caching users
const CACHED_USERS_KEY = "chatnexus_cached_users";
const SIDEBAR_FILTERS_KEY = "chatnexus_sidebar_filters";
const USER_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const TENOR_MEDIA_URL_PATTERN = /^https?:\/\/media\.tenor\.com\//i;
const IMAGE_MEDIA_URL_PATTERN = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
const VIDEO_MEDIA_URL_PATTERN = /\.(mp4|webm)(\?.*)?$/i;

type SidebarFilters = {
  friendsOnly: boolean;
  gender: "all" | "male" | "female";
};
type UsersSidebarMode = "chat" | "history";
type ConversationStatsResponse = Record<
  number,
  { lastMessage: { msgId: number; senderId: number; message: string; timestamp: string } | null; unread: number }
>;

const DEFAULT_FILTERS: SidebarFilters = {
  friendsOnly: false,
  gender: "all",
};

function readStoredSidebarFilters(): SidebarFilters {
  if (typeof window === "undefined") {
    return { ...DEFAULT_FILTERS };
  }

  try {
    const stored = sessionStorage.getItem(SIDEBAR_FILTERS_KEY);
    if (!stored) {
      return { ...DEFAULT_FILTERS };
    }

    const parsed = JSON.parse(stored) as Partial<SidebarFilters> & {
      male?: boolean;
      female?: boolean;
    };
    return {
      friendsOnly: parsed.friendsOnly === true,
      gender:
        parsed.gender === "male" || parsed.male === true
          ? "male"
          : parsed.gender === "female" || parsed.female === true
            ? "female"
            : "all",
    };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

interface UsersSidebarProps {
  selectedUser: User | null;
  onUserSelect: (user: User) => void;
  mode?: UsersSidebarMode;
  onModeChange?: (mode: UsersSidebarMode) => void;
}

function getSidebarMessagePreview(message: unknown): string {
  if (typeof message !== "string") {
    return "";
  }

  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    return "";
  }

  if (normalizedMessage === "Sent an attachment") {
    return normalizedMessage;
  }

  const isStandaloneUrl = /^https?:\/\/[^\s]+$/i.test(normalizedMessage);
  const isMediaUrl =
    TENOR_MEDIA_URL_PATTERN.test(normalizedMessage) ||
    IMAGE_MEDIA_URL_PATTERN.test(normalizedMessage) ||
    VIDEO_MEDIA_URL_PATTERN.test(normalizedMessage);

  if (isStandaloneUrl && isMediaUrl) {
    return "Sent an attachment";
  }

  return normalizedMessage;
}

function formatSidebarTimestamp(timestamp: unknown): string {
  if (!timestamp) return "";

  const parsed = new Date(timestamp as string | number | Date);
  if (Number.isNaN(parsed.getTime())) return "";

  if (isToday(parsed)) {
    return format(parsed, "HH:mm");
  }

  if (isYesterday(parsed)) {
    return "Yesterday";
  }

  return format(parsed, "MMM d");
}

export function UsersSidebar({
  selectedUser,
  onUserSelect,
  mode = "chat",
  onModeChange,
}: UsersSidebarProps) {
  const { user, logoutMutation } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { sidebarUsers } = useSocket();
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<SidebarFilters>(
    () => readStoredSidebarFilters(),
  );
  const [cachedUsers, setCachedUsers] = useState<Map<number, CachedUser>>(
    () => {
      // Initialize from localStorage
      try {
        const stored = localStorage.getItem(CACHED_USERS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as [number, CachedUser][];
          return new Map(parsed);
        }
      } catch {
        // Ignore parse errors
      }
      return new Map();
    },
  );
  // Update cached users when the sidebar feed changes
  useEffect(() => {
    setCachedUsers((prev) => {
      const now = Date.now();
      const newCache = new Map(prev);

      const sidebarUserIds = new Set(sidebarUsers.map((u) => u.userId));

      sidebarUsers.forEach((sidebarUser) => {
        if (sidebarUser.userId !== user?.userId) {
          const existingUser = newCache.get(sidebarUser.userId);
          newCache.set(sidebarUser.userId, {
            ...sidebarUser,
            isPinned: existingUser?.isPinned || !sidebarUser.isOnline,
            lastSeen: sidebarUser.isOnline
              ? now
              : existingUser?.lastSeen ?? now,
          });
        }
      });

      // Mark users not in the sidebar feed as offline and keep their last seen
      newCache.forEach((cachedUser, odUserId) => {
        if (!sidebarUserIds.has(odUserId) && cachedUser.isPinned) {
          newCache.delete(odUserId);
          return;
        }

        if (!sidebarUserIds.has(odUserId) && cachedUser.isOnline) {
          newCache.set(odUserId, {
            ...cachedUser,
            isOnline: false,
          });
        }
      });

      // Remove users who have been offline for more than 3 minutes
      newCache.forEach((cachedUser, odUserId) => {
        if (
          !cachedUser.isPinned &&
          !cachedUser.isOnline &&
          now - cachedUser.lastSeen > USER_TIMEOUT_MS
        ) {
          newCache.delete(odUserId);
        }
      });

      // Persist to localStorage
      try {
        localStorage.setItem(
          CACHED_USERS_KEY,
          JSON.stringify(Array.from(newCache.entries())),
        );
      } catch {
        // Ignore storage errors
      }

      return newCache;
    });
  }, [sidebarUsers, user?.userId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        SIDEBAR_FILTERS_KEY,
        JSON.stringify(appliedFilters),
      );
    } catch {
      // Ignore storage errors
    }
  }, [appliedFilters]);

  useEffect(() => {
    if (!user?.isGuest || !appliedFilters.friendsOnly) {
      return;
    }

    setAppliedFilters((prev) => ({
      ...prev,
      friendsOnly: false,
    }));
  }, [appliedFilters.friendsOnly, user?.isGuest]);

  // Periodic cleanup of stale offline users
  useEffect(() => {
    const interval = setInterval(() => {
      setCachedUsers((prev) => {
        const now = Date.now();
        const newCache = new Map(prev);
        let changed = false;

        newCache.forEach((cachedUser, odUserId) => {
          if (
            !cachedUser.isPinned &&
            !cachedUser.isOnline &&
            now - cachedUser.lastSeen > USER_TIMEOUT_MS
          ) {
            newCache.delete(odUserId);
            changed = true;
          }
        });

        if (changed) {
          try {
            localStorage.setItem(
              CACHED_USERS_KEY,
              JSON.stringify(Array.from(newCache.entries())),
            );
          } catch {
            // Ignore storage errors
          }
        }

        return changed ? newCache : prev;
      });
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const friendUsersQuery = useQuery({
    queryKey: ["/api/users/friends"],
    enabled: !!user && !user.isGuest,
    queryFn: async () =>
      readJsonResponse<User[]>(await apiRequest("GET", "/api/users/friends")),
    staleTime: 60_000,
  });

  const historyUsersQuery = useQuery({
    queryKey: ["/api/users/history"],
    enabled: !!user,
    queryFn: async () =>
      readJsonResponse<User[]>(await apiRequest("GET", "/api/users/history")),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const liveSidebarUsersById = useMemo(
    () => new Map(sidebarUsers.map((sidebarUser) => [sidebarUser.userId, sidebarUser])),
    [sidebarUsers],
  );

  const friendUserIds = useMemo(
    () =>
      new Set((friendUsersQuery.data ?? []).map((friendUser) => friendUser.userId)),
    [friendUsersQuery.data],
  );

  const sourceUsers = useMemo<CachedUser[]>(() => {
    if (mode !== "history") {
      if (!appliedFilters.friendsOnly || user?.isGuest) {
        return Array.from(cachedUsers.values());
      }

      return (friendUsersQuery.data ?? []).map((friendUser) => {
        const liveSidebarUser = liveSidebarUsersById.get(friendUser.userId);
        const cachedUser = cachedUsers.get(friendUser.userId);

        return {
          ...cachedUser,
          ...friendUser,
          isOnline: liveSidebarUser?.isOnline ?? cachedUser?.isOnline ?? false,
          isPinned: true,
          lastSeen: cachedUser?.lastSeen ?? 0,
        };
      });
    }

    return (historyUsersQuery.data ?? []).map((historyUser) => {
      const liveSidebarUser = liveSidebarUsersById.get(historyUser.userId);
      const cachedUser = cachedUsers.get(historyUser.userId);

      return {
        ...cachedUser,
        ...historyUser,
        isOnline:
          liveSidebarUser?.isOnline ??
          cachedUser?.isOnline ??
          historyUser.isOnline ??
          false,
        isPinned: true,
        lastSeen: cachedUser?.lastSeen ?? 0,
      };
    });
  }, [
    appliedFilters.friendsOnly,
    cachedUsers,
    friendUsersQuery.data,
    historyUsersQuery.data,
    liveSidebarUsersById,
    mode,
    user?.isGuest,
  ]);

  const candidateUsers = sourceUsers
    .filter(
      (u) =>
        u.userId !== user?.userId &&
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (appliedFilters.gender === "all" ||
          (appliedFilters.gender === "male" && u.gender === "Male") ||
          (appliedFilters.gender === "female" && u.gender === "Female")),
    );

  // Fetch conversation stats for candidate users
  const { data: conversationStats } = useQuery({
    queryKey: [
      "conversations-stats",
      candidateUsers.map((u) => u.userId).join(","),
    ],
    queryFn: async () => {
      if (candidateUsers.length === 0) return {};
      const ids = candidateUsers.map((u) => u.userId).join(",");
      const res = await apiRequest(
        "GET",
        `/api/conversations/stats?userIds=${encodeURIComponent(ids)}`,
      );
      return readJsonResponse<ConversationStatsResponse>(res);
    },
    enabled: candidateUsers.length > 0,
  });

  const displayUsers = candidateUsers
    .filter(
      (candidateUser) =>
        !appliedFilters.friendsOnly || friendUserIds.has(candidateUser.userId),
    )
    .sort((leftUser, rightUser) => {
      const rightTimestamp = new Date(
        conversationStats?.[rightUser.userId]?.lastMessage?.timestamp ?? 0,
      ).getTime();
      const leftTimestamp = new Date(
        conversationStats?.[leftUser.userId]?.lastMessage?.timestamp ?? 0,
      ).getTime();
      const timestampDelta = rightTimestamp - leftTimestamp;
      if (!Number.isNaN(timestampDelta) && timestampDelta !== 0) {
        return timestampDelta;
      }

      const onlineDelta = Number(rightUser.isOnline) - Number(leftUser.isOnline);
      if (onlineDelta !== 0) return onlineDelta;

      const unreadDelta =
        (conversationStats?.[rightUser.userId]?.unread ?? 0) -
        (conversationStats?.[leftUser.userId]?.unread ?? 0);
      if (unreadDelta !== 0) return unreadDelta;

      return leftUser.username.localeCompare(rightUser.username);
    });

  const hasActiveFilters =
    appliedFilters.friendsOnly ||
    appliedFilters.gender !== "all" ||
    mode === "history";
  const isHistoryMode = mode === "history";
  const isFriendFilterLoading =
    appliedFilters.friendsOnly &&
    !user?.isGuest &&
    friendUsersQuery.isPending;
  const activeNavigationItem: ChatNavigationItem =
    location.startsWith("/global-chat")
      ? "global"
      : location === "/random-chat"
          ? "random"
          : "chat";

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleGenderFilterChange = (value: string) => {
    setAppliedFilters((prev) => ({
      ...prev,
      gender:
        value === "male" || value === "female" || value === "all"
          ? value
          : "all",
    }));
  };

  const handleDashboardViewChange = (view: "chat" | "friends" | "history") => {
    if (view === "friends") {
      if (!user || user.isGuest) {
        toast({
          title: "Friends view unavailable",
          description: "Register or log in to filter your friends here.",
        });
        return;
      }

      onModeChange?.("chat");
      setAppliedFilters((prev) => ({ ...prev, friendsOnly: true }));
      return;
    }

    setAppliedFilters((prev) => ({ ...prev, friendsOnly: false }));
    onModeChange?.(view === "history" ? "history" : "chat");
  };

  const handleNavigationSelect = (item: ChatNavigationItem) => {
    if (item === "random") {
      if (location !== "/random-chat") {
        navigateWithinAppShell(location, "/random-chat", setLocation);
      }
      return;
    }

    if (item === "settings") {
      if (location !== "/settings") {
        navigateWithinAppShell(location, "/settings", setLocation);
      }
      return;
    }

    if (item === "logout") {
      handleLogout();
      return;
    }

    if (item === "global") {
      if (location !== "/global-chat") {
        navigateWithinAppShell(location, "/global-chat", setLocation);
      }
      return;
    }

    if (location !== "/dashboard") {
      navigateWithinAppShell(location, "/dashboard", setLocation);
    }
  };

  const activeDashboardView: "chat" | "friends" | "history" =
    mode === "history"
      ? "history"
      : appliedFilters.friendsOnly
        ? "friends"
        : "chat";
  const dashboardViewConfig: Record<
    "chat" | "friends" | "history",
    { icon: typeof MessageCircle; title: string }
  > = {
    chat: { icon: MessageCircle, title: "Chats" },
    friends: { icon: UserRoundCheck, title: "Friends" },
    history: { icon: History, title: "History" },
  };
  const activeDashboardViewConfig = dashboardViewConfig[activeDashboardView];
  const ActiveDashboardViewIcon = activeDashboardViewConfig.icon;
  const dashboardTitleContent = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 rounded-full text-left text-[1.55rem] font-semibold tracking-tight text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Choose chat dashboard view"
        >
          <span className="truncate">{activeDashboardViewConfig.title}</span>
          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-40 rounded-[1rem] border border-border/70 bg-popover p-1.5"
      >
        {([
          ["chat", MessageCircle, "Chats"],
          ["friends", UserRoundCheck, "Friends"],
          ["history", History, "History"],
        ] as const).map(([value, Icon, label]) => (
          <DropdownMenuItem
            key={value}
            className="rounded-[0.85rem] px-3 py-2"
            onSelect={() => handleDashboardViewChange(value)}
          >
            <Icon className="mr-2 h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const genderFilterAction = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-10 w-10 rounded-full border-0 bg-transparent text-muted-foreground shadow-none ring-0 hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0",
            appliedFilters.gender !== "all" && "text-primary hover:text-primary",
          )}
          title="Gender filter"
          aria-label="Gender filter"
        >
          <VenusAndMars className="h-4.5 w-4.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-38 rounded-[1rem] border border-border/70 bg-popover p-1.5"
      >
        {([
          ["all", VenusAndMars, "All"],
          ["male", Mars, "Male"],
          ["female", Venus, "Female"],
        ] as const).map(([value, Icon, label]) => {
          const isSelected = appliedFilters.gender === value;

          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => handleGenderFilterChange(value)}
              className={cn(
                "rounded-[0.85rem] px-3 py-2",
                isSelected && "bg-accent text-accent-foreground",
              )}
            >
              <Icon className="mr-2 h-4 w-4" />
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
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

        <div className="relative flex min-w-0 flex-1 flex-col bg-background text-foreground md:overflow-hidden">
          <div className="px-4 pb-3 pt-4 md:px-4 md:pb-3 md:pt-4">
            <ChatPageHeader
              icon={ActiveDashboardViewIcon}
              title={activeDashboardViewConfig.title}
              titleContent={dashboardTitleContent}
              onLogout={handleLogout}
              logoutPending={logoutMutation.isPending}
              headerAction={genderFilterAction}
            />

            <div className="mt-3 flex items-center gap-3 md:mt-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground " />
                <Input
                  type="text"
                  placeholder="Search chats"
                  aria-label="Search chats"
                  className="h-11 rounded-full border-border bg-card pl-10 text-sm text-foreground 
                  md:bg-muted
                  placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-users"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-[100px] pt-1 scrollbar-none md:px-3 md:pb-4">
            <div className="space-y-[2px]" role="listbox" aria-label="Available chats">
              {displayUsers.length === 0 ? (
                <div className="rounded-[1.5rem] px-4 py-10 text-center text-sm ">
                  {isHistoryMode && historyUsersQuery.isPending
                    ? "Loading conversations..."
                    : isHistoryMode && historyUsersQuery.isError
                      ? "Failed to load conversations"
                      : isFriendFilterLoading
                    ? "Loading friends..."
                    : searchTerm || hasActiveFilters
                      ? "No users found"
                      : isHistoryMode
                        ? "No conversations yet"
                        : "No users available"}
                </div>
              ) : (
                displayUsers.map((displayUser) => {
                  const lastMessage =
                    conversationStats?.[displayUser.userId]?.lastMessage;
                  const unreadCount =
                    conversationStats?.[displayUser.userId]?.unread ?? 0;
                  const preview = lastMessage
                    ? `${lastMessage.senderId === user?.userId ? "You: " : ""}${getSidebarMessagePreview(lastMessage.message)}`
                    : displayUser.isOnline
                      ? "Online now"
                      : "Tap to start chatting";

                  return (
                    <Button
                      key={displayUser.userId}
                      variant="ghost"
                      className={cn(
                        "group h-auto w-full justify-start rounded-[1.6rem] border border-transparent bg-transparent px-3 py-3 text-card-foreground shadow-none transition-colors hover:bg-accent/30",
                        selectedUser?.userId === displayUser.userId
                          ? "bg-accent/70"
                          : "bg-transparent",
                      )}
                      onClick={() => onUserSelect(displayUser)}
                      aria-selected={selectedUser?.userId === displayUser.userId}
                      aria-label={`Open chat with ${displayUser.username}`}
                      data-testid={`button-user-${displayUser.userId}`}
                    >
                      <div className="flex w-full items-start gap-3 text-left">
                        <div className="relative shrink-0">
                          <div
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-black",
                              !displayUser.isOnline && "opacity-65",
                            )}
                            style={{
                              background: displayUser.isGuest
                                ? "var(--brand-muted)"
                                : getAvatarColor(displayUser.username),
                            }}
                          >
                            {displayUser.isGuest
                              ? "G"
                              : getUserInitials(displayUser.username)}
                          </div>
                          <div
                            className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background",
                              displayUser.isOnline
                                ? "bg-emerald-500"
                                : "bg-muted-foreground",
                            )}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "truncate text-sm font-semibold text-card-foreground",
                                  !displayUser.isOnline && "opacity-85",
                                )}
                                data-testid={`text-username-${displayUser.userId}`}
                              >
                                {displayUser.username}
                              </p>
                              <p className="mt-1 truncate text-xs leading-5 text-muted-foreground">
                                {preview}
                              </p>
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-2 pl-2">
                              <span className="text-[11px] font-medium text-muted-foreground">
                                {formatSidebarTimestamp(lastMessage?.timestamp)}
                              </span>
                              {unreadCount > 0 ? (
                                <span className="inline-flex min-w-[1.4rem] items-center justify-center rounded-full bg-primary px-1.5  text-[10px] font-semibold text-primary-foreground">
                                  {unreadCount}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Button>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
