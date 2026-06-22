import { useEffect, useRef } from "react";

export type KeyCombo = {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
};

export type ShortcutAction = (e: KeyboardEvent) => void;

export type ShortcutConfig = {
  combo: KeyCombo;
  action: ShortcutAction;
  preventDefault?: boolean;
  allowInInput?: boolean;
};

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[], enabled = true) {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      for (const config of shortcutsRef.current) {
        if (
          event.key.toLowerCase() === config.combo.key.toLowerCase() &&
          !!event.ctrlKey === !!config.combo.ctrlKey &&
          !!event.altKey === !!config.combo.altKey &&
          !!event.shiftKey === !!config.combo.shiftKey &&
          !!event.metaKey === !!config.combo.metaKey
        ) {
          if (isInput && !config.allowInInput) {
            continue;
          }

          if (config.preventDefault !== false) {
            event.preventDefault();
          }
          config.action(event);
          return; // Stop processing after finding the matching shortcut
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled]);
}
