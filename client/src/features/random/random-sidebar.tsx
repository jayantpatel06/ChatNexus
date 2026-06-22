import {
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ChevronRight,
  VenetianMask,
  Loader2,
  Mars,
  MessageCircleMore,
  Search,
  Shuffle,
  Venus,
  VenusAndMars,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ChatNavigationMenu,
  type ChatNavigationItem,
} from "@/features/shared/chat-navigation-menu";
import { ChatPageHeader } from "@/features/shared/chat-page-header";
import { navigateWithinAppShell } from "@/app/app-shell-navigation";
import { cn } from "@/lib/utils";
import type { RandomChatPartner } from "./random-chat-panel";

// --- Types ---
export type RandomGenderPreference = "any" | "female" | "male";

export type RandomChatPreferences = {
  interests: string[];
  interestsMatchingEnabled: boolean;
  maxWaitDurationSeconds: number;
  autoSearchOnDisconnect: boolean;
  genderPreference: RandomGenderPreference;
};

export type RandomChatMatchPreferences = Pick<
  RandomChatPreferences,
  "interests" | "interestsMatchingEnabled" | "maxWaitDurationSeconds"
>;

export type RandomMatchState = "connecting" | "idle" | "matched" | "searching";

// --- Constants ---
export const RANDOM_CHAT_PREFERENCES_KEY = "chatnexus_random_chat_preferences";
export const IDLE_RANDOM_CHAT_STATUS = "Set your interests and press Start Chat.";
export const RANDOM_CHAT_CONFIRM_STATUS = "Press Confirm to end this chat.";
export const DEFAULT_RANDOM_CHAT_MAX_WAIT_DURATION_SECONDS = 15;
export const RANDOM_CHAT_SEARCHING_STATUS = "Searching for user...";
export const RANDOM_CHAT_MAX_WAIT_OPTIONS = [
  { label: "5 sec", value: 5 },
  { label: "10 sec", value: 10 },
  { label: "30 sec", value: 30 },
  { label: "Forever", value: 0 },
] as const;

// --- Serialization & Sanitization Helpers ---
export function sanitizeRandomChatMaxWaitDurationSeconds(value: unknown): number {
  const parsedValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_RANDOM_CHAT_MAX_WAIT_DURATION_SECONDS;
  }

  if (parsedValue === 0) {
    return 0;
  }

  return Math.min(120, Math.max(5, Math.round(parsedValue)));
}

export function sanitizeRandomGenderPreference(
  value: unknown,
): RandomGenderPreference {
  if (value === "male" || value === "female") {
    return value;
  }

  return "any";
}

export function sanitizeInterestList(interests: string[]): string[] {
  return Array.from(
    new Set(
      interests.map((interest) => interest.trim().slice(0, 24)).filter(Boolean),
    ),
  ).slice(0, 10);
}

export function readStoredRandomChatPreferences(): RandomChatPreferences {
  if (typeof window === "undefined") {
    return {
      interests: [],
      interestsMatchingEnabled: true,
      maxWaitDurationSeconds: DEFAULT_RANDOM_CHAT_MAX_WAIT_DURATION_SECONDS,
      autoSearchOnDisconnect: false,
      genderPreference: "any",
    };
  }

  try {
    const stored = localStorage.getItem(RANDOM_CHAT_PREFERENCES_KEY);
    if (!stored) {
      return {
        interests: [],
        interestsMatchingEnabled: true,
        maxWaitDurationSeconds: DEFAULT_RANDOM_CHAT_MAX_WAIT_DURATION_SECONDS,
        autoSearchOnDisconnect: false,
        genderPreference: "any",
      };
    }

    const parsed = JSON.parse(stored) as Partial<RandomChatPreferences>;
    return {
      interests: sanitizeInterestList(
        Array.isArray(parsed.interests) ? parsed.interests : [],
      ),
      interestsMatchingEnabled: parsed.interestsMatchingEnabled !== false,
      maxWaitDurationSeconds: sanitizeRandomChatMaxWaitDurationSeconds(
        parsed.maxWaitDurationSeconds,
      ),
      autoSearchOnDisconnect: parsed.autoSearchOnDisconnect === true,
      genderPreference: sanitizeRandomGenderPreference(parsed.genderPreference),
    };
  } catch {
    return {
      interests: [],
      interestsMatchingEnabled: true,
      maxWaitDurationSeconds: DEFAULT_RANDOM_CHAT_MAX_WAIT_DURATION_SECONDS,
      autoSearchOnDisconnect: false,
      genderPreference: "any",
    };
  }
}

