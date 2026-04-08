import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { useSocket } from "@/providers/socket-provider";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";
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
  Settings2,
  ShieldOff,
  SlidersHorizontal,
  User as UserIcon,
  UserPlus,
  Volume2,
} from "lucide-react";

type SettingsSection = "profile" | "preferences" | "blocked";

type BlockedUsersResponse = {
  users: User[];
};

const DEFAULT_SETTINGS_PREFERENCES = {
  pushNotifications: true,
  notificationSound: true,
  allowFriendRequests: true,
} as const;

type PreferenceKey = keyof typeof DEFAULT_SETTINGS_PREFERENCES;

const settingsSections = [
  { id: "profile" as const, label: "Profile", icon: UserIcon },
  {
    id: "preferences" as const,
    label: "Preferences",
    icon: SlidersHorizontal,
  },
  { id: "blocked" as const, label: "Blocked", icon: Ban },
];

const preferenceItems = [
  {
    key: "pushNotifications" as const,
    label: "Push notifications",
    description: "Visual toggle for message and activity alerts.",
    icon: Bell,
  },
  {
    key: "notificationSound" as const,
    label: "Notification sound",
    description: "Preview how in-app sounds will be grouped here later.",
    icon: Volume2,
  },
  {
    key: "allowFriendRequests" as const,
    label: "Allow friend requests",
    description:
      "Layout placeholder for controlling whether others can send requests.",
    icon: UserPlus,
  },
];

