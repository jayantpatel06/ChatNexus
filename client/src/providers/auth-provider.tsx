import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type {
  LoginUser,
  RegisterUser,
  User,
  User as SelectUser,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import {
  apiRequest,
  decodeStoredToken,
  getStoredToken,
  getStoredUser,
  queryClient,
  removeStoredToken,
  removeStoredUser,
  setStoredToken,
  setStoredUser,
} from "@/lib/queryClient";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<
    { user: SelectUser; token: string },
    Error,
    LoginUser
  >;
  logoutMutation: UseMutationResult<void, Error, void>;
  token: string | null;
  updateToken: (token: string | null) => void;
  updateUser: (user: SelectUser | null, token?: string | null) => void;
  registerMutation: UseMutationResult<
    { user: SelectUser; token: string },
    Error,
    RegisterUser
  >;
  guestLoginMutation: UseMutationResult<
    { user: SelectUser; token: string },
    Error,
    string
  >;
};

export const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_REFRESH_PATH = "/api/auth/refresh";
const CURRENT_USER_PATH = "/api/user";
const LOGIN_PATH = "/api/login";
const REGISTER_PATH = "/api/register";
const GUEST_LOGIN_PATH = "/api/guest-login";
const JSON_HEADERS = { "Content-Type": "application/json" } as const;
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function clearStoredSession() {
  removeStoredToken();
  removeStoredUser();
}

async function refreshAuthToken(currentToken: string) {
  const response = await fetch(AUTH_REFRESH_PATH, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${currentToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to refresh token");
  }

  return (await response.json()) as { token: string; user: User };
}

async function fetchCurrentUser(currentToken: string) {
  const response = await fetch(CURRENT_USER_PATH, {
    headers: {
      Authorization: `Bearer ${currentToken}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error("Failed to fetch user");
  }

  return (await response.json()) as User;
}

async function login(credentials: LoginUser) {
  const response = await fetch(LOGIN_PATH, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Login failed");
  }

  return (await response.json()) as { user: User; token: string };
}

async function register(credentials: RegisterUser) {
  const response = await fetch(REGISTER_PATH, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Registration failed");
  }

  return (await response.json()) as { user: User; token: string };
}

async function guestLogin(username: string) {
  const response = await fetch(GUEST_LOGIN_PATH, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Guest login failed");
  }

  return (await response.json()) as { user: User; token: string };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<SelectUser | null>(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const updateToken = useCallback((newToken: string | null) => {
    setToken(newToken);
    if (newToken) {
      setStoredToken(newToken);
    } else {
      removeStoredToken();
    }
  }, []);

  const updateSession = useCallback(
    (nextUser: SelectUser | null, nextToken?: string | null) => {
      setUser(nextUser);
      queryClient.setQueryData(["/api/user"], nextUser);

      if (nextUser) {
        setStoredUser(nextUser);
      } else {
        removeStoredUser();
      }

      if (nextToken !== undefined) {
        updateToken(nextToken);
      }
    },
    [updateToken],
  );

  const clearSession = useCallback(() => {
    clearStoredSession();
    setToken(null);
    setUser(null);
    setError(null);
    queryClient.setQueryData(["/api/user"], null);
  }, []);

  const refreshTokenIfNeeded = useCallback(
    async (currentToken: string) => {
      const payload = decodeStoredToken(currentToken);
      if (!payload?.exp) {
        throw new Error("Invalid token payload");
      }

      const expiresAt = payload.exp * 1000;
      const timeUntilExpiry = expiresAt - Date.now();

      if (timeUntilExpiry <= 0) {
        throw new Error("Token expired");
      }

      if (timeUntilExpiry > REFRESH_THRESHOLD_MS) {
        return currentToken;
      }

      const data = await refreshAuthToken(currentToken);
      updateSession(data.user, data.token);
      return data.token;
    },
    [updateSession],
  );

  const syncUser = useCallback(
    async (currentToken: string) => {
      const nextUser = await fetchCurrentUser(currentToken);
      updateSession(nextUser);
      return nextUser;
    },
    [updateSession],
  );

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      const storedToken = getStoredToken();
      const storedUser = getStoredUser();

      if (!storedToken) {
        if (!cancelled) {
          setIsLoading(false);
          setUser(null);
        }
        return;
      }

      if (storedUser) {
        setUser(storedUser);
        queryClient.setQueryData(["/api/user"], storedUser);
      }

      try {
        const validToken = await refreshTokenIfNeeded(storedToken);
        await syncUser(validToken);
        if (!cancelled) {
          setError(null);
        }
      } catch (authError) {
        const message =
          authError instanceof Error
            ? authError.message
            : "Session validation failed";

        if (
          message === "Unauthorized" ||
          message === "Token expired" ||
          message === "Invalid token payload" ||
          message === "Failed to refresh token"
        ) {
          if (!cancelled) {
            clearSession();
          }
        } else {
          console.warn("Auth bootstrap network issue, keeping stored session");
          if (!cancelled) {
            setError(
              authError instanceof Error ? authError : new Error(message),
            );
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    bootstrapAuth();

    return () => {
      cancelled = true;
    };
  }, [clearSession, refreshTokenIfNeeded, syncUser]);

  useEffect(() => {
    if (!token) return;

    const payload = decodeStoredToken(token);
    if (!payload?.exp) return;

    const expiresAt = payload.exp * 1000;
    const refreshAt = Math.max(Date.now() + 30_000, expiresAt - REFRESH_THRESHOLD_MS);
    const delay = Math.max(30_000, refreshAt - Date.now());

    const timeout = window.setTimeout(async () => {
      try {
        const nextToken = await refreshTokenIfNeeded(token);
        await syncUser(nextToken);
      } catch {
        console.warn("Scheduled token refresh failed");
      }
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [token, refreshTokenIfNeeded, syncUser]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;

      const currentToken = getStoredToken();
      if (!currentToken) return;

      try {
        const nextToken = await refreshTokenIfNeeded(currentToken);
        await syncUser(nextToken);
      } catch {
        console.warn("Visibility auth sync failed");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      updateSession(data.user, data.token);
      setError(null);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${data.user.username}`,
      });
    },
    onError: (mutationError: Error) => {
      toast({
        title: "Login failed",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: register,
    onSuccess: (data) => {
      updateSession(data.user, data.token);
      setError(null);
      toast({
        title: "Account created!",
        description: `Welcome to ChatNexus, ${data.user.username}!`,
      });
    },
    onError: (mutationError: Error) => {
      toast({
        title: "Registration failed",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  const guestLoginMutation = useMutation({
    mutationFn: guestLogin,
    onSuccess: (data) => {
      updateSession(data.user, data.token);
      setError(null);
      toast({
        title: "Welcome!",
        description: `Joined as ${data.user.username}`,
      });
    },
    onError: (mutationError: Error) => {
      toast({
        title: "Guest login failed",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      clearSession();
      toast({
        title: "Logged out",
        description: "See you next time!",
      });
    },
    onError: () => {
      clearSession();
      toast({
        title: "Logged out",
        description: "See you next time!",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        token,
        updateToken,
        updateUser: updateSession,
        guestLoginMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
