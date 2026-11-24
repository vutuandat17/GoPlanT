import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/AuthSession';
import { safeBack } from '@/services/navigation';
import {
  fetchAdminAuditLogs,
  type AdminAuditAction,
  type ApiAdminAuditLogEntry,
} from '@/services/api';

const AUDIT_ACTION_META: Record<AdminAuditAction, { label: string; bg: string; fg: string }> = {
  LOCK_USER: { label: 'Khóa tài khoản', bg: '#FEE2E2', fg: '#B42318' },
  UNLOCK_USER: { label: 'Mở khóa', bg: '#DDF2E4', fg: '#174F3B' },
  DISABLE_USER: { label: 'Vô hiệu hóa', bg: '#E5E7EB', fg: '#374151' },
  ACTIVATE_USER: { label: 'Kích hoạt', bg: '#DDF2E4', fg: '#174F3B' },
  GRANT_ADMIN: { label: 'Cấp quyền Admin', bg: '#E0E7FF', fg: '#3730A3' },
  REVOKE_ADMIN: { label: 'Thu hồi Admin', bg: '#FEF3C7', fg: '#92400E' },
  GRANT_MODERATOR: { label: 'Cấp Moderator', bg: '#CCFBF1', fg: '#115E59' },
  REVOKE_MODERATOR: { label: 'Thu hồi Moderator', bg: '#FFEDD5', fg: '#9A3412' },
  REVOKE_SESSIONS: { label: 'Thu hồi phiên', bg: '#E0F2FE', fg: '#0369A1' },
  RESEND_VERIFICATION: { label: 'Gửi lại xác minh', bg: '#F3E8FF', fg: '#6B21A8' },
  SEND_PASSWORD_RESET: { label: 'Gửi đặt lại MK', bg: '#FEF3C7', fg: '#92400E' },
};

const ACTION_FILTERS: { key: '' | AdminAuditAction; label: string }[] = [
  { key: '', label: 'Tất cả' },
  { key: 'LOCK_USER', label: 'Khóa' },
  { key: 'UNLOCK_USER', label: 'Mở khóa' },
  { key: 'DISABLE_USER', label: 'Vô hiệu hóa' },
  { key: 'ACTIVATE_USER', label: 'Kích hoạt' },
  { key: 'GRANT_ADMIN', label: 'Cấp Admin' },
  { key: 'REVOKE_ADMIN', label: 'Thu hồi Admin' },
  { key: 'GRANT_MODERATOR', label: 'Cấp Moderator' },
  { key: 'REVOKE_MODERATOR', label: 'Thu hồi Moderator' },
  { key: 'REVOKE_SESSIONS', label: 'Thu hồi phiên' },
  { key: 'RESEND_VERIFICATION', label: 'Gửi lại xác minh' },
  { key: 'SEND_PASSWORD_RESET', label: 'Gửi đặt lại MK' },
];

