import {
  Command,
  Globe,
  MessageCircleMore,
  Settings2,
  Shuffle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ChatDesktopShellPlaceholderProps = {
  enableCommandCenter?: boolean;
};

const commandCenterShortcuts = [
  { label: "Open Chat", shortcut: "C", icon: MessageCircleMore },
  { label: "Open Global", shortcut: "G", icon: Globe },
  { label: "Open Random", shortcut: "R", icon: Shuffle },
  { label: "Open Settings", shortcut: "S", icon: Settings2 },
];

function ChatNexusShellLogo() {
  return (
    <img
      src="/assets/images/logo-256.png"
      alt="ChatNexus"
      className="h-40 w-40 opacity-60 dark:opacity-50 lg:h-52 lg:w-52"
      draggable={false}
    />
  );
}

export function ChatDesktopShellPlaceholder({
  enableCommandCenter = false,
}: ChatDesktopShellPlaceholderProps) {
  return (
    <DropdownMenu>
      <div className="flex h-full min-w-0 flex-1 items-center justify-center">
        <div className="relative h-full min-h-0 w-full flex-1 overflow-hidden bg-background">
          {enableCommandCenter ? (
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="absolute right-0 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-3 rounded-l-2xl border border-r-0 border-border/70 bg-card/90 px-2 py-4 text-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-card"
                aria-label="Open command center"
              >
                <Command className="h-4 w-4 text-primary" />
                <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-semibold uppercase tracking-[0.1em] text-foreground/85">
                  Shortcuts
                </span>
              </button>
            </DropdownMenuTrigger>
          ) : null}

          <div className="absolute inset-0 bg-transparent" />
          <div className="relative flex h-full w-full flex-col">
            <div className="flex min-h-0 flex-1 items-center justify-center p-6 lg:p-10">
              <div className="flex w-full max-w-lg flex-col items-center px-8 py-8">
                <ChatNexusShellLogo />
                <div className="-mt-6 text-center text-2xl font-semibold tracking-normal opacity-60 dark:opacity-60 sm:text-3xl">
                  <span className="text-foreground">chatnexus</span>
                  <span className="text-primary">.me</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {enableCommandCenter ? (
        <DropdownMenuContent
          side="left"
          align="center"
          sideOffset={12}
          className="w-[14rem] rounded-[1.4rem] border-border/70 bg-card/96 p-2 shadow-xl backdrop-blur-xl"
        >
          <div className="">
            {commandCenterShortcuts.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-foreground transition-colors hover:bg-muted/70"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-foreground/90" />
                    <span className="text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 font-mono text-xs font-semibold text-muted-foreground">
                    <Command className="h-3.5 w-3.5" />
                    {item.shortcut}
                  </span>
                </div>
              );
            })}
          </div>
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  );
}
