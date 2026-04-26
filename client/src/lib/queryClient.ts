import {
  QueryClient,
  type QueryFunction,
  type QueryFunctionContext,
} from "@tanstack/react-query";
import {
  fetchWithTimeout,
  readJsonResponse,
  throwIfResNotOk,
} from "@/lib/api-client";
import { getStoredToken } from "@/lib/auth-storage";

export {
  apiRequest,
  fetchWithTimeout,
  readJsonResponse,
} from "@/lib/api-client";
export {
  decodeStoredToken,
  getStoredToken,
  getStoredUser,
  removeStoredToken,
  removeStoredUser,
  setStoredToken,
  setStoredUser,
} from "@/lib/auth-storage";

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
