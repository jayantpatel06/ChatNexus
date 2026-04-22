import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/providers/auth-provider";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";
import {
  getPushSubscriptionStatus,
  isPushNotificationsSupported,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/lib/push-notifications";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggleButton2 } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn, getUserInitials } from "@/lib/utils";
import type { SelfUserProfile, User } from "@shared/schema";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  LogOut,
  Palette,
  Shield,
  User as UserIcon,
} from "lucide-react";
import {
  ChatNavigationMenu,
  type ChatNavigationItem,
} from "@/chat/chat-navigation-menu";

type SettingsSection = "profile" | "notifications" | "blocked" | null;

type BlockedUsersResponse = {
  users: User[];
};

const DEFAULT_SETTINGS_PREFERENCES = {
  pushNotifications: false,
};

export function SettingsSidebar() {
  const { user, updateUser, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  const [activeSection, setActiveSection] = useState<SettingsSection>(null);
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
    enabled: !!user,
    queryFn: async () =>
      readJsonResponse<SelfUserProfile>(
        await apiRequest("GET", "/api/user/profile"),
      ),
    staleTime: 0,
  });

  const blockedUsersQuery = useQuery({
    queryKey: ["/api/users/blocked"],
    enabled: !!user,
    queryFn: async () =>
      readJsonResponse<BlockedUsersResponse>(
        await apiRequest("GET", "/api/users/blocked"),
      ),
    staleTime: 0,
  });

  const pushSubscriptionStatusQuery = useQuery({
    queryKey: ["/api/notifications/push-subscription"],
    enabled: !!user && !user.isGuest && isPushNotificationsSupported(),
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
    setPreferenceDraft((prev) => ({
      ...prev,
      pushNotifications:
        !!pushSubscriptionStatusQuery.data?.enabled && !isGuestUser,
    }));
  }, [isGuestUser, pushSubscriptionStatusQuery.data?.enabled]);

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    setNewUsername(profileQuery.data.username || "");
    setNewAge(
      profileQuery.data.age != null ? String(profileQuery.data.age) : "",
    );
    setUsernameError("");
    setAgeError("");
  }, [profileQuery.data]);

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
            (blockedUser) => blockedUser.userId !== blockedUserId,
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

  const handleSubmitProfile = (event: FormEvent) => {
    event.preventDefault();
    if (user?.isGuest) {
      return;
    }

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

  const handleNavigationSelect = (item: ChatNavigationItem) => {
    if (item === "random" && location !== "/random-chat") {
      setLocation("/random-chat");
    }
    if (item === "global" && location !== "/global-chat") {
      setLocation("/global-chat");
    }
    if (item === "chat" && location !== "/dashboard") {
      setLocation("/dashboard");
    }
    if (item === "settings" && location !== "/settings") {
      setLocation("/settings");
    }
    if (item === "logout") {
      logoutMutation.mutate();
    }
  };

  const toggleSection = (section: SettingsSection) => {
    setActiveSection((current) => (current === section ? null : section));
  };

  const isSaving = updateProfileMutation.isPending;
  const profileDisplayName =
    profile?.username?.trim() || user?.username?.trim() || "User";
  const emailLabel = profile?.gmail?.trim()
    ? profile.gmail
    : isGuestUser
      ? "Guests do not have an email"
      : "No email available";
  const genderLabel = profile?.gender?.trim() || "Not provided";
  const membershipLabel = isGuestUser ? "Guest" : "Member";
  const settingsRowClassName =
    "flex w-full items-center justify-between gap-3 rounded-[1.3rem] px-3.5 py-3 text-left transition-colors hover:bg-muted/40";
  const settingsDetailClassName = "px-3.5 pb-4 pt-1";

  return (
    <div className="h-full w-full overflow-hidden bg-background text-foreground md:w-[28rem] md:shrink-0 md:border-r md:border-border">
      <div className="flex h-full w-full overflow-hidden bg-background">
        <div className="hidden md:flex md:shrink-0">
          <ChatNavigationMenu
            activeItem="settings"
            onSelect={handleNavigationSelect}
            variant="rail"
            className="h-full"
          />
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto bg-background scrollbar-none">
          <div className="px-3 pb-2 pt-4">
            <div className="flex items-center justify-between px-4 pb-2 pt-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Settings
              </h1>
              <Button
                type="button"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                variant="destructive"
                size="sm"
                className="h-9 gap-1.5 rounded-full px-3"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Log Out</span>
                {logoutMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
              </Button>
            </div>
            <div className="mt-4 rounded-[1.2rem] border border-border/70 bg-muted/30 px-4 py-4">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{
                    background: user?.isGuest
                      ? "var(--brand-muted)"
                      : "var(--brand-primary)",
                    color: user?.isGuest ? "var(--background)" : "#ffffff",
                  }}
                >
                  {user?.isGuest ? "G" : getUserInitials(profileDisplayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
                    {profileDisplayName}
                  </h1>
                  <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {membershipLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-3 pb-[100px] pt-1">
            <div>
              <button
                type="button"
                onClick={() => toggleSection("profile")}
                className={cn(
                  settingsRowClassName,
                  activeSection === "profile" && "bg-muted/25",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.85rem] bg-sky-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
                    <UserIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
                      Account
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Username, age and profile details
                    </p>
                  </div>
                </div>
                {activeSection === "profile" ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>

              {activeSection === "profile" && (
                <div className={settingsDetailClassName}>
                  <form
                    onSubmit={handleSubmitProfile}
                    className="space-y-4 pt-1"
                  >
                    <div className="grid grid-cols-[65%_35%] gap-3 rounded-[1rem] bg-background/60 p-1">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="username"
                          className="text-xs font-semibold text-muted-foreground m-2"
                        >
                          Name
                        </Label>
                        <Input
                          id="username"
                          type="text"
                          value={newUsername}
                          onChange={(event) => {
                            setNewUsername(event.target.value);
                            setUsernameError("");
                          }}
                          disabled={isSaving || isGuestUser}
                          className={cn(
                            "h-10 mt-1 rounded-sm !border-solid !border-1 !border-foreground/40 bg-background text-sm text-foreground shadow-none focus:!border-solid focus:!border-1 focus:!border-primary focus-visible:!border-solid focus-visible:!border-1 focus-visible:!border-primary",
                            usernameError &&
                              "!border-destructive focus:!border-destructive focus-visible:!border-destructive",
                          )}
                        />
                        {usernameError && (
                          <p className="text-xs text-destructive">
                            {usernameError}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="age"
                          className="text-xs font-semibold text-muted-foreground m-2"
                        >
                          Age
                        </Label>
                        <Input
                          id="age"
                          type="number"
                          inputMode="numeric"
                          min={18}
                          max={120}
                          value={newAge}
                          onChange={(event) => {
                            setNewAge(event.target.value);
                            setAgeError("");
                          }}
                          disabled={isSaving || isGuestUser}
                          className={cn(
                            "h-10 mt-1 rounded-sm !border-solid !border-1 !border-foreground/40 bg-background text-sm text-foreground shadow-none focus:!border-solid focus:!border-1 focus:!border-primary focus-visible:!border-solid focus-visible:!border-1 focus-visible:!border-primary",
                            ageError &&
                              "!border-destructive focus:!border-destructive focus-visible:!border-destructive",
                          )}
                        />
                        {ageError && (
                          <p className="text-xs text-destructive">{ageError}</p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground m-2">
                          Email
                        </Label>
                        <Input
                          value={emailLabel}
                          readOnly
                          aria-readonly="true"
                          className="h-10 border border-border/80 bg-muted/20 text-sm text-muted-foreground shadow-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground m-2">
                          Gender
                        </Label>
                        <Input
                          value={genderLabel}
                          readOnly
                          aria-readonly="true"
                          className="h-10 border border-border/80 bg-muted/20 text-sm text-muted-foreground shadow-none"
                        />
                      </div>
                    </div>

                    {isGuestUser ? (
                      <p className="mt-2 flex items-center gap-1 text-xs text-amber-500">
                        <Lock className="h-3 w-3" />
                        Guest accounts cannot edit profile
                      </p>
                    ) : (
                      <Button
                        type="submit"
                        disabled={
                          isSaving || !newUsername.trim() || !newAge.trim()
                        }
                        className="mt-2 h-10 w-full"
                      >
                        {isSaving ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          "Save Profile"
                        )}
                      </Button>
                    )}
                  </form>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => toggleSection("notifications")}
                className={cn(
                  settingsRowClassName,
                  activeSection === "notifications" && "bg-muted/25",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.85rem] bg-rose-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
                    <Bell className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
                      Notifications
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Push notifications
                    </p>
                  </div>
                </div>
                {activeSection === "notifications" ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>

              {activeSection === "notifications" && (
                <div className={settingsDetailClassName}>
                  <div className="flex items-center justify-between gap-4 rounded-[1.1rem] bg-muted/30 px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        Push Notifications
                      </span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Receive alerts when friends message you offline
                      </p>
                    </div>
                    <Switch
                      checked={preferenceDraft.pushNotifications}
                      disabled={
                        pushSubscriptionStatusQuery.isFetching ||
                        pushNotificationsMutation.isPending
                      }
                      onCheckedChange={(checked) => {
                        if (isGuestUser) {
                          toast({
                            title: "Unavailable",
                            description:
                              "Register an account to use notifications.",
                          });
                          return;
                        }

                        if (!isPushNotificationsSupported()) {
                          toast({
                            title: "Unsupported",
                            description:
                              "Browser does not support push notifications.",
                            variant: "destructive",
                          });
                          return;
                        }

                        pushNotificationsMutation.mutate(checked);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => toggleSection("blocked")}
                className={cn(
                  settingsRowClassName,
                  activeSection === "blocked" && "bg-muted/25",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.85rem] bg-emerald-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
                    <Shield className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
                      Blocked Users ({blockedUsers.length})
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Manage blocked chats
                    </p>
                  </div>
                </div>
                {activeSection === "blocked" ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>

              {activeSection === "blocked" && (
                <div className={settingsDetailClassName}>
                  {blockedUsersQuery.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : blockedUsersQuery.isError ? (
                    <p className="text-xs text-rose-400">
                      Failed to load blocked users
                    </p>
                  ) : blockedUsers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No blocked users
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {blockedUsers.map((blockedUser) => (
                        <div
                          key={blockedUser.userId}
                          className="flex items-center justify-between gap-3 rounded-[1rem] bg-muted/30 px-3 py-3"
                        >
                          <span className="text-sm">
                            {blockedUser.username}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              unblockUserMutation.mutate(blockedUser.userId)
                            }
                            disabled={unblockUserMutation.isPending}
                            className="h-6 px-2 text-xs"
                          >
                            {unblockUserMutation.isPending &&
                            unblockUserMutation.variables ===
                              blockedUser.userId ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Unblock"
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 rounded-[1.3rem] px-3.5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.85rem] bg-amber-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]">
                    <Palette className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
                      Appearance
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Switch between light and dark modes
                    </p>
                  </div>
                </div>
                <ThemeToggleButton2 className="shrink-0 shadow-none" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
