import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Settings2, Loader2, Lock } from "lucide-react";

interface UserSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UpdateUsernameRequest {
  username: string;
}

export function UserSettingsModal({
  open,
  onOpenChange,
}: UserSettingsModalProps) {
  const { user, updateToken } = useAuth();
  const { forceReconnect } = useSocket();
  const { toast } = useToast();
  const [newUsername, setNewUsername] = useState(user?.username || "");
  const [usernameError, setUsernameError] = useState("");

  const updateUsernameMutation = useMutation({
    mutationFn: async (data: UpdateUsernameRequest) => {
      const res = await apiRequest("PUT", "/api/user/username", data);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return (await res.json()) as { user: any; token: string };
    },
    onSuccess: (data) => {
      // Update the token in auth context (username is encoded in JWT)
      if (data.token) {
        updateToken(data.token);
      }
      // Update the user data in the query cache
      queryClient.setQueryData(["/api/user"], data.user);
      // Force socket reconnection to update online status with new token
      forceReconnect();
      toast({
        title: "Username updated",
        description: `Your username has been changed to ${data.user.username}`,
      });
      onOpenChange(false);
      setUsernameError("");
    },
    onError: (error: Error) => {
      if (
        error.message.includes("Username already exists") ||
        error.message.includes("taken")
      ) {
        setUsernameError(
          "This username is already taken. Please choose a different one.",
        );
      } else {
        setUsernameError(error.message || "Failed to update username");
      }
      toast({
        title: "Failed to update username",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedUsername = newUsername.trim();

    if (!trimmedUsername) {
      setUsernameError("Username cannot be empty");
      return;
    }

    if (trimmedUsername.length < 2) {
      setUsernameError("Username must be at least 2 characters long");
      return;
    }

    if (trimmedUsername.length > 20) {
      setUsernameError("Username must be less than 20 characters");
      return;
    }

    if (trimmedUsername === user?.username) {
      setUsernameError("Please choose a different username");
      return;
    }

    setUsernameError("");
    updateUsernameMutation.mutate({ username: trimmedUsername });
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewUsername(e.target.value);
    if (usernameError) {
      setUsernameError("");
    }
  };

  const handleCancel = () => {
    setNewUsername(user?.username || "");
    setUsernameError("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            User Settings
          </DialogTitle>
          <DialogDescription>
            Update your profile settings and preferences.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium">
              Username
            </Label>
            <div className="space-y-1">
              <Input
                id="username"
                type="text"
                value={newUsername}
                onChange={handleUsernameChange}
                placeholder="Enter new username"
                disabled={updateUsernameMutation.isPending || user?.isGuest}
                className={usernameError ? "border-destructive" : ""}
                data-testid="input-new-username"
              />
              {usernameError && (
                <p
                  className="text-sm text-destructive"
                  data-testid="error-username"
                >
                  {usernameError}
                </p>
              )}
              {user?.isGuest && (
                <p className="text-sm text-muted-foreground">
                  Register an account to change your username
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="relative">
              <div
                className={`w-10 h-10 ${user?.isGuest ? "bg-gray-500" : "bg-primary"} text-white rounded-full flex items-center justify-center font-medium`}
              >
                {user?.isGuest
                  ? "G"
                  : user?.username?.slice(0, 2).toUpperCase()}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-card rounded-full"></div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">
                {newUsername || "Username"}
              </p>
              <p className="text-xs text-muted-foreground">
                {user?.isGuest ? "Guest Account" : "Member Account"}
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={updateUsernameMutation.isPending}
              className="flex-1"
              data-testid="button-cancel-settings"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                updateUsernameMutation.isPending ||
                !newUsername.trim() ||
                user?.isGuest
              }
              className="flex-1"
              data-testid="button-save-settings"
            >
              {updateUsernameMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : user?.isGuest ? (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
