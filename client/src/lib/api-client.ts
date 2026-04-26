import { getStoredToken } from "@/lib/auth-storage";

const API_REQUEST_TIMEOUT_MS = 15_000;

export async function throwIfResNotOk(res: Response) {
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
  const externalSignal = init?.signal;
  let didTimeout = false;
  let detachExternalAbort: (() => void) | undefined;
  const timeout = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      const forwardAbort = () => controller.abort(externalSignal.reason);
      externalSignal.addEventListener("abort", forwardAbort, { once: true });
      detachExternalAbort = () =>
        externalSignal.removeEventListener("abort", forwardAbort);
    }
  }

  try {
    const { signal: _ignoredSignal, ...restInit } = init ?? {};
    return await fetch(input, {
      ...restInit,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (externalSignal?.aborted && !didTimeout) {
        throw error;
      }

      throw new Error("Request timed out. Please try again.");
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    detachExternalAbort?.();
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
