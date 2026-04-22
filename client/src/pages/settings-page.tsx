import { SettingsSidebar } from "@/chat/settings-sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { Seo } from "@/components/seo";

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
        <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
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
        <div className="flex flex-1 flex-col items-center justify-center bg-muted/30 px-6">
          <div className="rounded-full border border-border bg-card/90 px-4 py-2 text-sm text-muted-foreground">
            Settings are managed from the left panel.
          </div>
        </div>
      </div>
    </>
  );
}
