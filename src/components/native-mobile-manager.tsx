import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { initDeviceNotifications, triggerDeviceNotification } from "@/lib/device-notifications";

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type: string;
  related_match_id?: number;
  related_verification_id?: number;
  related_item_id?: number;
  is_read: boolean;
}

interface NotificationsResponse {
  items: NotificationItem[];
}

export function NativeMobileManager() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const lastKnownNotifIdRef = useRef<number | null>(null);

  // 1. Initialize native push notifications and hardware back-button / gesture listener
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    initDeviceNotifications((extra) => {
      if (extra?.matchId) {
        router.navigate({ to: "/matches", search: { chatMatchId: extra.matchId } as any });
      } else if (extra?.itemId) {
        router.navigate({ to: "/item/$id", params: { id: String(extra.itemId) } });
      } else if (extra?.verificationId) {
        router.navigate({ to: "/claim/$id", params: { id: String(extra.verificationId) } });
      } else {
        router.navigate({ to: "/notifications" });
      }
    });

    const backListener = App.addListener("backButton", () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        App.minimizeApp();
      }
    });

    return () => {
      backListener.then((l) => l.remove());
    };
  }, [router]);

  // 2. Poll for new notifications to trigger Android Status Bar notifications (WhatsApp-style)
  const { data } = useQuery({
    queryKey: ["latestNotificationsForDeviceBar"],
    queryFn: () => api.get<NotificationsResponse>("/api/notifications/?limit=5"),
    enabled: isAuthenticated,
    refetchInterval: 10000, // Check every 10 seconds
    staleTime: 8000,
  });

  useEffect(() => {
    if (!data?.items || data.items.length === 0) return;

    const unreadItems = data.items.filter((item) => !item.is_read);
    if (unreadItems.length === 0) return;

    const newest = unreadItems[0];
    // If we already alerted for this ID, skip
    if (lastKnownNotifIdRef.current === null) {
      // First load: memorize latest ID so we don't spam old notifications
      lastKnownNotifIdRef.current = newest.id;
      return;
    }

    if (newest.id > lastKnownNotifIdRef.current) {
      lastKnownNotifIdRef.current = newest.id;

      // Trigger Android system bar notification with vibration & sound
      triggerDeviceNotification({
        title: newest.title || "FindIt AI Alert",
        body: newest.message || "You have a new update",
        extra: {
          matchId: newest.related_match_id,
          itemId: newest.related_item_id,
          verificationId: newest.related_verification_id,
        },
      });
    }
  }, [data]);

  return null;
}
