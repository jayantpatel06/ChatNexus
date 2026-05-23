import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { ChatArea } from "./direct-chat-panel";
import { ActiveChatProvider, useActiveChat } from "./use-active-chat";
import { UsersSidebar } from "./direct-sidebar";
import { Seo } from "@/components/seo";
import { MobileBottomNav } from "@/features/shared/mobile-bottom-nav";
import { useIsMobile } from "@/hooks/use-mobile";
import type { User } from "@shared/schema";

const PENDING_PRIVATE_CHAT_KEY = "chatnexus_pending_private_chat";

export type PrivateChatPageMode = "chat" | "history";

function parsePublicUser(value: unknown): User | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const { userId, username, age, gender, isOnline, isGuest } = value as Record<
    string,
    unknown
  >;
  const hasValidAge =
    age === null ||
    (Number.isInteger(age) && (age as number) >= 18 && (age as number) <= 120);
  const hasValidGender =
    gender === null || (typeof gender === "string" && gender.length <= 10);

  if (
    !Number.isInteger(userId) ||
    (userId as number) <= 0 ||
    typeof username !== "string" ||
    username.length < 1 ||
    username.length > 50 ||
    !hasValidAge ||
    !hasValidGender ||
    typeof isOnline !== "boolean" ||
    typeof isGuest !== "boolean"
  ) {
    return null;
  }

  return {
    userId,
    username,
    age,
    gender,
    isOnline,
    isGuest,
  } as User;
}

export default function ChatDashboard() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [mode, setMode] = useState<PrivateChatPageMode>("chat");

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
  };

  const handleBackToSidebar = () => {
    setSelectedUser(null);
  };

  return (
    <ActiveChatProvider>
      <ChatDashboardContent
        mode={mode}
        onModeChange={setMode}
        selectedUser={selectedUser}
        onUserSelect={handleUserSelect}
        onBack={handleBackToSidebar}
      />
    </ActiveChatProvider>
  );
}

function ChatDashboardContent({
  mode,
  onModeChange,
  selectedUser,
  onUserSelect,
  onBack,
}: {
  mode: PrivateChatPageMode;
  onModeChange: (mode: PrivateChatPageMode) => void;
  selectedUser: User | null;
  onUserSelect: (user: User) => void;
  onBack: () => void;
}) {
  const { setActiveUserId } = useActiveChat();
  const isMobile = useIsMobile();
  const search = useSearch();

  useEffect(() => {
    setActiveUserId(selectedUser?.userId ?? null);
  }, [selectedUser, setActiveUserId]);

  useEffect(() => {
    if (mode !== "chat" || selectedUser) {
      return;
    }

    const pendingPrivateChat = sessionStorage.getItem(PENDING_PRIVATE_CHAT_KEY);
    if (!pendingPrivateChat) {
      return;
    }

    try {
      const user = parsePublicUser(JSON.parse(pendingPrivateChat));
      if (user) {
        onUserSelect(user);
      }
    } catch {
      // Ignore malformed storage values.
    } finally {
      sessionStorage.removeItem(PENDING_PRIVATE_CHAT_KEY);
    }
  }, [mode, onUserSelect, selectedUser]);

  useEffect(() => {
    if (mode !== "chat") return;

    const params = new URLSearchParams(search);
    const userIdParam = params.get("user");
    if (!userIdParam) return;

    const userId = parseInt(userIdParam, 10);
    const cleanedSearch = new URLSearchParams(search);
    cleanedSearch.delete("user");
    const nextSearch = cleanedSearch.toString();
    const newUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState({}, document.title, newUrl);

    if (isNaN(userId) || selectedUser?.userId === userId) return;

    import("@/lib/api-client").then(({ apiRequest, readJsonResponse }) => {
      apiRequest("GET", `/api/users/${userId}`)
        .then(readJsonResponse)
        .then((user) => {
          const parsedUser = parsePublicUser(user);
          if (parsedUser) {
            onUserSelect(parsedUser);
          }
        })
        .catch(console.error);
    });
  }, [mode, onUserSelect, search, selectedUser?.userId]);

  if (isMobile) {
    if (selectedUser) {
      return (
        <>
          <Seo
            title="Dashboard | ChatNexus"
            description="Protected chat dashboard inside ChatNexus."
            path="/direct"
            robots="noindex, nofollow"
          />
          <div
            className="safe-top-shell flex h-[100dvh] flex-col overflow-hidden bg-background"
            data-testid="chat-dashboard"
          >
            <ChatArea
              selectedUser={selectedUser}
              onBack={onBack}
              showBackButton={true}
            />
          </div>
        </>
      );
    }

    return (
      <>
        <Seo
          title="Dashboard | ChatNexus"
          description="Protected chat dashboard inside ChatNexus."
          path="/direct"
          robots="noindex, nofollow"
        />
        <div className="safe-top-shell flex h-[100dvh] flex-col bg-background" data-testid="chat-dashboard">
          <div className="flex-1 min-h-0 overflow-hidden">
            <UsersSidebar
              selectedUser={selectedUser}
              onUserSelect={onUserSelect}
              mode={mode}
              onModeChange={onModeChange}
            />
          </div>
          <MobileBottomNav />
        </div>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Dashboard | ChatNexus"
        description="Protected chat dashboard inside ChatNexus."
        path="/direct"
        robots="noindex, nofollow"
      />
      <div
        className="flex h-screen overflow-hidden bg-background text-foreground"
        data-testid="chat-dashboard"
      >
        <UsersSidebar
          selectedUser={selectedUser}
          onUserSelect={onUserSelect}
          mode={mode}
          onModeChange={onModeChange}
        />
        <ChatArea
          selectedUser={selectedUser}
          onBack={onBack}
          showBackButton={true}
        />
      </div>
    </>
  );
}
