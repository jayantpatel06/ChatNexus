import { useEffect, useState } from "react";
import { ChatArea } from "@/chat/chat-area";
import { ActiveChatProvider, useActiveChat } from "@/chat/use-active-chat";
import { UsersSidebar } from "@/chat/users-sidebar";
import { Seo } from "@/components/seo";
import { useIsMobile } from "@/hooks/use-mobile";
import { publicUserSchema, type User } from "@shared/schema";

const PENDING_PRIVATE_CHAT_KEY = "chatnexus_pending_private_chat";

type PrivateChatPageMode = "chat" | "history";

type PrivateChatPageShellProps = {
  mode: PrivateChatPageMode;
  title: string;
  description: string;
  path: string;
  testId: string;
};

export function PrivateChatPageShell({
  mode,
  title,
  description,
  path,
  testId,
}: PrivateChatPageShellProps) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
  };

  const handleBackToSidebar = () => {
    setSelectedUser(null);
  };

  return (
    <ActiveChatProvider>
      <PrivateChatPageShellContent
        mode={mode}
        title={title}
        description={description}
        path={path}
        testId={testId}
        selectedUser={selectedUser}
        onUserSelect={handleUserSelect}
        onBack={handleBackToSidebar}
      />
    </ActiveChatProvider>
  );
}

function PrivateChatPageShellContent({
  mode,
  title,
  description,
  path,
  testId,
  selectedUser,
  onUserSelect,
  onBack,
}: PrivateChatPageShellProps & {
  selectedUser: User | null;
  onUserSelect: (user: User) => void;
  onBack: () => void;
}) {
  const { setActiveUserId } = useActiveChat();
  const isMobile = useIsMobile();

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
      onUserSelect(publicUserSchema.parse(JSON.parse(pendingPrivateChat)));
    } catch {
      // Ignore malformed storage values.
    } finally {
      sessionStorage.removeItem(PENDING_PRIVATE_CHAT_KEY);
    }
  }, [mode, onUserSelect, selectedUser]);

  if (isMobile) {
    if (selectedUser) {
      return (
        <>
          <Seo
            title={title}
            description={description}
            path={path}
            robots="noindex, nofollow"
          />
          <div
            className="flex h-[100dvh] flex-col overflow-hidden bg-brand-bg"
            data-testid={testId}
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
          title={title}
          description={description}
          path={path}
          robots="noindex, nofollow"
        />
        <div className="h-[100dvh] bg-brand-bg" data-testid={testId}>
          <UsersSidebar
            selectedUser={selectedUser}
            onUserSelect={onUserSelect}
            mode={mode}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Seo
        title={title}
        description={description}
        path={path}
        robots="noindex, nofollow"
      />
      <div
        className="flex h-screen bg-brand-bg text-brand-text"
        data-testid={testId}
      >
        <UsersSidebar
          selectedUser={selectedUser}
          onUserSelect={onUserSelect}
          mode={mode}
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
