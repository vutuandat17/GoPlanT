import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { ApiCareTask, CareTaskType } from '@/services/api';

const CARE_CHANNEL_ID = 'care-reminders';

const TASK_LABELS: Record<CareTaskType, string> = {
  watering: 'Tưới nước',
  fertilizing: 'Bón phân',
  pruning: 'Cắt tỉa',
  weeding: 'Làm cỏ',
  repotting: 'Thay đất / Chậu',
  cleaning: 'Vệ sinh cây',
  environment_check: 'Kiểm tra môi trường',
  pest_control: 'Phòng trừ sâu bệnh',
  misting: 'Phun sương',
  other: 'Chăm sóc cây',
};

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function ensureCareNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CARE_CHANNEL_ID, {
        name: 'Nhắc lịch chăm sóc cây',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1E4B38',
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Synchronize device-local scheduled reminders for pending care tasks in the next 7 days.
 * Cancels previous reminders first so completed/skipped tasks or deleted schedules are cleared.
 */
export async function syncCareTaskNotifications(tasks: ApiCareTask[], enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!enabled || tasks.length === 0) return;

    const granted = await ensureCareNotificationPermissions();
    if (!granted) return;

    const nowMs = Date.now();
    const sevenDaysMs = nowMs + 7 * 86_400_000;

    const upcoming = tasks
      .filter((task) => {
        if (task.status !== 'pending') return false;
        const dueMs = Date.parse(task.dueAt);
        return Number.isFinite(dueMs) && dueMs > nowMs + 15_000 && dueMs <= sevenDaysMs;
      })
      .slice(0, 48);

    for (const task of upcoming) {
      const dueDate = new Date(task.dueAt);
      const label = task.title || TASK_LABELS[task.taskType] || 'Chăm sóc cây';
      await Notifications.scheduleNotificationAsync({
        identifier: `care-task-${task.id}`,
        content: {
          title: `🌱 Đến giờ ${label.toLowerCase()}`,
          body: `${task.plantName} cần được ${label.toLowerCase()} theo lịch chăm sóc.`,
          data: { taskId: task.id, scheduleId: task.scheduleId, plantId: task.plantId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: dueDate,
          ...(Platform.OS === 'android' ? { channelId: CARE_CHANNEL_ID } : {}),
        },
      });
    }
  } catch {
    // Keep app functional even if native notification scheduling is unavailable in the host.
  }
}
