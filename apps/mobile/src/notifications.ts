import Constants, { ExecutionEnvironment } from "expo-constants";
import type { Reminder } from "./api";

// Expo Go (SDK 53+) no longer supports expo-notifications (local or remote) at all —
// it throws/warns as soon as you touch the module. Real reminder notifications need a
// development build (`npx expo run:android` / `eas build --profile development`).
// Until then, Expo Go just skips scheduling silently so the rest of the app keeps working.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (isExpoGo) return false;
  const Notifications = await import("expo-notifications");
  const Device = await import("expo-device");
  if (!Device.isDevice) return true; // simulators: skip the hard requirement
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function setupAndroidChannel() {
  if (isExpoGo) return;
  const Notifications = await import("expo-notifications");
  const { Platform } = await import("react-native");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", {
      name: "Care reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("alerts", {
      name: "Family alerts",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
    });
  }
}

async function setForegroundHandler() {
  const Notifications = await import("expo-notifications");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Expo push token for server-sent notifications (reminders from the backend scheduler, caregiver
// alerts). Needs a development build with an EAS projectId; returns null when unavailable, in
// which case the senior app falls back to local daily notifications.
export async function getPushToken(): Promise<string | null> {
  if (isExpoGo) return null;
  try {
    if (!(await ensureNotificationPermission())) return null;
    await setupAndroidChannel();
    await setForegroundHandler();
    const Notifications = await import("expo-notifications");
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

// Cancels everything and re-schedules one repeating daily notification per active reminder.
export async function syncDailyReminderNotifications(reminders: Reminder[]) {
  if (isExpoGo) return;
  const Notifications = await import("expo-notifications");
  await setForegroundHandler();

  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const reminder of reminders.filter((r) => r.active)) {
    const [hour, minute] = reminder.time.split(":").map(Number);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.label,
        body: reminder.question,
        data: { reminderId: reminder.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: "reminders",
      },
    });
  }
}

export async function cancelLocalReminders() {
  if (isExpoGo) return;
  const Notifications = await import("expo-notifications");
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export function notificationsAvailable(): boolean {
  return !isExpoGo;
}
