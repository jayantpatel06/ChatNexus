import { PrivateChatPageShell } from "@/pages/private-chat-page-shell";

export default function ChatHistoryPage() {
  return (
    <PrivateChatPageShell
      mode="history"
      title="History | ChatNexus"
      description="Protected conversation history inside ChatNexus."
      path="/history"
      testId="chat-history"
    />
  );
}
