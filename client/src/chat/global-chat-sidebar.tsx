import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Globe, Loader2, Search } from "lucide-react";
import { format } from "date-fns";
import type { GlobalMessageWithSender, User } from "@shared/schema";
import { useLocation } from "wouter";
import { navigateWithinAppShell } from "@/app/app-shell-navigation";
import { GlobalChatRoomPanel } from "@/chat/global-chat-room-panel";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { Seo } from "@/components/seo";
import { useAuth } from "@/providers/auth-provider";
import { useSocket } from "@/providers/socket-provider";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ChatNavigationMenu,
  type ChatNavigationItem,
} from "@/chat/chat-navigation-menu";
import { ChatDesktopShellPlaceholder } from "@/chat/chat-desktop-shell-placeholder";
import { ChatPageHeader } from "@/chat/chat-page-header";
import { cn, getAvatarColor, getUserInitials } from "@/lib/utils";

const GLOBAL_MESSAGES_QUERY_KEY = ["/api/global-messages?limit=200"] as const;
const PENDING_PRIVATE_CHAT_KEY = "chatnexus_pending_private_chat";

type GlobalParticipant = {
  isOnline: boolean;
  lastMessage: GlobalMessageWithSender;
  user: User;
};

type GlobalChatSidebarProps = {
  onEnterRoom: () => void;
};

