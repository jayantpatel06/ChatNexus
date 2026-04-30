import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { navigateWithinAppShell } from "@/app/app-shell-navigation";
import { useAuth } from "@/providers/auth-provider";
import { apiRequest, readJsonResponse } from "@/lib/api-client";
import { queryClient } from "@/lib/queryClient";
import {
  getPushSubscriptionStatus,
  isPushNotificationsSupported,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/lib/push-notifications";
import { ChatPageHeader } from "@/chat/chat-page-header";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggleButton2 } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn, getUserInitials } from "@/lib/utils";
import type { SelfUserProfile, User } from "@shared/schema";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Bell,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Info,
  Loader2,
  Lock,
  LogOut,
  Palette,
  Settings,
  User as UserIcon,
} from "lucide-react";
import {
  ChatNavigationMenu,
  type ChatNavigationItem,
} from "@/chat/chat-navigation-menu";

type SettingsSection =
  | "profile"
  | "notifications"
  | "blocked"
  | "appearance"
  | "help"
  | "about"
  | null;

type BlockedUsersResponse = {
  users: User[];
};

type SettingSectionKey = Exclude<SettingsSection, null>;

type SettingsItem = {
  id: SettingSectionKey;
  title: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
};

const DEFAULT_SETTINGS_PREFERENCES = {
  pushNotifications: false,
};

const CHATNEXUS_VERSION = "1.0.0";

// Shared spacing tokens for settings content so other screens can reuse them.
const SETTINGS_LAYOUT = {
  contentPadding:
    "px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-1 md:px-4 md:pb-2 md:pt-1",
  stack: "space-y-3 md:space-y-2",
  profileCard:
    "rounded-sm border border-border/70 bg-muted/70 px-6 py-3 md:px-5 md:py-3",
  listCard:
    "overflow-hidden rounded-sm",
  row: "flex w-full items-center justify-between gap-4 px-6 py-3.5 text-left transition-colors duration-200 hover:bg-accent/40 md:gap-3 md:px-5 md:py-3",
  detail: "px-3 pb-3.5 pt-3 md:px-2.5 md:pb-3 md:pt-2.5",
  iconTile:
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] md:h-8 md:w-8",
  detailCard:
    "rounded-[1.15rem] border border-border/70 bg-muted/70 px-4 py-3.5 md:px-3 md:py-3",
  fieldInput:
    "h-11 rounded-[0.95rem] border border-border/70 bg-background/80 text-sm text-foreground shadow-none focus-visible:border-primary md:h-9 md:text-xs",
} as const;

function SettingsSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(SETTINGS_LAYOUT.detailCard, className)}>{children}</div>
  );
}

function ReadonlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </Label>
      <Input
        value={value}
        readOnly
        aria-readonly="true"
        className="h-11 rounded-[0.95rem] border border-border/70 bg-muted/15 text-sm text-muted-foreground shadow-none"
      />
    </div>
  );
}

