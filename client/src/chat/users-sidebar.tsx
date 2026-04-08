import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import type { SelfUserProfile, User } from "@shared/schema";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggleButton2 } from "@/components/site-nav";
import { cn, getAvatarColor, getUserInitials } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import {
  Ban,
  Bell,
  Search,
  Filter,
  LogOut,
  Loader2,
  Lock,
  Settings2,
  ShieldOff,
  SlidersHorizontal,
  User as UserIcon,
  UserPlus,
  Volume2,
} from "lucide-react";
import { useLocation } from "wouter";
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
const LAST_READ_MESSAGES_KEY = "chatnexus_last_read_messages";
const SIDEBAR_FILTERS_KEY = "chatnexus_sidebar_filters";
const USER_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const TENOR_MEDIA_URL_PATTERN = /^https?:\/\/media\.tenor\.com\//i;
const IMAGE_MEDIA_URL_PATTERN = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
const VIDEO_MEDIA_URL_PATTERN = /\.(mp4|webm)(\?.*)?$/i;

type SidebarFilters = {
  friendsOnly: boolean;
  gender: "all" | "male" | "female";
};

type FriendshipStatusResponse = {
  isFriend: boolean;
};

type BlockedUsersResponse = {
  users: User[];
};

type SettingsSection = "profile" | "preferences" | "blocked";
type UsersSidebarMode = "chat" | "history";
type ConversationStatsResponse = Record<
  number,
  { lastMessage: { msgId: number; senderId: number; message: string; timestamp: string } | null; unread: number }
>;

const DEFAULT_FILTERS: SidebarFilters = {
  friendsOnly: false,
  gender: "all",
};

