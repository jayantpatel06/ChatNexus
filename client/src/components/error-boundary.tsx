import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("App error boundary caught an error:", error, errorInfo);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg px-6 text-brand-text">
        <div className="w-full max-w-md rounded-[1.75rem] border border-brand-border bg-brand-card p-8 text-center shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-brand-muted">
            Something went wrong
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-brand-text">
            ChatNexus hit an unexpected error
          </h1>
          <p className="mt-3 text-sm text-brand-muted">
            Refresh the view or head back home. Your session is still stored locally.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button onClick={this.handleRetry}>Try Again</Button>
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