function formatDateTimeVi(iso: string | null | undefined) {
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

export default function AdminAuditLogsScreen() {
  const { user, accessToken } = useAuthSession();
  const [logs, setLogs] = useState<ApiAdminAuditLogEntry[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [actionFilter, setActionFilter] = useState<'' | AdminAuditAction>('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async (nextPage = 0, append = false) => {
    if (!accessToken || user?.role !== 'admin') return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const res = await fetchAdminAuditLogs(accessToken, {
        page: nextPage,
        size: 25,
        action: actionFilter,
      });
      setLogs((prev) => (append ? [...prev, ...res.items] : res.items));
      setPage(res.page);
      setTotalPages(res.totalPages);
      setTotalElements(res.totalElements);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được nhật ký kiểm toán.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [accessToken, user?.role, actionFilter]);

  useEffect(() => {
    void loadLogs(0, false);
  }, [loadLogs]);

  if (user?.role !== 'admin') {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={() => safeBack('/account')} style={s.back}>
            <Text style={s.backText}>←</Text>
          </Pressable>
          <Text style={s.headerTitle}>Nhật ký kiểm toán</Text>
          <View style={s.headerSpacer} />
        </View>
        <View style={s.deniedWrap}>
          <Text style={s.deniedTitle}>Không có quyền truy cập</Text>
          <Text style={s.caption}>Chỉ Quản trị viên mới được xem nhật ký kiểm toán quản trị.</Text>
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
        <Text style={s.headerTitle}>Nhật ký kiểm toán quản trị</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Làm mới" onPress={() => void loadLogs(0, false)} style={s.refreshBtn}>
          <Text style={s.refreshText}>↻</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.banner}>
          <Text style={s.bannerTitle}>Tổng hợp thao tác quản trị ({totalElements})</Text>
          <Text style={s.caption}>Lưu vết bất biến mọi lần khóa/mở khóa, kích hoạt, đổi quyền Admin và thu hồi phiên.</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
          {ACTION_FILTERS.map((item) => (
            <Pressable
              key={item.key || 'all-audit'}
              onPress={() => setActionFilter(item.key)}
              style={[s.pill, actionFilter === item.key && s.pillActive]}>
              <Text style={[s.pillText, actionFilter === item.key && s.pillTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {error ? <Text style={s.errorText}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 18 }} /> : null}

        {!loading && logs.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.cardTitle}>Chưa có bản ghi kiểm toán nào</Text>
            <Text style={s.caption}>Các thay đổi trạng thái hoặc phân quyền của Admin sẽ xuất hiện tại đây.</Text>
          </View>
        ) : null}

        {logs.map((log) => {
          const meta = AUDIT_ACTION_META[log.action] ?? { label: log.action, bg: C.softSurface, fg: C.forest };
          return (
            <View key={log.id} style={s.logCard}>
              <View style={s.topRow}>
                <Text style={[s.badge, { backgroundColor: meta.bg, color: meta.fg }]}>{meta.label}</Text>
                <Text style={s.timeText}>{formatDateTimeVi(log.createdAt)}</Text>
              </View>
              <Text style={s.cardTitle} numberOfLines={1}>
                Đối tượng: {log.targetDisplayName || 'Người dùng'} ({log.targetEmail || log.targetUserId})
              </Text>
              <Text style={s.metaLine}>
                Thực hiện bởi: {log.actorDisplayName || log.actorEmail || 'Hệ thống'}
              </Text>
              {log.previousValue || log.newValue ? (
                <Text style={s.metaLine}>
                  Thay đổi: {log.previousValue ?? '—'} → {log.newValue ?? '—'}
                </Text>
              ) : null}
              {log.reason ? <Text style={s.reasonText}>Lý do: {log.reason}</Text> : null}
            </View>
          );
        })}

        {page + 1 < totalPages ? (
          <Pressable
            disabled={loadingMore}
            onPress={() => void loadLogs(page + 1, true)}
            style={s.loadMoreBtn}>
            <Text style={s.loadMoreText}>{loadingMore ? 'Đang tải...' : 'Tải thêm nhật ký'}</Text>
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
  pills: { flexDirection: 'row', gap: 7, paddingVertical: 2 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: C.surface },
  pillActive: { backgroundColor: C.primary },
  pillText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 11 },
  pillTextActive: { color: C.surface },
  errorText: { color: '#B42318', fontFamily: F.regular, fontSize: 12 },
  emptyCard: { padding: 18, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 6 },
  logCard: { padding: 12, borderRadius: 14, backgroundColor: C.surface, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, fontFamily: F.semiBold, fontSize: 10 },
  timeText: { color: C.mutedText, fontFamily: F.regular, fontSize: 11 },
  cardTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  metaLine: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  reasonText: { color: C.text, fontFamily: F.regular, fontSize: 11, fontStyle: 'italic' },
  loadMoreBtn: { minHeight: 44, borderRadius: 10, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  loadMoreText: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
});
