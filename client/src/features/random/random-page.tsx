import { useLocation } from "wouter";
import { Seo } from "@/components/seo";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChatDesktopShellPlaceholder } from "@/features/shared/chat-desktop-shell";
import { MobileBottomNav } from "@/features/shared/mobile-bottom-nav";
import { RandomChatArea } from "./random-chat-panel";
import { RandomSidebar } from "./random-sidebar";
import { useRandomChat } from "./use-random-chat";

export default function RandomChatPage() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const {
    user,
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
    messages,
    messageInput,
    showEmojiPicker,
    setShowEmojiPicker,
    statusMessage,
    disconnectedPartnerName,
    isPartnerTyping,
    messagesContainerRef,
    composerPickerRef,
    composerPickerTriggerRef,
    handleEmojiClick,
    handleSendGif,
    handleConfirmChatEnd,
    handleMessageInputChange,
    handleKeyDown,
    handleSendMessage,
    handleSkipChat,
    footerActionState,
    hasDraftText,
    isDarkTheme,
  } = useRandomChat();

  const conversationPanel = (
    <RandomChatArea
      currentPartner={currentPartner}
      currentUserId={user?.userId ?? null}
      currentUsername={user?.username ?? null}
      disconnectedPartnerName={disconnectedPartnerName}
      footerActionState={footerActionState}
      hasDraftText={hasDraftText}
      isDarkTheme={isDarkTheme}
      isChatActive={isMatched}
      isFindingMatch={isFindingMatch}
      isMobile={isMobile}
      isPartnerTyping={isPartnerTyping}
      messageInput={messageInput}
      messages={messages}
      messagesContainerRef={messagesContainerRef}
      onBack={leaveRandomChat}
      onEmojiClick={handleEmojiClick}
      onGifClick={handleSendGif}
      onConfirmChatEnd={handleConfirmChatEnd}
      onInputChange={handleMessageInputChange}
      onInputKeyDown={handleKeyDown}
      onSendMessage={handleSendMessage}
      onSkip={handleSkipChat}
      onStartChat={() => beginMatchmaking()}
      setShowEmojiPicker={setShowEmojiPicker}
      statusMessage={statusMessage}
      showEmojiPicker={showEmojiPicker}
      composerPickerRef={composerPickerRef}
      composerPickerTriggerRef={composerPickerTriggerRef}
    />
  );

  const sidebarPanel = (
    <RandomSidebar
      currentPartner={currentPartner}
      preferences={preferences}
      setPreferences={setPreferences}
      interestDraft={interestDraft}
      setInterestDraft={setInterestDraft}
      isInterestsExpanded={isInterestsExpanded}
      setIsInterestsExpanded={setIsInterestsExpanded}
      isFindingMatch={isFindingMatch}
      isMatched={isMatched}
      handleAddInterest={handleAddInterest}
      handleRemoveInterest={handleRemoveInterest}
      beginMatchmaking={beginMatchmaking}
      leaveRandomChat={leaveRandomChat}
    />
  );

  const shouldShowConversationPanel =
    currentPartner !== null || messages.length > 0 || isFindingMatch;

  if (isMobile) {
    if (shouldShowConversationPanel) {
      return (
        <>
          <Seo
            title="Random Chat | ChatNexus"
            description="Protected random chat inside ChatNexus."
            path="/random"
            robots="noindex, nofollow"
          />
          <div
            className="safe-top-shell flex h-[100dvh] flex-col bg-brand-bg"
            data-testid="random-chat-mobile-layout"
          >
            {conversationPanel}
          </div>
        </>
      );
    }

    return (
      <>
        <Seo
          title="Random Chat | ChatNexus"
          description="Protected random chat inside ChatNexus."
          path="/random"
          robots="noindex, nofollow"
        />
        <div
          className="safe-top-shell flex h-[100dvh] flex-col bg-brand-bg"
          data-testid="random-chat-mobile-layout"
        >
          <div className="flex-1 min-h-0 overflow-hidden bg-background">
            {sidebarPanel}
          </div>
          <MobileBottomNav />
        </div>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Random Chat | ChatNexus"
        description="Protected random chat inside ChatNexus."
        path="/random"
        robots="noindex, nofollow"
      />
      <div
        className="flex h-screen overflow-hidden bg-background text-foreground"
        data-testid="random-chat-desktop-layout"
      >
        {sidebarPanel}

        <div className="flex min-w-0 flex-1">
          {shouldShowConversationPanel ? (
            conversationPanel
          ) : (
            <ChatDesktopShellPlaceholder enableCommandCenter />
          )}
        </div>
      </div>
    </>
  );
}
