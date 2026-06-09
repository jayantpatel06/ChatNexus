import LegalDocumentPage, {
  type LegalSection,
} from "./legal-document-page";

const SECTIONS: LegalSection[] = [
  {
    id: "information-we-collect",
    title: "Information We Collect",
    content: [
      "ChatNexus collects minimal information to provide and improve our service. The data we collect depends on how you use the platform:",
    ],
    list: [
      "Account Data: When you register, we collect your email address, username, age, and gender. Guest users provide only a temporary username that is not permanently stored.",
      "Message Data: Messages sent through ChatNexus are processed in real-time for delivery. We do not permanently store the content of private messages after they have been delivered.",
      "Usage Data: We collect anonymized analytics such as page views, session duration, and feature usage to improve performance and user experience.",
      "Device Data: Basic device information including browser type, operating system, and screen resolution may be collected for compatibility purposes.",
      "Uploaded Media: Files and images shared in conversations are stored temporarily on our servers to facilitate delivery and are subject to automatic cleanup policies.",
    ],
  },
  {
    id: "how-we-use-information",
    title: "How We Use Your Information",
    content: [
      "We use the information we collect for the following purposes:",
    ],
    list: [
      "To provide, operate, and maintain the ChatNexus platform",
      "To authenticate your identity and manage your account",
      "To deliver messages and media in real-time conversations",
      "To respond to your support requests and help center submissions",
      "To detect and prevent abuse, spam, and violations of our Terms of Service",
      "To analyze aggregate usage patterns and improve platform performance",
      "To send important service-related notifications (not marketing spam)",
    ],
  },
  {
    id: "cookies",
    title: "Cookies & Local Storage",
    content: [
      "ChatNexus uses cookies and browser local storage to maintain your session, remember your theme preference (light/dark mode), and keep you logged in across visits. We do not use third-party advertising cookies.",
      "You can clear cookies and local storage at any time through your browser settings, though this may require you to log in again.",
    ],
    contentList: true,
  },
  {
    id: "data-sharing",
    title: "Data Sharing & Third Parties",
    content: [
      "ChatNexus does not sell, rent, or trade your personal information to third parties. Period.",
      "We may share data only in the following limited circumstances:",
    ],
    list: [
      "Infrastructure Providers: We use hosting and database services to operate the platform. These providers process data on our behalf under strict contractual obligations.",
      "Legal Requirements: We may disclose information if required by law, court order, or governmental regulation.",
      "Safety: If we believe disclosure is necessary to protect the safety of our users or the public.",
    ],
  },
  {
    id: "data-retention",
    title: "Data Retention",
    content: [
      "We retain your account data for as long as your account is active. If you request account deletion through our Help Center, we will permanently delete your account data within 30 days.",
      "Guest session data is ephemeral and is automatically purged when the session ends or after a short expiration window.",
      "Anonymized analytics data may be retained indefinitely as it cannot be linked back to individual users.",
    ],
    contentList: true,
  },
  {
    id: "your-rights",
    title: "Your Rights",
    content: ["As a ChatNexus user, you have the right to:"],
    list: [
      "Access the personal data we hold about you",
      "Request correction of inaccurate data",
      "Request deletion of your account and associated data",
      "Export your data in a portable format",
      "Opt out of non-essential data collection",
    ],
    after: [
      "To exercise any of these rights, please contact us through the Help Center at chatnexus.me/help-center or email us at support@chatnexus.me.",
    ],
  },
  {
    id: "security",
    title: "Security",
    content: [
      "We take the security of your data seriously. ChatNexus implements industry-standard security measures including encrypted connections (HTTPS/WSS), secure password hashing, token-based authentication, and regular security audits.",
      "However, no method of transmission over the internet is 100% secure. While we strive to protect your data, we cannot guarantee absolute security.",
    ],
    contentList: true,
  },
  {
    id: "childrens-privacy",
    title: "Children's Privacy",
    content: [
      "ChatNexus is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13. If we learn that we have collected data from a child under 13, we will delete it promptly.",
    ],
  },
  {
    id: "changes",
    title: "Changes to This Policy",
    content: [
      "We may update this Privacy Policy from time to time. When we make significant changes, we will notify users through the platform. Your continued use of ChatNexus after changes constitutes acceptance of the updated policy.",
    ],
    after: ["Last updated: March 2026"],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      heading="Privacy Policy"
      seoTitle="Privacy Policy | ChatNexus"
      seoDescription="Read ChatNexus's privacy policy to understand how we collect, use, and protect your data."
      path="/privacy"
      sections={SECTIONS}
    />
  );
}
