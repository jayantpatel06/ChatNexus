import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { User } from "@shared/schema";
import { UserSettingsModal } from "@/components/user-settings-modal";
import {
  Search,
  Settings,
  LogOut,
  User as UserIcon,
  Globe,
} from "lucide-react";
import { Link } from "wouter";

// Extended user type with online status tracking
interface CachedUser extends User {
  isOnline: boolean;
  lastSeen: number; // timestamp
}

// Local storage key for caching users
const CACHED_USERS_KEY = "chatnexus_cached_users";
const USER_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

interface UsersSidebarProps {
  selectedUser: User | null;
  onUserSelect: (user: User) => void;
}

export function UsersSidebar({
  selectedUser,
  onUserSelect,
}: UsersSidebarProps) {
  const { user, logoutMutation } = useAuth();
  const { onlineUsers, isConnected } = useSocket();
  const [searchTerm, setSearchTerm] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  // Update cached users when online users change
  useEffect(() => {
    setCachedUsers((prev) => {
      const now = Date.now();
      const newCache = new Map(prev);

      // Mark all current online users as online and update lastSeen
      const onlineUserIds = new Set(onlineUsers.map((u) => u.userId));

      onlineUsers.forEach((onlineUser) => {
        if (onlineUser.userId !== user?.userId) {
          newCache.set(onlineUser.userId, {
            ...onlineUser,
            isOnline: true,
            lastSeen: now,
          });
        }
      });

      // Mark users not in online list as offline (keep their lastSeen)
      newCache.forEach((cachedUser, odUserId) => {
        if (!onlineUserIds.has(odUserId) && cachedUser.isOnline) {
          newCache.set(odUserId, {
            ...cachedUser,
            isOnline: false,
            // Keep the lastSeen from when they were last online
          });
        }
      });

      // Remove users who have been offline for more than 3 minutes
      newCache.forEach((cachedUser, odUserId) => {
        if (
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
  }, [onlineUsers, user?.userId]);

  // Periodic cleanup of stale offline users
  useEffect(() => {
    const interval = setInterval(() => {
      setCachedUsers((prev) => {
        const now = Date.now();
        const newCache = new Map(prev);
        let changed = false;

        newCache.forEach((cachedUser, odUserId) => {
          if (
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

  // Convert cached users to array for display, excluding current user
  const displayUsers = Array.from(cachedUsers.values())
    .filter(
      (u) =>
        u.userId !== user?.userId &&
        u.username.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    // Sort: online users first, then by username
    .sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return a.username.localeCompare(b.username);
    });

  const onlineCount = displayUsers.filter((u) => u.isOnline).length;

  // Fetch conversation stats for visible users
  const { data: conversationStats } = useQuery({
    queryKey: [
      "conversations-stats",
      displayUsers.map((u) => u.userId).join(","),
    ],
    queryFn: async () => {
      if (displayUsers.length === 0) return {};
      const ids = displayUsers.map((u) => u.userId).join(",");
      const res = await fetch(`/api/conversations/stats?userIds=${ids}`);
      if (!res.ok) return {};
      return res.json() as Promise<
        Record<number, { lastMessage: any; unread: number }>
      >;
    },
    // Refresh often to show new messages/unread counts
    refetchInterval: 5000,
    enabled: displayUsers.length > 0,
  });

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

      {/* Global Chat Link */}
      <div className="p-4 border-b border-brand-border flex-shrink-0">
        <Link href="/global-chat">
          <Button variant="outline" className="w-full gap-2 border-brand-border hover:bg-brand-primary hover:text-black hover:border-brand-primary transition-all">
            <Globe className="h-4 w-4" />
            Global Chat
          </Button>
        </Link>
      </div>

      {/* Online Users List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-2">
          <div className="text-xs font-medium text-brand-muted uppercase tracking-wide px-2 py-2 flex items-center justify-between flex-shrink-0 sticky top-0 bg-brand-sidebar z-10">
            <span>Users</span>
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
                {searchTerm ? "No Users found" : "No Users available"}
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
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>
                        {displayUser.isGuest
                          ? "Guest"
                          : displayUser.isOnline
                            ? "Online"
                            : "Offline"}
                      </span>
                    </div>
                    {/* Last Message Preview */}
                    {conversationStats?.[displayUser.userId]?.lastMessage && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-[150px] opacity-70">
                        {conversationStats[displayUser.userId].lastMessage
                          .senderId === user?.userId
                          ? "You: "
                          : ""}
                        {
                          conversationStats[displayUser.userId].lastMessage
                            .message
                        }
                      </p>
                    )}
                  </div>

                  {/* Unread Badge */}
                  {conversationStats?.[displayUser.userId]?.unread ? (
                    <Badge
                      variant="destructive"
                      className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] flex-shrink-0 animate-in zoom-in"
                    >
                      {conversationStats[displayUser.userId].unread > 9
                        ? "9+"
                        : conversationStats[displayUser.userId].unread}
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
