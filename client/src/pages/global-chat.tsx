import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useQuery } from "@tanstack/react-query";
import { GlobalMessage } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

export default function GlobalChat() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messageInput, setMessageInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<GlobalMessage[]>([]);

  const { data: initialMessages } = useQuery<GlobalMessage[]>({
    queryKey: ["/api/global-messages"],
  });

  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (data: { message: GlobalMessage }) => {
      setMessages((prev) => [...prev, data.message]);
    };

    socket.on("global_message", handleNewMessage);

    return () => {
      socket.off("global_message", handleNewMessage);
    };
  }, [socket]);

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
          <CardHeader className="border-b">
            <CardTitle>Global Chatroom</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((msg) => {
                  const isMe = msg.senderId === user?.userId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          isMe
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {!isMe && (
                          <div className="text-xs opacity-70 mb-1">
                            User #{msg.senderId}
                          </div>
                        )}
                        <p>{msg.message}</p>
                        <div className="text-xs opacity-50 mt-1 text-right">
                          {format(new Date(msg.timestamp), "HH:mm")}
                        </div>
                      </div>
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
