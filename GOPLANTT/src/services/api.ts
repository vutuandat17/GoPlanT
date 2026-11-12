export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') ?? '';
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

export type ApiUser = { id: string; email: string; displayName: string; roles: string[] };
export type AuthResult = { accessToken: string; tokenType: string; expiresIn: number; user: ApiUser };
export type PlantCatalogItem = { id: string; commonName: string; scientificName: string; category: string };
export type ApiGarden = {
  id: string; name: string; locationType: string; locationDetail: string | null; description: string | null;
  createdAt: string; updatedAt: string;
};
export type ApiOwnedPlant = {
  id: string; catalogId: string; gardenId: string | null; displayName: string; commonName: string;
  scientificName: string; specificLocation: string | null; plantedOn: string | null; note: string | null; addedAt: string;
};
