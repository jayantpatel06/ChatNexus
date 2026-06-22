import { Suspense, lazy, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { PageLoader } from "@/components/page-loader";
import { getAppLenis } from "@/lib/lenis";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { navigateWithinAppShell } from "@/app/app-shell-navigation";

const LandingPage = lazy(() => import("@/pages/landing-page"));
const ChatDashboard = lazy(() => import("@/features/direct/direct-page"));
const GlobalChat = lazy(() => import("@/features/global/global-page"));
const GlobalChatRoom = lazy(() => import("@/features/global/global-chat-panel"));
const RandomChatPage = lazy(() => import("@/features/random/random-page"));
const SettingsPage = lazy(() => import("@/features/settings/settings-page"));
const AuthPage = lazy(() => import("@/pages/auth-page"));
const HelpCenterPage = lazy(() => import("@/pages/help-center-page"));
const FeaturesPage = lazy(() => import("@/pages/features-page"));
const AboutPage = lazy(() => import("@/pages/about-page"));
const ContactPage = lazy(() => import("@/pages/contact-page"));
const PrivacyPolicyPage = lazy(() => import("@/pages/privacy-policy-page"));
const TermsOfServicePage = lazy(() => import("@/pages/terms-of-service-page"));
const OmegleAlternativePage = lazy(() => import("@/pages/omegle-alternative"));
const StrangerChatPage = lazy(() => import("@/pages/stranger-chat"));
const RandomChatPage2 = lazy(() => import("@/pages/random-chat"));
const AnonymousChatPage = lazy(() => import("@/pages/anonymous-chat"));
const ChatibAlternativePage = lazy(() => import("@/pages/chatib-alternative"));
const MonkeyAppAlternativePage = lazy(() => import("@/pages/monkey-app-alternative"));
const OmetvAlternativePage = lazy(() => import("@/pages/ometv-alternative"));
const ChitChatAlternativePage = lazy(() => import("@/pages/chitchat-alternative"));
const GlobalChatRoomPage = lazy(() => import("@/pages/global-chat-room"));
const BlogPage = lazy(() => import("@/pages/blog-page"));

// Blog Articles
const BlogPillarOmegle = lazy(() => import("@/pages/blog/pillar-omegle-alternatives"));
const BlogSafetyGuide = lazy(() => import("@/pages/blog/safety-guide"));
const BlogGlobalChat = lazy(() => import("@/pages/blog/global-chat-explained"));
const BlogStrangerVsRandom = lazy(() => import("@/pages/blog/stranger-vs-random"));
const BlogAnonymousRooms = lazy(() => import("@/pages/blog/anonymous-rooms"));
const BlogMakeFriends = lazy(() => import("@/pages/blog/make-friends"));
const BlogIsOmegleSafe = lazy(() => import("@/pages/blog/is-omegle-safe"));
const BlogAppsLikeMonkey = lazy(() => import("@/pages/blog/apps-like-monkey"));
const BlogBestAppsToTalk = lazy(() => import("@/pages/blog/best-apps-to-talk-to-strangers"));
const BlogWhyDidOmegleShutDown = lazy(() => import("@/pages/blog/why-did-omegle-shut-down"));
const BlogTextVsVideoChat = lazy(() => import("@/pages/blog/text-vs-video-chat"));
const BlogOmegleBanned = lazy(() => import("@/pages/blog/omegle-banned"));

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

function GlobalShortcutsBridge() {
  const [location, setLocation] = useLocation();

  useKeyboardShortcuts([
    {
      combo: { key: "d", altKey: true },
      action: () => navigateWithinAppShell(location, "/direct", setLocation),
    },
    {
      combo: { key: "g", altKey: true },
      action: () => navigateWithinAppShell(location, "/global", setLocation),
    },
    {
      combo: { key: "f", altKey: true },
      action: () => navigateWithinAppShell(location, "/random", setLocation),
    },
    {
      combo: { key: "s", altKey: true },
      action: () => navigateWithinAppShell(location, "/settings", setLocation),
    },
  ]);

  return null;
}

export function AppRouter() {
  return (
    <>
      <RouteScrollRestoration />
      <NotificationNavigationBridge />
      <GlobalShortcutsBridge />
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={LandingPage} />
          <Route path="/direct">
            <ProtectedRouteBoundary component={ChatDashboard} />
          </Route>
          <Route path="/global/chat">
            <ProtectedRouteBoundary component={GlobalChatRoom} />
          </Route>
          <Route path="/global">
            <ProtectedRouteBoundary component={GlobalChat} />
          </Route>
          <Route path="/random">
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
          <Route path="/omegle-alternative" component={OmegleAlternativePage} />
          <Route path="/stranger-chat" component={StrangerChatPage} />
          <Route path="/random-chat" component={RandomChatPage2} />
          <Route path="/anonymous-chat" component={AnonymousChatPage} />
          <Route path="/chatib-alternative" component={ChatibAlternativePage} />
          <Route path="/monkey-app-alternative" component={MonkeyAppAlternativePage} />
          <Route path="/ometv-alternative" component={OmetvAlternativePage} />
          <Route path="/chitchat-alternative" component={ChitChatAlternativePage} />
          <Route path="/global-chat-room" component={GlobalChatRoomPage} />
          <Route path="/blog" component={BlogPage} />
          
          <Route path="/blog/best-sites-like-omegle" component={BlogPillarOmegle} />
          <Route path="/blog/how-to-talk-to-strangers-online-safely" component={BlogSafetyGuide} />
          <Route path="/blog/what-is-a-global-chat-room" component={BlogGlobalChat} />
          <Route path="/blog/stranger-chat-vs-random-chat" component={BlogStrangerVsRandom} />
          <Route path="/blog/best-free-anonymous-chat-rooms" component={BlogAnonymousRooms} />
          <Route path="/blog/how-to-make-friends-online" component={BlogMakeFriends} />
          <Route path="/blog/is-omegle-safe" component={BlogIsOmegleSafe} />
          <Route path="/blog/apps-like-monkey" component={BlogAppsLikeMonkey} />
          <Route path="/blog/best-apps-to-talk-to-strangers" component={BlogBestAppsToTalk} />
          <Route path="/blog/why-did-omegle-shut-down" component={BlogWhyDidOmegleShutDown} />
          <Route path="/blog/text-vs-video-chat" component={BlogTextVsVideoChat} />
          <Route path="/blog/omegle-banned" component={BlogOmegleBanned} />

          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
    </>
  );
}
