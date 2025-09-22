import { useState } from "react";
import { UsersSidebar } from "@/components/users-sidebar";
import { ChatArea } from "@/components/chat-area";
import { User } from "@shared/schema";

export default function ChatDashboard() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
  };

  return (
    <div className="min-h-screen bg-background flex" data-testid="chat-dashboard">
      <UsersSidebar selectedUser={selectedUser} onUserSelect={handleUserSelect} />
      <ChatArea selectedUser={selectedUser} />
    </div>
  );
}