const DEFAULT_SETTINGS_PREFERENCES = {
  pushNotifications: true,
  notificationSound: true,
  allowFriendRequests: true,
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
}: UsersSidebarProps) {
  const { user, logoutMutation } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { sidebarUsers, isConnected } = useSocket();
  const [searchTerm, setSearchTerm] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [lastReadMessageIds, setLastReadMessageIds] = useState<Record<number, number>>(
    () => {
      try {
        const stored = localStorage.getItem(LAST_READ_MESSAGES_KEY);
        return stored ? (JSON.parse(stored) as Record<number, number>) : {};
      } catch {
        return {};
      }
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
      localStorage.setItem(
        LAST_READ_MESSAGES_KEY,
        JSON.stringify(lastReadMessageIds),
      );
    } catch {
      // Ignore storage errors
    }
  }, [lastReadMessageIds]);

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

  const historyUsersQuery = useQuery({
    queryKey: ["/api/users/history"],
    enabled: mode === "history" && !!user,
    queryFn: async () =>
      readJsonResponse<User[]>(await apiRequest("GET", "/api/users/history")),
    staleTime: 0,
    refetchInterval: mode === "history" ? 5000 : false,
  });

  const liveSidebarUsersById = useMemo(
    () => new Map(sidebarUsers.map((sidebarUser) => [sidebarUser.userId, sidebarUser])),
    [sidebarUsers],
  );

  const sourceUsers = useMemo<CachedUser[]>(() => {
    if (mode !== "history") {
      return Array.from(cachedUsers.values());
    }

    return (historyUsersQuery.data ?? []).map((historyUser) => {
      const liveSidebarUser = liveSidebarUsersById.get(historyUser.userId);

      return {
        ...historyUser,
        isOnline: liveSidebarUser?.isOnline ?? historyUser.isOnline ?? false,
        isPinned: true,
        lastSeen: 0,
      };
    });
  }, [cachedUsers, historyUsersQuery.data, liveSidebarUsersById, mode]);

  const candidateUsers = sourceUsers
    .filter(
      (u) =>
        u.userId !== user?.userId &&
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (appliedFilters.gender === "all" ||
          (appliedFilters.gender === "male" && u.gender === "Male") ||
          (appliedFilters.gender === "female" && u.gender === "Female")),
    );

  const shouldLoadFriendships =
    !!user && !user.isGuest && candidateUsers.length > 0;

  const friendshipStatusQueries = useQueries({
    queries: shouldLoadFriendships
      ? candidateUsers.map((candidateUser) => ({
          queryKey: ["friendship-status", candidateUser.userId],
          queryFn: async () => {
            const res = await apiRequest(
              "GET",
              `/api/users/${candidateUser.userId}/friendship`,
            );
            return readJsonResponse<FriendshipStatusResponse>(res);
          },
          staleTime: 60_000,
        }))
      : [],
  });

  const friendUserIds = new Set<number>();
  friendshipStatusQueries.forEach((query, index) => {
    if (query.data?.isFriend) {
      friendUserIds.add(candidateUsers[index].userId);
    }
  });

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
    refetchInterval: 5000,
    enabled: candidateUsers.length > 0,
  });

  const getHasUnread = (candidateUser: CachedUser) => {
    const lastMessage = conversationStats?.[candidateUser.userId]?.lastMessage;
    if (!lastMessage) {
      return false;
    }

    if (selectedUser?.userId === candidateUser.userId) {
      return false;
    }

    if (lastMessage.senderId === user?.userId) {
      return false;
    }

    return lastReadMessageIds[candidateUser.userId] !== lastMessage.msgId;
  };

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
        Number(getHasUnread(rightUser)) - Number(getHasUnread(leftUser));
      if (unreadDelta !== 0) return unreadDelta;

      return leftUser.username.localeCompare(rightUser.username);
    });

  const onlineCount = displayUsers.filter((u) => u.isOnline).length;
  const hasActiveFilters =
    appliedFilters.friendsOnly || appliedFilters.gender !== "all";
  const isFriendFilterLoading =
    appliedFilters.friendsOnly &&
    friendshipStatusQueries.some((query) => query.isPending);
  const activeNavigationItem: ChatNavigationItem =
    location === "/global-chat"
      ? "global"
      : location === "/history"
        ? "history"
        : location === "/random-chat"
          ? "random"
        : "chat";

  useEffect(() => {
    if (!selectedUser) {
      return;
    }

    const lastMessage = conversationStats?.[selectedUser.userId]?.lastMessage;
    if (!lastMessage) {
      return;
    }

    setLastReadMessageIds((prev) => {
      if (prev[selectedUser.userId] === lastMessage.msgId) {
        return prev;
      }

      return {
        ...prev,
        [selectedUser.userId]: lastMessage.msgId,
      };
    });
  }, [conversationStats, selectedUser]);

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

  const handleFriendsFilterToggle = () => {
    if (!user || user.isGuest) {
      toast({
        title: "Friends filter unavailable",
        description: "Register or log in to filter your friends here.",
      });
      return;
    }

    setAppliedFilters((prev) => ({
      ...prev,
      friendsOnly: !prev.friendsOnly,
    }));
  };

  const handleNavigationSelect = (item: ChatNavigationItem) => {
    if (item === "random") {
      if (location !== "/random-chat") {
        setLocation("/random-chat");
      }
      return;
    }

    if (item === "settings") {
      setSettingsOpen(true);
      return;
    }

    if (item === "global") {
      if (location !== "/global-chat") {
        setLocation("/global-chat");
      }
      return;
    }

    if (item === "history") {
      if (location !== "/history") {
        setLocation("/history");
      }
      return;
    }

    if (location !== "/dashboard") {
      setLocation("/dashboard");
    }
  };

  return (
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

        <div className="relative flex min-w-0 flex-1 flex-col bg-background text-foreground md:overflow-hidden md:rounded-sm md:border md:border-border/70 md:bg-card md:shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className=" px-3 pb-2 pt-2 md:px-3 md:pb-2 md:pt-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate px-2 text-2xl font-semibold leading-none tracking-tight text-foreground">
                  ChatNexus
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium shadow-sm",
                    isConnected
                      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                      : "bg-rose-500/12 text-rose-700 dark:text-rose-300",
                  )}
                  data-testid="text-online-count"
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
                  <span>{onlineCount} online</span>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  title="Logout"
                  data-testid="button-logout"
                  className="h-11 w-11 rounded-full  text-muted-foreground shadow-[0_12px_28px_rgba(15,23,42,0.08)] hover:bg-accent hover:text-foreground"
                >
                  <LogOut className="h-6 w-6" />
                </Button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-3 md:mt-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground " />
                <Input
                  type="text"
                  placeholder={
                    mode === "history" ? "Search Conversations" : "Search Users"
                  }
                  className="h-11 rounded-full border-border bg-card pl-10 text-sm text-foreground 
                  md: bg-muted
                  placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-users"
                />
              </div>

            
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+94px)] p-1 scrollbar-none md:px-3 md:pb-4">
            <div className="mb-3 flex items-center gap-2 px-1">
              {[
                { value: "all", label: "All" },
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
              ].map((option) => {
                const isActive = appliedFilters.gender === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleGenderFilterChange(option.value)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    data-testid={`button-pill-${option.value}`}
                    aria-pressed={isActive}
                  >
                    {option.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleFriendsFilterToggle}
                disabled={!user || user.isGuest}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  appliedFilters.friendsOnly
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                  (!user || user.isGuest) &&
                    "cursor-not-allowed opacity-55 hover:bg-muted hover:text-muted-foreground",
                )}
                data-testid="button-pill-friends"
                aria-pressed={appliedFilters.friendsOnly}
                title={
                  !user || user.isGuest
                    ? "Register or log in to use the friends filter"
                    : "Show only friends"
                }
              >
                Friends
              </button>
            </div>

            <div className="space-y-2">
              {displayUsers.length === 0 ? (
                <div className="rounded-[1.5rem] px-4 py-10 text-center text-sm ">
                  {mode === "history" && historyUsersQuery.isPending
                    ? "Loading conversations..."
                    : mode === "history" && historyUsersQuery.isError
                      ? "Failed to load conversations"
                      : isFriendFilterLoading
                    ? "Loading friends..."
                    : searchTerm || hasActiveFilters
                      ? "No users found"
                      : mode === "history"
                        ? "No conversations yet"
                        : "No users available"}
                </div>
              ) : (
                displayUsers.map((displayUser) => {
                  const lastMessage =
                    conversationStats?.[displayUser.userId]?.lastMessage;
                  const unreadCount =
                    conversationStats?.[displayUser.userId]?.unread ?? 0;
                  const hasUnread = getHasUnread(displayUser);
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
                        "group h-auto w-full justify-start rounded-[1.6rem] border border-transparent bg-card px-3 py-3 text-card-foreground shadow-[0_10px_28px_rgba(15,23,42,0.05)] transition-all hover:border-border hover:bg-accent/40",
                        selectedUser?.userId === displayUser.userId
                          ? "border-border bg-accent shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
                          : "bg-card",
                      )}
                      onClick={() => onUserSelect(displayUser)}
                      data-testid={`button-user-${displayUser.userId}`}
                    >
                      <div className="flex w-full items-start gap-3 text-left">
                        <div className="relative shrink-0">
                          <div
                            className={cn(
                              "flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-black",
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
                                : "bg-muted-foreground/35",
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
                              {hasUnread ? (
                                <span className="inline-flex min-w-[1.4rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                  {unreadCount > 9 ? "9+" : unreadCount || "1"}
                                </span>
                              ) : displayUser.isOnline ? (
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                              ) : (
                                <span className="text-[10px] text-muted-foreground/45">
                                  -
                                </span>
                              )}
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
    </div>
  );
}

export function UserSettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, updateUser, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [preferenceDraft, setPreferenceDraft] = useState(
    DEFAULT_SETTINGS_PREFERENCES,
  );
  const [newUsername, setNewUsername] = useState(user?.username || "");
  const [newAge, setNewAge] = useState(user?.age != null ? String(user.age) : "");
  const [usernameError, setUsernameError] = useState("");
  const [ageError, setAgeError] = useState("");

  const profileQuery = useQuery({
    queryKey: ["/api/user/profile"],
    enabled: open && !!user,
    queryFn: async () =>
      readJsonResponse<SelfUserProfile>(await apiRequest("GET", "/api/user/profile")),
    staleTime: 0,
  });
  const blockedUsersQuery = useQuery({
    queryKey: ["/api/users/blocked"],
    enabled: open && !!user,
    queryFn: async () =>
      readJsonResponse<BlockedUsersResponse>(
        await apiRequest("GET", "/api/users/blocked"),
      ),
    staleTime: 0,
  });

  const profile = profileQuery.data ?? (user ? { ...user, gmail: null } : null);

  useEffect(() => {
    setNewUsername(user?.username || "");
    setNewAge(user?.age != null ? String(user.age) : "");
  }, [user?.age, user?.username]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveSection("profile");
    setPreferenceDraft(DEFAULT_SETTINGS_PREFERENCES);
  }, [open]);

  useEffect(() => {
    if (!open || !profileQuery.data) {
      return;
    }

    setNewUsername(profileQuery.data.username || "");
    setNewAge(
      profileQuery.data.age != null ? String(profileQuery.data.age) : "",
    );
    setUsernameError("");
    setAgeError("");
  }, [open, profileQuery.data]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { username: string; age: number }) => {
      const res = await apiRequest("PUT", "/api/user/profile", data);
      return readJsonResponse<{
        user: User;
        profile: SelfUserProfile;
        token: string;
      }>(res);
    },
    onSuccess: (data) => {
      updateUser(data.user, data.token);
      queryClient.setQueryData(["/api/user"], data.user);
      queryClient.setQueryData(["/api/user/profile"], data.profile);
      toast({
        title: "Profile updated",
        description: "Your profile details have been saved.",
      });
      onOpenChange(false);
      setUsernameError("");
      setAgeError("");
    },
    onError: (error: Error) => {
      if (
        error.message.includes("Username already exists") ||
        error.message.includes("taken")
      ) {
        setUsernameError(
          "This username is already taken. Please choose a different one.",
        );
      } else {
        setUsernameError("");
      }

      toast({
        title: "Failed to update profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  const unblockUserMutation = useMutation({
    mutationFn: async (blockedUserId: number) => {
      const res = await apiRequest("DELETE", `/api/users/${blockedUserId}/block`);
      return readJsonResponse<{ unblocked: boolean }>(res);
    },
    onSuccess: (_data, blockedUserId) => {
      queryClient.setQueryData<BlockedUsersResponse>(
        ["/api/users/blocked"],
        (current) => ({
          users: (current?.users ?? []).filter(
            (blockedUser) => blockedUser.userId !== blockedUserId,
          ),
        }),
      );
      void queryClient.invalidateQueries({
        queryKey: ["friendship-status", blockedUserId],
      });
      toast({
        title: "User unblocked",
        description: "They can appear in your sidebar again.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to unblock user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (user?.isGuest) {
      return;
    }

    const trimmedUsername = newUsername.trim();
    const parsedAge = Number(newAge);

    if (!trimmedUsername) {
      setUsernameError("Username cannot be empty");
      return;
    }

    if (trimmedUsername.length < 2) {
      setUsernameError("Username must be at least 2 characters long");
      return;
    }

    if (trimmedUsername.length > 20) {
      setUsernameError("Username must be less than 20 characters");
      return;
    }

    if (!newAge.trim()) {
      setAgeError("Age is required");
      return;
    }

    if (!Number.isInteger(parsedAge) || parsedAge < 13 || parsedAge > 120) {
      setAgeError("Age must be a whole number between 13 and 120");
      return;
    }

    if (trimmedUsername === user?.username && parsedAge === user?.age) {
      toast({
        title: "No changes to save",
        description: "Update your name or age first.",
      });
      return;
    }

    setUsernameError("");
    setAgeError("");
    updateProfileMutation.mutate({ username: trimmedUsername, age: parsedAge });
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewUsername(e.target.value);
    if (usernameError) {
      setUsernameError("");
    }
  };

  const handleAgeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewAge(e.target.value);
    if (ageError) {
      setAgeError("");
    }
  };

  const handleCancel = () => {
    setNewUsername(profile?.username || user?.username || "");
    setNewAge(
      profile?.age != null
        ? String(profile.age)
        : user?.age != null
          ? String(user.age)
          : "",
    );
    setUsernameError("");
    setAgeError("");
    onOpenChange(false);
  };

  const handleLogout = () => {
    onOpenChange(false);
    logoutMutation.mutate();
  };
  const handleUnblockUser = (blockedUserId: number) => {
    unblockUserMutation.mutate(blockedUserId);
  };
  const handlePreferenceToggle = (
    key: keyof typeof DEFAULT_SETTINGS_PREFERENCES,
    checked: boolean,
  ) => {
    setPreferenceDraft((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const isGuestUser = user?.isGuest ?? false;
  const isSaving = updateProfileMutation.isPending;
  const blockedUsers = blockedUsersQuery.data?.users ?? [];
  const unblockingUserId = unblockUserMutation.isPending
    ? unblockUserMutation.variables
    : null;
  const emailValue = isGuestUser
    ? "-"
    : profileQuery.isPending
      ? "Loading..."
      : profile?.gmail || "-";
  const profileDisplayName = newUsername.trim() || profile?.username || "User";
  const profileGender = profile?.gender || "-";
  const settingsSections = [
    { id: "profile" as const, label: "Profile", icon: UserIcon },
    {
      id: "preferences" as const,
      label: "Preferences",
      icon: SlidersHorizontal,
    },
    { id: "blocked" as const, label: "Blocked", icon: Ban },
  ];
  const preferenceItems = [
    {
      key: "pushNotifications" as const,
      label: "Push notifications",
      description: "Visual toggle for message and activity alerts.",
      icon: Bell,
    },
    {
      key: "notificationSound" as const,
      label: "Notification sound",
      description: "Preview how in-app sounds will be grouped here later.",
      icon: Volume2,
    },
    {
      key: "allowFriendRequests" as const,
      label: "Allow friend requests",
      description:
        "Layout placeholder for controlling whether others can send requests.",
      icon: UserPlus,
    },
  ];
  const isProfileSection = activeSection === "profile";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-0.75rem)] w-[calc(100%-1rem)] overflow-y-auto overscroll-y-contain p-0 touch-pan-y sm:max-w-3xl md:grid md:h-[min(88vh,680px)] md:grid-rows-[auto_minmax(0,1fr)] md:overflow-hidden">
        <DialogHeader className="gap-2 border-b px-3 py-3 text-left sm:px-5">
          <div className="pr-8">
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              User Settings
            </DialogTitle>
            <DialogDescription className="mt-1">
              Manage your profile, preview preferences, and blocked users.
            </DialogDescription>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5 md:hidden">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;

              return (
                <Button
                  key={section.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "h-9 shrink-0 rounded-full border px-3 text-sm font-medium",
                    isActive
                      ? "border-primary/20 bg-muted text-foreground"
                      : "border-border/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                  data-testid={`button-settings-tab-${section.id}`}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {section.label}
                </Button>
              );
            })}
          </div>
        </DialogHeader>

        <div className="min-h-0 md:grid md:grid-cols-[190px_minmax(0,1fr)]">
          <aside className="hidden border-r bg-muted/20 md:flex md:flex-col md:gap-1.5 md:px-3 md:py-4">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;

              return (
                <Button
                  key={section.id}
                  type="button"
                  variant="ghost"
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "h-10 justify-start rounded-xl px-3 text-sm font-medium",
                    isActive
                      ? "bg-muted text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                  data-testid={`button-settings-side-tab-${section.id}`}
                >
                  <Icon className="mr-3 h-4 w-4" />
                  {section.label}
                </Button>
              );
            })}
          </aside>

          <div className="min-h-0 px-3 py-3 sm:px-5 md:overflow-y-auto md:px-5 md:py-4">
            {isProfileSection ? (
              <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/35 p-3 sm:flex-row sm:items-center">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{
                backgroundColor: isGuestUser
                  ? "#6b7280"
                  : getAvatarColor(profileDisplayName),
              }}
            >
              {getUserInitials(profileDisplayName)}
            </div>
            
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {profileDisplayName}
              </p>
              <p className="text-xs text-muted-foreground">
                {isGuestUser ? "Guest account" : "Registered account"}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <ThemeToggleButton2 className="shadow-none" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleLogout}
                disabled={logoutMutation.isPending || isSaving}
                className="h-9 w-9 rounded-full border-destructive/25 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                data-testid="button-settings-logout"
                title="Logout"
                aria-label="Logout"
              >
                {logoutMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-border bg-muted/25 p-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Profile</Label>
              <p className="text-xs text-muted-foreground">
                {isGuestUser
                  ? "Guest accounts can view profile details only."
                  : "Registered accounts can edit name and age."}
              </p>
            </div>

            <div className="grid gap-2.5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-sm font-medium">
                    Name
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    value={newUsername}
                    onChange={handleUsernameChange}
                    placeholder="Enter your name"
                    disabled={isSaving || isGuestUser}
                    className={usernameError ? "border-destructive" : ""}
                    data-testid="input-new-username"
                  />
                  {usernameError && (
                    <p
                      className="text-sm text-destructive"
                      data-testid="error-username"
                    >
                      {usernameError}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="settings-email" className="text-sm font-medium">
                    Email
                  </Label>
                  <Input
                    id="settings-email"
                    value={emailValue}
                    disabled
                    readOnly
                    data-testid="input-settings-email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <Label htmlFor="settings-age" className="text-sm font-medium">
                    Age
                  </Label>
                  <Input
                    id="settings-age"
                    type="number"
                    inputMode="numeric"
                    min={13}
                    max={120}
                    value={newAge}
                    onChange={handleAgeChange}
                    placeholder="Enter your age"
                    disabled={isSaving || isGuestUser}
                    className={ageError ? "border-destructive" : ""}
                    data-testid="input-settings-age"
                  />
                  {ageError && (
                    <p className="text-sm text-destructive">{ageError}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="settings-gender" className="text-sm font-medium">
                    Gender
                  </Label>
                  <Input
                    id="settings-gender"
                    value={profileGender}
                    disabled
                    readOnly
                    data-testid="input-settings-gender"
                  />
                </div>
              </div>
            </div>

            {profileQuery.isError && !isGuestUser && (
              <p className="text-sm text-destructive">
                Failed to load the latest email for this account.
              </p>
            )}
          </div>

          <div className="hidden space-y-2.5 rounded-lg border border-border bg-muted/25 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Blocked users</Label>
                <p className="text-xs text-muted-foreground">
                  Unblock people here if you want them to appear in your sidebar
                  again.
                </p>
              </div>
              <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {blockedUsers.length}
              </span>
            </div>

            {blockedUsersQuery.isPending ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading blocked users...
              </div>
            ) : blockedUsers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                You have not blocked anyone.
              </div>
            ) : (
              <div className="space-y-2">
                {blockedUsers.map((blockedUser) => {
                  const blockedSubtitleParts = [
                    blockedUser.gender || null,
                    blockedUser.age != null ? `${blockedUser.age}` : null,
                    blockedUser.isGuest ? "Guest" : "Registered",
                  ].filter(Boolean);

                  return (
                    <div
                      key={blockedUser.userId}
                      className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-background/70 px-3 py-2"
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold text-white"
                        style={{
                          backgroundColor: blockedUser.isGuest
                            ? "#6b7280"
                            : getAvatarColor(blockedUser.username),
                        }}
                      >
                        {getUserInitials(blockedUser.username)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {blockedUser.username}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {blockedSubtitleParts.join(" • ")}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnblockUser(blockedUser.userId)}
                        disabled={
                          unblockUserMutation.isPending &&
                          unblockingUserId === blockedUser.userId
                        }
                        className="shrink-0"
                        data-testid={`button-unblock-user-${blockedUser.userId}`}
                      >
                        {unblockUserMutation.isPending &&
                        unblockingUserId === blockedUser.userId ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Unblocking...
                          </>
                        ) : (
                          <>
                            <ShieldOff className="mr-2 h-4 w-4" />
                            Unblock
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {blockedUsersQuery.isError && (
              <p className="text-sm text-destructive">
                Failed to load blocked users.
              </p>
            )}
          </div>

          <div className="grid gap-2 pt-1 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving || logoutMutation.isPending}
              data-testid="button-cancel-settings"
            >
              Close
            </Button>
            <Button
              type="submit"
              disabled={
                isSaving ||
                logoutMutation.isPending ||
                !newUsername.trim() ||
                !newAge.trim() ||
                isGuestUser
              }
              data-testid="button-save-settings"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isGuestUser ? (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Read Only
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
            ) : activeSection === "preferences" ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-muted/25 p-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Preferences</Label>
                    <p className="text-xs text-muted-foreground">
                      Layout only for now. The actual preference behavior will be
                      wired later.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {preferenceItems.map((item) => {
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.key}
                        className="flex items-start gap-3 rounded-xl border border-border bg-muted/25 p-3"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground">
                          <Icon className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {item.label}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {item.description}
                          </p>
                        </div>

                        <Switch
                          checked={preferenceDraft[item.key]}
                          onCheckedChange={(checked) =>
                            handlePreferenceToggle(item.key, checked)
                          }
                          aria-label={item.label}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    data-testid="button-close-settings-preferences"
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-muted/25 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Blocked users</Label>
                      <p className="text-xs text-muted-foreground">
                        Unblock people here if you want them to appear in your
                        sidebar again.
                      </p>
                    </div>
                    <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      {blockedUsers.length}
                    </span>
                  </div>
                </div>

                {blockedUsersQuery.isPending ? (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading blocked users...
                  </div>
                ) : blockedUsers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                    You have not blocked anyone.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {blockedUsers.map((blockedUser) => {
                      const blockedSubtitleParts = [
                        blockedUser.gender || null,
                        blockedUser.age != null ? `${blockedUser.age}` : null,
                        blockedUser.isGuest ? "Guest" : "Registered",
                      ].filter(Boolean);

                      return (
                        <div
                          key={blockedUser.userId}
                        className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-background/70 px-3 py-2"
                        >
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold text-white"
                            style={{
                              backgroundColor: blockedUser.isGuest
                                ? "#6b7280"
                                : getAvatarColor(blockedUser.username),
                            }}
                          >
                            {getUserInitials(blockedUser.username)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {blockedUser.username}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {blockedSubtitleParts.join(" / ")}
                            </p>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnblockUser(blockedUser.userId)}
                            disabled={
                              unblockUserMutation.isPending &&
                              unblockingUserId === blockedUser.userId
                            }
                            className="shrink-0"
                            data-testid={`button-unblock-user-${blockedUser.userId}`}
                          >
                            {unblockUserMutation.isPending &&
                            unblockingUserId === blockedUser.userId ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Unblocking...
                              </>
                            ) : (
                              <>
                                <ShieldOff className="mr-2 h-4 w-4" />
                                Unblock
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {blockedUsersQuery.isError && (
                  <p className="text-sm text-destructive">
                    Failed to load blocked users.
                  </p>
                )}

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    data-testid="button-close-settings-blocked"
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
