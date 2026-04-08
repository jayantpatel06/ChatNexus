import { MessageCircle } from "lucide-react";

export function PageLoader() {
  return (
    <div className="preloader" role="status" aria-live="polite" aria-label="Loading page">
      <div className="preloader-ring" aria-hidden="true">
        <MessageCircle className="h-8 w-8 text-brand-primary" />
      </div>
      <span className="sr-only">Loading page...</span>
    </div>
  );
}
