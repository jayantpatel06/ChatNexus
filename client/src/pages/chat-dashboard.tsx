import { useState } from "react";
import { UsersSidebar } from "@/components/users-sidebar";
import { ChatArea } from "@/components/chat-area";
import { User } from "@shared/schema";
import { useIsMobile } from "@/hooks/use-mobile";
import { ActiveChatProvider, useActiveChat } from "@/hooks/use-active-chat";
import { useEffect } from "react";

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
      <ChatDashboardContent selectedUser={selectedUser} onUserSelect={handleUserSelect} onBack={handleBackToSidebar} />
    </ActiveChatProvider>
  );
}

function ChatDashboardContent({ selectedUser, onUserSelect, onBack }: { selectedUser: User | null, onUserSelect: (u: User) => void, onBack: () => void }) {
  const { setActiveUserId } = useActiveChat();
  const isMobile = useIsMobile();
  
  useEffect(() => {
    setActiveUserId(selectedUser?.userId ?? null);
  }, [selectedUser, setActiveUserId]);

  if (isMobile) {
    // On mobile, show either sidebar or chat area, not both
    if (selectedUser) {
      return (
        <div className="h-screen bg-background" data-testid="chat-dashboard">
          <ChatArea 
            selectedUser={selectedUser} 
            onBack={onBack}
            showBackButton={true}
          />
        </div>
      );
    } else {
      return (
        <div className="h-screen bg-background" data-testid="chat-dashboard">
          <UsersSidebar selectedUser={selectedUser} onUserSelect={onUserSelect} />
        </div>
      );
    }
  }

  // Desktop layout - show both sidebar and chat area
  return (
    <div className="h-screen bg-background flex" data-testid="chat-dashboard">
      <UsersSidebar selectedUser={selectedUser} onUserSelect={onUserSelect} />
      <ChatArea 
        selectedUser={selectedUser} 
        onBack={onBack}
        showBackButton={true}
      />
    </div>
  );
}
