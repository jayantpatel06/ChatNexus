import { SettingsSidebar } from "@/chat/settings-sidebar";
import { ChatDesktopShellPlaceholder } from "@/chat/chat-desktop-shell-placeholder";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { Seo } from "@/components/seo";
import { Settings2 } from "lucide-react";

export default function SettingsPage() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <>
        <Seo
          title="Settings | ChatNexus"
          description="Settings"
          path="/settings"
          robots="noindex, nofollow"
        />
        <div className="safe-top-shell flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
          <div className="flex-1 min-h-0">
            <SettingsSidebar />
          </div>
          <MobileBottomNav />
        </div>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Settings | ChatNexus"
        description="Settings"
        path="/settings"
        robots="noindex, nofollow"
      />
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <SettingsSidebar />
        <ChatDesktopShellPlaceholder
          icon={Settings2}
          title="Manage your settings and preferences here"
        />
      </div>
    </>
  );
}
