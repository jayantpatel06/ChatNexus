import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Seo } from "@/components/seo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const ISSUE_OPTIONS = [
  { value: "account_deletion", label: "Account deletion request" },
  { value: "deletion_follow_up", label: "Deletion follow-up" },
  { value: "login_problem", label: "Login or access issue" },
  { value: "privacy_report", label: "Privacy concern" },
  { value: "other", label: "Other help request" },
] as const;

export default function HelpCenterPage() {
  const { toast } = useToast();
  const [issueType, setIssueType] = useState<string>("account_deletion");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!issueType) {
      toast({
        title: "Select an issue",
        description: "Please choose a help topic from the dropdown.",
        variant: "destructive",
      });
      return;
    }
    if (trimmed.length < 20) {
      toast({
        title: "Message too short",
        description: "Please provide at least 20 characters for your request.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await apiRequest("POST", "/api/help-center", {
        issueType,
        message: trimmed,
      });
      setMessage("");
      setIssueType("account_deletion");
      toast({
        title: "Request submitted",
        description: "Our support team received your request and will respond soon.",
      });
    } catch (error) {
      toast({
        title: "Could not submit request",
        description:
          error instanceof Error
            ? error.message
            : "Please try again in a few minutes.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Seo
        title="Help Center | ChatNexus"
        description="Contact ChatNexus support for account deletion and related account requests."
        path="/help-center"
      />
      <main className="min-h-screen bg-brand-bg text-brand-text px-4 py-10 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <Link href="/">
            <Button
              variant="ghost"
              className="mb-6 gap-2 rounded-full border border-brand-border hover:bg-brand-primary/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>

          <section className="rounded-2xl border border-brand-border bg-brand-card/90 p-6 shadow-sm ring-1 ring-border/40 backdrop-blur-sm sm:p-8">
            <h1 className="text-3xl font-bold tracking-tight">Contact Us / Help Center</h1>
            <p className="mt-2 text-sm text-brand-muted">
              Use this form for account deletion or any account support issue.
            </p>

            <form className="mt-8 space-y-6" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="issue-type">Related issue</Label>
                <Select value={issueType} onValueChange={setIssueType}>
                  <SelectTrigger id="issue-type" className="w-full">
                    <SelectValue placeholder="Select an issue" />
                  </SelectTrigger>
                  <SelectContent>
                    {ISSUE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="help-message">Message</Label>
                <Textarea
                  id="help-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue in detail. For account deletion, include your username/email and the reason for deletion."
                  className="min-h-36 resize-y"
                />
              </div>

              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Submit Request
              </Button>
            </form>
          </section>
        </div>
      </main>
    </>
  );
}
