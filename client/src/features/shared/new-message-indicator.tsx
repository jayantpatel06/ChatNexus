import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

interface NewMessageIndicatorProps {
  onClick: () => void;
  className?: string;
}

/**
 * Instagram-style floating indicator shown when new messages arrive
 * while user is scrolled up in the chat.
 */
export function NewMessageIndicator({
  onClick,
  className = "absolute bottom-28 left-1/2 transform -translate-x-1/2 z-50",
}: NewMessageIndicatorProps) {
  return (
    <div className={className}>
      <Button
        onClick={onClick}
        className="rounded-full px-4 py-2 shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
        size="sm"
      >
        <ChevronDown className="w-4 h-4" />
        New message
      </Button>
    </div>
  );
}
