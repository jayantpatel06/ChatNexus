import { useState, useEffect } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { User } from "@shared/schema";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getStoredTheme, toggleStoredTheme } from "@/lib/theme";
import {
  Search,
  Settings,
  LogOut,
  Globe,
  Filter,
  RefreshCw,
  Loader2,
  Lock,
  Moon,
  Settings2,
  Sun,
} from "lucide-react";
import { Link } from "wouter";
import { useSocket } from "@/providers/socket-provider";

// Extended user type with online status tracking
interface CachedUser extends User {
  isOnline: boolean;
  lastSeen: number; // timestamp
  isPinned: boolean;
}

// Local storage key for caching users
const CACHED_USERS_KEY = "chatnexus_cached_users";
const LAST_READ_MESSAGES_KEY = "chatnexus_last_read_messages";
const USER_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const TENOR_MEDIA_URL_PATTERN = /^https?:\/\/media\.tenor\.com\//i;
const IMAGE_MEDIA_URL_PATTERN = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
const VIDEO_MEDIA_URL_PATTERN = /\.(mp4|webm)(\?.*)?$/i;

type SidebarFilters = {
  friendsOnly: boolean;
  male: boolean;
  female: boolean;
};

type FriendshipStatusResponse = {
  isFriend: boolean;
};

const DEFAULT_FILTERS: SidebarFilters = {
  friendsOnly: false,
  male: false,
  female: false,
};