export function SettingsSidebar() {
  const { user, updateUser, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  const [activeSection, setActiveSection] = useState<SettingsSection>(null);
  const sectionRefs = useRef<
    Partial<Record<SettingSectionKey, HTMLDivElement | null>>
  >({});
  const detailRefs = useRef<
    Partial<Record<SettingSectionKey, HTMLDivElement | null>>
  >({});
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

  useEffect(() => {
    if (!activeSection) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      sectionRefs.current[activeSection]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
      detailRefs.current[activeSection]?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeSection]);

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
      navigateWithinAppShell(location, "/random-chat", setLocation);
    }
    if (item === "global" && location !== "/global-chat") {
      navigateWithinAppShell(location, "/global-chat", setLocation);
    }
    if (item === "chat" && location !== "/dashboard") {
      navigateWithinAppShell(location, "/dashboard", setLocation);
    }
    if (item === "settings" && location !== "/settings") {
      navigateWithinAppShell(location, "/settings", setLocation);
    }
    if (item === "logout") {
      logoutMutation.mutate();
    }
  };

  const toggleSection = (section: SettingSectionKey) => {
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

  const settingsItems: SettingsItem[] = [
    {
      id: "profile",
      title: "Account",
      description: "Username, age, and profile",
      icon: UserIcon,
      iconClassName: "bg-sky-500",
    },
    {
      id: "notifications",
      title: "Notifications",
      description: "Manage your notifications",
      icon: Bell,
      iconClassName: "bg-rose-500",
    },
    {
      id: "blocked",
      title: "Blocked Users",
      description: "Manage blocked users",
      icon: Ban,
      iconClassName: "bg-emerald-500",
    },
    {
      id: "appearance",
      title: "Appearance",
      description: "Theme and display",
      icon: Palette,
      iconClassName: "bg-amber-500",
    },
    {
      id: "help",
      title: "Help & Support",
      description: "Get help and contact support",
      icon: CircleHelp,
      iconClassName: "bg-violet-500",
    },
    {
      id: "about",
      title: "About ChatNexus",
      description: `Version ${CHATNEXUS_VERSION}`,
      icon: Info,
      iconClassName: "bg-blue-500",
    },
  ];

  const renderSectionContent = (section: SettingSectionKey) => {
    if (section === "profile") {
      return (
        <form onSubmit={handleSubmitProfile} className="space-y-4 pt-1 md:space-y-3">
          <div className="grid grid-cols-[65%_30%] gap-2 rounded-sm p-1 md:gap-1.5">
            <div className="space-y-1.5">
              <Label
                htmlFor="settings-username"
                className="m-2 text-xs font-semibold text-muted-foreground md:m-1.5 md:text-[11px]"
              >
                Name
              </Label>
              <Input
                id="settings-username"
                type="text"
                value={newUsername}
                onChange={(event) => {
                  setNewUsername(event.target.value);
                  setUsernameError("");
                }}
                disabled={isSaving || isGuestUser}
                className={cn(
                  "mt-1 h-10 rounded-sm !border-solid !border-1 !border-foreground/40 bg-background text-sm text-foreground shadow-none focus:!border-solid focus:!border-1 focus:!border-primary focus-visible:!border-solid focus-visible:!border-1 focus-visible:!border-primary md:h-9 md:text-xs",
                  usernameError &&
                    "!border-destructive focus:!border-destructive focus-visible:!border-destructive",
                )}
              />
              {usernameError ? (
                <p className="text-xs text-destructive md:text-[11px]">{usernameError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="settings-age"
                className="m-2 text-xs font-semibold text-muted-foreground md:m-1.5 md:text-[11px]"
              >
                Age
              </Label>
              <Input
                id="settings-age"
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
                  "mt-1 h-10 rounded-sm !border-solid !border-1 !border-foreground/40 bg-background text-sm text-foreground shadow-none focus:!border-solid focus:!border-1 focus:!border-primary focus-visible:!border-solid focus-visible:!border-1 focus-visible:!border-primary md:h-9 md:text-xs",
                  ageError &&
                    "!border-destructive focus:!border-destructive focus-visible:!border-destructive",
                )}
              />
              {ageError ? (
                <p className="text-xs text-destructive md:text-[11px]">{ageError}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label className="m-2 text-xs font-semibold text-muted-foreground md:m-1.5 md:text-[11px]">
                Email
              </Label>
              <Input
                value={emailLabel}
                readOnly
                aria-readonly="true"
                className="h-10 border border-border/80 bg-muted/20 text-sm text-muted-foreground shadow-none md:h-9 md:text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="m-2 text-xs font-semibold text-muted-foreground md:m-1.5 md:text-[11px]">
                Gender
              </Label>
              <Input
                value={genderLabel}
                readOnly
                aria-readonly="true"
                className="h-10 border border-border/80 bg-muted/20 text-sm text-muted-foreground shadow-none md:h-9 md:text-xs"
              />
            </div>
          </div>

          {isGuestUser ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-amber-500 md:text-[11px]">
              <Lock className="h-3 w-3 md:h-2.5 md:w-2.5" />
              Guest accounts cannot edit profile
            </p>
          ) : (
            <Button
              type="submit"
              disabled={isSaving || !newUsername.trim() || !newAge.trim()}
              className="mt-2 h-10 w-full md:h-9 md:text-xs"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin md:h-3.5 md:w-3.5" />
              ) : (
                "Save Profile"
              )}
            </Button>
          )}
        </form>
      );
    }

    if (section === "notifications") {
      return (
        <div className="space-y-3">
          <SettingsSurface className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground md:text-[13px]">
                Push Notifications
              </p>
              <p className="mt-1 text-sm text-muted-foreground md:text-xs">
                Receive alerts when friends message you while you are away.
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
          </SettingsSurface>
          
        </div>
      );
    }

    if (section === "blocked") {
      if (blockedUsersQuery.isPending) {
        return (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground md:h-3.5 md:w-3.5" />
          </div>
        );
      }

      if (blockedUsersQuery.isError) {
        return (
          <p className="text-sm text-destructive md:text-xs">
            Failed to load blocked users.
          </p>
        );
      }

      if (blockedUsers.length === 0) {
        return (
          <SettingsSurface>
            <p className="text-sm text-muted-foreground md:text-xs">No blocked users.</p>
          </SettingsSurface>
        );
      }

      return (
        <div className="space-y-2">
          {blockedUsers.map((blockedUser) => (
            <SettingsSurface
              key={blockedUser.userId}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground md:text-[13px]">
                  {blockedUser.username}
                </p>
                <p className="mt-1 text-xs text-muted-foreground md:text-[11px]">
                  Remove to allow chats again
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => unblockUserMutation.mutate(blockedUser.userId)}
                disabled={unblockUserMutation.isPending}
                className="h-9 rounded-full px-3 text-xs md:h-8 md:px-2.5 md:text-[11px]"
              >
                {unblockUserMutation.isPending &&
                unblockUserMutation.variables === blockedUser.userId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin md:h-3 md:w-3" />
                ) : (
                  "Unblock"
                )}
              </Button>
            </SettingsSurface>
          ))}
        </div>
      );
    }

    if (section === "appearance") {
      return (
        <SettingsSurface className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground md:text-[13px]">
              Theme Toggle
            </p>
            <p className="mt-1 text-sm text-muted-foreground md:text-xs">
              Keep the current color system and switch light or dark instantly.
            </p>
          </div>
          <ThemeToggleButton2 className="shrink-0 shadow-none" />
        </SettingsSurface>
      );
    }

    if (section === "help") {
      return (
        <div className="space-y-3">
          <SettingsSurface>
            <p className="text-sm font-semibold text-foreground md:text-[13px]">
              Need a hand?
            </p>
            <p className="mt-1 text-sm text-muted-foreground md:text-xs">
              Open the help center for guides or jump straight to the contact
              page for support.
            </p>
          </SettingsSurface>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-[1rem] md:h-9 md:text-xs"
              onClick={() => setLocation("/help-center")}
            >
              Help Center
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-[1rem] md:h-9 md:text-xs"
              onClick={() => setLocation("/contact")}
            >
              Contact Support
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3 md:space-y-2">
        <SettingsSurface>
          <p className="text-sm font-semibold text-foreground md:text-[13px]">ChatNexus</p>
          <p className="mt-1 text-sm text-muted-foreground md:text-xs">
            Realtime chat across private, global, and random conversations.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/12 px-3 py-1 text-xs font-semibold text-primary md:px-2.5 md:py-0.5 md:text-[11px]">
              Version {CHATNEXUS_VERSION}
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground md:px-2.5 md:py-0.5 md:text-[11px]">
              {membershipLabel}
            </span>
          </div>
        </SettingsSurface>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-sm md:h-9 md:text-xs"
          onClick={() => setLocation("/about")}
        >
          Open About Page
        </Button>
      </div>
    );
  };

  return (
    <div className="h-full w-full overflow-hidden bg-background text-foreground md:w-[26rem] md:shrink-0 md:border-r md:border-border">
      <div className="flex h-full w-full overflow-hidden bg-background">
        <div className="hidden md:flex md:shrink-0">
          <ChatNavigationMenu
            activeItem="settings"
            onSelect={handleNavigationSelect}
            variant="rail"
            className="h-full"
          />
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col bg-background text-foreground md:overflow-hidden">
          <div className="px-4 pb-3 pt-4 md:px-4 md:pb-3 md:pt-4">
            <ChatPageHeader
              icon={Settings}
              title="Settings"
              onLogout={() => logoutMutation.mutate()}
              logoutPending={logoutMutation.isPending}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-background scrollbar-none">
            <div className={SETTINGS_LAYOUT.contentPadding}>
              <div className={SETTINGS_LAYOUT.stack}>
              <div className={SETTINGS_LAYOUT.profileCard}>
                <div className="flex items-center gap-4 md:gap-3">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white md:h-11 md:w-11 md:text-base"
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
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-xl font-semibold tracking-tight text-foreground md:text-lg">
                        {profileDisplayName}
                      </p>
                      <span className="rounded-full bg-primary/14 px-2.5 py-1 text-[11px] font-semibold text-primary md:px-2 md:py-0.5 md:text-[10px]">
                        {membershipLabel}
                      </span>
                    </div>
                    <p className="mt-1 mb-1 truncate text-sm text-muted-foreground md:text-xs">
                      {emailLabel}
                    </p>
                  </div>
                </div>
              </div>

              <div className={SETTINGS_LAYOUT.listCard}>
                {settingsItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  const detailId = `settings-section-${item.id}`;

                  return (
                    <div
                      key={item.id}
                      ref={(node) => {
                        sectionRefs.current[item.id] = node;
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(item.id)}
                        aria-expanded={isActive}
                        aria-controls={detailId}
                        className={cn(
                          SETTINGS_LAYOUT.row,
                          isActive && "bg-accent/70",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={cn(
                              SETTINGS_LAYOUT.iconTile,
                              item.iconClassName,
                            )}
                          >
                            <Icon className="h-4.5 w-4.5 md:h-3.5 md:w-3.5" />
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="truncate text-[15px] font-semibold leading-tight text-foreground md:text-sm">
                              {item.title}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground md:text-xs">
                              {item.description}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {isActive ? (
                            <ChevronUp className="h-4 w-4 text-foreground md:h-3.5 md:w-3.5" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground md:h-3.5 md:w-3.5" />
                          )}
                        </div>
                      </button>

                      {isActive ? (
                        <div
                          id={detailId}
                          ref={(node) => {
                            detailRefs.current[item.id] = node;
                          }}
                          tabIndex={-1}
                          className={cn(
                            SETTINGS_LAYOUT.detail,
                            "scroll-mt-2 outline-none",
                          )}
                        >
                          {renderSectionContent(item.id)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-center">
                <Button
                  type="button"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                  variant="ghost"
                  className="h-11 w-[88%] rounded-full border border-destructive/20 bg-destructive/10 text-sm font-semibold text-destructive hover:bg-destructive/15 hover:text-destructive md:h-9 md:w-[70%] md:text-xs"
                >
                  {logoutMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin md:h-3 md:w-3" />
                  ) : (
                    <>
                      <LogOut className="mr-2 h-3 w-3 md:h-3 md:w-3" />
                      Log Out
                    </>
                  )}
                </Button>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
