import LegalDocumentPage, {
  type LegalSection,
} from "@/components/legal-document-page";

const SECTIONS: LegalSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of Terms",
    content: [
      "By accessing or using ChatNexus, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree with any part of these terms, you must not use the platform.",
      "These terms apply to all users of ChatNexus, including registered users, guest users, and visitors browsing the site.",
    ],
  },
  {
    id: "eligibility",
    title: "Eligibility",
    content: [
      "You must be at least 13 years of age to use ChatNexus. By creating an account or using guest access, you represent that you meet this age requirement.",
      "If you are between 13 and 18, you may use ChatNexus only with the involvement and consent of a parent or legal guardian.",
    ],
    contentList: true,
  },
  {
    id: "accounts",
    title: "User Accounts",
    content: [
      "You may use ChatNexus as a guest (with limited features) or create a registered account. When creating an account:",
    ],
    list: [
      "You must provide accurate and complete registration information",
      "You are responsible for maintaining the confidentiality of your password",
      "You are responsible for all activity that occurs under your account",
      "You must notify us immediately of any unauthorized use of your account",
      "You may not create multiple accounts to circumvent bans or restrictions",
    ],
    after: [
      "ChatNexus reserves the right to suspend or terminate accounts that violate these terms.",
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    content: [
      "ChatNexus is designed for respectful, constructive conversations. You agree not to:",
    ],
    list: [
      "Send messages that are harassing, threatening, abusive, or hateful",
      "Share illegal content, including but not limited to child exploitation material",
      "Impersonate other users, ChatNexus staff, or public figures",
      "Spam, flood, or disrupt conversations with automated scripts or bots",
      "Attempt to access other users' accounts or private data",
      "Use ChatNexus for commercial solicitation, advertising, or phishing",
      "Upload malware, viruses, or other harmful files",
      "Circumvent any security features, rate limits, or content filters",
      "Engage in any activity that violates applicable laws or regulations",
    ],
  },
  {
    id: "content",
    title: "User Content",
    content: [
      "You retain ownership of the content you create and share on ChatNexus. However, by using the platform, you grant ChatNexus a limited, non-exclusive license to transmit, process, and temporarily store your content as necessary to operate the service.",
      "We do not claim ownership of your messages, images, or files. Private messages are processed in real-time and are not permanently stored on our servers after delivery.",
      "ChatNexus reserves the right to remove content that violates these terms without prior notice.",
    ],
    contentList: true,
  },
  {
    id: "guest-access",
    title: "Guest Access",
    content: [
      "ChatNexus offers guest access that allows users to participate in conversations without creating a permanent account. Guest sessions are temporary and subject to the following conditions:",
    ],
    list: [
      "Guest usernames are not reserved and may be reused by other guests",
      "Guest message history is not preserved between sessions",
      "Guest accounts may have limited access to certain features",
      "ChatNexus may terminate guest sessions at any time",
    ],
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    content: [
      "The ChatNexus platform, including its design, code, branding, logos, and documentation, is the intellectual property of ChatNexus and is protected by copyright and trademark laws.",
      "You may not copy, modify, distribute, or create derivative works based on the ChatNexus platform without explicit written permission.",
    ],
    contentList: true,
  },
  {
    id: "disclaimers",
    title: "Disclaimers & Limitation of Liability",
    content: [
      'ChatNexus is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied. We do not guarantee that the service will be uninterrupted, secure, or error-free.',
      "ChatNexus is not responsible for the content, accuracy, or behavior of its users. You interact with other users at your own risk.",
      "To the maximum extent permitted by law, ChatNexus shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform.",
    ],
    contentList: true,
  },
  {
    id: "termination",
    title: "Termination",
    content: [
      "We reserve the right to suspend or terminate your access to ChatNexus at any time, with or without cause, and with or without notice. Reasons for termination may include, but are not limited to, violation of these terms, abusive behavior, or extended inactivity.",
      "Upon termination, your right to use ChatNexus will immediately cease. Data associated with terminated accounts may be deleted in accordance with our Privacy Policy.",
    ],
    contentList: true,
  },
  {
    id: "modifications",
    title: "Modifications to Terms",
    content: [
      "ChatNexus reserves the right to modify these Terms of Service at any time. When we make material changes, we will provide notice through the platform.",
      "Your continued use of ChatNexus after modifications constitutes acceptance of the updated terms. If you do not agree with the changes, you should stop using the platform.",
    ],
    contentList: true,
    after: ["Last updated: March 2026"],
  },
];

export default function TermsOfServicePage() {
  return (
    <LegalDocumentPage
      heading="Terms & Conditions"
      seoTitle="Terms of Service | ChatNexus"
      seoDescription="Read the ChatNexus Terms of Service governing the use of our anonymous chat platform."
      path="/terms"
      sections={SECTIONS}
    />
  );
}
