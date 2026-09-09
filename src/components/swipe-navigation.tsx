import React, { useEffect, useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

const MAIN_TABS = [
  "/dashboard",
  "/discover",
  "/report",
  "/matches",
  "/notifications",
  "/profile",
];

function getTabIndex(path: string): number {
  if (path === "/dashboard") return 0;
  if (path === "/discover") return 1;
  if (path === "/report") return 2;
  if (path === "/matches" || path.startsWith("/claim")) return 3;
  if (path === "/notifications") return 4;
  if (path === "/profile" || path === "/settings") return 5;
  return -1;
}

function isHorizontalScrollable(element: HTMLElement | null): boolean {
  let current = element;
  while (current && current !== document.body) {
    if (
      current.tagName === "INPUT" ||
      current.tagName === "TEXTAREA" ||
      current.tagName === "SELECT" ||
      current.getAttribute("role") === "slider" ||
      current.classList.contains("no-swipe") ||
      current.dataset.noSwipe === "true"
    ) {
      return true;
    }

    const style = window.getComputedStyle(current);
    const overflowX = style.overflowX;
    if (
      (overflowX === "auto" || overflowX === "scroll") &&
      current.scrollWidth > current.clientWidth + 4
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

export function SwipeNavigationWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const routerState = useRouterState();
  const { isAuthenticated } = useAuth();
  const currentPath = routerState.location.pathname;

  const [slideDirection, setSlideDirection] = useState<"left" | "right" | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number; ignored: boolean } | null>(null);
  const gestureLockRef = useRef<"horizontal" | "vertical" | null>(null);

  // Trigger brief haptic feedback if supported
  const triggerHaptic = () => {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(10);
      }
    } catch {
      // Ignore vibration errors
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isAuthenticated || e.touches.length !== 1) {
      touchStartRef.current = null;
      gestureLockRef.current = null;
      return;
    }

    const touch = e.touches[0];
    const target = e.target as HTMLElement;

    // Check if element or any ancestor is horizontally scrollable or an input
    const ignored = isHorizontalScrollable(target);

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      ignored,
    };
    gestureLockRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || touchStartRef.current.ignored || e.touches.length !== 1) {
      return;
    }

    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    if (!gestureLockRef.current) {
      // Determine gesture axis once threshold passed
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
        gestureLockRef.current = "vertical"; // Let user scroll vertically naturally
      } else if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        gestureLockRef.current = "horizontal";
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (
      !touchStartRef.current ||
      touchStartRef.current.ignored ||
      gestureLockRef.current === "vertical"
    ) {
      touchStartRef.current = null;
      gestureLockRef.current = null;
      return;
    }

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;

    touchStartRef.current = null;
    gestureLockRef.current = null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const velocity = absDx / (dt || 1);

    // Minimum criteria: horizontal swipe > 50px (or > 35px if high velocity) and dominant horizontal angle
    const isHorizontalSwipe =
      (absDx >= 50 || (absDx >= 35 && velocity > 0.35)) &&
      absDx > absDy * 1.5 &&
      dt < 550;

    if (!isHorizontalSwipe) return;

    const currentTabIdx = getTabIndex(currentPath);

    if (dx < 0) {
      // SWIPE LEFT (Finger right-to-left) -> Next screen/tab
      if (currentTabIdx >= 0 && currentTabIdx < MAIN_TABS.length - 1) {
        const nextPath = MAIN_TABS[currentTabIdx + 1];
        setSlideDirection("left");
        triggerHaptic();
        router.navigate({ to: nextPath as any });
      }
    } else if (dx > 0) {
      // SWIPE RIGHT (Finger left-to-right) -> Previous screen/tab or Back
      if (currentTabIdx > 0) {
        const prevPath = MAIN_TABS[currentTabIdx - 1];
        setSlideDirection("right");
        triggerHaptic();
        router.navigate({ to: prevPath as any });
      } else if (currentTabIdx === -1) {
        // On a sub-page or detail page (e.g. /item/:id, /claim/:id) -> Navigate back
        setSlideDirection("right");
        triggerHaptic();
        if (typeof window !== "undefined" && window.history.length > 1) {
          window.history.back();
        } else {
          router.navigate({ to: "/dashboard" });
        }
      }
    }
  };

  // Reset slide animation after completion
  useEffect(() => {
    if (!slideDirection) return;
    const t = setTimeout(() => {
      setSlideDirection(null);
    }, 250);
    return () => clearTimeout(t);
  }, [slideDirection, currentPath]);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`min-h-screen w-full transition-transform duration-200 ${
        slideDirection === "left"
          ? "animate-screen-slide-left"
          : slideDirection === "right"
          ? "animate-screen-slide-right"
          : ""
      }`}
    >
      {children}
    </div>
  );
}
