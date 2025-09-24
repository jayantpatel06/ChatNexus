import { useState, useEffect } from 'react';

export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    // Only run on mobile devices
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) return;

    let initialViewportHeight = window.visualViewport?.height || window.innerHeight;
    
    const handleViewportChange = () => {
      if (!window.visualViewport) return;
      
      const currentViewportHeight = window.visualViewport.height;
      const heightDifference = initialViewportHeight - currentViewportHeight;
      
      // Consider keyboard visible if viewport height decreased by more than 150px
      if (heightDifference > 150) {
        setKeyboardHeight(heightDifference);
        setIsKeyboardVisible(true);
        // Add class to body to prevent scroll
        document.body.classList.add('keyboard-open');
      } else {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
        // Remove class from body
        document.body.classList.remove('keyboard-open');
      }
    };

    // Fallback for devices without visualViewport support
    const handleResize = () => {
      if (window.visualViewport) return; // Skip if visualViewport is available
      
      const currentHeight = window.innerHeight;
      const heightDifference = initialViewportHeight - currentHeight;
      
      if (heightDifference > 150) {
        setKeyboardHeight(heightDifference);
        setIsKeyboardVisible(true);
        document.body.classList.add('keyboard-open');
      } else {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
        document.body.classList.remove('keyboard-open');
      }
    };

    // Use Visual Viewport API if available (better support)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
    } else {
      // Fallback to window resize
      window.addEventListener('resize', handleResize);
    }

    // Cleanup
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
      } else {
        window.removeEventListener('resize', handleResize);
      }
      // Make sure to remove class on cleanup
      document.body.classList.remove('keyboard-open');
    };
  }, []);

  return { keyboardHeight, isKeyboardVisible };
}