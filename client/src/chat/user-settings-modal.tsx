import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { useSocket } from "@/providers/socket-provider";
import { apiRequest, readJsonResponse } from "@/lib/api-client";
import { queryClient } from "@/lib/queryClient";
import {
  getPushSubscriptionStatus,
  isPushNotificationsSupported,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/lib/push-notifications";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggleButton2 } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn, getAvatarColor, getUserInitials } from "@/lib/utils";
import type { SelfUserProfile, User } from "@shared/schema";
import {
  Ban,
  Bell,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Shield,
  ShieldOff,
  Volume2,
  UserPlus,
} from "lucide-react";

type SettingsSection = "profile" | "preferences" | "safety";

type BlockedUsersResponse = {
  users: User[];
};

const DEFAULT_SETTINGS_PREFERENCES = {
  pushNotifications: false,
  notificationSound: true,
  allowFriendRequests: true,
};

type PreferenceKey = keyof typeof DEFAULT_SETTINGS_PREFERENCES;

function MinimalCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-card/50 p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ProfileSection({
  isGuestUser,
  isSaving,
  newUsername,
  newAge,
  usernameError,
  ageError,
  onUsernameChange,
  onAgeChange,
}: {
  isGuestUser: boolean;
  isSaving: boolean;
  newUsername: string;
  newAge: string;
  usernameError: string;
  ageError: string;
  onUsernameChange: (value: string) => void;
  onAgeChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="username" className="text-xs font-semibold">
            Name
          </Label>
          <Input
            id="username"
            type="text"
            value={newUsername}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder="Your name"
            disabled={isSaving || isGuestUser}
            className={cn(
              "h-10 rounded-lg text-sm",
              usernameError && "border-destructive",
            )}
          />
          {usernameError && (
            <p className="text-xs text-destructive">{usernameError}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="age" className="text-xs font-semibold">
            Age
          </Label>
          <Input
            id="age"
            type="number"
            inputMode="numeric"
            min={18}
            max={120}
            value={newAge}
            onChange={(e) => onAgeChange(e.target.value)}
            placeholder="18-120"
            disabled={isSaving || isGuestUser}
            className={cn(
              "h-10 rounded-lg text-sm",
              ageError && "border-destructive",
            )}
          />
          {ageError && <p className="text-xs text-destructive">{ageError}</p>}
        </div>
      </div>

      {isGuestUser && (
        <MinimalCard className="border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-2 text-xs">
            <Lock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span>Guest accounts cannot edit profile</span>
          </div>
        </MinimalCard>
      )}
    </div>
  );
}

function PreferencesSection({
  preferenceDraft,
  onPreferenceToggle,
  isPushNotificationsBusy,
}: {
  preferenceDraft: typeof DEFAULT_SETTINGS_PREFERENCES;
  onPreferenceToggle: (key: PreferenceKey, checked: boolean) => void;
  isPushNotificationsBusy: boolean;
}) {
  const preferences = [
    {
      key: "pushNotifications" as const,
      label: "Notifications",
      icon: Bell,
    },
    {
      key: "notificationSound" as const,
      label: "Sound",
      icon: Volume2,
    },
    {
      key: "allowFriendRequests" as const,
      label: "Friend requests",
      icon: UserPlus,
    },
  ];

  return (
    <div className="space-y-3">
      <MinimalCard className="space-y-2">
        {preferences.map((pref) => {
          const Icon = pref.icon;
          return (
            <div
              key={pref.key}
              className="flex items-center justify-between p-2 hover:bg-background/30 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{pref.label}</span>
              </div>
              <Switch
                checked={preferenceDraft[pref.key]}
                disabled={
                  pref.key === "pushNotifications" && isPushNotificationsBusy
                }
                onCheckedChange={(checked) =>
                  onPreferenceToggle(pref.key, checked)
                }
              />
            </div>
          );
        })}
      </MinimalCard>

      <MinimalCard className="flex items-center justify-between p-2">
        <span className="text-sm text-muted-foreground">Theme</span>
        <ThemeToggleButton2 className="shadow-none" />
      </MinimalCard>
    </div>
  );
}

function SafetySection({
  blockedUsers,
  isPending,
  isError,
  onUnblock,
  isUnblocking,
  unblockingUserId,
}: {
  blockedUsers: User[];
  isPending: boolean;
  isError: boolean;
  onUnblock: (blockedUserId: number) => void;
  isUnblocking: boolean;
  unblockingUserId: number | null;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Blocked ({blockedUsers.length})
      </h3>

      {isPending ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load</p>
      ) : blockedUsers.length === 0 ? (
        <MinimalCard>
          <p className="text-sm text-muted-foreground text-center py-4">
            No blocked users
          </p>
        </MinimalCard>
      ) : (
        <MinimalCard className="p-0 divide-y divide-border/50">
          {blockedUsers.map((user) => (
            <div
              key={user.userId}
              className="flex items-center justify-between p-3 hover:bg-background/30 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-8 w-8 rounded-lg text-xs font-semibold text-white flex-shrink-0"
                  style={{
                    backgroundColor: user.isGuest
                      ? "#6b7280"
                      : getAvatarColor(user.username),
                  }}
                >
                  {getUserInitials(user.username)}
                </div>
                <span className="text-sm truncate">{user.username}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onUnblock(user.userId)}
                disabled={isUnblocking && unblockingUserId === user.userId}
                className="h-7 w-7 rounded-lg"
              >
                {isUnblocking && unblockingUserId === user.userId ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ShieldOff className="h-3 w-3" />
                )}
              </Button>
            </div>
          ))}
        </MinimalCard>
      )}
    </div>
  );
}

