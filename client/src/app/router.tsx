import { Suspense, lazy, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { PageLoader } from "@/components/page-loader";
import { getAppLenis } from "@/lib/lenis";
import { ProtectedRoute } from "./protected-route";

const LandingPage = lazy(() => import("@/pages/landing-page"));
const ChatDashboard = lazy(() => import("@/pages/chat-dashboard-page"));
const ChatHistoryPage = lazy(() => import("@/pages/chat-history-page"));
const GlobalChat = lazy(() => import("@/pages/global-chat-page"));
const RandomChatPage = lazy(() => import("@/pages/random-chat-page"));
const AuthPage = lazy(() => import("@/pages/auth-page"));
const HelpCenterPage = lazy(() => import("@/pages/help-center-page"));
const FeaturesPage = lazy(() => import("@/pages/features-page"));
const AboutPage = lazy(() => import("@/pages/about-page"));
const ContactPage = lazy(() => import("@/pages/contact-page"));
const PrivacyPolicyPage = lazy(() => import("@/pages/privacy-policy-page"));
const TermsOfServicePage = lazy(() => import("@/pages/terms-of-service-page"));
const NotFoundPage = lazy(() => import("@/pages/not-found-page"));

function RouteScrollRestoration() {
  const [location] = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash) {
      return;
    }

    const lenis = getAppLenis();

    if (lenis) {
      lenis.scrollTo(0, { immediate: true, force: true });
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);

  return null;
}

export function AppRouter() {
  return (
    <>
      <RouteScrollRestoration />
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={LandingPage} />
          <ProtectedRoute path="/dashboard" component={ChatDashboard} />
          <ProtectedRoute path="/history" component={ChatHistoryPage} />
          <ProtectedRoute path="/global-chat" component={GlobalChat} />
          <ProtectedRoute path="/random-chat" component={RandomChatPage} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/help-center" component={HelpCenterPage} />
          <Route path="/features" component={FeaturesPage} />
          <Route path="/about" component={AboutPage} />
          <Route path="/contact" component={ContactPage} />
          <Route path="/privacy" component={PrivacyPolicyPage} />
          <Route path="/terms" component={TermsOfServicePage} />
          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
    </>
  );
}
