import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import { clearSessionTokens, readRefreshToken, saveAccessToken, saveRefreshToken } from './tokenStorage';

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
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string | null;
  body?: unknown;
  skipAuthRefresh?: boolean;
};

type TokenRefreshedListener = (next: AuthResult | null) => void;
let tokenRefreshedListener: TokenRefreshedListener | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setTokenRefreshedListener(listener: TokenRefreshedListener | null) {
  tokenRefreshedListener = listener;
}

async function tryRefreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const storedRefresh = await readRefreshToken();
      if (!storedRefresh || !apiBaseUrl) return null;
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefresh }),
      });
      if (!response.ok) {
        await clearSessionTokens();
        tokenRefreshedListener?.(null);
        return null;
      }
      const next = await response.json() as AuthResult;
      await saveAccessToken(next.accessToken);
      if (next.refreshToken) await saveRefreshToken(next.refreshToken);
      tokenRefreshedListener?.(next);
      return next.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!apiBaseUrl) throw new ApiError('Chưa cấu hình EXPO_PUBLIC_API_URL.');

  const performFetch = async (token?: string | null) => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 15000) : null;
    try {
      return await fetch(`${apiBaseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(Platform.OS !== 'web' ? { 'X-Client-Platform': Platform.OS } : {}),
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        ...(controller ? { signal: controller.signal } : {}),
      });
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  };

  let response: Response;
  try {
    response = await performFetch(options.token);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Kết nối máy chủ quá thời gian (15 giây). Kiểm tra backend và địa chỉ API.');
    }
    throw new ApiError('Không kết nối được máy chủ. Kiểm tra backend và địa chỉ API.');
  }

  if (response.status === 401 && options.token && !options.skipAuthRefresh && !path.startsWith('/api/v1/auth/')) {
    const newAccessToken = await tryRefreshAccessToken();
    if (newAccessToken) {
      try {
        response = await performFetch(newAccessToken);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ApiError('Kết nối máy chủ quá thời gian (15 giây). Kiểm tra backend và địa chỉ API.');
        }
        throw new ApiError('Không kết nối được máy chủ. Kiểm tra backend và địa chỉ API.');
      }
    }
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

async function buildPhotoFormData(
  defaultFileName: string,
  photo: { uri: string; mimeType?: string | null; fileName?: string | null },
): Promise<FormData> {
  const fileName = photo.fileName ?? defaultFileName;
  const body = new FormData();
  if (Platform.OS === 'web') {
    let blob: Blob;
    try {
      const res = await fetch(photo.uri);
      blob = await res.blob();
    } catch (error) {
      const reason = error instanceof Error && error.message ? ` (${error.message})` : '';
      throw new ApiError(`Không thể đọc dữ liệu ảnh từ trình duyệt${reason}.`);
    }
    const inferredMime = photo.mimeType
      ?? (blob.type === 'image/png' || fileName.toLocaleLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    if (inferredMime !== 'image/jpeg' && inferredMime !== 'image/png') {
      throw new ApiError('Ảnh cần ở định dạng JPEG hoặc PNG.');
    }
    const typedBlob = blob.type === inferredMime ? blob : new Blob([blob], { type: inferredMime });
    body.append('file', typedBlob, fileName);
    return body;
  }

  const mimeType = photo.mimeType ?? (fileName.toLocaleLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
    throw new ApiError('Ảnh cần ở định dạng JPEG hoặc PNG.');
  }
  const file = new File(photo.uri);
  body.append('file', file, fileName);
  return body;
}

async function sendMultipartPhoto<T>(
  endpoint: string,
  defaultFileName: string,
  token: string,
  photo: { uri: string; mimeType?: string | null; fileName?: string | null },
  parseResponse: (response: Response) => Promise<T>,
): Promise<T> {
  if (!apiBaseUrl) throw new ApiError('Chưa cấu hình EXPO_PUBLIC_API_URL.');
  const body = await buildPhotoFormData(defaultFileName, photo);
  let response: Response;
  try {
    response = await expoFetch(`${apiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      body,
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
  return parseResponse(response);
}

async function uploadPhoto(
  endpoint: string,
  defaultFileName: string,
  token: string,
  photo: { uri: string; mimeType?: string | null; fileName?: string | null },
) {
  await sendMultipartPhoto<void>(endpoint, defaultFileName, token, photo, async () => undefined);
}

export function uploadPlantPhoto(plantId: string, token: string, photo: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  return uploadPhoto(`/api/v1/plants/${plantId}/photo`, `plant-${plantId}.jpg`, token, photo);
}

export function uploadGardenPhoto(gardenId: string, token: string, photo: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  return uploadPhoto(`/api/v1/gardens/${gardenId}/photo`, `garden-${gardenId}.jpg`, token, photo);
}

export function deleteGardenPhoto(gardenId: string, token: string) {
  return apiRequest<void>(`/api/v1/gardens/${gardenId}/photo`, { method: 'DELETE', token });
}

export function getGardenPhotoUri(gardenId: string, photoUpdatedAt?: string | null) {
  return photoUpdatedAt && apiBaseUrl ? `${apiBaseUrl}/api/v1/gardens/${gardenId}/photo?v=${encodeURIComponent(photoUpdatedAt)}` : null;
}

export type ApiUser = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  timezone?: string;
  avatarUpdatedAt?: string | null;
};

export function getMyAvatarUri(avatarUpdatedAt?: string | null) {
  return avatarUpdatedAt && apiBaseUrl ? `${apiBaseUrl}/api/v1/auth/me/avatar?v=${encodeURIComponent(avatarUpdatedAt)}` : null;
}

export function getAdminUserAvatarUri(userId: string, avatarUpdatedAt?: string | null) {
  return avatarUpdatedAt && apiBaseUrl
    ? `${apiBaseUrl}/api/v1/admin/users/${userId}/avatar?v=${encodeURIComponent(avatarUpdatedAt)}`
    : null;
}

export function uploadMyAvatar(
  token: string,
  photo: { uri: string; mimeType?: string | null; fileName?: string | null },
): Promise<ApiUser> {
  return sendMultipartPhoto<ApiUser>(
    '/api/v1/auth/me/avatar',
    'avatar.jpg',
    token,
    photo,
    (response) => response.json() as Promise<ApiUser>,
  );
}

export function deleteMyAvatar(token: string) {
  return apiRequest<void>('/api/v1/auth/me/avatar', { method: 'DELETE', token });
}
export type AuthResult = { accessToken: string; refreshToken?: string; tokenType: string; expiresIn: number; user: ApiUser };
export type ForgotPasswordResult = { resetToken?: string | null; message: string };

export function refreshAuthSession(refreshToken: string) {
  return apiRequest<AuthResult>('/api/v1/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    skipAuthRefresh: true,
  });
}

