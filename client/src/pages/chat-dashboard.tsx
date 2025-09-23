import { useState } from "react";
import { UsersSidebar } from "@/components/users-sidebar";
import { ChatArea } from "@/components/chat-area";
import { User } from "@shared/schema";
import { useIsMobile } from "@/hooks/use-mobile";

export default function ChatDashboard() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const isMobile = useIsMobile();

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
  };

  const handleBackToSidebar = () => {
    setSelectedUser(null);
  };

  if (isMobile) {
    // On mobile, show either sidebar or chat area, not both
    if (selectedUser) {
      return (
        <div className="min-h-screen bg-background" data-testid="chat-dashboard">
          <ChatArea 
            selectedUser={selectedUser} 
            onBack={handleBackToSidebar}
            showBackButton={true}
          />
        </div>
      );
    } else {
      return (
        <div className="min-h-screen bg-background" data-testid="chat-dashboard">
          <UsersSidebar selectedUser={selectedUser} onUserSelect={handleUserSelect} />
        </div>
      );
    }
  }

  // Desktop layout - show both sidebar and chat area
  return (
    <div className="min-h-screen bg-background flex" data-testid="chat-dashboard">
      <UsersSidebar selectedUser={selectedUser} onUserSelect={handleUserSelect} />
      <ChatArea 
        selectedUser={selectedUser} 
        onBack={handleBackToSidebar}
        showBackButton={false}
      />
    </div>
  );
}
