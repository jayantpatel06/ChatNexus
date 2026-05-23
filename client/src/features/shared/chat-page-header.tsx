import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { LogOut, MoonStar, MoreVertical, SunMedium } from "lucide-react";
import { useThemeToggleState } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ChatPageHeaderProps = {
  icon: LucideIcon;
  title: string;
  titleContent?: ReactNode;
  onLogout: () => void;
  logoutPending?: boolean;
  headerAction?: ReactNode;
  menuContent?: ReactNode;
};

export function ChatPageHeader({
  icon: Icon,
  title,
  titleContent,
  onLogout,
  logoutPending = false,
  headerAction,
  menuContent,
}: ChatPageHeaderProps) {
  const { isDark, toggleTheme } = useThemeToggleState();
  const ThemeIcon = isDark ? SunMedium : MoonStar;

  return (
    <div className="flex items-center justify-between gap-4 px-1">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-primary">
          <Icon className="h-5 w-5" />
        </div>
        {titleContent ?? (
          <h1 className="truncate text-[1.55rem] font-semibold tracking-tight text-foreground">
            {title}
          </h1>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {headerAction}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full border-0 bg-transparent text-muted-foreground shadow-none ring-0 hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              title={`${title} menu`}
            >
              <MoreVertical className="h-4.5 w-4.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-46 rounded-[1rem] border border-border/70 bg-popover p-1.5"
          >
            <DropdownMenuItem
              onSelect={toggleTheme}
              className="rounded-[0.85rem] px-3 py-2"
            >
              <ThemeIcon className="mr-2 h-4 w-4" />
              Change theme
            </DropdownMenuItem>

            {menuContent}

            <DropdownMenuItem
              onSelect={onLogout}
              disabled={logoutPending}
              className="rounded-[0.85rem] px-3 py-2 text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
