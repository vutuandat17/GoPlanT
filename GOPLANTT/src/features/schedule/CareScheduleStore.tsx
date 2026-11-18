import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuthSession } from '@/features/auth/AuthSession';
import { useAppPreferences } from '@/features/preferences/AppPreferences';
import { syncCareTaskNotifications } from '@/features/schedule/localNotifications';
import {
  completeCareTask,
  createCareSchedule,
  deleteCareSchedule,
  fetchCalendarCareTasks,
  fetchCareSchedules,
  fetchTodayCareTasks,
  isApiConfigured,
  skipCareTask,
  toLocalIsoDate,
  updateCareSchedule,
  type ApiCalendarTasksView,
  type ApiCareDaySummary,
  type ApiCareSchedule,
  type ApiCareScheduleRequest,
  type ApiCareTask,
  type CareTaskType,
} from '@/services/api';

export const CARE_TASK_META: Record<CareTaskType, { label: string; emoji: string; color: string }> = {
  watering: { label: 'Tưới nước', emoji: '💧', color: '#D1E9FF' },
  fertilizing: { label: 'Bón phân', emoji: '🌿', color: '#D5F2E1' },
  pruning: { label: 'Cắt tỉa', emoji: '✂️', color: '#FFE0CF' },
  weeding: { label: 'Làm cỏ', emoji: '🌱', color: '#E2F3D5' },
  repotting: { label: 'Thay đất / Chậu', emoji: '🪴', color: '#FCE7D2' },
  cleaning: { label: 'Vệ sinh cây', emoji: '🧽', color: '#DFF4F3' },
  environment_check: { label: 'Kiểm tra môi trường', emoji: '☀️', color: '#FFF3CD' },
  pest_control: { label: 'Phòng trừ sâu bệnh', emoji: '🛡️', color: '#FAD8D3' },
  misting: { label: 'Phun sương', emoji: '🌫️', color: '#E8F4FD' },
  other: { label: 'Công việc khác', emoji: '📝', color: '#F3E5FF' },
};

export const CARE_TASK_TYPES: CareTaskType[] = [
  'watering',
  'fertilizing',
  'pruning',
  'weeding',
  'repotting',
  'cleaning',
  'environment_check',
  'pest_control',
  'misting',
  'other',
];

const ISO_DAY_SHORT: Record<number, string> = {
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7',
  7: 'CN',
};

export function formatScheduleRepeat(schedule: Pick<ApiCareSchedule, 'repeatType' | 'frequencyDays' | 'daysOfWeek'>): string {
  if (schedule.repeatType === 'WEEKLY') {
    const days = [...(schedule.daysOfWeek ?? [])].sort((a, b) => a - b);
    if (days.length === 7) return 'Mỗi ngày';
    if (days.length === 0) return 'Hàng tuần';
    return `Hàng tuần (${days.map((d) => ISO_DAY_SHORT[d] ?? d).join(', ')})`;
  }
  const freq = schedule.frequencyDays ?? 1;
  if (freq === 1) return 'Mỗi ngày';
  if (freq === 2) return 'Cách ngày';
  if (freq === 7) return 'Hàng tuần';
  return `Mỗi ${freq} ngày`;
}

export function formatTimeShort(timeOfDay: string | null | undefined): string {
  if (!timeOfDay) return '08:00';
  return timeOfDay.slice(0, 5);
}

export function formatDueTimeLocal(dueAt: string | null | undefined): string {
  if (!dueAt) return '08:00';
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return formatTimeShort(dueAt.slice(11, 16));
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}

