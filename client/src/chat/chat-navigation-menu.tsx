import { cn } from "@/lib/utils";
import {
  Globe,
  History,
  MessageCircle,
  Settings,
  Shuffle,
} from "lucide-react";

export type ChatNavigationItem =
  | "chat"
  | "history"
  | "global"
  | "random"
  | "settings";
export const CHAT_DASHBOARD_NAVIGATION_EVENT =
  "chatnexus-dashboard-navigation";

type NavigationVariant = "bottom" | "rail";

type ChatNavigationMenuProps = {
  activeItem: ChatNavigationItem;
  onSelect: (item: ChatNavigationItem) => void;
  variant: NavigationVariant;
  className?: string;
};

const navigationItems: Array<{
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
    id: "history",
    label: "History",
    icon: History,
    testId: "button-menu-history",
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
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    testId: "button-menu-settings",
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
  variant,
  className,
}: ChatNavigationMenuProps) {
  const isRail = variant === "rail";
  const primaryRailItems = navigationItems.filter((item) => item.id !== "settings");
  const footerRailItems = navigationItems.filter((item) => item.id === "settings");
  const itemsToRender = isRail ? primaryRailItems : navigationItems;
  const getButtonClasses = (isActive: boolean, disabled?: boolean) =>
    cn(
      "group relative overflow-hidden transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      !disabled && "active:scale-[0.98]",
      isRail
        ? "flex w-full items-center justify-center rounded-full px-1 py-1.5 text-center"
        : "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[1rem] px-1 py-1.5 text-center",
      disabled
        ? "cursor-not-allowed text-muted-foreground/40 opacity-60"
        : isRail
          ? isActive
            ? "text-primary-foreground"
            : "text-muted-foreground hover:text-foreground active:text-foreground"
          : isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground",
    );
  const getIconClasses = (isActive: boolean, disabled?: boolean) =>
    cn(
      "flex items-center justify-center border transition-colors duration-150",
      isRail ? "h-10 w-10" : "h-8 w-8",
      disabled
        ? "border-transparent bg-muted/60 text-muted-foreground/50"
        : isRail
          ? isActive
            ? "rounded-full border-transparent bg-primary text-primary-foreground shadow-sm"
            : "rounded-full border-transparent bg-transparent text-current group-hover:bg-muted group-active:bg-muted"
          : isActive
            ? "rounded-full border-transparent bg-transparent text-current"
            : "rounded-full border-transparent bg-transparent text-current",
    );

  return (
    <nav
      className={cn(
        isRail
          ? "flex h-full w-[58px] shrink-0 flex-col justify-between rounded-sm border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur"
          : "flex items-center justify-between gap-1 rounded-[1.35rem] border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur",
        className,
      )}
      aria-label="Chat navigation"
    >
      <div
        className={cn(
          "flex",
          isRail ? "flex-col items-center gap-2.5" : "w-full items-center gap-1",
        )}
      >
        {itemsToRender.map((item) => {
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
                <Icon className={isRail ? "h-6 w-6" : "h-6 w-6"} />
              </span>
              {!isRail && (
                <span className="text-[0.68rem] font-medium leading-none tracking-tight">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isRail && footerRailItems.length > 0 && (
        <div className="flex flex-col gap-2">
          {footerRailItems.map((item) => {
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
      )}
    </nav>
  );
}
