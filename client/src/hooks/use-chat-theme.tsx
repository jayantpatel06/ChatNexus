import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ChatTheme =
  | "default"
  | "midnight"
  | "forest"
  | "sunset"
  | "bubblegum"
  | "slate";

type ThemeMap = Record<string, ChatTheme>; // key: selectedUser.userId

type ChatThemeContextValue = {
  getThemeForUser: (userId: string | number | null | undefined) => ChatTheme;
  setThemeForUser: (userId: string | number | null | undefined, theme: ChatTheme) => void;
  availableThemes: { id: ChatTheme; label: string }[];
};

const ChatThemeContext = createContext<ChatThemeContextValue | null>(null);

const STORAGE_KEY = "chatnexus.chatThemes";

function loadFromStorage(): ThemeMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as ThemeMap;
    return {};
  } catch {
    return {};
  }
}

function saveToStorage(map: ThemeMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function ChatThemeProvider({ children }: { children: React.ReactNode }) {
  const [themesByUser, setThemesByUser] = useState<ThemeMap>({});

  useEffect(() => {
    setThemesByUser(loadFromStorage());
  }, []);

  useEffect(() => {
    saveToStorage(themesByUser);
  }, [themesByUser]);

  const getThemeForUser = (userId: string | number | null | undefined): ChatTheme => {
    if (userId === null || userId === undefined) return "default";
    const key = String(userId);
    return themesByUser[key] || "default";
  };

  const setThemeForUser = (
    userId: string | number | null | undefined,
    theme: ChatTheme
  ) => {
    if (userId === null || userId === undefined) return;
    const key = String(userId);
    setThemesByUser((prev) => ({ ...prev, [key]: theme }));
  };

  const availableThemes: { id: ChatTheme; label: string }[] = useMemo(
    () => [
      { id: "default", label: "Default" },
      { id: "midnight", label: "Midnight" },
      { id: "forest", label: "Forest" },
      { id: "sunset", label: "Sunset" },
      { id: "bubblegum", label: "Bubblegum" },
      { id: "slate", label: "Slate" },
    ],
    []
  );

  const value: ChatThemeContextValue = {
    getThemeForUser,
    setThemeForUser,
    availableThemes,
  };

  return <ChatThemeContext.Provider value={value}>{children}</ChatThemeContext.Provider>;
}

export function useChatTheme() {
  const ctx = useContext(ChatThemeContext);
  if (!ctx) throw new Error("useChatTheme must be used within ChatThemeProvider");
  return ctx;
}