export function formatDateVi(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

const emptySummary: ApiCareDaySummary = { total: 0, pending: 0, completed: 0, skipped: 0, overdue: 0 };

type CareScheduleContextValue = {
  schedules: ApiCareSchedule[];
  todayTasks: ApiCareTask[];
  todaySummary: ApiCareDaySummary;
  isLoading: boolean;
  error: string;
  refresh: () => Promise<void>;
  createSchedule: (plantId: string, body: ApiCareScheduleRequest) => Promise<ApiCareSchedule>;
  updateSchedule: (scheduleId: string, body: ApiCareScheduleRequest) => Promise<ApiCareSchedule>;
  removeSchedule: (scheduleId: string) => Promise<void>;
  completeTask: (taskId: string, note?: string) => Promise<void>;
  skipTask: (taskId: string, note?: string) => Promise<void>;
  loadCalendar: (from: string, to: string, options?: { plantId?: string; scheduleId?: string }) => Promise<ApiCalendarTasksView>;
};

const CareScheduleContext = createContext<CareScheduleContextValue | null>(null);

export function CareScheduleProvider({ children }: { children: ReactNode }) {
  const { accessToken, isReady } = useAuthSession();
  const { careNotificationsEnabled } = useAppPreferences();
  const [schedules, setSchedules] = useState<ApiCareSchedule[]>([]);
  const [todayTasks, setTodayTasks] = useState<ApiCareTask[]>([]);
  const [todaySummary, setTodaySummary] = useState<ApiCareDaySummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!isApiConfigured || !accessToken) {
      setSchedules([]);
      setTodayTasks([]);
      setTodaySummary(emptySummary);
      setError('');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const [scheduleRows, todayView] = await Promise.all([
        fetchCareSchedules(accessToken),
        fetchTodayCareTasks(accessToken, toLocalIsoDate()),
      ]);
      setSchedules(scheduleRows);
      setTodayTasks(todayView.tasks);
      setTodaySummary(todayView.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được lịch chăm sóc.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isReady) void refresh();
  }, [isReady, refresh]);

  useEffect(() => {
    if (!isReady) return;
    if (!isApiConfigured || !accessToken || !careNotificationsEnabled) {
      void syncCareTaskNotifications([], false);
      return;
    }
    const today = new Date();
    const from = toLocalIsoDate(today);
    const end = new Date(today);
    end.setDate(today.getDate() + 6);
    const to = toLocalIsoDate(end);
    let active = true;
    void fetchCalendarCareTasks(accessToken, from, to)
      .then((view) => {
        if (active) void syncCareTaskNotifications(view.tasks ?? [], true);
      })
      .catch(() => {
        if (active) void syncCareTaskNotifications(todayTasks, true);
      });
    return () => {
      active = false;
    };
  }, [isReady, accessToken, careNotificationsEnabled, schedules, todayTasks]);

  const value = useMemo<CareScheduleContextValue>(() => ({
    schedules,
    todayTasks,
    todaySummary,
    isLoading,
    error,
    refresh,
    createSchedule: async (plantId, body) => {
      if (!isApiConfigured || !accessToken) {
        throw new Error('Cần đăng nhập và kết nối máy chủ để tạo lịch chăm sóc.');
      }
      const created = await createCareSchedule(plantId, accessToken, body);
      await refresh();
      return created;
    },
    updateSchedule: async (scheduleId, body) => {
      if (!isApiConfigured || !accessToken) {
        throw new Error('Cần đăng nhập và kết nối máy chủ để cập nhật lịch chăm sóc.');
      }
      const updated = await updateCareSchedule(scheduleId, accessToken, body);
      await refresh();
      return updated;
    },
    removeSchedule: async (scheduleId) => {
      if (!isApiConfigured || !accessToken) {
        throw new Error('Cần đăng nhập và kết nối máy chủ để xóa lịch chăm sóc.');
      }
      await deleteCareSchedule(scheduleId, accessToken);
      await refresh();
    },
    completeTask: async (taskId, note) => {
      if (!isApiConfigured || !accessToken) {
        throw new Error('Cần đăng nhập để cập nhật công việc.');
      }
      await completeCareTask(taskId, accessToken, { note: note?.trim() || null, date: toLocalIsoDate() });
      await refresh();
    },
    skipTask: async (taskId, note) => {
      if (!isApiConfigured || !accessToken) {
        throw new Error('Cần đăng nhập để cập nhật công việc.');
      }
      await skipCareTask(taskId, accessToken, { note: note?.trim() || null, date: toLocalIsoDate() });
      await refresh();
    },
    loadCalendar: async (from, to, options) => {
      if (!isApiConfigured || !accessToken) {
        return { from, to, timezone: 'Asia/Ho_Chi_Minh', tasks: [], summary: emptySummary };
      }
      return fetchCalendarCareTasks(accessToken, from, to, options);
    },
  }), [schedules, todayTasks, todaySummary, isLoading, error, refresh, accessToken]);

  return <CareScheduleContext.Provider value={value}>{children}</CareScheduleContext.Provider>;
}

export function useCareSchedules() {
  const context = useContext(CareScheduleContext);
  if (!context) throw new Error('useCareSchedules must be used inside CareScheduleProvider');
  return context;
}
