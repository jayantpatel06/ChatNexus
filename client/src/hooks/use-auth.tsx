import {
  createContext,
  ReactNode,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User as SelectUser, LoginUser, RegisterUser } from "@shared/schema";
import {
  apiRequest,
  queryClient,
  getStoredToken,
  setStoredToken,
  removeStoredToken,
} from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  // Initialize token from localStorage
  const [token, setToken] = useState<string | null>(() => getStoredToken());

  // Update localStorage when token changes
  const updateToken = useCallback((newToken: string | null) => {
    setToken(newToken);
    if (newToken) {
      setStoredToken(newToken);
    } else {
      removeStoredToken();
    }
  }, []);

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      // Only fetch if we have a token
      const storedToken = getStoredToken();
      if (!storedToken) return null;

      try {
        const res = await fetch("/api/user", {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        });

        if (res.status === 401 || res.status === 403) {
          // Token is invalid or expired, clear it
          updateToken(null);
          return null;
        }

        if (!res.ok) throw new Error("Failed to fetch user");
        return await res.json();
      } catch (error) {
        // Network error - don't clear token, just return cached user or null
        // This prevents logout on temporary network issues (e.g., phone waking up)
        console.warn("Network error fetching user, keeping existing session");
        return null;
      }
    },
    // Prevent refetching on window focus (e.g., phone screen turning on)
    refetchOnWindowFocus: false,
    // Don't refetch on mount if we already have data
    refetchOnMount: false,
    // Keep cached data indefinitely
    staleTime: Infinity,
    // Don't retry on failure - prevents logout loop
    retry: false,
    // Keep previous data while refetching
    placeholderData: (previousData) => previousData,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginUser) => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }
      return (await res.json()) as { user: SelectUser; token: string };
    },
    onSuccess: (data) => {
      updateToken(data.token);
      queryClient.setQueryData(["/api/user"], data.user);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${data.user.username}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: RegisterUser) => {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Registration failed");
      }
      return (await res.json()) as { user: SelectUser; token: string };
    },
    onSuccess: (data) => {
      updateToken(data.token);
      queryClient.setQueryData(["/api/user"], data.user);
      toast({
        title: "Account created!",
        description: `Welcome to ChatNexus, ${data.user.username}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const guestLoginMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await fetch("/api/guest-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Guest login failed");
      }
      return (await res.json()) as { user: SelectUser; token: string };
    },
    onSuccess: (data) => {
      updateToken(data.token);
      queryClient.setQueryData(["/api/user"], data.user);
      toast({
        title: "Welcome!",
        description: `Joined as ${data.user.username}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Guest login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      updateToken(null);
      queryClient.setQueryData(["/api/user"], null);
      toast({
        title: "Logged out",
        description: "See you next time!",
      });
    },
    onError: (error: Error) => {
      // Even if server logout fails, clear local state
      updateToken(null);
      queryClient.setQueryData(["/api/user"], null);
      toast({
        title: "Logged out",
        description: "See you next time!",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        token,
        updateToken,
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
