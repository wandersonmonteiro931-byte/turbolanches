import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Restores window scroll position when navigating back to a page (POP).
 * Saves position on every scroll/unload, keyed by the current pathname+search.
 */
export function useScrollRestoration(key?: string) {
  const location = useLocation();
  const navType = useNavigationType();
  const storageKey = `scroll:${key ?? location.pathname + location.search}`;

  // Save scroll position continuously
  useEffect(() => {
    const save = () => {
      sessionStorage.setItem(storageKey, String(window.scrollY));
    };
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("beforeunload", save);
    return () => {
      save();
      window.removeEventListener("scroll", save);
      window.removeEventListener("beforeunload", save);
    };
  }, [storageKey]);

  // Restore on mount: only when navigating back (POP) or returning to same page
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved && (navType === "POP" || navType === "PUSH")) {
      const y = parseInt(saved, 10);
      if (!isNaN(y)) {
        // Use rAF to wait for layout
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