// --- Orbital Animation Component ---
function RandomSearchOrbitalAnimation() {
  return (
    <div
      className="relative mx-auto flex h-[16.5rem] w-full items-center justify-center text-primary md:h-[12.75rem]"
      aria-hidden="true"
    >
      <div className="flex h-24 w-24 items-center justify-center rounded-full border border-violet-500 bg-primary/10 text-violet-500 shadow-[0_0_88px_rgba(56,69,248,0.36)] md:h-20 md:w-20">
        <VenetianMask className="h-12 w-12 md:h-10 md:w-10" strokeWidth={1.7} />
      </div>
    </div>
  );
}

// --- Controls Panel Component ---
type RandomMatchControlsPanelProps = {
  currentPartner: RandomChatPartner | null;
  autoSearchOnDisconnect: boolean;
  genderPreference: RandomGenderPreference;
  interestMatchingEnabled: boolean;
  interestDraft: string;
  interests: string[];
  isInterestsExpanded: boolean;
  isFindingMatch: boolean;
  isMatched: boolean;
  onAddInterest: () => void;
  onAutoSearchOnDisconnectChange: (checked: boolean) => void;
  onGenderPreferenceChange: (preference: RandomGenderPreference) => void;
  onInterestDraftChange: Dispatch<SetStateAction<string>>;
  onInterestMatchingChange: (checked: boolean) => void;
  onInterestsExpandedChange: (open: boolean) => void;
  onMaxWaitDurationChange: (value: number | string) => void;
  onRemoveInterest: (interest: string) => void;
  onStartChat: () => void;
  onStopChat: () => void;
  onLogout: () => void;
  logoutPending: boolean;
  startChatDisabled: boolean;
  startChatLabel: string;
  maxWaitDurationSeconds: number;
};