interface UsersSidebarProps {
  selectedUser: User | null;
  onUserSelect: (user: User) => void;
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

export function UsersSidebar({
  selectedUser,
  onUserSelect,
}: UsersSidebarProps) {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const { sidebarUsers, isConnected, refreshOnlineUsers, forceReconnect } =
    useSocket();
  const [searchTerm, setSearchTerm] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] =
    useState<SidebarFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] =
    useState<SidebarFilters>(DEFAULT_FILTERS);
  const [isRefreshingUsers, setIsRefreshingUsers] = useState(false);
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

  const candidateUsers = Array.from(cachedUsers.values())
    .filter(
      (u) =>
        u.userId !== user?.userId &&
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (!appliedFilters.male && !appliedFilters.female
          ? true
          : (appliedFilters.male && u.gender === "Male") ||
            (appliedFilters.female && u.gender === "Female")),
    );

  const shouldLoadFriendships = !!user && !user.isGuest && candidateUsers.length > 0;

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
      return readJsonResponse<
        Record<number, { lastMessage: any; unread: number }>
      >(res);
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
      const unreadDelta =
        Number(getHasUnread(rightUser)) - Number(getHasUnread(leftUser));
      if (unreadDelta !== 0) return unreadDelta;

      const friendDelta =
        Number(friendUserIds.has(rightUser.userId)) -
        Number(friendUserIds.has(leftUser.userId));
      if (friendDelta !== 0) return friendDelta;

      const guestDelta = Number(rightUser.isGuest) - Number(leftUser.isGuest);
      if (guestDelta !== 0) return guestDelta;

      const onlineDelta = Number(rightUser.isOnline) - Number(leftUser.isOnline);
      if (onlineDelta !== 0) return onlineDelta;

      return leftUser.username.localeCompare(rightUser.username);
    });

  const onlineCount = displayUsers.filter((u) => u.isOnline).length;
  const hasActiveFilters =
    appliedFilters.friendsOnly || appliedFilters.male || appliedFilters.female;
  const isFriendFilterLoading =
    appliedFilters.friendsOnly &&
    friendshipStatusQueries.some((query) => query.isPending);

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

  const getUserInitials = (username: string) => {
    return username.slice(0, 2).toUpperCase();
  };

  const getAvatarColor = (username: string) => {
    const index = username.length % 6;
    return `var(--avatar-${index})`;
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleFilterOpenChange = (open: boolean) => {
    setDraftFilters(appliedFilters);
    setFilterOpen(open);
  };

  const handleFilterToggle =
    (key: keyof SidebarFilters) => (checked: boolean | "indeterminate") => {
      setDraftFilters((prev) => ({
        ...prev,
        [key]: checked === true,
      }));
    };

  const handleCancelFilters = () => {
    setDraftFilters(appliedFilters);
    setFilterOpen(false);
  };

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters);
    setFilterOpen(false);
  };

  const handleRefreshUsers = async () => {
    if (isRefreshingUsers) return;

    setIsRefreshingUsers(true);
    try {
      if (!isConnected) {
        forceReconnect();
      }
      await refreshOnlineUsers();
    } catch {
      toast({
        title: "Refresh failed",
        description: "Could not refresh the users list right now.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshingUsers(false);
    }
  };

  return (
    <div className="w-full md:w-80 bg-brand-sidebar border-r border-brand-border flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-brand-border bg-brand-sidebar flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">ChatNexus</h2>
          <div className="flex items-center gap-2">
            <HoverCard>
              <HoverCardTrigger asChild>
                <Badge
                  variant="secondary"
                  className="bg-brand-card text-brand-text flex items-center gap-1 border border-brand-border"
                  data-testid="text-connection-status"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${isConnected ? "bg-brand-primary animate-pulse" : "bg-red-600"}`}
                  ></div>
                  {isConnected ? "Server Online" : "Server Offline"}
                </Badge>
              </HoverCardTrigger>
              {!isConnected && (
                <HoverCardContent>
                  <div className="text-sm">
                    Wait a moment while we are reconnecting....
                  </div>
                </HoverCardContent>
              )}
            </HoverCard>
            <Button
              variant="ghost"
              size="sm"
              title="Settings"
              data-testid="button-settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Current User Info */}
        {user && (
          <div className="flex items-center gap-3 p-3 bg-brand-primary/10 rounded-lg border border-brand-primary/20">
            <div className="relative">
              <div
                className={`w-10 h-10 ${user.isGuest ? "bg-brand-muted" : "bg-brand-primary"} text-black rounded-full flex items-center justify-center font-bold`}
              >
                {user.isGuest ? "G" : getUserInitials(user.username)}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="font-medium text-foreground truncate"
                data-testid="text-current-username"
              >
                {user.username}
              </p>
              <p className="text-xs text-muted-foreground">
                {user.isGuest ? "Guest" : "Member"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              title="Logout"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </Button>
          </div>
        )}
      </div>

      {/* Global Chat Link */}
      <div className="p-4 border-b border-brand-border flex-shrink-0">
        <Link href="/global-chat">
          <Button variant="outline" className="w-full gap-2 border-brand-border hover:bg-brand-primary hover:text-black hover:border-brand-primary transition-all">
            <Globe className="h-4 w-4" />
            Global Chat
          </Button>
        </Link>
      </div>

      {/* Search Bar */}
      <div className="p-4 border-b border-brand-border flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <Input
            type="text"
            placeholder="Search User"
            className="pl-10 bg-brand-card border-brand-border text-brand-text placeholder:text-brand-muted focus:ring-brand-primary/30"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-users"
          />
        </div>
      </div>

      

      {/* Online Users List */}
      <div className="flex-1 overflow-y-auto scrollbar-none min-h-0">
        <div className="p-2">
          <div className="text-xs font-medium text-brand-muted uppercase tracking-wide px-2 py-2 flex items-center justify-between flex-shrink-0 sticky top-0 bg-brand-sidebar z-10">
            <div className="flex items-center gap-1.5">
              <span>Users</span>
              <Popover open={filterOpen} onOpenChange={handleFilterOpenChange}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    title={
                      !user || user.isGuest
                        ? "Filters are available for registered users only"
                        : "Filter users"
                    }
                    disabled={!user || user.isGuest}
                    className={`h-7 w-7 border border-brand-border bg-brand-card text-brand-text hover:bg-brand-card/80 ${
                      hasActiveFilters ? "border-brand-primary text-brand-primary" : ""
                    }`}
                    data-testid="button-user-filters"
                  >
                    <Filter className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-64 border-brand-border bg-brand-card p-3 text-brand-text"
                >
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Filter users
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Apply one or more filters to the sidebar list.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <Checkbox
                          checked={draftFilters.friendsOnly}
                          onCheckedChange={handleFilterToggle("friendsOnly")}
                        />
                        <span>Friend</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <Checkbox
                          checked={draftFilters.male}
                          onCheckedChange={handleFilterToggle("male")}
                        />
                        <span>Male</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <Checkbox
                          checked={draftFilters.female}
                          onCheckedChange={handleFilterToggle("female")}
                        />
                        <span>Female</span>
                      </label>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCancelFilters}
                        className="border-brand-border"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleApplyFilters}
                        className="bg-brand-primary text-black hover:bg-brand-primary/90"
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                title="Refresh users list"
                onClick={handleRefreshUsers}
                disabled={isRefreshingUsers}
                className="h-7 w-7 border border-brand-border bg-brand-card text-brand-text hover:bg-brand-card/80"
                data-testid="button-refresh-users"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRefreshingUsers ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
            <Badge
              variant="secondary"
              className="bg-brand-card text-brand-text border border-brand-border"
              data-testid="text-online-count"
            >
              {onlineCount} online
            </Badge>
          </div>

          <div className="space-y-1">
            {displayUsers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                {isFriendFilterLoading
                  ? "Loading friends..."
                  : searchTerm || hasActiveFilters
                    ? "No Users found"
                    : "No Users available"}
              </div>
            ) : (
              displayUsers.map((displayUser) => (
                <Button
                  key={displayUser.userId}
                  variant="ghost"
                  className={`w-full flex items-center gap-3 p-2 h-auto justify-start border border-transparent rounded-lg transition-all ${
                    selectedUser?.userId === displayUser.userId
                      ? "bg-brand-primary/20 border-brand-primary/40 text-brand-text"
                      : "bg-transparent text-brand-text hover:bg-brand-card hover:border-brand-border"
                  }`}
                  onClick={() => onUserSelect(displayUser)}
                  data-testid={`button-user-${displayUser.userId}`}
                >
                  <div className="relative">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-black ${!displayUser.isOnline ? "opacity-60" : ""}`}
                      style={{ background: displayUser.isGuest ? 'var(--brand-muted)' : getAvatarColor(displayUser.username) }}
                    >
                      {displayUser.isGuest
                        ? "G"
                        : getUserInitials(displayUser.username)}
                    </div>
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${displayUser.isOnline ? "bg-brand-primary" : "bg-brand-muted"} border-2 border-brand-sidebar rounded-full`}
                    ></div>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p
                      className={`font-medium text-foreground text-sm truncate ${!displayUser.isOnline ? "opacity-70" : ""}`}
                      data-testid={`text-username-${displayUser.userId}`}
                    >
                      {displayUser.username}
                    </p>
                    
                    {/* Last Message Preview */}
                    {conversationStats?.[displayUser.userId]?.lastMessage && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-[150px] opacity-70">
                        {conversationStats[displayUser.userId].lastMessage
                          .senderId === user?.userId
                          ? "You: "
                          : ""}
                        {getSidebarMessagePreview(
                          conversationStats[displayUser.userId].lastMessage
                            .message,
                        )}
                      </p>
                    )}
                  </div>

                  {/* Unread Badge */}
                  {getHasUnread(displayUser) ? (
                    <Badge
                      variant="destructive"
                      className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] flex-shrink-0 animate-in zoom-in"
                    >
                      1+
                    </Badge>
                  ) : (
                    <div
                      className={`${selectedUser?.userId === displayUser.userId ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
                    ></div>
                  )}
                </Button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <UserSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function UserSettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [newUsername, setNewUsername] = useState(user?.username || "");
  const [usernameError, setUsernameError] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      (getStoredTheme() ??
        (document.documentElement.classList.contains("dark")
          ? "dark"
          : "light")) === "dark"
    );
  });

  useEffect(() => {
    setNewUsername(user?.username || "");
  }, [user?.username]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    setIsDarkMode(
      (getStoredTheme() ??
        (document.documentElement.classList.contains("dark")
          ? "dark"
          : "light")) === "dark",
    );
  }, [open]);

  const updateUsernameMutation = useMutation({
    mutationFn: async (data: { username: string }) => {
      const res = await apiRequest("PUT", "/api/user/username", data);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return (await res.json()) as { user: User; token: string };
    },
    onSuccess: (data) => {
      updateUser(data.user, data.token);
      queryClient.setQueryData(["/api/user"], data.user);
      toast({
        title: "Username updated",
        description: `Your username has been changed to ${data.user.username}`,
      });
      onOpenChange(false);
      setUsernameError("");
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
        setUsernameError(error.message || "Failed to update username");
      }

      toast({
        title: "Failed to update username",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedUsername = newUsername.trim();

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

    if (trimmedUsername === user?.username) {
      setUsernameError("Please choose a different username");
      return;
    }

    setUsernameError("");
    updateUsernameMutation.mutate({ username: trimmedUsername });
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewUsername(e.target.value);
    if (usernameError) {
      setUsernameError("");
    }
  };

  const handleCancel = () => {
    setNewUsername(user?.username || "");
    setUsernameError("");
    onOpenChange(false);
  };

  const handleThemeToggle = (checked: boolean) => {
    const currentIsDark =
      (getStoredTheme() ??
        (document.documentElement.classList.contains("dark")
          ? "dark"
          : "light")) === "dark";

    if (checked !== currentIsDark) {
      toggleStoredTheme(currentIsDark);
    }

    setIsDarkMode(checked);
    window.dispatchEvent(new Event("chatnexus-theme-change"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            User Settings
          </DialogTitle>
          <DialogDescription>
            Update your profile settings and preferences.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Theme</Label>
              <p className="text-xs text-muted-foreground">
                Switch between light and dark mode.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-muted-foreground" />
              <Switch
                checked={isDarkMode}
                onCheckedChange={handleThemeToggle}
                data-testid="switch-theme-mode"
              />
              <Moon className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium">
              Username
            </Label>
            <div className="space-y-1">
              <Input
                id="username"
                type="text"
                value={newUsername}
                onChange={handleUsernameChange}
                placeholder="Enter new username"
                disabled={updateUsernameMutation.isPending || user?.isGuest}
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
              {user?.isGuest && (
                <p className="text-sm text-muted-foreground">
                  Register an account to change your username
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <div className="relative">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full font-medium text-white ${
                  user?.isGuest ? "bg-gray-500" : "bg-primary"
                }`}
              >
                {user?.isGuest
                  ? "G"
                  : user?.username?.slice(0, 2).toUpperCase()}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-green-500"></div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {newUsername || "Username"}
              </p>
              <p className="text-xs text-muted-foreground">
                {user?.isGuest ? "Guest Account" : "Member Account"}
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={updateUsernameMutation.isPending}
              className="flex-1"
              data-testid="button-cancel-settings"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                updateUsernameMutation.isPending ||
                !newUsername.trim() ||
                user?.isGuest
              }
              className="flex-1"
              data-testid="button-save-settings"
            >
              {updateUsernameMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : user?.isGuest ? (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
