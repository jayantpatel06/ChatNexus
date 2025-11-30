import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GlobalMessageWithSender } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

export default function GlobalChat() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messageInput, setMessageInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery<GlobalMessageWithSender[]>({
    queryKey: ["/api/global-messages"],
  });

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (data: { message: GlobalMessageWithSender }) => {
      queryClient.setQueryData<GlobalMessageWithSender[]>(["/api/global-messages"], (old) => {
        if (!old) return [data.message];
        // Check if message already exists to prevent duplicates
        if (old.some(m => m.id === data.message.id)) return old;
        return [...old, data.message];
      });
    };

    socket.on("global_message", handleNewMessage);

    return () => {
      socket.off("global_message", handleNewMessage);
    };
  }, [socket, queryClient]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !socket) return;

    socket.emit("global_message", {
      message: messageInput,
      receiverId: 0 // Not used for global, but keeping structure if needed or just ignore
    });

    setMessageInput("");
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-4xl flex-1 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Global Chat</h1>
        </div>

        <Card className="flex-1 flex flex-col h-[600px]">
          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-1">
                {messages.map((msg) => {
                  const isMe = msg.senderId === user?.userId;
                  return (
                    <div
                      key={msg.id}
                      className="flex items-baseline gap-2 py-1 hover:bg-muted/50 px-2 rounded"
                    >
                      <span className={`font-bold text-sm whitespace-nowrap ${isMe ? "text-primary" : "text-foreground"}`}>
                        {isMe ? "Me" : msg.sender.username} :
                      </span>
                      <span className="text-sm">{msg.message}</span>
                      <span className="text-xs text-green-500 whitespace-nowrap ml-2">
                        {format(new Date(msg.timestamp), "HH:mm")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="p-4 border-t">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1"
                />
                <Button type="submit" size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
