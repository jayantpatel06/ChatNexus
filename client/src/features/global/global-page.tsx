import { useState } from "react";
import { useLocation } from "wouter";
import { GlobalChatSidebar } from "./global-sidebar";
import { GlobalChatRoomPanel } from "./global-chat-panel";
import { MobileBottomNav } from "@/features/shared/mobile-bottom-nav";
import { ChatDesktopShellPlaceholder } from "@/features/shared/chat-desktop-shell";
import { Seo } from "@/components/seo";
import { useIsMobile } from "@/hooks/use-mobile";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export default function GlobalChatPage() {
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [showDesktopRoom, setShowDesktopRoom] = useState(true);

  const openGlobalRoom = () => {
    if (!isMobile) {
      setShowDesktopRoom(true);
      return;
    }

    if (location !== "/global/chat") {
      setLocation("/global/chat");
    }
  };

  const closeDesktopRoom = () => {
    setShowDesktopRoom(false);
  };

  useKeyboardShortcuts([
    {
      combo: { key: "g" },
      action: () => {
        if (!showDesktopRoom) {
          openGlobalRoom();
        }
      },
    },
  ]);

  if (isMobile) {
    return (
      <>
        <Seo
          title="Global Chat | ChatNexus"
          description="Discover who is active in the ChatNexus global room."
          path="/global"
          robots="noindex, nofollow"
        />
        <div className="safe-top-shell flex h-[100dvh] flex-col bg-background text-foreground">
          <div className="min-h-0 flex-1 overflow-hidden">
            <GlobalChatSidebar onEnterRoom={openGlobalRoom} />
          </div>
          <MobileBottomNav />
        </div>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Global Chat | ChatNexus"
        description="Discover who is active in the ChatNexus global room."
        path="/global"
        robots="noindex, nofollow"
      />
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <GlobalChatSidebar onEnterRoom={openGlobalRoom} />

        {showDesktopRoom ? (
          <GlobalChatRoomPanel isMobile={false} onBack={closeDesktopRoom} />
        ) : (
          <ChatDesktopShellPlaceholder enableCommandCenter />
        )}
      </div>
    </>
  );
}