export function logoutAuthSession(refreshToken: string) {
  return apiRequest<void>('/api/v1/auth/logout', {
    method: 'POST',
    body: { refreshToken },
    skipAuthRefresh: true,
  });
}

export function changePassword(token: string, body: { currentPassword: string; newPassword: string }) {
  return apiRequest<void>('/api/v1/auth/change-password', {
    method: 'POST',
    token,
    body,
  });
}

export function forgotPassword(email: string) {
  return apiRequest<ForgotPasswordResult>('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

export function resetPassword(body: { token: string; newPassword: string }) {
  return apiRequest<void>('/api/v1/auth/reset-password', {
    method: 'POST',
    body,
  });
}

export function resendVerificationEmail(email: string) {
  return apiRequest<{ message: string; verificationToken?: string }>('/api/v1/auth/resend-verification', {
    method: 'POST',
    body: { email },
  });
}
export type PageResponse<T> = {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type PlantCatalogItem = {
  id: string;
  commonName: string;
  scientificName: string;
  category: string;
  difficulty?: string | null;
  lightRequirement?: string | null;
  waterFrequencyDays?: number | null;
  temperatureRange?: string | null;
  toxicityWarning?: string | null;
  overview?: string | null;
  origin?: string | null;
  morphology?: string | null;
};

export function fetchCatalogPlants(params?: { page?: number; size?: number; q?: string; category?: string }) {
  const search = new URLSearchParams();
  if (params?.page !== undefined) search.set('page', String(params.page));
  if (params?.size !== undefined) search.set('size', String(params.size));
  if (params?.q?.trim()) search.set('q', params.q.trim());
  if (params?.category?.trim()) search.set('category', params.category.trim());
  const qs = search.toString();
  return apiRequest<PageResponse<PlantCatalogItem>>(`/api/v1/catalog/plants${qs ? `?${qs}` : ''}`);
}

export function fetchOwnedPlants(token: string, params?: { page?: number; size?: number; q?: string; gardenId?: string }) {
  const search = new URLSearchParams();
  if (params?.page !== undefined) search.set('page', String(params.page));
  if (params?.size !== undefined) search.set('size', String(params.size));
  if (params?.q?.trim()) search.set('q', params.q.trim());
  if (params?.gardenId?.trim()) search.set('gardenId', params.gardenId.trim());
  const qs = search.toString();
  return apiRequest<PageResponse<ApiOwnedPlant>>(`/api/v1/plants${qs ? `?${qs}` : ''}`, { token });
}
export type ApiGarden = {
  id: string;
  name: string;
  locationType: string;
  locationDetail: string | null;
  description: string | null;
  provinceCode?: string | null;
  provinceName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationSource?: 'province' | 'gps' | null;
  createdAt: string;
  updatedAt: string;
  photoUpdatedAt?: string | null;
};

export type ApiGardenRequest = {
  name: string;
  locationType: string;
  locationDetail?: string | null;
  description?: string | null;
  locationSource?: 'province' | 'gps' | null;
  provinceCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type ApiProvince = {
  code: string;
  name: string;
  center: string;
  latitude: number;
  longitude: number;
};

export type PlantTemperatureAlert = {
  plantId: string;
  displayName: string;
  temperatureRange: string;
  minC: number;
  maxC: number;
  level: 'too_cold' | 'too_hot';
};

export type ApiGardenWeather = {
  gardenId: string;
  status: 'OK' | 'NO_LOCATION' | 'NOT_CONFIGURED' | 'UNAVAILABLE';
  stale: boolean;
  outdoor: boolean;
  locationSource: 'province' | 'gps' | null;
  provinceCode: string | null;
  provinceName: string | null;
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  temperatureC: number | null;
  feelsLikeC: number | null;
  tempMinC: number | null;
  tempMaxC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  windSpeedMs: number | null;
  cloudsPct: number | null;
  conditionCode: number | null;
  conditionMain: string | null;
  conditionDescription: string | null;
  iconCode: string | null;
  observedAt: string | null;
  fetchedAt: string | null;
  plantAlerts: PlantTemperatureAlert[];
};

export function updateGarden(gardenId: string, token: string, body: ApiGardenRequest) {
  return apiRequest<ApiGarden>(`/api/v1/gardens/${gardenId}`, {
    method: 'PUT',
    token,
    body,
  });
}

export function fetchWeatherProvinces() {
  return apiRequest<ApiProvince[]>('/api/v1/weather/provinces');
}

export function fetchGardenWeather(gardenId: string, token: string, refresh = false) {
  const qs = refresh ? '?refresh=true' : '';
  return apiRequest<ApiGardenWeather>(`/api/v1/gardens/${gardenId}/weather${qs}`, { token });
}
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

export type JournalLogType = 'growth' | 'watering' | 'fertilizing' | 'pest' | 'pruning' | 'other';
export type JournalHealthStatus = 'healthy' | 'warning' | 'critical';

export type ApiJournalEntry = {
  id: string;
  plantId: string;
  plantName: string;
  plantScientificName: string;
  plantCategory: string;
  gardenId: string | null;
  gardenName: string | null;
  careTaskId: string | null;
  entryDate: string;
  logType: JournalLogType;
  healthStatus: JournalHealthStatus;
  title: string | null;
  note: string;
  photoIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ApiJournalRequest = {
  entryDate?: string | null;
  logType: JournalLogType;
  healthStatus: JournalHealthStatus;
  title?: string | null;
  note: string;
  careTaskId?: string | null;
};

export type ApiJournalUpdateRequest = {
  entryDate?: string | null;
  logType: JournalLogType;
  healthStatus: JournalHealthStatus;
  title?: string | null;
  note: string;
};

export type ApiJournalPhotoMeta = {
  id: string;
  journalId: string;
  contentType: string;
  createdAt: string;
};

export function fetchJournals(
  token: string,
  params?: { page?: number; size?: number; plantId?: string; logType?: JournalLogType; healthStatus?: JournalHealthStatus; q?: string },
) {
  const search = new URLSearchParams();
  if (params?.page !== undefined) search.set('page', String(params.page));
  if (params?.size !== undefined) search.set('size', String(params.size));
  if (params?.plantId?.trim()) search.set('plantId', params.plantId.trim());
  if (params?.logType) search.set('logType', params.logType);
  if (params?.healthStatus) search.set('healthStatus', params.healthStatus);
  if (params?.q?.trim()) search.set('q', params.q.trim());
  const qs = search.toString();
  return apiRequest<PageResponse<ApiJournalEntry>>(`/api/v1/journals${qs ? `?${qs}` : ''}`, { token });
}

export function fetchPlantJournals(plantId: string, token: string) {
  return apiRequest<ApiJournalEntry[]>(`/api/v1/plants/${plantId}/journals`, { token });
}

export function createJournalEntry(plantId: string, token: string, body: ApiJournalRequest) {
  return apiRequest<ApiJournalEntry>(`/api/v1/plants/${plantId}/journals`, {
    method: 'POST',
    token,
    body,
  });
}

export function updateJournalEntry(journalId: string, token: string, body: ApiJournalUpdateRequest) {
  return apiRequest<ApiJournalEntry>(`/api/v1/journals/${journalId}`, {
    method: 'PUT',
    token,
    body,
  });
}

export function deleteJournalEntry(journalId: string, token: string) {
  return apiRequest<void>(`/api/v1/journals/${journalId}`, {
    method: 'DELETE',
    token,
  });
}

export function uploadJournalPhoto(
  journalId: string,
  token: string,
  photo: { uri: string; mimeType?: string | null; fileName?: string | null },
): Promise<ApiJournalPhotoMeta> {
  return sendMultipartPhoto<ApiJournalPhotoMeta>(
    `/api/v1/journals/${journalId}/photos`,
    `journal-${journalId}.jpg`,
    token,
    photo,
    (response) => response.json() as Promise<ApiJournalPhotoMeta>,
  );
}

export function deleteJournalPhoto(journalId: string, photoId: string, token: string) {
  return apiRequest<void>(`/api/v1/journals/${journalId}/photos/${photoId}`, {
    method: 'DELETE',
    token,
  });
}

export type BloomStage = 'seedling' | 'budding' | 'flowering' | 'fruiting';

export type ApiGrowthRecord = {
  id: string;
  plantId: string;
  recordedDate: string;
  heightCm: number | null;
  leafCount: number | null;
  bloomStage: BloomStage | null;
  note: string | null;
  createdAt: string;
};

export type ApiGrowthRecordRequest = {
  recordedDate?: string;
  heightCm?: number | null;
  leafCount?: number | null;
  bloomStage?: BloomStage | null;
  note?: string | null;
};

export function fetchPlantGrowthRecords(plantId: string, token: string) {
  return apiRequest<ApiGrowthRecord[]>(`/api/v1/plants/${plantId}/growth-records`, { token });
}

export function createPlantGrowthRecord(plantId: string, token: string, body: ApiGrowthRecordRequest) {
  return apiRequest<ApiGrowthRecord>(`/api/v1/plants/${plantId}/growth-records`, {
    method: 'POST',
    token,
    body,
  });
}

export function deletePlantGrowthRecord(recordId: string, token: string) {
  return apiRequest<void>(`/api/v1/growth-records/${recordId}`, {
    method: 'DELETE',
    token,
  });
}

// ───────────────────────────── Admin User Management ─────────────────────────────

export type AdminUserStatus = 'pending_verification' | 'active' | 'disabled' | 'locked';
export type AdminAuditAction =
  | 'LOCK_USER'
  | 'UNLOCK_USER'
  | 'DISABLE_USER'
  | 'ACTIVATE_USER'
  | 'GRANT_ADMIN'
  | 'REVOKE_ADMIN'
  | 'GRANT_MODERATOR'
  | 'REVOKE_MODERATOR'
  | 'REVOKE_SESSIONS'
  | 'RESEND_VERIFICATION'
  | 'SEND_PASSWORD_RESET';

export type ApiAdminUserSummary = {
  id: string;
  email: string;
  displayName: string;
  status: AdminUserStatus;
  timezone: string;
  roles: string[];
  emailVerifiedAt: string | null;
  gardenCount: number;
  plantCount: number;
  activeSessionCount: number;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  avatarUpdatedAt?: string | null;
};

export type ApiAdminAuditLogEntry = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorDisplayName: string | null;
  targetUserId: string;
  targetEmail: string | null;
  targetDisplayName: string | null;
  action: AdminAuditAction;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
};

export type ApiAdminUserDetail = ApiAdminUserSummary & {
  recentAuditLogs: ApiAdminAuditLogEntry[];
};

export type ApiAdminUserStats = {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  lockedOrDisabledUsers: number;
  adminUsers: number;
  newUsersLast7Days: number;
  recentActiveUsers7Days: number;
};

export function fetchAdminUserStats(token: string) {
  return apiRequest<ApiAdminUserStats>('/api/v1/admin/users/stats', { token });
}

export function fetchAdminUsers(
  token: string,
  params?: { page?: number; size?: number; q?: string; status?: string; role?: string; activity?: string },
) {
  const qs = new URLSearchParams();
  if (params?.page !== undefined) qs.set('page', String(params.page));
  if (params?.size !== undefined) qs.set('size', String(params.size));
  if (params?.q?.trim()) qs.set('q', params.q.trim());
  if (params?.status) qs.set('status', params.status);
  if (params?.role) qs.set('role', params.role);
  if (params?.activity) qs.set('activity', params.activity);
  const query = qs.toString();
  return apiRequest<PageResponse<ApiAdminUserSummary>>(`/api/v1/admin/users${query ? `?${query}` : ''}`, { token });
}

export function fetchAdminUserDetail(userId: string, token: string) {
  return apiRequest<ApiAdminUserDetail>(`/api/v1/admin/users/${userId}`, { token });
}

export function updateAdminUserStatus(
  userId: string,
  token: string,
  body: { status: 'active' | 'locked' | 'disabled'; reason?: string | null },
) {
  return apiRequest<ApiAdminUserDetail>(`/api/v1/admin/users/${userId}/status`, {
    method: 'PATCH',
    token,
    body,
  });
}

export function updateAdminUserRole(
  userId: string,
  token: string,
  body: { admin?: boolean; moderator?: boolean; reason?: string | null },
) {
  return apiRequest<ApiAdminUserDetail>(`/api/v1/admin/users/${userId}/roles`, {
    method: 'PUT',
    token,
    body,
  });
}

export function revokeAdminUserSessions(userId: string, token: string, reason?: string | null) {
  return apiRequest<ApiAdminUserDetail>(`/api/v1/admin/users/${userId}/revoke-sessions`, {
    method: 'POST',
    token,
    body: reason ? { reason } : {},
  });
}

export type ApiAdminResendVerificationResult = {
  user: ApiAdminUserDetail;
  message: string;
  verificationToken: string | null;
};

export function resendAdminUserVerification(userId: string, token: string, reason?: string | null) {
  return apiRequest<ApiAdminResendVerificationResult>(`/api/v1/admin/users/${userId}/resend-verification`, {
    method: 'POST',
    token,
    body: reason ? { reason } : {},
  });
}

export type ApiAdminSendPasswordResetResult = {
  user: ApiAdminUserDetail;
  message: string;
  resetToken: string | null;
};

export function sendAdminUserPasswordReset(userId: string, token: string, reason?: string | null) {
  return apiRequest<ApiAdminSendPasswordResetResult>(`/api/v1/admin/users/${userId}/send-password-reset`, {
    method: 'POST',
    token,
    body: reason ? { reason } : {},
  });
}

export function fetchAdminAuditLogs(
  token: string,
  params?: { page?: number; size?: number; targetUserId?: string; action?: string },
) {
  const qs = new URLSearchParams();
  if (params?.page !== undefined) qs.set('page', String(params.page));
  if (params?.size !== undefined) qs.set('size', String(params.size));
  if (params?.targetUserId) qs.set('targetUserId', params.targetUserId);
  if (params?.action) qs.set('action', params.action);
  const query = qs.toString();
  return apiRequest<PageResponse<ApiAdminAuditLogEntry>>(`/api/v1/admin/audit-logs${query ? `?${query}` : ''}`, { token });
}

// ───────────────────────────── Auth Activity History ─────────────────────────────

export type AuthEventType = 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT' | 'ADMIN_REVOKED' | 'PASSWORD_CHANGED';

export type ApiAuthEvent = {
  id: string;
  userId: string;
  userEmail: string | null;
  userDisplayName: string | null;
  sessionFamilyId: string | null;
  eventType: AuthEventType;
  platform: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
  detail: string | null;
  createdAt: string;
};

export function fetchMyAuthEvents(token: string, params?: { page?: number; size?: number }) {
  const qs = new URLSearchParams();
  if (params?.page !== undefined) qs.set('page', String(params.page));
  if (params?.size !== undefined) qs.set('size', String(params.size));
  const query = qs.toString();
  return apiRequest<PageResponse<ApiAuthEvent>>(`/api/v1/auth/me/auth-events${query ? `?${query}` : ''}`, { token });
}

export function fetchAdminAuthEvents(
  token: string,
  params?: { page?: number; size?: number; userId?: string; eventType?: string; q?: string },
) {
  const qs = new URLSearchParams();
  if (params?.page !== undefined) qs.set('page', String(params.page));
  if (params?.size !== undefined) qs.set('size', String(params.size));
  if (params?.userId) qs.set('userId', params.userId);
  if (params?.eventType) qs.set('eventType', params.eventType);
  if (params?.q?.trim()) qs.set('q', params.q.trim());
  const query = qs.toString();
  return apiRequest<PageResponse<ApiAuthEvent>>(`/api/v1/admin/auth-events${query ? `?${query}` : ''}`, { token });
}

export function fetchAdminUserAuthEvents(
  userId: string,
  token: string,
  params?: { page?: number; size?: number },
) {
  const qs = new URLSearchParams();
  if (params?.page !== undefined) qs.set('page', String(params.page));
  if (params?.size !== undefined) qs.set('size', String(params.size));
  const query = qs.toString();
  return apiRequest<PageResponse<ApiAuthEvent>>(`/api/v1/admin/users/${userId}/auth-events${query ? `?${query}` : ''}`, { token });
}
