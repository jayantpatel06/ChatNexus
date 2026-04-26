import { Suspense, lazy, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { PageLoader } from "@/components/page-loader";
import { getAppLenis } from "@/lib/lenis";

const LandingPage = lazy(() => import("@/pages/landing-page"));
const ChatDashboard = lazy(() => import("@/pages/chat-dashboard-page"));
const GlobalChat = lazy(() => import("@/chat/global-chat-sidebar"));
const GlobalChatRoom = lazy(() => import("@/chat/global-chat-room-panel"));
const RandomChatPage = lazy(() => import("@/pages/random-chat-page"));
const SettingsPage = lazy(() => import("@/pages/settings-page"));
const AuthPage = lazy(() => import("@/pages/auth-page"));
const HelpCenterPage = lazy(() => import("@/pages/help-center-page"));
const FeaturesPage = lazy(() => import("@/pages/features-page"));
const AboutPage = lazy(() => import("@/pages/about-page"));
const ContactPage = lazy(() => import("@/pages/contact-page"));
const PrivacyPolicyPage = lazy(() => import("@/pages/privacy-policy-page"));
const TermsOfServicePage = lazy(() => import("@/pages/terms-of-service-page"));
const NotFoundPage = lazy(() => import("@/pages/not-found-page"));
const ProtectedRouteBoundary = lazy(() =>
  import("./protected-route").then((module) => ({
    default: module.ProtectedRoute,
  })),
);
const AuthRouteBoundary = lazy(() =>
  import("./auth-route").then((module) => ({
    default: module.AuthRoute,
  })),
);

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

function NotificationNavigationBridge() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (
        event.data?.type !== "chatnexus:navigate-from-notification" ||
        typeof event.data?.url !== "string"
      ) {
        return;
      }

      const nextUrl = new URL(event.data.url, window.location.origin);
      if (nextUrl.origin !== window.location.origin) {
        window.location.assign(nextUrl.toString());
        return;
      }

      setLocation(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      window.focus();
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [setLocation]);

  return null;
}

export function AppRouter() {
  return (
    <>
      <RouteScrollRestoration />
      <NotificationNavigationBridge />
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={LandingPage} />
          <Route path="/dashboard">
            <ProtectedRouteBoundary component={ChatDashboard} />
          </Route>
          <Route path="/global-chat/room">
            <ProtectedRouteBoundary component={GlobalChatRoom} />
          </Route>
          <Route path="/global-chat">
            <ProtectedRouteBoundary component={GlobalChat} />
          </Route>
          <Route path="/random-chat">
            <ProtectedRouteBoundary component={RandomChatPage} />
          </Route>
          <Route path="/settings">
            <ProtectedRouteBoundary component={SettingsPage} />
          </Route>
          <Route path="/auth">
            <AuthRouteBoundary component={AuthPage} />
          </Route>
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
