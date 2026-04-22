import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Globe, Loader2, Search } from "lucide-react";
import type { GlobalMessageWithSender, User } from "@shared/schema";
import { useLocation } from "wouter";
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
  const { onlineUsers, isConnected } = useSocket();
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
          participant.user.username
            .toLowerCase()
            .includes(normalizedSearchTerm)),
    );
  }, [participants, searchTerm, user?.userId]);

  const onlineParticipantCount = participants.filter(
    (participant) => participant.isOnline,
  ).length;

  const handleNavigationSelect = (item: ChatNavigationItem) => {
    if (item === "chat" && location !== "/dashboard") {
      setLocation("/dashboard");
      return;
    }

    if (item === "random" && location !== "/random-chat") {
      setLocation("/random-chat");
      return;
    }

    if (item === "settings" && location !== "/settings") {
      setLocation("/settings");
      return;
    }

    if (item === "logout") {
      logoutMutation.mutate();
      return;
    }

    if (location !== "/global-chat") {
      setLocation("/global-chat");
    }
  };

  const handleParticipantSelect = (selectedUser: User) => {
    sessionStorage.setItem(
      PENDING_PRIVATE_CHAT_KEY,
      JSON.stringify(selectedUser),
    );
    setLocation("/dashboard");
  };

  return (
    <div className="h-full w-full overflow-hidden bg-background md:w-[28rem] md:shrink-0 md:border-r md:border-border">
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
          <div className="px-3 pb-2 pt-4 md:px-3 md:pb-2 md:pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <h1 className="truncate px-2 text-2xl font-semibold leading-none tracking-tight text-foreground">
                  Global Chat
                </h1>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3 md:mt-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search global users"
                  aria-label="Search global users"
                  className="h-11 rounded-full border-border bg-card pl-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 md:bg-muted"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 px-1">
              <Button
                type="button"
                size="sm"
                className="h-9 shrink-0 rounded-full px-4"
                onClick={onEnterRoom}
              >
                Go to Chat
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">
                  Users online now ({onlineParticipantCount})
                </h2>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[100px] pt-1 scrollbar-none md:px-3 md:pb-4">
            <div className="space-y-[2px]" role="list" aria-label="Global chat participants">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-[1.5rem] px-4 py-10 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Loading global participants...
                  </p>
                </div>
              ) : isError ? (
                <div className="rounded-[1.5rem] px-4 py-10 text-center text-sm text-destructive">
                  Failed to load global users
                </div>
              ) : filteredParticipants.length === 0 ? (
                <div className="rounded-[1.5rem] px-4 py-10 text-center text-sm text-muted-foreground">
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
  return (
    <button
      type="button"
      onClick={() => onSelect(participant.user)}
      className="flex w-full items-center gap-3 rounded-[1.2rem] px-3 py-2.5 text-left transition-colors hover:bg-accent/30"
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-black",
          !participant.isOnline && "opacity-70",
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
      <span className="truncate text-sm font-medium text-card-foreground">
        {participant.user.username}
      </span>
    </button>
  );
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
        <div className="flex h-[100dvh] flex-col bg-background text-foreground">
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
          <div className="hidden min-w-0 flex-1 items-center justify-center px-6 md:flex">
            <div className="w-full max-w-xl rounded-[1.8rem] p-8 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-[var(--brand-grad-start)] to-[var(--brand-grad-end)] text-black">
                <Globe className="h-7 w-7" />
              </div>
              <h6 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
                Click on Go to Chat button to join the global chat room.
              </h6>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