function BlockedUsersPanel({
  blockedUsers,
  isPending,
  isError,
  onUnblock,
  isUnblocking,
  unblockingUserId,
  onClose,
}: {
  blockedUsers: User[];
  isPending: boolean;
  isError: boolean;
  onUnblock: (blockedUserId: number) => void;
  isUnblocking: boolean;
  unblockingUserId: number | null;
  onClose?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-muted/25 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Blocked users</Label>
            <p className="text-xs text-muted-foreground">
              Unblock people here if you want them to appear in your sidebar
              again.
            </p>
          </div>
          <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {blockedUsers.length}
          </span>
        </div>
      </div>

      {isPending ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading blocked users...
        </div>
      ) : blockedUsers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
          You have not blocked anyone.
        </div>
      ) : (
        <div className="space-y-2">
          {blockedUsers.map((blockedUser) => {
            const blockedSubtitleParts = [
              blockedUser.gender || null,
              blockedUser.age != null ? `${blockedUser.age}` : null,
              blockedUser.isGuest ? "Guest" : "Registered",
            ].filter(Boolean);

            return (
              <div
                key={blockedUser.userId}
                className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-background/70 px-3 py-2"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold text-white"
                  style={{
                    backgroundColor: blockedUser.isGuest
                      ? "#6b7280"
                      : getAvatarColor(blockedUser.username),
                  }}
                >
                  {getUserInitials(blockedUser.username)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {blockedUser.username}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {blockedSubtitleParts.join(" / ")}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onUnblock(blockedUser.userId)}
                  disabled={isUnblocking && unblockingUserId === blockedUser.userId}
                  className="shrink-0"
                  data-testid={`button-unblock-user-${blockedUser.userId}`}
                >
                  {isUnblocking && unblockingUserId === blockedUser.userId ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Unblocking...
                    </>
                  ) : (
                    <>
                      <ShieldOff className="mr-2 h-4 w-4" />
                      Unblock
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">Failed to load blocked users.</p>
      )}

      {onClose ? (
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            data-testid="button-close-settings-blocked"
          >
            Close
          </Button>
        </div>
      ) : null}
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
  const { socket, isConnected } = useSocket();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [preferenceDraft, setPreferenceDraft] = useState(
    DEFAULT_SETTINGS_PREFERENCES,
  );
  const [newUsername, setNewUsername] = useState(user?.username || "");
  const [newAge, setNewAge] = useState(user?.age != null ? String(user.age) : "");
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

  const profile = profileQuery.data ?? (user ? { ...user, gmail: null } : null);
  const isGuestUser = user?.isGuest ?? false;
  const blockedUsers = blockedUsersQuery.data?.users ?? [];

  useEffect(() => {
    setNewUsername(user?.username || "");
    setNewAge(user?.age != null ? String(user.age) : "");
  }, [user?.age, user?.username]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveSection("profile");
    setPreferenceDraft(DEFAULT_SETTINGS_PREFERENCES);
  }, [open]);

  useEffect(() => {
    if (!open || !profileQuery.data) {
      return;
    }

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
        title: "Profile updated",
        description: "Your profile details have been saved.",
      });
      onOpenChange(false);
      setUsernameError("");
      setAgeError("");
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
        setUsernameError("");
      }

      toast({
        title: "Failed to update profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unblockUserMutation = useMutation({
    mutationFn: async (blockedUserId: number) => {
      const res = await apiRequest("DELETE", `/api/users/${blockedUserId}/block`);
      return readJsonResponse<{ unblocked: boolean }>(res);
    },
    onSuccess: (_data, blockedUserId) => {
      queryClient.setQueryData<BlockedUsersResponse>(
        ["/api/users/blocked"],
        (current) => ({
          users: (current?.users ?? []).filter(
            (blockedUser) => blockedUser.userId !== blockedUserId,
          ),
        }),
      );
      void queryClient.invalidateQueries({
        queryKey: ["friendship-status-batch"],
      });
      toast({
        title: "User unblocked",
        description: "They can appear in your sidebar again.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to unblock user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!socket || !isConnected || !user || user.isGuest) {
      return;
    }

    const handleRelationshipSync = () => {
      void queryClient.invalidateQueries({
        queryKey: ["friendship-status-batch"],
      });
    };

    socket.on("friend_request_updated", handleRelationshipSync);
    socket.on("relationship_status_updated", handleRelationshipSync);

    return () => {
      socket.off("friend_request_updated", handleRelationshipSync);
      socket.off("relationship_status_updated", handleRelationshipSync);
    };
  }, [socket, isConnected, user]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (user?.isGuest) {
      return;
    }

    const trimmedUsername = newUsername.trim();
    const parsedAge = Number(newAge);

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

    if (!newAge.trim()) {
      setAgeError("Age is required");
      return;
    }

    if (!Number.isInteger(parsedAge) || parsedAge < 13 || parsedAge > 120) {
      setAgeError("Age must be a whole number between 13 and 120");
      return;
    }

    if (trimmedUsername === user?.username && parsedAge === user?.age) {
      toast({
        title: "No changes to save",
        description: "Update your name or age first.",
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

  const handlePreferenceToggle = (key: PreferenceKey, checked: boolean) => {
    setPreferenceDraft((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const handleLogout = () => {
    onOpenChange(false);
    logoutMutation.mutate();
  };

  const isSaving = updateProfileMutation.isPending;
  const unblockingUserId = unblockUserMutation.isPending
    ? unblockUserMutation.variables
    : null;
  const emailValue = isGuestUser
    ? "-"
    : profileQuery.isPending
      ? "Loading..."
      : profile?.gmail || "-";
  const profileDisplayName = newUsername.trim() || profile?.username || "User";
  const profileGender = profile?.gender || "-";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-0.75rem)] w-[calc(100%-1rem)] overflow-y-auto overscroll-y-contain p-0 touch-pan-y sm:max-w-3xl md:grid md:h-[min(88vh,680px)] md:grid-rows-[auto_minmax(0,1fr)] md:overflow-hidden">
        <DialogHeader className="gap-2 border-b px-3 py-3 text-left sm:px-5">
          <div className="pr-8">
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              User Settings
            </DialogTitle>
            <DialogDescription className="mt-1">
              Manage your profile, preview preferences, and blocked users.
            </DialogDescription>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5 md:hidden">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;

              return (
                <Button
                  key={section.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "h-9 shrink-0 rounded-full border px-3 text-sm font-medium",
                    isActive
                      ? "border-primary/20 bg-muted text-foreground"
                      : "border-border/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                  data-testid={`button-settings-tab-${section.id}`}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {section.label}
                </Button>
              );
            })}
          </div>
        </DialogHeader>

        <div className="min-h-0 md:grid md:grid-cols-[190px_minmax(0,1fr)]">
          <aside className="hidden border-r bg-muted/20 md:flex md:flex-col md:gap-1.5 md:px-3 md:py-4">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;

              return (
                <Button
                  key={section.id}
                  type="button"
                  variant="ghost"
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "h-10 justify-start rounded-xl px-3 text-sm font-medium",
                    isActive
                      ? "bg-muted text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                  data-testid={`button-settings-side-tab-${section.id}`}
                >
                  <Icon className="mr-3 h-4 w-4" />
                  {section.label}
                </Button>
              );
            })}
          </aside>

          <div className="min-h-0 px-3 py-3 sm:px-5 md:overflow-y-auto md:px-5 md:py-4">
            {activeSection === "profile" ? (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/35 p-3 sm:flex-row sm:items-center">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{
                      backgroundColor: isGuestUser
                        ? "#6b7280"
                        : getAvatarColor(profileDisplayName),
                    }}
                  >
                    {getUserInitials(profileDisplayName)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {profileDisplayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isGuestUser ? "Guest account" : "Registered account"}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <ThemeToggleButton2 className="shadow-none" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleLogout}
                      disabled={logoutMutation.isPending || isSaving}
                      className="h-9 w-9 rounded-full border-destructive/25 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      data-testid="button-settings-logout"
                      title="Logout"
                      aria-label="Logout"
                    >
                      {logoutMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LogOut className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2.5 rounded-xl border border-border bg-muted/25 p-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Profile</Label>
                    <p className="text-xs text-muted-foreground">
                      {isGuestUser
                        ? "Guest accounts can view profile details only."
                        : "Registered accounts can edit name and age."}
                    </p>
                  </div>

                  <div className="grid gap-2.5">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="username" className="text-sm font-medium">
                          Name
                        </Label>
                        <Input
                          id="username"
                          type="text"
                          value={newUsername}
                          onChange={(event) => {
                            setNewUsername(event.target.value);
                            if (usernameError) {
                              setUsernameError("");
                            }
                          }}
                          placeholder="Enter your name"
                          disabled={isSaving || isGuestUser}
                          className={usernameError ? "border-destructive" : ""}
                          data-testid="input-new-username"
                        />
                        {usernameError ? (
                          <p
                            className="text-sm text-destructive"
                            data-testid="error-username"
                          >
                            {usernameError}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="settings-email"
                          className="text-sm font-medium"
                        >
                          Email
                        </Label>
                        <Input
                          id="settings-email"
                          value={emailValue}
                          disabled
                          readOnly
                          data-testid="input-settings-email"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1.5">
                        <Label htmlFor="settings-age" className="text-sm font-medium">
                          Age
                        </Label>
                        <Input
                          id="settings-age"
                          type="number"
                          inputMode="numeric"
                          min={13}
                          max={120}
                          value={newAge}
                          onChange={(event) => {
                            setNewAge(event.target.value);
                            if (ageError) {
                              setAgeError("");
                            }
                          }}
                          placeholder="Enter your age"
                          disabled={isSaving || isGuestUser}
                          className={ageError ? "border-destructive" : ""}
                          data-testid="input-settings-age"
                        />
                        {ageError ? (
                          <p className="text-sm text-destructive">{ageError}</p>
                        ) : null}
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="settings-gender"
                          className="text-sm font-medium"
                        >
                          Gender
                        </Label>
                        <Input
                          id="settings-gender"
                          value={profileGender}
                          disabled
                          readOnly
                          data-testid="input-settings-gender"
                        />
                      </div>
                    </div>
                  </div>

                  {profileQuery.isError && !isGuestUser ? (
                    <p className="text-sm text-destructive">
                      Failed to load the latest email for this account.
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2 pt-1 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isSaving || logoutMutation.isPending}
                    data-testid="button-cancel-settings"
                  >
                    Close
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      isSaving ||
                      logoutMutation.isPending ||
                      !newUsername.trim() ||
                      !newAge.trim() ||
                      isGuestUser
                    }
                    data-testid="button-save-settings"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : isGuestUser ? (
                      <>
                        <Lock className="mr-2 h-4 w-4" />
                        Read Only
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </form>
            ) : activeSection === "preferences" ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-muted/25 p-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Preferences</Label>
                    <p className="text-xs text-muted-foreground">
                      Layout only for now. The actual preference behavior will be
                      wired later.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {preferenceItems.map((item) => {
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.key}
                        className="flex items-start gap-3 rounded-xl border border-border bg-muted/25 p-3"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground">
                          <Icon className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {item.label}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {item.description}
                          </p>
                        </div>

                        <Switch
                          checked={preferenceDraft[item.key]}
                          onCheckedChange={(checked) =>
                            handlePreferenceToggle(item.key, checked)
                          }
                          aria-label={item.label}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    data-testid="button-close-settings-preferences"
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <BlockedUsersPanel
                blockedUsers={blockedUsers}
                isPending={blockedUsersQuery.isPending}
                isError={blockedUsersQuery.isError}
                onUnblock={(blockedUserId) => unblockUserMutation.mutate(blockedUserId)}
                isUnblocking={unblockUserMutation.isPending}
                unblockingUserId={unblockingUserId}
                onClose={handleCancel}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
