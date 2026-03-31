import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import AboutPage from "@/pages/about-page";
import AuthPage from "@/pages/auth-page";
import ChatDashboard from "@/pages/chat-dashboard-page";
import ContactPage from "@/pages/contact-page";
import FeaturesPage from "@/pages/features-page";
import GlobalChat from "@/pages/global-chat-page";
import HelpCenterPage from "@/pages/help-center-page";
import LandingPage from "@/pages/landing-page";
import NotFoundPage from "@/pages/not-found-page";
import PrivacyPolicyPage from "@/pages/privacy-policy-page";
import TermsOfServicePage from "@/pages/terms-of-service-page";
import { ProtectedRoute } from "./protected-route";

function RouteScrollRestoration() {
  const [location] = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash) {
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
      <Switch>
        <Route path="/" component={LandingPage} />
        <ProtectedRoute path="/dashboard" component={ChatDashboard} />
        <ProtectedRoute path="/global-chat" component={GlobalChat} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/help-center" component={HelpCenterPage} />
        <Route path="/features" component={FeaturesPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/privacy" component={PrivacyPolicyPage} />
        <Route path="/terms" component={TermsOfServicePage} />
        <Route component={NotFoundPage} />
      </Switch>
    </>
  );
}
