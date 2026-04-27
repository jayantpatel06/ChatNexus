type AppShellNavigate = (
  to: string,
  options?: { replace?: boolean; state?: unknown },
) => void;

const DASHBOARD_ROUTE = "/dashboard";
const GLOBAL_ROUTE = "/global-chat";
const RANDOM_ROUTE = "/random-chat";
const SETTINGS_ROUTE = "/settings";
const APP_SHELL_BASE_STATE_KEY = "chatnexusAppShellBaseRoute";

const APP_SHELL_PRIMARY_ROUTES = new Set([
  DASHBOARD_ROUTE,
  GLOBAL_ROUTE,
  RANDOM_ROUTE,
  SETTINGS_ROUTE,
]);

function getPrimaryRoute(path: string): string | null {
  if (path === DASHBOARD_ROUTE) {
    return DASHBOARD_ROUTE;
  }

  if (path === RANDOM_ROUTE) {
    return RANDOM_ROUTE;
  }

  if (path === SETTINGS_ROUTE) {
    return SETTINGS_ROUTE;
  }

  if (path === GLOBAL_ROUTE || path.startsWith(`${GLOBAL_ROUTE}/`)) {
    return GLOBAL_ROUTE;
  }

  return null;
}

function readBaseRouteState() {
  if (typeof window === "undefined") {
    return null;
  }

  const historyState = window.history.state as
    | Record<string, unknown>
    | null
    | undefined;
  const baseRoute = historyState?.[APP_SHELL_BASE_STATE_KEY];

  return typeof baseRoute === "string" ? baseRoute : null;
}

export function navigateWithinAppShell(
  currentPath: string,
  targetPath: string,
  navigate: AppShellNavigate,
) {
  const currentPrimaryRoute = getPrimaryRoute(currentPath);
  const targetPrimaryRoute = getPrimaryRoute(targetPath);

  if (!targetPrimaryRoute || currentPath === targetPath) {
    if (currentPath !== targetPath) {
      navigate(targetPath);
    }
    return;
  }

  const currentBaseRoute = readBaseRouteState();

  if (targetPrimaryRoute === DASHBOARD_ROUTE) {
    if (
      typeof window !== "undefined" &&
      currentPrimaryRoute &&
      currentPrimaryRoute !== DASHBOARD_ROUTE &&
      currentBaseRoute === DASHBOARD_ROUTE
    ) {
      window.history.back();
      return;
    }

    navigate(DASHBOARD_ROUTE, {
      replace: currentPrimaryRoute === DASHBOARD_ROUTE,
    });
    return;
  }

  const nextState = { [APP_SHELL_BASE_STATE_KEY]: DASHBOARD_ROUTE };

  if (currentPrimaryRoute === DASHBOARD_ROUTE) {
    navigate(targetPrimaryRoute, { state: nextState });
    return;
  }

  if (
    currentPrimaryRoute &&
    APP_SHELL_PRIMARY_ROUTES.has(currentPrimaryRoute) &&
    currentBaseRoute === DASHBOARD_ROUTE
  ) {
    navigate(targetPrimaryRoute, {
      replace: true,
      state: nextState,
    });
    return;
  }

  navigate(targetPrimaryRoute, { state: nextState });
}
