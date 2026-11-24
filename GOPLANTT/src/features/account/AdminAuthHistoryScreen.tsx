import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/AuthSession';
import { safeBack } from '@/services/navigation';
import {
  fetchAdminAuthEvents,
  type ApiAuthEvent,
  type AuthEventType,
} from '@/services/api';

export const AUTH_EVENT_META: Record<AuthEventType, { label: string; bg: string; fg: string }> = {
  LOGIN_SUCCESS: { label: 'Đăng nhập', bg: '#DDF2E4', fg: '#174F3B' },
  LOGIN_FAILED: { label: 'Đăng nhập lỗi', bg: '#FEE2E2', fg: '#B42318' },
  LOGOUT: { label: 'Đăng xuất', bg: '#E5E7EB', fg: '#374151' },
  ADMIN_REVOKED: { label: 'Admin thu hồi', bg: '#FEF3C7', fg: '#92400E' },
  PASSWORD_CHANGED: { label: 'Đổi mật khẩu', bg: '#E0F2FE', fg: '#0369A1' },
};

const EVENT_FILTERS: { key: '' | AuthEventType; label: string }[] = [
  { key: '', label: 'Tất cả' },
  { key: 'LOGIN_SUCCESS', label: 'Đăng nhập' },
  { key: 'LOGOUT', label: 'Đăng xuất' },
  { key: 'LOGIN_FAILED', label: 'Thất bại' },
  { key: 'ADMIN_REVOKED', label: 'Admin thu hồi' },
  { key: 'PASSWORD_CHANGED', label: 'Đổi mật khẩu' },
];

