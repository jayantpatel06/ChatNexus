import {
  QueryClient,
  type QueryFunction,
  type QueryFunctionContext,
} from "@tanstack/react-query";
import { publicUserSchema, type User } from "@shared/schema";

const TOKEN_KEY = "chatnexus_jwt";
const USER_KEY = "chatnexus_user";
const API_REQUEST_TIMEOUT_MS = 15_000;

export type JwtPayload = {
  exp?: number;
  iat?: number;
  sub?: number;
  username?: string;
  isGuest?: boolean;
};

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return publicUserSchema.parse(JSON.parse(raw));
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function setStoredUser(user: User): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeStoredUser(): void {
  localStorage.removeItem(USER_KEY);
}

export function decodeStoredToken(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = API_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};

  if (data) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetchWithTimeout(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

export async function readJsonResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await res.text();
    const trimmed = text.trimStart().toLowerCase();

    if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
      throw new Error(
        "The backend route is not active yet. Restart the server and try again.",
      );
    }

    throw new Error("Expected a JSON response from the API.");
  }

  return (await res.json()) as T;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export function getQueryFn<T>(options: {
  on401: "throw";
}): QueryFunction<T>;
export function getQueryFn<T>(options: {
  on401: "returnNull";
}): QueryFunction<T | null>;
export function getQueryFn<T>({
  on401: unauthorizedBehavior,
}: {
  on401: UnauthorizedBehavior;
}) {
  return async ({ queryKey }: QueryFunctionContext) => {
    const token = getStoredToken();
    const headers: Record<string, string> = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetchWithTimeout(queryKey.join("/") as string, {
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await readJsonResponse(res);
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
