import { cn } from "@/lib/utils";
import {
  Globe,
  LogOut,
  MessageCircle,
  Settings,
  Shuffle,
} from "lucide-react";

export type ChatNavigationItem =
  | "chat"
  | "global"
  | "random"
  | "settings"
  | "logout";
export const CHAT_DASHBOARD_NAVIGATION_EVENT =
  "chatnexus-dashboard-navigation";

type ChatNavigationMenuProps = {
  activeItem: ChatNavigationItem;
  onSelect: (item: ChatNavigationItem) => void;
  className?: string;
};

const primaryItems: Array<{
  id: ChatNavigationItem;
  label: string;
  icon: typeof MessageCircle;
  disabled?: boolean;
  testId: string;
}> = [
  {
    id: "chat",
    label: "Chat",
    icon: MessageCircle,
    testId: "button-tab-private",
  },
  {
    id: "global",
    label: "Global",
    icon: Globe,
    testId: "button-tab-global",
  },
  {
    id: "random",
    label: "Random",
    icon: Shuffle,
    testId: "button-tab-random",
  },
];

const footerItems: Array<{
  id: ChatNavigationItem;
  label: string;
  icon: typeof MessageCircle;
  testId: string;
}> = [
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    testId: "button-menu-settings",
  },
  {
    id: "logout",
    label: "Logout",
    icon: LogOut,
    testId: "button-menu-logout",
  },
];

export function dispatchChatDashboardNavigation(item: ChatNavigationItem) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ChatNavigationItem>(CHAT_DASHBOARD_NAVIGATION_EVENT, {
      detail: item,
    }),
  );
}

export function ChatNavigationMenu({
  activeItem,
  onSelect,
  className,
}: ChatNavigationMenuProps) {
  const getButtonClasses = (isActive: boolean, disabled?: boolean) =>
    cn(
      "group relative overflow-hidden transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      !disabled && "active:scale-[0.98]",
      "flex w-full items-center justify-center rounded-full px-1 py-1.5 text-center",
      disabled
        ? "cursor-not-allowed text-muted-foreground/40 opacity-60"
        : isActive
          ? "text-accent-foreground"
          : "text-muted-foreground hover:text-foreground active:text-foreground",
    );
  const getIconClasses = (isActive: boolean, disabled?: boolean) =>
    cn(
      "flex h-10 w-10 items-center justify-center border transition-colors duration-150",
      disabled
        ? "border-transparent bg-muted/60 text-muted-foreground/50"
        : isActive
          ? "rounded-full border-border bg-accent text-accent-foreground shadow-sm"
          : "rounded-full border-transparent bg-transparent text-current group-hover:bg-muted group-active:bg-muted",
    );

  return (
    <nav
      className={cn(
        "flex h-full w-[54px] shrink-0 flex-col justify-between border-r border-border bg-background px-1 py-4",
        className,
      )}
      aria-label="Chat navigation"
    >
      <div className="flex flex-col items-center gap-2.5">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              disabled={item.disabled}
              className={getButtonClasses(isActive, item.disabled)}
              title={item.label}
              aria-current={isActive ? "page" : undefined}
              data-testid={item.testId}
            >
              <span className={getIconClasses(isActive, item.disabled)}>
                <Icon className="h-5 w-5" />
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        {footerItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={getButtonClasses(isActive)}
              title={item.label}
              aria-current={isActive ? "page" : undefined}
              data-testid={item.testId}
            >
              <span className={getIconClasses(isActive)}>
                <Icon className="h-5 w-5" />
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
