import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Loader2, ChevronDown } from "lucide-react";
import { Seo } from "@/components/seo";
import { Button } from "@/components/ui/button";
import { CustomCursor } from "@/components/effects";
import SiteNav from "@/components/site-nav";
import PageFooter from "@/components/page-footer";
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
import { fetchWithTimeout } from "@/lib/queryClient";

const DEFAULT_ISSUE_TYPE = "account_deletion";
const HELP_CENTER_API_PATH = "/api/help-center";
const MIN_HELP_MESSAGE_LENGTH = 20;
const ISSUE_OPTIONS = [
  { value: "account_deletion", label: "Account deletion request" },
  { value: "deletion_follow_up", label: "Deletion follow-up" },
  { value: "login_problem", label: "Login or access issue" },
  { value: "privacy_report", label: "Privacy concern" },
  { value: "other", label: "Other help request" },
] as const;

const HELP_FAQS = [
  {
    question: "How do I delete my ChatNexus account?",
    answer:
      "Select 'Account deletion request' from the form below, provide your username or email, and submit. Our team will process your request and permanently delete your account data within 30 days.",
  },
  {
    question: "I can't log into my account. What should I do?",
    answer:
      "First, make sure you're using the correct email address and password. If you've forgotten your password, select 'Login or access issue' from the form below and describe the problem. Our support team will help you regain access.",
  },
  {
    question: "Can I use ChatNexus without creating an account?",
    answer:
      "Yes! ChatNexus offers guest access that lets you start chatting immediately with a temporary username. Guest sessions are ephemeral — your data is automatically purged when the session ends.",
  },
  {
    question: "How do I report inappropriate behavior?",
    answer:
      "If you encounter harassment, spam, or any violations of our Terms of Service, select 'Privacy concern' or 'Other help request' in the form below. Include details about the user and the behavior so our moderation team can take action.",
  },
  {
    question: "Is my data safe on ChatNexus?",
    answer:
      "Absolutely. ChatNexus uses encrypted connections (HTTPS/WSS), secure password hashing, and minimal data retention. Private messages are processed in real-time and not permanently stored. Read our full Privacy Policy for details.",
  },
  {
    question: "How long does it take to get a response from support?",
    answer:
      "We review support inbox requests as quickly as possible. Response times vary based on volume and the type of issue you report.",
  },
];

type HelpCenterRequest = {
  issueType: string;
  message: string;
};

async function submitHelpCenterRequest(payload: HelpCenterRequest) {
  const response = await fetchWithTimeout(HELP_CENTER_API_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message ?? "Please try again in a few minutes.");
  }
}

export default function HelpCenterPage() {
  const { toast } = useToast();
  const [issueType, setIssueType] = useState<string>(DEFAULT_ISSUE_TYPE);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
    if (trimmed.length < MIN_HELP_MESSAGE_LENGTH) {
      toast({
        title: "Message too short",
        description: `Please provide at least ${MIN_HELP_MESSAGE_LENGTH} characters for your request.`,
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await submitHelpCenterRequest({
        issueType,
        message: trimmed,
      });
      setMessage("");
      setIssueType(DEFAULT_ISSUE_TYPE);
      toast({
        title: "Request submitted",
        description: "Your request was recorded in our support inbox for review.",
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
        description="Get help with your ChatNexus account. Find answers to common questions or submit a support request."
        path="/help-center"
      />
      <div className="landing-root">
        <CustomCursor />
        <SiteNav />
      <main className="min-h-screen pt-28 pb-10 px-4 sm:px-6 relative z-10 w-full">
        <div className="mx-auto w-full max-w-3xl">

          {/* ── FAQ Section ── */}
          <section className="mb-8 rounded-2xl border border-brand-border bg-brand-card/90 p-6 shadow-sm ring-1 ring-border/40 backdrop-blur-sm sm:p-8">
            <h1 className="text-3xl font-bold tracking-tight">Help Center</h1>
            <p className="mt-2 text-sm text-brand-muted">
              Find quick answers to common questions below, or scroll down to
              submit a support request.
            </p>

            <div className="mt-8 space-y-3">
              <h2 className="text-lg font-semibold mb-4">Frequently Asked Questions</h2>
              {HELP_FAQS.map((faq, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-brand-border overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-5 py-4 text-left font-medium text-brand-text hover:bg-brand-card/60 transition-colors"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    aria-expanded={openFaq === i}
                  >
                    <span className="pr-4">{faq.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 flex-shrink-0 text-brand-muted transition-transform duration-200 ${
                        openFaq === i ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {openFaq === i && (
                    <div className="px-5 pb-4 text-sm text-brand-muted leading-relaxed border-t border-brand-border pt-3">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── Support Form ── */}
          <section className="rounded-2xl border border-brand-border bg-brand-card/90 p-6 shadow-sm ring-1 ring-border/40 backdrop-blur-sm sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight">Submit a Request</h2>
            <p className="mt-2 text-sm text-brand-muted">
              Can't find what you're looking for? Use this form for account
              deletion or any account support issue.
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
      <PageFooter />
      </div>
    </>
  );
}