function RandomMatchControlsPanel({
  currentPartner,
  autoSearchOnDisconnect,
  genderPreference,
  interestMatchingEnabled,
  interestDraft,
  interests,
  isInterestsExpanded,
  isFindingMatch,
  isMatched,
  onAddInterest,
  onAutoSearchOnDisconnectChange,
  onGenderPreferenceChange,
  onInterestDraftChange,
  onInterestMatchingChange,
  onInterestsExpandedChange,
  onMaxWaitDurationChange,
  onRemoveInterest,
  onStartChat,
  onStopChat,
  onLogout,
  logoutPending,
  startChatDisabled,
  startChatLabel,
  maxWaitDurationSeconds,
}: RandomMatchControlsPanelProps) {
  const genderOptions: Array<{
    icon: typeof VenusAndMars;
    label: string;
    value: RandomGenderPreference;
  }> = [
    { value: "any", label: "Any", icon: VenusAndMars },
    { value: "male", label: "Male", icon: Mars },
    { value: "female", label: "Female", icon: Venus },
  ];
  const selectedGenderOption =
    genderOptions.find((option) => option.value === genderPreference) ??
    genderOptions[0];
  const primaryActionLabel = isFindingMatch ? "Stop Searching" : startChatLabel;
  const primaryActionHandler = isFindingMatch ? onStopChat : onStartChat;
  const primaryActionDisabled = isFindingMatch ? false : startChatDisabled;
  const sidebarDrawerScopeClass =
    "md:left-[54px] md:right-auto md:w-[calc(26rem-54px)] mb-20 md:mb-0";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ChatPageHeader
        icon={Shuffle}
        title="Random Chat"
        onLogout={onLogout}
        logoutPending={logoutPending}
      />

      <div className="flex min-h-0 flex-1 flex-col pb-[calc(5.4rem+env(safe-area-inset-bottom))] pt-0 md:pb-4">
        <div className="mx-auto flex h-full w-full max-w-[24rem] flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center pb-6 pt-8 md:pb-0 md:pt-0">
            <div className="relative flex w-full flex-col items-center gap-3 text-center">
              <RandomSearchOrbitalAnimation />
            </div>
          </div>

          <div className="relative -mx-4 mt-auto w-[calc(100%+2rem)] rounded-t-[2.5rem] bg-gradient-to-b from-muted/80 via-muted/48 to-transparent px-3 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-4 md:-mb-4 md:px-4">
            <div className="relative mx-auto w-[90%] max-w-[22rem]">
              <DropdownMenu>
                <div className="flex w-full items-center justify-between gap-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <VenusAndMars className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Gender Filter
                      </p>
                    </div>
                  </div>
                  <DropdownMenuTrigger asChild>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex items-center gap-2 rounded-full px-1.5 py-1 text-sm font-medium text-primary transition-colors hover:bg-muted/45"
                        aria-label="Open gender preference menu"
                      >
                        {selectedGenderOption.label}
                        <ChevronRight className="h-4 w-4 -rotate-90 text-muted-foreground" />
                      </button>
                    </div>
                  </DropdownMenuTrigger>
                </div>
                <DropdownMenuContent
                  side="top"
                  align="end"
                  sideOffset={8}
                  className="w-38 rounded-2xl border border-border/70 bg-card p-2"
                >
                  {genderOptions.map((option) => {
                    const OptionIcon = option.icon;
                    const isSelected = genderPreference === option.value;

                    return (
                      <DropdownMenuItem
                        key={option.value}
                        onSelect={() => onGenderPreferenceChange(option.value)}
                        className={cn(
                          "flex min-h-11 items-center justify-between rounded-xl px-3",
                          isSelected && "bg-accent text-accent-foreground",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary",
                              isSelected && "bg-background/70 text-foreground",
                            )}
                          >
                            <OptionIcon className="h-4 w-4" />
                          </div>
                          <span>{option.label}</span>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="relative px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Search className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-medium text-foreground">
                          Your Interests
                        </p>
                      </div>
                    </div>
                  </div>

                  <Drawer
                    open={isInterestsExpanded}
                    onOpenChange={onInterestsExpandedChange}
                  >
                    <DrawerTrigger asChild>
                      <button
                        type="button"
                        className="flex shrink-0 items-center gap-2 rounded-full px-1.5 py-1 text-sm font-medium text-primary transition-colors hover:bg-muted/45"
                        aria-label="Open interest matching drawer"
                      >
                        <span>{interestMatchingEnabled ? "ON" : "OFF"}</span>
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 -rotate-90 text-muted-foreground transition-transform",
                          )}
                        />
                      </button>
                    </DrawerTrigger>

                    <DrawerContent
                      overlayClassName={sidebarDrawerScopeClass}
                      className={cn(
                        sidebarDrawerScopeClass,
                        "border-x-0 border-b-0 bg-muted p-0 shadow-[0_-24px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl md:max-w-none",
                      )}
                    >
                      <div className="space-y-2 pt-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-xl font-semibold text-foreground/70">
                            Match with interests
                          </span>
                          <Switch
                            checked={interestMatchingEnabled}
                            onCheckedChange={onInterestMatchingChange}
                            aria-label="Toggle interest matching"
                          />
                        </div>

                        <div className="px-2 py-2 bg-background/70 rounded-[0.85rem]">
                          <div className="flex flex-wrap items-center gap-2">
                            {interests.map((interest) => (
                              <span
                                key={interest}
                                className="inline-flex h-9 items-center gap-2 rounded-[0.85rem] bg-card px-3 text-xs font-medium text-foreground"
                              >
                                <span className="max-w-[8rem] truncate">
                                  {interest}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onRemoveInterest(interest)}
                                  className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
                                  aria-label={`Remove ${interest}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ))}

                            <Input
                              type="text"
                              placeholder="Add an interest..."
                              className="h-9 min-w-[7.5rem] flex-1 border-0 rounded-[0.85rem] bg-card px-3 text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                              value={interestDraft}
                              onChange={(event) =>
                                onInterestDraftChange(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  onAddInterest();
                                }
                              }}
                              data-testid="input-random-interest"
                            />
                          </div>
                        </div>

                        <div className="rounded-[0.85rem] bg-background/70 p-3">
                          <p className="text-sm font-medium text-muted-foreground/80">
                            Max Wait Duration
                          </p>
                          <div className="mt-2 grid grid-cols-4 gap-2">
                            {RANDOM_CHAT_MAX_WAIT_OPTIONS.map((option) => {
                              const isSelected =
                                maxWaitDurationSeconds === option.value;

                              return (
                                <button
                                  key={option.label}
                                  type="button"
                                  onClick={() =>
                                    onMaxWaitDurationChange(option.value)
                                  }
                                  className={cn(
                                    "h-9 rounded-[0.7rem] px-1 text-[11px] font-semibold transition-colors",
                                    isSelected
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-foreground hover:bg-muted/80",
                                  )}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-[0.85rem] bg-background/70 p-3">
                          <div className="min-w-0 pr-3">
                            <p className="text-sm font-medium text-foreground">
                              Auto search after disconnect
                            </p>
                          </div>
                          <Switch
                            checked={autoSearchOnDisconnect}
                            onCheckedChange={onAutoSearchOnDisconnectChange}
                            aria-label="Toggle auto search after disconnect"
                          />
                        </div>

                        <Button
                          type="button"
                          onClick={() => onInterestsExpandedChange(false)}
                          className="h-10 w-full rounded-[0.7rem] bg-background text-sm font-semibold text-foreground hover:bg-card"
                        >
                          Done
                        </Button>
                      </div>
                    </DrawerContent>
                  </Drawer>
                </div>
              </div>

              <div className="pt-4 pb-3 flex items-center justify-center">
                <Button
                  type="button"
                  onClick={primaryActionHandler}
                  disabled={primaryActionDisabled}
                  variant="outline"
                  className="h-12 w-[80%] rounded-full border-primary/25 bg-muted/80 text-sm font-semibold text-primary shadow-none hover:bg-primary/10 hover:text-primary md:h-10 md:rounded-[1rem]"
                >
                  {isFindingMatch ? (
                    <X className="mr-2 h-4 w-4" />
                  ) : primaryActionDisabled ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MessageCircleMore className="mr-2 h-4 w-4" />
                  )}
                  {primaryActionLabel}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main RandomSidebar Component ---
export type RandomSidebarProps = {
  currentPartner: RandomChatPartner | null;
  preferences: RandomChatPreferences;
  setPreferences: Dispatch<SetStateAction<RandomChatPreferences>>;
  interestDraft: string;
  setInterestDraft: Dispatch<SetStateAction<string>>;
  isInterestsExpanded: boolean;
  setIsInterestsExpanded: Dispatch<SetStateAction<boolean>>;
  isFindingMatch: boolean;
  isMatched: boolean;
  handleAddInterest: () => void;
  handleRemoveInterest: (interest: string) => void;
  beginMatchmaking: (status: string) => void;
  leaveRandomChat: () => void;
};

export function RandomSidebar({
  currentPartner,
  preferences,
  setPreferences,
  interestDraft,
  setInterestDraft,
  isInterestsExpanded,
  setIsInterestsExpanded,
  isFindingMatch,
  isMatched,
  handleAddInterest,
  handleRemoveInterest,
  beginMatchmaking,
  leaveRandomChat,
}: RandomSidebarProps) {
  const { logoutMutation } = useAuth();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const activeNavigationItem: ChatNavigationItem = "random";

  const handleNavigationSelect = (selectedItem: ChatNavigationItem) => {
    if (selectedItem === activeNavigationItem) {
      return;
    }

    if (selectedItem === "logout") {
      logoutMutation.mutate();
      return;
    }

    const targetLocation = selectedItem === "chat" ? "/direct" : `/${selectedItem}`;
    if (location !== targetLocation) {
      navigateWithinAppShell(location, targetLocation, setLocation);
    }
  };

  const startChatLabel = currentPartner
    ? "Find New Chat"
    : isFindingMatch
      ? "Searching..."
      : "Start Chat";

  return (
    <div className="h-full w-full overflow-hidden bg-background md:w-[26rem] md:shrink-0 md:border-r md:border-border">
      <div className="flex h-full w-full overflow-hidden bg-background">
        <div className="hidden md:flex md:shrink-0">
          <ChatNavigationMenu
            activeItem={activeNavigationItem}
            onSelect={handleNavigationSelect}
            className="h-full"
          />
        </div>

        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground md:overflow-hidden">
          <div
            className={cn(
              "min-h-0 flex-1 px-4 pb-0 pt-4 md:px-4 md:pb-4 md:pt-4",
              isMobile ? "overflow-visible" : "overflow-hidden",
            )}
          >
            <div className="mx-auto flex h-full w-full max-w-[26rem] flex-col">
              <RandomMatchControlsPanel
                currentPartner={currentPartner}
                autoSearchOnDisconnect={preferences.autoSearchOnDisconnect}
                genderPreference={preferences.genderPreference}
                interestMatchingEnabled={preferences.interestsMatchingEnabled}
                interestDraft={interestDraft}
                interests={preferences.interests}
                isInterestsExpanded={isInterestsExpanded}
                isFindingMatch={isFindingMatch}
                isMatched={isMatched}
                onAddInterest={handleAddInterest}
                onGenderPreferenceChange={(genderPreference) =>
                  setPreferences((prev) => ({
                    ...prev,
                    genderPreference,
                  }))
                }
                onInterestDraftChange={setInterestDraft}
                onInterestMatchingChange={(checked) =>
                  setPreferences((prev) => ({
                    ...prev,
                    interestsMatchingEnabled: checked,
                  }))
                }
                onAutoSearchOnDisconnectChange={(checked) =>
                  setPreferences((prev) => ({
                    ...prev,
                    autoSearchOnDisconnect: checked,
                  }))
                }
                onInterestsExpandedChange={setIsInterestsExpanded}
                onMaxWaitDurationChange={(value) =>
                  setPreferences((prev) => ({
                    ...prev,
                    maxWaitDurationSeconds: sanitizeRandomChatMaxWaitDurationSeconds(value),
                  }))
                }
                onRemoveInterest={handleRemoveInterest}
                onStartChat={() => beginMatchmaking(RANDOM_CHAT_SEARCHING_STATUS)}
                onStopChat={leaveRandomChat}
                onLogout={() => logoutMutation.mutate()}
                logoutPending={logoutMutation.isPending}
                startChatDisabled={isFindingMatch}
                startChatLabel={startChatLabel}
                maxWaitDurationSeconds={preferences.maxWaitDurationSeconds}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
