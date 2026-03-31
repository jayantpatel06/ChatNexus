import { useState } from "react";
import { ChatArea } from "@/chat/chat-area";
import { User } from "@shared/schema";
import { useIsMobile } from "@/hooks/use-mobile";
import { ActiveChatProvider, useActiveChat } from "@/chat/use-active-chat";
import { useEffect } from "react";
import { Seo } from "@/components/seo";
import { UsersSidebar } from "@/chat/users-sidebar";

const PENDING_PRIVATE_CHAT_KEY = "chatnexus_pending_private_chat";

export default function ChatDashboard() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const isMobile = useIsMobile();

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
  };

  const handleBackToSidebar = () => {
    setSelectedUser(null);
  };

  return (
    <ActiveChatProvider>
      <ChatDashboardContent
        selectedUser={selectedUser}
        onUserSelect={handleUserSelect}
        onBack={handleBackToSidebar}
      />
    </ActiveChatProvider>
  );
}

function ChatDashboardContent({
  selectedUser,
  onUserSelect,
  onBack,
}: {
  selectedUser: User | null;
  onUserSelect: (u: User) => void;
  onBack: () => void;
}) {
  const { setActiveUserId } = useActiveChat();
  const isMobile = useIsMobile();

  useEffect(() => {
    setActiveUserId(selectedUser?.userId ?? null);
  }, [selectedUser, setActiveUserId]);

  useEffect(() => {
    if (selectedUser) return;

    const pendingPrivateChat = sessionStorage.getItem(PENDING_PRIVATE_CHAT_KEY);
    if (!pendingPrivateChat) return;

    try {
      onUserSelect(JSON.parse(pendingPrivateChat) as User);
    } catch {
      // Ignore malformed storage values.
    } finally {
      sessionStorage.removeItem(PENDING_PRIVATE_CHAT_KEY);
    }
  }, [selectedUser, onUserSelect]);

  if (isMobile) {
    // On mobile, show either sidebar or chat area, not both
    // Use h-[100dvh] for proper mobile viewport height (accounts for browser chrome)
    if (selectedUser) {
      return (
        <>
          <Seo
            title="Dashboard | ChatNexus"
            description="Protected chat dashboard inside ChatNexus."
            path="/dashboard"
            robots="noindex, nofollow"
          />
          <div
            className="h-[100dvh] bg-brand-bg flex flex-col overflow-hidden"
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
    } else {
      return (
        <>
          <Seo
            title="Dashboard | ChatNexus"
            description="Protected chat dashboard inside ChatNexus."
            path="/dashboard"
            robots="noindex, nofollow"
          />
          <div className="h-[100dvh] bg-brand-bg" data-testid="chat-dashboard">
            <UsersSidebar
              selectedUser={selectedUser}
              onUserSelect={onUserSelect}
            />
          </div>
        </>
      );
    }
  }

  // Desktop layout - show both sidebar and chat area
  return (
    <>
      <Seo
        title="Dashboard | ChatNexus"
        description="Protected chat dashboard inside ChatNexus."
        path="/dashboard"
        robots="noindex, nofollow"
      />
      <div className="h-screen bg-brand-bg flex" data-testid="chat-dashboard">
        <UsersSidebar selectedUser={selectedUser} onUserSelect={onUserSelect} />
        <ChatArea
          selectedUser={selectedUser}
          onBack={onBack}
          showBackButton={true}
        />
      </div>
    </>
  );
}