export function GlobalChatSidebar({ onEnterRoom }: GlobalChatSidebarProps) {
  const { user, logoutMutation } = useAuth();
  const { onlineUsers } = useSocket();
  const [location, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const {
    data: messages = [],
    isLoading,
    isError,
  } = useQuery<GlobalMessageWithSender[]>({
    queryKey: GLOBAL_MESSAGES_QUERY_KEY,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const onlineUserIds = useMemo(
    () => new Set(onlineUsers.map((onlineUser) => onlineUser.userId)),
    [onlineUsers],
  );

  const participants = useMemo<GlobalParticipant[]>(() => {
    const latestByUserId = new Map<number, GlobalMessageWithSender>();

    messages.forEach((message) => {
      if (!message.sender) {
        return;
      }

      latestByUserId.set(message.senderId, message);
    });

    return Array.from(latestByUserId.values())
      .map((message) => ({
        user: message.sender,
        lastMessage: message,
        isOnline: onlineUserIds.has(message.senderId) || message.sender.isOnline,
      }))
      .sort((leftParticipant, rightParticipant) => {
        const onlineDelta =
          Number(rightParticipant.isOnline) - Number(leftParticipant.isOnline);
        if (onlineDelta !== 0) {
          return onlineDelta;
        }

        const timestampDelta =
          new Date(rightParticipant.lastMessage.timestamp).getTime() -
          new Date(leftParticipant.lastMessage.timestamp).getTime();
        if (!Number.isNaN(timestampDelta) && timestampDelta !== 0) {
          return timestampDelta;
        }

        return leftParticipant.user.username.localeCompare(
          rightParticipant.user.username,
        );
      });
  }, [messages, onlineUserIds]);

  const filteredParticipants = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();
    return participants.filter(
      (participant) =>
        participant.user.userId !== user?.userId &&
        (!normalizedSearchTerm ||
          participant.user.username.toLowerCase().includes(normalizedSearchTerm)),
    );
  }, [participants, searchTerm, user?.userId]);

  const handleNavigationSelect = (item: ChatNavigationItem) => {
    if (item === "chat" && location !== "/dashboard") {
      navigateWithinAppShell(location, "/dashboard", setLocation);
      return;
    }

    if (item === "random" && location !== "/random-chat") {
      navigateWithinAppShell(location, "/random-chat", setLocation);
      return;
    }

    if (item === "settings" && location !== "/settings") {
      navigateWithinAppShell(location, "/settings", setLocation);
      return;
    }

    if (item === "logout") {
      logoutMutation.mutate();
      return;
    }

    if (location !== "/global-chat") {
      navigateWithinAppShell(location, "/global-chat", setLocation);
    }
  };

  const handleParticipantSelect = (selectedUser: User) => {
    sessionStorage.setItem(
      PENDING_PRIVATE_CHAT_KEY,
      JSON.stringify(selectedUser),
    );
    navigateWithinAppShell(location, "/dashboard", setLocation);
  };

  return (
    <div className="h-full w-full overflow-hidden bg-background md:w-[26rem] md:shrink-0 md:border-r md:border-border">
      <div className="flex h-full w-full overflow-hidden bg-background">
        <div className="hidden md:flex md:shrink-0">
          <ChatNavigationMenu
            activeItem="global"
            onSelect={handleNavigationSelect}
            variant="rail"
            className="h-full"
          />
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col bg-background text-foreground md:overflow-hidden">
          <div className="px-4 pb-3 pt-4 md:px-4 md:pb-3 md:pt-4">
            <ChatPageHeader
              icon={Globe}
              title="Global Chat"
              onLogout={() => logoutMutation.mutate()}
              logoutPending={logoutMutation.isPending}
            />

            <div className="mt-3 flex items-center gap-3 md:mt-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search global users"
                  aria-label="Search global users"
                  className="h-11 rounded-full border-border bg-card pl-10 text-sm text-foreground md:bg-muted placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-1 scrollbar-none md:pb-5">
            <div
              className="overflow-hidden rounded-[1.6rem]"
              role="list"
              aria-label="Global chat participants"
            >
              {isLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Loading global participants...
                  </p>
                </div>
              ) : isError ? (
                <div className="px-4 py-10 text-center text-sm text-destructive">
                  Failed to load global users
                </div>
              ) : filteredParticipants.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {searchTerm.trim()
                    ? "No users found"
                    : "No users with global messages yet"}
                </div>
              ) : (
                filteredParticipants.map((participant) => (
                  <GlobalParticipantRow
                    key={participant.user.userId}
                    participant={participant}
                    onSelect={handleParticipantSelect}
                  />
                ))
              )}
            </div>
          </div>

          <Button
            type="button"
            size="icon"
            className="absolute bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-6 z-20 h-12 w-12 rounded-full shadow-[0_18px_45px_-20px_rgba(59,130,246,0.9)] md:bottom-5"
            onClick={onEnterRoom}
            title="Open global chat room"
          >
            <ArrowRight className="h-4.5 w-4.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function GlobalParticipantRow({
  participant,
  onSelect,
}: {
  participant: GlobalParticipant;
  onSelect: (user: User) => void;
}) {
  const activityTime = formatParticipantTimestamp(
    participant.lastMessage.timestamp,
  );

  return (
    <button
      type="button"
      onClick={() => onSelect(participant.user)}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/20"
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-black",
          !participant.isOnline && "opacity-80",
        )}
        style={{
          background: participant.user.isGuest
            ? "var(--brand-muted)"
            : getAvatarColor(participant.user.username),
        }}
      >
        {participant.user.isGuest
          ? "G"
          : getUserInitials(participant.user.username)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold text-card-foreground">
            {participant.user.username}
          </p>
          {activityTime ? (
            <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">
              {activityTime}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function formatParticipantTimestamp(timestamp: unknown): string {
  if (!timestamp) {
    return "";
  }

  const parsed = new Date(timestamp as string | number | Date);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const elapsedMs = Date.now() - parsed.getTime();
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const elapsedHours = Math.floor(elapsedMs / 3600000);
  const elapsedDays = Math.floor(elapsedMs / 86400000);

  if (elapsedMinutes <= 0) {
    return "now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  if (elapsedDays < 7) {
    return `${elapsedDays}d ago`;
  }

  return format(parsed, "MMM d");
}

export default function GlobalChatPage() {
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [showDesktopRoom, setShowDesktopRoom] = useState(false);

  const openGlobalRoom = () => {
    if (!isMobile) {
      setShowDesktopRoom(true);
      return;
    }

    if (location !== "/global-chat/room") {
      setLocation("/global-chat/room");
    }
  };

  const closeDesktopRoom = () => {
    setShowDesktopRoom(false);
  };

  if (isMobile) {
    return (
      <>
        <Seo
          title="Global Chat | ChatNexus"
          description="Discover who is active in the ChatNexus global room."
          path="/global-chat"
          robots="noindex, nofollow"
        />
        <div className="safe-top-shell flex h-[100dvh] flex-col bg-background text-foreground">
          <div className="min-h-0 flex-1 overflow-hidden">
            <GlobalChatSidebar onEnterRoom={openGlobalRoom} />
          </div>
          <MobileBottomNav />
        </div>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Global Chat | ChatNexus"
        description="Discover who is active in the ChatNexus global room."
        path="/global-chat"
        robots="noindex, nofollow"
      />
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <GlobalChatSidebar onEnterRoom={openGlobalRoom} />

        {showDesktopRoom ? (
          <GlobalChatRoomPanel isMobile={false} onBack={closeDesktopRoom} />
        ) : (
          <ChatDesktopShellPlaceholder
            icon={Globe}
            title="Use the floating button to open the public room."
          />
        )}
      </div>
    </>
  );
}
