import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";

let isInitialized = false;

export async function initDeviceNotifications(onNotificationClick?: (data: any) => void) {
  if (!Capacitor.isNativePlatform()) return;
  if (isInitialized) return;

  try {
    // 1. Request notification permission (required on Android 13+)
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      await LocalNotifications.requestPermissions();
    }

    // 2. Create notification channel with high importance (sound, heads-up banner, vibration)
    await LocalNotifications.createChannel({
      id: "findit_alerts",
      name: "FindIt AI Alerts",
      description: "Match updates, chat messages, and verification notifications",
      importance: 5, // High priority (heads-up banner)
      visibility: 1, // Visible on lockscreen
      sound: "beep.wav",
      vibration: true,
      lights: true,
      lightColor: "#f59e0b",
    });

    // 3. Listen for clicks on the notification in the top status bar
    LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
      console.log("Notification tapped:", action);
      if (onNotificationClick && action.notification.extra) {
        onNotificationClick(action.notification.extra);
      }
    });

    isInitialized = true;
  } catch (err) {
    console.warn("Could not initialize local notifications:", err);
  }
}

export async function triggerDeviceNotification({
  title,
  body,
  extra = {},
}: {
  title: string;
  body: string;
  extra?: Record<string, any>;
}) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const id = Math.floor(Date.now() % 1000000);
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          channelId: "findit_alerts",
          smallIcon: "ic_launcher_round",
          iconColor: "#f59e0b",
          sound: undefined,
          extra,
          schedule: { at: new Date(Date.now() + 150) },
        },
      ],
    });
  } catch (err) {
    console.warn("Failed to schedule device notification:", err);
  }
}
