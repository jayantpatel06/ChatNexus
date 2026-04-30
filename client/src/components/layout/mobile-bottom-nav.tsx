import { navigateWithinAppShell } from "@/app/app-shell-navigation";
import { cn } from "@/lib/utils";
import { MessageCircle, Globe, Shuffle, Settings } from "lucide-react";
import { useLocation } from "wouter";

export function MobileBottomNav() {
  const [location, setLocation] = useLocation();

  const navItems = [
    {
      id: "chat",
      label: "Chats",
      icon: MessageCircle,
      href: "/dashboard",
      isActive: location === "/dashboard",
    },
    {
      id: "global",
      label: "Global",
      icon: Globe,
      href: "/global-chat",
      isActive: location.startsWith("/global-chat"),
    },
    {
      id: "random",
      label: "Random",
      icon: Shuffle,
      href: "/random-chat",
      isActive: location === "/random-chat",
    },
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
      href: "/settings",
      isActive: location === "/settings",
    },
  ];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-1 md:hidden">
      <nav
        className="pointer-events-auto mx-auto flex w-fit max-w-full items-center justify-center gap-1 rounded-full border border-border/80 bg-card/90 p-1  backdrop-blur"
        aria-label="Mobile chat navigation"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                navigateWithinAppShell(location, item.href, setLocation)
              }
              className={cn(
                "flex shrink-0 flex-col items-center gap-1.5 rounded-full px-5.5 py-1 text-center transition-colors",
                item.isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-current={item.isActive ? "page" : undefined}
            >
              <Icon
                className="h-6 w-6"
                strokeWidth={item.isActive ? 2.4 : 2}
              />
              <span className="whitespace-nowrap text-[13px] font-medium leading-none tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
