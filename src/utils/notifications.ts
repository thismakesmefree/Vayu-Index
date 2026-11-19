export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export const NOTIFICATIONS_OPT_IN_KEY = 'vayu_notifications_opt_in_v1';

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }

  try {
    if (Notification.permission === 'granted') {
      window.localStorage?.setItem(NOTIFICATIONS_OPT_IN_KEY, 'granted');
      return 'granted';
    }
    const result = await Notification.requestPermission();
    window.localStorage?.setItem(NOTIFICATIONS_OPT_IN_KEY, result);
    return result;
  } catch {
    return Notification.permission || 'default';
  }
}

export async function sendRouteReadyNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1200)),
      ]);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: typeof data?.taskId === 'string' ? `vayu-route-${data.taskId}` : 'vayu-route-task',
          data: {
            url: '/?view=map',
            ...data,
          },
        });
        return true;
      }
    }

    const notif = new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      tag: typeof data?.taskId === 'string' ? `vayu-route-${data.taskId}` : 'vayu-route-task',
    });
    notif.onclick = () => {
      window.focus();
      if (typeof data?.taskId === 'string') {
        window.dispatchEvent(new CustomEvent('vayu-open-route-task', { detail: { taskId: data.taskId } }));
      }
    };
    return true;
  } catch {
    return false;
  }
}
