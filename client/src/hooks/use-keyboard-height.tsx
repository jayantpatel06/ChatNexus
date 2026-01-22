import { useState, useEffect, useRef } from "react";

export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Use ref to track initial height so it can be updated on orientation change
  const initialViewportHeightRef = useRef(
    typeof window !== "undefined"
      ? window.visualViewport?.height || window.innerHeight
      : 0,
  );

  useEffect(() => {
    // Only run on mobile devices
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) return;

    // Update initial height reference
    initialViewportHeightRef.current =
      window.visualViewport?.height || window.innerHeight;

    const handleViewportChange = () => {
      if (!window.visualViewport) return;

      const currentViewportHeight = window.visualViewport.height;
      const heightDifference =
        initialViewportHeightRef.current - currentViewportHeight;

      // Consider keyboard visible if viewport height decreased by more than 150px
      if (heightDifference > 150) {
        setKeyboardHeight(heightDifference);
        setIsKeyboardVisible(true);
        // Add class to body to prevent scroll
        document.body.classList.add("keyboard-open");
      } else {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
        // Remove class from body
        document.body.classList.remove("keyboard-open");
      }
    };

    // Handle orientation change - reset baseline height
    const handleOrientationChange = () => {
      // Wait for orientation change to complete
      setTimeout(() => {
        initialViewportHeightRef.current =
          window.visualViewport?.height || window.innerHeight;
        // Reset keyboard state after orientation change
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
        document.body.classList.remove("keyboard-open");
      }, 100);
    };

    // Fallback for devices without visualViewport support
    const handleResize = () => {
      if (window.visualViewport) return; // Skip if visualViewport is available

      const currentHeight = window.innerHeight;
      const heightDifference = initialViewportHeightRef.current - currentHeight;

      if (heightDifference > 150) {
        setKeyboardHeight(heightDifference);
        setIsKeyboardVisible(true);
        document.body.classList.add("keyboard-open");
      } else {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
        document.body.classList.remove("keyboard-open");
      }
    };

    // Use Visual Viewport API if available (better support)
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange);
      window.visualViewport.addEventListener("scroll", handleViewportChange);
    } else {
      // Fallback to window resize
      window.addEventListener("resize", handleResize);
    }

    // Listen for orientation changes
    window.addEventListener("orientationchange", handleOrientationChange);

    // Cleanup
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener(
          "resize",
          handleViewportChange,
        );
        window.visualViewport.removeEventListener(
          "scroll",
          handleViewportChange,
        );
      } else {
        window.removeEventListener("resize", handleResize);
      }
      window.removeEventListener("orientationchange", handleOrientationChange);
      // Reset state and remove class on cleanup
      document.body.classList.remove("keyboard-open");
    };
  }, []);

  return { keyboardHeight, isKeyboardVisible };
}
