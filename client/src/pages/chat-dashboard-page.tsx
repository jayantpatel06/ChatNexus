import { PrivateChatPageShell } from "@/pages/private-chat-page-shell";

export default function ChatDashboard() {
  return (
    <PrivateChatPageShell
      title="Dashboard | ChatNexus"
      description="Protected chat dashboard inside ChatNexus."
      path="/dashboard"
      testId="chat-dashboard"
    />
  );
}
