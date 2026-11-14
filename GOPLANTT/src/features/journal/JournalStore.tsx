import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuthSession } from '@/features/auth/AuthSession';
import {
  createJournalEntry,
  deleteJournalEntry,
  deleteJournalPhoto,
  fetchJournals,
  isApiConfigured,
  updateJournalEntry,
  uploadJournalPhoto,
  type ApiJournalEntry,
  type ApiJournalRequest,
  type ApiJournalUpdateRequest,
  type JournalHealthStatus,
  type JournalLogType,
} from '@/services/api';

export const JOURNAL_LOG_TYPE_META: Record<JournalLogType, { label: string; emoji: string; color: string }> = {
  growth: { label: 'Phát triển', emoji: '🌱', color: '#D5F2E1' },
  watering: { label: 'Tưới nước', emoji: '💧', color: '#D1E9FF' },
  fertilizing: { label: 'Bón phân', emoji: '🌿', color: '#E2F3D5' },
  pest: { label: 'Sâu bệnh', emoji: '🐛', color: '#FAD8D3' },
  pruning: { label: 'Cắt tỉa', emoji: '✂️', color: '#FFE0CF' },
  other: { label: 'Khác', emoji: '📝', color: '#F3E5FF' },
};

export const JOURNAL_LOG_TYPES: JournalLogType[] = ['growth', 'watering', 'fertilizing', 'pest', 'pruning', 'other'];

export const JOURNAL_HEALTH_META: Record<JournalHealthStatus, { label: string; bg: string; fg: string }> = {
  healthy: { label: 'Khỏe mạnh', bg: '#D5F2E1', fg: '#1E4B38' },
  warning: { label: 'Cần theo dõi', bg: '#FEF3C7', fg: '#B45309' },
  critical: { label: 'Cần can thiệp', bg: '#FEE2E2', fg: '#C53030' },
};

export const JOURNAL_HEALTH_STATUSES: JournalHealthStatus[] = ['healthy', 'warning', 'critical'];

export type LocalPhotoDraft = { uri: string; mimeType?: string | null; fileName?: string | null };

type JournalContextValue = {
  journals: ApiJournalEntry[];
  isLoading: boolean;
  error: string;
  refresh: () => Promise<void>;
  createJournal: (plantId: string, body: ApiJournalRequest, photos?: LocalPhotoDraft[]) => Promise<ApiJournalEntry>;
  updateJournal: (journalId: string, body: ApiJournalUpdateRequest, newPhotos?: LocalPhotoDraft[]) => Promise<ApiJournalEntry>;
  removeJournal: (journalId: string) => Promise<void>;
  removePhoto: (journalId: string, photoId: string) => Promise<void>;
};

const JournalContext = createContext<JournalContextValue | null>(null);

export function JournalProvider({ children }: { children: ReactNode }) {
  const { accessToken, isReady } = useAuthSession();
  const [journals, setJournals] = useState<ApiJournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!isApiConfigured || !accessToken) {
      setJournals([]);
      setError('');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const rows = await fetchJournals(accessToken);
      setJournals(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được nhật ký chăm sóc.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isReady) void refresh();
  }, [isReady, refresh]);

  const value = useMemo<JournalContextValue>(() => ({
    journals,
    isLoading,
    error,
    refresh,
    createJournal: async (plantId, body, photos = []) => {
      if (!isApiConfigured || !accessToken) {
        throw new Error('Cần đăng nhập và kết nối máy chủ để lưu nhật ký.');
      }
      const created = await createJournalEntry(plantId, accessToken, body);
      for (const photo of photos) {
        await uploadJournalPhoto(created.id, accessToken, photo);
      }
      await refresh();
      return created;
    },
    updateJournal: async (journalId, body, newPhotos = []) => {
      if (!isApiConfigured || !accessToken) {
        throw new Error('Cần đăng nhập để cập nhật nhật ký.');
      }
      const updated = await updateJournalEntry(journalId, accessToken, body);
      for (const photo of newPhotos) {
        await uploadJournalPhoto(journalId, accessToken, photo);
      }
      await refresh();
      return updated;
    },
    removeJournal: async (journalId) => {
      if (!isApiConfigured || !accessToken) {
        throw new Error('Cần đăng nhập để xóa nhật ký.');
      }
      await deleteJournalEntry(journalId, accessToken);
      await refresh();
    },
    removePhoto: async (journalId, photoId) => {
      if (!isApiConfigured || !accessToken) {
        throw new Error('Cần đăng nhập để xóa ảnh.');
      }
      await deleteJournalPhoto(journalId, photoId, accessToken);
      await refresh();
    },
  }), [journals, isLoading, error, refresh, accessToken]);

  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

export function useJournals() {
  const context = useContext(JournalContext);
  if (!context) throw new Error('useJournals must be used inside JournalProvider');
  return context;
}