export function UserSettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, updateUser, logoutMutation } = useAuth();
  const { isConnected } = useSocket();
  const { toast } = useToast();
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("profile");
  const [preferenceDraft, setPreferenceDraft] = useState(
    DEFAULT_SETTINGS_PREFERENCES,
  );
  const [newUsername, setNewUsername] = useState(user?.username || "");
  const [newAge, setNewAge] = useState(
    user?.age != null ? String(user.age) : "",
  );
  const [usernameError, setUsernameError] = useState("");
  const [ageError, setAgeError] = useState("");

  const profileQuery = useQuery({
    queryKey: ["/api/user/profile"],
    enabled: open && !!user,
    queryFn: async () =>
      readJsonResponse<SelfUserProfile>(
        await apiRequest("GET", "/api/user/profile"),
      ),
    staleTime: 0,
  });

  const blockedUsersQuery = useQuery({
    queryKey: ["/api/users/blocked"],
    enabled: open && !!user,
    queryFn: async () =>
      readJsonResponse<BlockedUsersResponse>(
        await apiRequest("GET", "/api/users/blocked"),
      ),
    staleTime: 0,
  });

  const pushSubscriptionStatusQuery = useQuery({
    queryKey: ["/api/notifications/push-subscription"],
    enabled: open && !!user && !user.isGuest && isPushNotificationsSupported(),
    queryFn: getPushSubscriptionStatus,
    staleTime: 0,
  });

  const profile = profileQuery.data ?? (user ? { ...user, gmail: null } : null);
  const isGuestUser = user?.isGuest ?? false;
  const blockedUsers = blockedUsersQuery.data?.users ?? [];

  useEffect(() => {
    setNewUsername(user?.username || "");
    setNewAge(user?.age != null ? String(user.age) : "");
  }, [user?.age, user?.username]);

  useEffect(() => {
    if (!open) return;
    setActiveSection("profile");
    setPreferenceDraft(DEFAULT_SETTINGS_PREFERENCES);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPreferenceDraft((prev) => ({
      ...prev,
      pushNotifications:
        !!pushSubscriptionStatusQuery.data?.enabled && !isGuestUser,
    }));
  }, [isGuestUser, open, pushSubscriptionStatusQuery.data?.enabled]);

  useEffect(() => {
    if (!open || !profileQuery.data) return;
    setNewUsername(profileQuery.data.username || "");
    setNewAge(
      profileQuery.data.age != null ? String(profileQuery.data.age) : "",
    );
    setUsernameError("");
    setAgeError("");
  }, [open, profileQuery.data]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { username: string; age: number }) => {
      const res = await apiRequest("PUT", "/api/user/profile", data);
      return readJsonResponse<{
        user: User;
        profile: SelfUserProfile;
        token: string;
      }>(res);
    },
    onSuccess: (data) => {
      updateUser(data.user, data.token);
      queryClient.setQueryData(["/api/user"], data.user);
      queryClient.setQueryData(["/api/user/profile"], data.profile);
      toast({
        title: "Profile saved",
        description: "Changes updated.",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      if (
        error.message.includes("Username already exists") ||
        error.message.includes("taken")
      ) {
        setUsernameError("Username taken");
      }
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unblockUserMutation = useMutation({
    mutationFn: async (blockedUserId: number) => {
      const res = await apiRequest(
        "DELETE",
        `/api/users/${blockedUserId}/block`,
      );
      return readJsonResponse<{ unblocked: boolean }>(res);
    },
    onSuccess: (_data, blockedUserId) => {
      queryClient.setQueryData<BlockedUsersResponse>(
        ["/api/users/blocked"],
        (current) => ({
          users: (current?.users ?? []).filter(
            (u) => u.userId !== blockedUserId,
          ),
        }),
      );
      void queryClient.invalidateQueries({
        queryKey: ["/api/users/friends"],
      });
      toast({
        title: "Unblocked",
        description: "User can appear in your sidebar again.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to unblock",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const pushNotificationsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled) {
        await subscribeToPushNotifications();
      } else {
        await unsubscribeFromPushNotifications();
      }
    },
    onSuccess: (_data, enabled) => {
      queryClient.setQueryData(["/api/notifications/push-subscription"], {
        enabled,
        count: enabled ? 1 : 0,
      });
      setPreferenceDraft((prev) => ({
        ...prev,
        pushNotifications: enabled,
      }));
      toast({
        title: enabled ? "Notifications enabled" : "Notifications disabled",
        description: enabled
          ? "Friend messages will notify you when you are offline."
          : "Push notifications are turned off for this device.",
      });
    },
    onError: (error: Error) => {
      setPreferenceDraft((prev) => ({
        ...prev,
        pushNotifications: !!pushSubscriptionStatusQuery.data?.enabled,
      }));
      toast({
        title: "Notification update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (user?.isGuest) return;

    const trimmedUsername = newUsername.trim();
    const parsedAge = Number(newAge);

    if (!trimmedUsername) {
      setUsernameError("Name required");
      return;
    }
    if (trimmedUsername.length < 2) {
      setUsernameError("Min 2 characters");
      return;
    }
    if (trimmedUsername.length > 20) {
      setUsernameError("Max 20 characters");
      return;
    }
    if (!newAge.trim()) {
      setAgeError("Age required");
      return;
    }
    if (!Number.isInteger(parsedAge) || parsedAge < 18 || parsedAge > 120) {
      setAgeError("18-120");
      return;
    }
    if (trimmedUsername === user?.username && parsedAge === user?.age) {
      toast({
        title: "No changes",
        description: "Update your info first.",
      });
      return;
    }

    setUsernameError("");
    setAgeError("");
    updateProfileMutation.mutate({ username: trimmedUsername, age: parsedAge });
  };

  const handleCancel = () => {
    setNewUsername(profile?.username || user?.username || "");
    setNewAge(
      profile?.age != null
        ? String(profile.age)
        : user?.age != null
          ? String(user.age)
          : "",
    );
    setUsernameError("");
    setAgeError("");
    onOpenChange(false);
  };

  const isSaving = updateProfileMutation.isPending;
  const unblockingUserId = unblockUserMutation.isPending
    ? unblockUserMutation.variables
    : null;

  const sections: Array<{ id: SettingsSection; label: string }> = [
    { id: "profile", label: "Profile" },
    { id: "preferences", label: "Settings" },
    { id: "safety", label: "Blocked" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100dvh-1.5rem)] max-h-[600px] w-[calc(100vw-1rem)] max-w-lg overflow-hidden rounded-2xl border border-border/50 bg-background/98 p-0 shadow-lg backdrop-blur-xl sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your account</DialogDescription>
        </DialogHeader>

        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b border-border/30 px-5 py-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{
                  backgroundColor: isGuestUser
                    ? "#6b7280"
                    : getAvatarColor(newUsername),
                }}
              >
                {getUserInitials(newUsername || "User")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-sm">{newUsername}</p>
                <p className="text-xs text-muted-foreground">
                  {isGuestUser ? "Guest" : "Registered"}
                </p>
              </div>
              
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-border/30 px-5 py-2.5 overflow-x-auto">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors",
                  activeSection === section.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {section.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            {activeSection === "profile" ? (
              <form
                onSubmit={handleSubmit}
                className="flex h-full flex-col gap-4"
              >
                <ProfileSection
                  isGuestUser={isGuestUser}
                  isSaving={isSaving}
                  newUsername={newUsername}
                  newAge={newAge}
                  usernameError={usernameError}
                  ageError={ageError}
                  onUsernameChange={(value) => {
                    setNewUsername(value);
                    if (usernameError) setUsernameError("");
                  }}
                  onAgeChange={(value) => {
                    setNewAge(value);
                    if (ageError) setAgeError("");
                  }}
                />
                <div className="flex gap-2 border-t border-border/30 pt-3 -mx-5 px-5 pb-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="flex-1 h-10 rounded-lg"
                  >
                    Close
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      isSaving ||
                      !newUsername.trim() ||
                      !newAge.trim() ||
                      isGuestUser
                    }
                    className="flex-1 h-10 rounded-lg"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving
                      </>
                    ) : isGuestUser ? (
                      <>
                        <Lock className="mr-2 h-4 w-4" />
                        Locked
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </form>
            ) : activeSection === "preferences" ? (
              <PreferencesSection
                preferenceDraft={preferenceDraft}
                isPushNotificationsBusy={
                  pushSubscriptionStatusQuery.isFetching ||
                  pushNotificationsMutation.isPending
                }
                onPreferenceToggle={(key, checked) => {
                  if (key === "pushNotifications") {
                    if (isGuestUser) {
                      toast({
                        title: "Notifications unavailable",
                        description:
                          "Register an account and add friends to use message notifications.",
                      });
                      return;
                    }

                    if (!isPushNotificationsSupported()) {
                      toast({
                        title: "Notifications unsupported",
                        description:
                          "This browser or device does not support push notifications.",
                        variant: "destructive",
                      });
                      return;
                    }

                    setPreferenceDraft((prev) => ({
                      ...prev,
                      pushNotifications: checked,
                    }));
                    pushNotificationsMutation.mutate(checked);
                    return;
                  }

                  setPreferenceDraft((prev) => ({
                    ...prev,
                    [key]: checked,
                  }));
                }}
              />
            ) : (
              <SafetySection
                blockedUsers={blockedUsers}
                isPending={blockedUsersQuery.isPending}
                isError={blockedUsersQuery.isError}
                onUnblock={(blockedUserId) =>
                  unblockUserMutation.mutate(blockedUserId)
                }
                isUnblocking={unblockUserMutation.isPending}
                unblockingUserId={unblockingUserId}
              />
            )}
          </div>

          {/* Status & Actions Footer */}
          <div className="border-t border-border/30 px-5 py-3 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block w-2 h-2 rounded-full",
                  isConnected ? "bg-emerald-500" : "bg-amber-500",
                )}
              />
              <span>{isConnected ? "Connected" : "Reconnecting"}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                logoutMutation.mutate();
              }}
              disabled={logoutMutation.isPending || isSaving}
              className="h-8 px-3 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {logoutMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <LogOut className="h-3 w-3 mr-1.5" />
                  <span className="text-xs">Sign out</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