export function formatAuthEventTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminAuthHistoryScreen() {
  const { user, accessToken } = useAuthSession();
  const params = useLocalSearchParams<{ userId?: string; userName?: string }>();
  const scopedUserId = typeof params.userId === 'string' && params.userId.trim() ? params.userId.trim() : undefined;
  const scopedUserName = typeof params.userName === 'string' && params.userName.trim() ? params.userName.trim() : undefined;
  const [events, setEvents] = useState<ApiAuthEvent[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [eventFilter, setEventFilter] = useState<'' | AuthEventType>('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const loadEvents = useCallback(async (nextPage = 0, append = false) => {
    if (!accessToken || user?.role !== 'admin') return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const res = await fetchAdminAuthEvents(accessToken, {
        page: nextPage,
        size: 25,
        userId: scopedUserId,
        eventType: eventFilter,
        q: appliedQuery,
      });
      setEvents((prev) => (append ? [...prev, ...res.items] : res.items));
      setPage(res.page);
      setTotalPages(res.totalPages);
      setTotalElements(res.totalElements);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được lịch sử đăng nhập/đăng xuất.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [accessToken, user?.role, scopedUserId, eventFilter, appliedQuery]);

  useEffect(() => {
    void loadEvents(0, false);
  }, [loadEvents]);

  if (user?.role !== 'admin') {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={() => safeBack('/account')} style={s.back}>
            <Text style={s.backText}>←</Text>
          </Pressable>
          <Text style={s.headerTitle}>Lịch sử đăng nhập</Text>
          <View style={s.headerSpacer} />
        </View>
        <View style={s.deniedWrap}>
          <Text style={s.deniedTitle}>Không có quyền truy cập</Text>
          <Text style={s.caption}>Chỉ Quản trị viên mới được xem nhật ký truy cập toàn hệ thống.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={() => safeBack('/account')} style={s.back}>
          <Text style={s.backText}>←</Text>
        </Pressable>
        <Text style={s.headerTitle}>Lịch sử đăng nhập & đăng xuất</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Làm mới" onPress={() => void loadEvents(0, false)} style={s.refreshBtn}>
          <Text style={s.refreshText}>↻</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.banner}>
          <Text style={s.bannerTitle}>
            {scopedUserName ? `Lịch sử phiên · ${scopedUserName} (${totalElements})` : `Nhật ký vào/ra hệ thống (${totalElements})`}
          </Text>
          <Text style={s.caption}>Theo dõi các lần đăng nhập, đăng xuất, đăng nhập thất bại và thu hồi phiên theo thời gian thực.</Text>
        </View>

        <View style={s.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => setAppliedQuery(query.trim())}
            placeholder="Tìm theo tên, email hoặc địa chỉ IP..."
            placeholderTextColor={C.mutedText}
            style={s.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
          />
          <Pressable onPress={() => setAppliedQuery(query.trim())} style={s.searchBtn}>
            <Text style={s.searchBtnText}>Tìm</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
          {EVENT_FILTERS.map((item) => (
            <Pressable
              key={item.key || 'all-events'}
              onPress={() => setEventFilter(item.key)}
              style={[s.pill, eventFilter === item.key && s.pillActive]}>
              <Text style={[s.pillText, eventFilter === item.key && s.pillTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {error ? <Text style={s.errorText}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 18 }} /> : null}

        {!loading && events.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.cardTitle}>Chưa có lịch sử phù hợp</Text>
            <Text style={s.caption}>Các sự kiện đăng nhập, đăng xuất sẽ tự động xuất hiện tại đây.</Text>
          </View>
        ) : null}

        {events.map((ev) => {
          const meta = AUTH_EVENT_META[ev.eventType] ?? AUTH_EVENT_META.LOGIN_SUCCESS;
          return (
            <View key={ev.id} style={s.eventCard}>
              <View style={s.topRow}>
                <Text style={[s.badge, { backgroundColor: meta.bg, color: meta.fg }]}>{meta.label}</Text>
                <Text style={s.timeText}>{formatAuthEventTime(ev.createdAt)}</Text>
              </View>
              <Text style={s.cardTitle} numberOfLines={1}>
                {ev.userDisplayName || 'Người dùng'} · {ev.userEmail || ev.userId}
              </Text>
              <Text style={s.metaLine}>
                Thiết bị: {ev.deviceLabel || ev.platform || 'Không rõ'}
                {ev.ipAddress ? ` · IP: ${ev.ipAddress}` : ''}
              </Text>
              {ev.detail ? <Text style={s.detailLine}>{ev.detail}</Text> : null}
            </View>
          );
        })}

        {page + 1 < totalPages ? (
          <Pressable
            disabled={loadingMore}
            onPress={() => void loadEvents(page + 1, true)}
            style={s.loadMoreBtn}>
            <Text style={s.loadMoreText}>{loadingMore ? 'Đang tải...' : 'Tải thêm sự kiện'}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  backText: { color: C.surface, fontSize: 22, lineHeight: 26 },
  headerTitle: { flex: 1, color: C.forest, fontFamily: F.semiBold, fontSize: 16 },
  headerSpacer: { width: 34 },
  refreshBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: C.forest, fontSize: 18, fontFamily: F.bold },
  deniedWrap: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', gap: 8 },
  deniedTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 17 },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },
  banner: { padding: 15, borderRadius: 14, backgroundColor: '#E5F1E8', gap: 4 },
  bannerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 16 },
  caption: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.surface, color: C.text, fontFamily: F.regular, fontSize: 13 },
  searchBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { color: C.surface, fontFamily: F.semiBold, fontSize: 13 },
  pills: { flexDirection: 'row', gap: 7, paddingVertical: 2 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: C.surface },
  pillActive: { backgroundColor: C.primary },
  pillText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 11 },
  pillTextActive: { color: C.surface },
  errorText: { color: '#B42318', fontFamily: F.regular, fontSize: 12 },
  emptyCard: { padding: 18, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 6 },
  eventCard: { padding: 12, borderRadius: 14, backgroundColor: C.surface, gap: 5 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, fontFamily: F.semiBold, fontSize: 10 },
  timeText: { color: C.mutedText, fontFamily: F.regular, fontSize: 11 },
  cardTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  metaLine: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  detailLine: { color: C.text, fontFamily: F.regular, fontSize: 11, fontStyle: 'italic' },
  loadMoreBtn: { minHeight: 44, borderRadius: 10, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  loadMoreText: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
});
