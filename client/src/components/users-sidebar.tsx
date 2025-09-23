import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User } from "@shared/schema";
import { UserSettingsModal } from "@/components/user-settings-modal";
import { Search, Settings, LogOut, User as UserIcon } from "lucide-react";

interface UsersSidebarProps {
  selectedUser: User | null;
  onUserSelect: (user: User) => void;
}

export function UsersSidebar({ selectedUser, onUserSelect }: UsersSidebarProps) {
  const { user, logoutMutation } = useAuth();
  const { onlineUsers, isConnected } = useSocket();
  const [searchTerm, setSearchTerm] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const filteredUsers = onlineUsers.filter(u => 
    u.userId !== user?.userId && 
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getUserInitials = (username: string) => {
    return username.slice(0, 2).toUpperCase();
  };

  const getAvatarColor = (username: string) => {
    const colors = [
      "from-blue-500 to-purple-500",
      "from-green-500 to-teal-500",
      "from-orange-500 to-red-500",
      "from-purple-500 to-pink-500",
      "from-indigo-500 to-blue-500",
      "from-yellow-500 to-orange-500",
    ];
    const index = username.length % colors.length;
    return colors[index];
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="w-full md:w-80 bg-card border-r border-border flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">ChatNexus</h2>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-gray-300 text-black flex items-center gap-1" data-testid="text-connection-status">
              <div className={`w-2 h-2 bg-green-600 rounded-full ${isConnected ? 'animate-pulse' : 'bg-red-600'}`}></div>
              {isConnected ? 'Online' : 'Offline'}
            </Badge>
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
          <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
            <div className="relative">
              <div className={`w-10 h-10 ${user.isGuest ? 'bg-gray-500' : 'bg-primary'} text-white rounded-full flex items-center justify-center font-medium`}>
                {user.isGuest ? 'G' : getUserInitials(user.username)}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-card rounded-full"></div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate" data-testid="text-current-username">{user.username}</p>
              <p className="text-xs text-muted-foreground">{user.isGuest ? 'Guest' : 'Member'}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} title="Logout" data-testid="button-logout">
              <LogOut className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </Button>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search User"
            className="pl-10 bg-gray-200 text-black placeholder:text-muted-foreground"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-users"
          />
        </div>
      </div>

      {/* Online Users List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 py-2 flex items-center justify-between flex-shrink-0 sticky top-0 bg-card z-10">
            <span>Online Users</span>
            <Badge variant="secondary" className="bg-gray-200 text-black" data-testid="text-online-count">
              {filteredUsers.length}
            </Badge>
          </div>
          
          <div className="space-y-1">
            {filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                {searchTerm ? 'No Users found' : 'No Users online'}
              </div>
            ) : (
              filteredUsers.map((onlineUser) => (
                <Button
                  key={onlineUser.userId}
                  variant="ghost"
                  className={`w-full flex items-center gap-3 p-2 h-auto justify-start ${
                    selectedUser?.userId === onlineUser.userId ? 'bg-gray-400 text-white' : 'bg-transparent text-black'
                  }`}
                  onClick={() => onUserSelect(onlineUser)}
                  data-testid={`button-user-${onlineUser.userId}`}
                >
                  <div className="relative">
                    <div className={`w-8 h-8 ${onlineUser.isGuest ? 'bg-gray-500' : `bg-gradient-to-br ${getAvatarColor(onlineUser.username)}`} text-white rounded-full flex items-center justify-center text-sm font-medium`}>
                      {onlineUser.isGuest ? 'G' : getUserInitials(onlineUser.username)}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-card rounded-full"></div>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-medium text-foreground text-sm truncate" data-testid={`text-username-${onlineUser.userId}`}>
                      {onlineUser.username}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {onlineUser.isGuest && <UserIcon className="w-3 h-3" />}
                      <span>{onlineUser.isGuest ? 'Guest' : 'Online'}</span>
                    </div>
                  </div>
                  <div className={`${selectedUser?.userId === onlineUser.userId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                  </div>
                </Button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <UserSettingsModal 
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
