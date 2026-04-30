import type { LucideIcon } from "lucide-react";

type ChatDesktopShellPlaceholderProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
};

export function ChatDesktopShellPlaceholder({
  icon: Icon,
  title,
  description,
}: ChatDesktopShellPlaceholderProps) {
  return (
    <div className="flex min-w-0 flex-1">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.14),transparent_40%)] dark:bg-[radial-gradient(circle_at_top,rgba(71,85,105,0.3),transparent_44%)]" />
        <div className="relative flex h-full flex-col">
          <div className="flex flex-1 items-center justify-center p-6 lg:p-10">
            <div className="w-full max-w-3xl p-8 text-center lg:p-10">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-primary/10 text-primary">
                <Icon className="h-8 w-8" />
              </div>
              <p className="mt-6 text-xl font-semibold tracking-tight text-foreground">
                {title}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
