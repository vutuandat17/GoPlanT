import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';

const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') ?? '';
export const apiBaseUrl =
  Platform.OS === 'web' && rawApiBaseUrl.includes('10.0.2.2')
    ? rawApiBaseUrl.replace('10.0.2.2', 'localhost')
    : rawApiBaseUrl;
export const isApiConfigured = Boolean(apiBaseUrl);

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  token?: string | null;
  body?: unknown;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!apiBaseUrl) throw new ApiError('Chưa cấu hình EXPO_PUBLIC_API_URL.');

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Kiểm tra backend và địa chỉ API.');
  }

  if (!response.ok) {
    let message = `Yêu cầu thất bại (${response.status}).`;
    try {
      const payload = await response.json() as { detail?: string; message?: string; title?: string };
      message = payload.detail ?? payload.message ?? payload.title ?? message;
    } catch {
      // Keep the status-based message if the response has no JSON body.
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function uploadPlantPhoto(plantId: string, token: string, photo: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  if (!apiBaseUrl) throw new ApiError('Chưa cấu hình EXPO_PUBLIC_API_URL.');
  const mimeType = photo.mimeType ?? (photo.fileName?.toLocaleLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
    throw new ApiError('Ảnh cần ở định dạng JPEG hoặc PNG.');
  }
  const file = new File(photo.uri);
  const body = new FormData();
  body.append('file', file, photo.fileName ?? `plant-${plantId}.jpg`);
  let response: Response;
  try {
    response = await expoFetch(`${apiBaseUrl}/api/v1/plants/${plantId}/photo`, {
      method: 'POST', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, body,
    });
  } catch (error) {
    const reason = error instanceof Error && error.message ? ` Chi tiết mạng: ${error.message}` : '';
    throw new ApiError(`Không gửi được yêu cầu tải ảnh tới ${apiBaseUrl}. Kiểm tra URL API của ứng dụng và kết nối mạng.${reason}`);
  }
  if (!response.ok) {
    let message = `Không tải được ảnh (${response.status}).`;
    try {
      const payload = await response.json() as { detail?: string; message?: string; title?: string };
      message = payload.detail ?? payload.message ?? payload.title ?? message;
    } catch { /* Keep the status-based message when the response has no JSON body. */ }
    throw new ApiError(message, response.status);
  }
}

export type ApiUser = { id: string; email: string; displayName: string; roles: string[] };
export type AuthResult = { accessToken: string; tokenType: string; expiresIn: number; user: ApiUser };
export type PlantCatalogItem = { id: string; commonName: string; scientificName: string; category: string };
export type ApiGarden = {
  id: string; name: string; locationType: string; locationDetail: string | null; description: string | null;
  createdAt: string; updatedAt: string;
};
export type ApiOwnedPlant = {
  id: string; catalogId: string; gardenId: string | null; displayName: string; commonName: string;
  scientificName: string; specificLocation: string | null; plantedOn: string | null; note: string | null; addedAt: string; photoUpdatedAt: string | null;
};

export type CareTaskType =
  | 'watering'
  | 'fertilizing'
  | 'pruning'
  | 'weeding'
  | 'repotting'
  | 'cleaning'
  | 'environment_check'
  | 'pest_control'
  | 'misting'
  | 'other';

export type CareRepeatType = 'DAILY_INTERVAL' | 'WEEKLY';

export type CareTaskStatus = 'pending' | 'completed' | 'skipped';

export type ApiCareScheduleRequest = {
  taskType: CareTaskType;
  title?: string | null;
  note?: string | null;
  repeatType: CareRepeatType;
  frequencyDays?: number | null;
  daysOfWeek?: number[] | null;
  timeOfDay?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type ApiCareSchedule = {
  id: string;
  plantId: string;
  plantName: string;
  plantScientificName: string;
  taskType: CareTaskType;
  title: string | null;
  note: string | null;
  repeatType: CareRepeatType;
  frequencyDays: number | null;
  daysOfWeek: number[] | null;
  timeOfDay: string;
  startDate: string;
  endDate: string | null;
  timezone: string;
  nextDueAt: string | null;
  active: boolean;
  createdAt: string;
};

export type ApiCareTask = {
  id: string;
  scheduleId: string;
  plantId: string;
  plantName: string;
  taskType: CareTaskType;
  title: string | null;
  dueDate: string;
  dueAt: string;
  status: CareTaskStatus;
  completedAt: string | null;
  skippedAt: string | null;
  note: string | null;
  overdue: boolean;
};

export type ApiCareDaySummary = {
  total: number;
  pending: number;
  completed: number;
  skipped: number;
  overdue: number;
};

export type ApiTodayTasksView = {
  date: string;
  timezone: string;
  tasks: ApiCareTask[];
  summary: ApiCareDaySummary;
};

export type ApiCalendarTasksView = {
  from: string;
  to: string;
  timezone: string;
  tasks: ApiCareTask[];
  summary: ApiCareDaySummary;
};

export function toLocalIsoDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fetchCareSchedules(token: string) {
  return apiRequest<ApiCareSchedule[]>('/api/v1/schedules', { token });
}

export function fetchPlantCareSchedules(plantId: string, token: string) {
  return apiRequest<ApiCareSchedule[]>(`/api/v1/plants/${plantId}/schedules`, { token });
}

export function createCareSchedule(plantId: string, token: string, body: ApiCareScheduleRequest) {
  return apiRequest<ApiCareSchedule>(`/api/v1/plants/${plantId}/schedules`, {
    method: 'POST',
    token,
    body,
  });
}

export function updateCareSchedule(scheduleId: string, token: string, body: ApiCareScheduleRequest) {
  return apiRequest<ApiCareSchedule>(`/api/v1/schedules/${scheduleId}`, {
    method: 'PUT',
    token,
    body,
  });
}

export function deleteCareSchedule(scheduleId: string, token: string) {
  return apiRequest<void>(`/api/v1/schedules/${scheduleId}`, {
    method: 'DELETE',
    token,
  });
}

export function fetchTodayCareTasks(token: string, date = toLocalIsoDate()) {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiRequest<ApiTodayTasksView>(`/api/v1/schedules/today${query}`, { token });
}

export function fetchCalendarCareTasks(
  token: string,
  from: string,
  to: string,
  options?: { plantId?: string; scheduleId?: string },
) {
  const params = new URLSearchParams({ from, to });
  if (options?.plantId) params.set('plantId', options.plantId);
  if (options?.scheduleId) params.set('scheduleId', options.scheduleId);
  return apiRequest<ApiCalendarTasksView>(`/api/v1/schedules/calendar?${params.toString()}`, { token });
}

export function completeCareTask(taskId: string, token: string, body?: { note?: string | null; date?: string | null }) {
  return apiRequest<ApiCareTask>(`/api/v1/tasks/${taskId}/complete`, {
    method: 'POST',
    token,
    body: body ?? { date: toLocalIsoDate() },
  });
}

export function skipCareTask(taskId: string, token: string, body?: { note?: string | null; date?: string | null }) {
  return apiRequest<ApiCareTask>(`/api/v1/tasks/${taskId}/skip`, {
    method: 'POST',
    token,
    body: body ?? { date: toLocalIsoDate() },
  });
}
