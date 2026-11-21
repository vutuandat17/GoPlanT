import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import {
  Alert,
  Modal,
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
  fetchAdminUserDetail,
  fetchAdminUserStats,
  fetchAdminUsers,
  resendAdminUserVerification,
  revokeAdminUserSessions,
  updateAdminUserRole,
  updateAdminUserStatus,
  type AdminAuditAction,
  type AdminUserStatus,
  type ApiAdminUserDetail,
  type ApiAdminUserStats,
  type ApiAdminUserSummary,
} from '@/services/api';

const STATUS_META: Record<AdminUserStatus, { label: string; bg: string; fg: string }> = {
  active: { label: 'Đã kích hoạt', bg: '#DDF2E4', fg: '#174F3B' },
  pending_verification: { label: 'Chờ xác minh', bg: '#FEF3C7', fg: '#B45309' },
  locked: { label: 'Đã khóa', bg: '#FEE2E2', fg: '#B42318' },
  disabled: { label: 'Vô hiệu hóa', bg: '#E5E7EB', fg: '#4B5563' },
};

const ACTION_LABELS: Record<AdminAuditAction, string> = {
  LOCK_USER: 'Khóa tài khoản',
  UNLOCK_USER: 'Mở khóa tài khoản',
  DISABLE_USER: 'Vô hiệu hóa tài khoản',
  ACTIVATE_USER: 'Kích hoạt tài khoản',
  GRANT_ADMIN: 'Cấp quyền Quản trị',
  REVOKE_ADMIN: 'Thu hồi quyền Quản trị',
  GRANT_MODERATOR: 'Cấp quyền Moderator',
  REVOKE_MODERATOR: 'Thu hồi quyền Moderator',
  REVOKE_SESSIONS: 'Thu hồi phiên đăng nhập',
  RESEND_VERIFICATION: 'Gửi lại email xác minh',
};

const STATUS_FILTERS: { key: '' | AdminUserStatus; label: string }[] = [
  { key: '', label: 'Tất cả trạng thái' },
  { key: 'active', label: 'Đã kích hoạt' },
  { key: 'pending_verification', label: 'Chờ xác minh' },
  { key: 'locked', label: 'Đã khóa' },
  { key: 'disabled', label: 'Vô hiệu hóa' },
];

const ROLE_FILTERS: { key: '' | 'admin' | 'moderator' | 'user'; label: string }[] = [
  { key: '', label: 'Mọi vai trò' },
  { key: 'admin', label: 'Quản trị viên' },
  { key: 'moderator', label: 'Kiểm duyệt viên' },
  { key: 'user', label: 'Thành viên' },
];

type ActivityFilterKey = '' | 'recent' | 'inactive_30d' | 'never_logged_in';

const ACTIVITY_FILTERS: { key: ActivityFilterKey; label: string }[] = [
  { key: '', label: 'Mọi mức độ dùng' },
  { key: 'recent', label: 'Dùng gần đây (7 ngày)' },
  { key: 'inactive_30d', label: 'Ngưng dùng (>30 ngày)' },
  { key: 'never_logged_in', label: 'Chưa từng đăng nhập' },
];

function getActivityBadge(item: ApiAdminUserSummary): { label: string; bg: string; fg: string } {
  if (!item.lastLoginAt) {
    return { label: 'Chưa từng đăng nhập', bg: '#F3F4F6', fg: '#4B5563' };
  }
  const refIso = item.lastActiveAt ?? item.lastLoginAt;
  const refMs = new Date(refIso).getTime();
  if (Number.isNaN(refMs)) {
    return { label: 'Chưa rõ hoạt động', bg: '#F3F4F6', fg: '#4B5563' };
  }
  const diffMinutes = Math.max(0, Math.floor((Date.now() - refMs) / 60000));
  if (diffMinutes <= 15) {
    return { label: '● Đang hoạt động', bg: '#D1FAE5', fg: '#065F46' };
  }
  if (diffMinutes < 60 * 24) {
    const hours = Math.max(1, Math.floor(diffMinutes / 60));
    return { label: `Truy cập ${hours} giờ trước`, bg: '#E0F2FE', fg: '#0369A1' };
  }
  const days = Math.floor(diffMinutes / (60 * 24));
  if (days <= 30) {
    return { label: `Truy cập ${days} ngày trước`, bg: '#EEF5EF', fg: '#3B6752' };
  }
  return { label: `Ngưng dùng (${days} ngày)`, bg: '#FEF3C7', fg: '#92400E' };
}

function formatDateTimeVi(iso: string | null | undefined) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminUsersScreen() {
  const { user, accessToken } = useAuthSession();
  const [users, setUsers] = useState<ApiAdminUserSummary[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | AdminUserStatus>('');
  const [roleFilter, setRoleFilter] = useState<'' | 'admin' | 'moderator' | 'user'>('');
  const [activityFilter, setActivityFilter] = useState<ActivityFilterKey>('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState<ApiAdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [adminsCollapsed, setAdminsCollapsed] = useState(false);
  const [membersCollapsed, setMembersCollapsed] = useState(false);
  const [stats, setStats] = useState<ApiAdminUserStats | null>(null);

  const loadStats = useCallback(async () => {
    if (!accessToken || user?.role !== 'admin') return;
    try {
      const nextStats = await fetchAdminUserStats(accessToken);
      setStats(nextStats);
    } catch {
      // Keep existing stats if stats refresh fails independently of list load.
    }
  }, [accessToken, user?.role]);

  const loadUsers = useCallback(async (nextPage = 0, append = false) => {
    if (!accessToken || user?.role !== 'admin') return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const [res] = await Promise.all([
        fetchAdminUsers(accessToken, {
          page: nextPage,
          size: 20,
          q: appliedQuery,
          status: statusFilter,
          role: roleFilter,
          activity: activityFilter,
        }),
        append ? Promise.resolve() : loadStats(),
      ]);
      setUsers((prev) => (append ? [...prev, ...res.items] : res.items));
      setPage(res.page);
      setTotalPages(res.totalPages);
      setTotalElements(res.totalElements);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách tài khoản.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [accessToken, user?.role, appliedQuery, statusFilter, roleFilter, activityFilter, loadStats]);

  useEffect(() => {
    void loadUsers(0, false);
  }, [loadUsers]);

  const openDetail = async (userId: string) => {
    if (!accessToken) return;
    setDetailLoading(true);
    setReason('');
    try {
      const data = await fetchAdminUserDetail(userId, accessToken);
      setDetail(data);
    } catch (err) {
      Alert.alert('Không tải được chi tiết', err instanceof Error ? err.message : 'Vui lòng thử lại.');
    } finally {
      setDetailLoading(false);
    }
  };

  const applyUpdate = (updated: ApiAdminUserDetail) => {
    setDetail(updated);
    setUsers((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
    setReason('');
    void loadStats();
  };

  const confirmStatusChange = (target: ApiAdminUserDetail, nextStatus: 'active' | 'locked' | 'disabled', title: string, message: string) => {
    if (!accessToken) return;
    Alert.alert(title, message, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xác nhận',
        style: nextStatus === 'active' ? 'default' : 'destructive',
        onPress: async () => {
          setActionBusy(true);
          try {
            const updated = await updateAdminUserStatus(target.id, accessToken, {
              status: nextStatus,
              reason: reason.trim() || null,
            });
            applyUpdate(updated);
            Alert.alert('Đã cập nhật', `Trạng thái tài khoản đã chuyển sang "${STATUS_META[updated.status].label}".`);
          } catch (err) {
            Alert.alert('Không thể cập nhật', err instanceof Error ? err.message : 'Vui lòng thử lại.');
          } finally {
            setActionBusy(false);
          }
        },
      },
    ]);
  };

  const confirmRoleChange = (target: ApiAdminUserDetail, grantAdmin: boolean) => {
    if (!accessToken) return;
    Alert.alert(
      grantAdmin ? 'Cấp quyền Quản trị' : 'Thu hồi quyền Quản trị',
      grantAdmin
        ? `Cấp quyền Quản trị viên (admin) cho tài khoản ${target.email}?`
        : `Thu hồi quyền Quản trị viên của tài khoản ${target.email}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận',
          style: grantAdmin ? 'default' : 'destructive',
          onPress: async () => {
            setActionBusy(true);
            try {
              const updated = await updateAdminUserRole(target.id, accessToken, {
                admin: grantAdmin,
                reason: reason.trim() || null,
              });
              applyUpdate(updated);
              Alert.alert('Đã cập nhật quyền', grantAdmin ? 'Đã cấp quyền Quản trị viên.' : 'Đã thu hồi quyền Quản trị viên.');
            } catch (err) {
              Alert.alert('Không thể đổi vai trò', err instanceof Error ? err.message : 'Vui lòng thử lại.');
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  };

  const confirmModeratorChange = (target: ApiAdminUserDetail, grantModerator: boolean) => {
    if (!accessToken) return;
    Alert.alert(
      grantModerator ? 'Cấp quyền Kiểm duyệt viên' : 'Thu hồi quyền Kiểm duyệt viên',
      grantModerator
        ? `Cấp quyền Kiểm duyệt viên danh mục cây (moderator) cho tài khoản ${target.email}?`
        : `Thu hồi quyền Kiểm duyệt viên của tài khoản ${target.email}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận',
          style: grantModerator ? 'default' : 'destructive',
          onPress: async () => {
            setActionBusy(true);
            try {
              const updated = await updateAdminUserRole(target.id, accessToken, {
                moderator: grantModerator,
                reason: reason.trim() || null,
              });
              applyUpdate(updated);
              Alert.alert('Đã cập nhật quyền', grantModerator ? 'Đã cấp quyền Kiểm duyệt viên.' : 'Đã thu hồi quyền Kiểm duyệt viên.');
            } catch (err) {
              Alert.alert('Không thể đổi vai trò', err instanceof Error ? err.message : 'Vui lòng thử lại.');
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  };

  const confirmRevokeSessions = (target: ApiAdminUserDetail) => {
    if (!accessToken) return;
    Alert.alert(
      'Thu hồi phiên đăng nhập',
      `Đăng xuất khỏi toàn bộ ${target.activeSessionCount} phiên làm mới của tài khoản ${target.email}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Thu hồi',
          style: 'destructive',
          onPress: async () => {
            setActionBusy(true);
            try {
              const updated = await revokeAdminUserSessions(target.id, accessToken, reason.trim() || null);
              applyUpdate(updated);
              Alert.alert('Đã thu hồi', 'Toàn bộ refresh token đang hoạt động của tài khoản đã bị thu hồi.');
            } catch (err) {
              Alert.alert('Không thể thu hồi phiên', err instanceof Error ? err.message : 'Vui lòng thử lại.');
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  };

  const confirmResendVerification = (target: ApiAdminUserDetail) => {
    if (!accessToken) return;
    Alert.alert(
      'Gửi lại email xác minh',
      `Tạo liên kết xác minh mới và gửi tới ${target.email}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Gửi lại',
          onPress: async () => {
            setActionBusy(true);
            try {
              const res = await resendAdminUserVerification(target.id, accessToken, reason.trim() || null);
              applyUpdate(res.user);
              const extraToken = res.verificationToken ? `\n\nToken dev: ${res.verificationToken}` : '';
              Alert.alert('Đã gửi lại xác minh', `${res.message}${extraToken}`);
            } catch (err) {
              Alert.alert('Không thể gửi lại email', err instanceof Error ? err.message : 'Vui lòng thử lại.');
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  };

  if (user?.role !== 'admin') {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={() => safeBack('/account')} style={s.back}>
            <Text style={s.backText}>←</Text>
          </Pressable>
          <Text style={s.headerTitle}>Quản lý tài khoản</Text>
          <View style={s.headerSpacer} />
        </View>
        <View style={s.deniedWrap}>
          <Text style={s.deniedTitle}>Không có quyền truy cập</Text>
          <Text style={s.caption}>Chỉ tài khoản Quản trị viên mới được truy cập khu vực quản lý người dùng.</Text>
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
        <Text style={s.headerTitle}>Quản lý tài khoản</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Làm mới" onPress={() => void loadUsers(0, false)} style={s.refreshBtn}>
          <Text style={s.refreshText}>↻</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.banner}>
          <View style={s.bannerTopRow}>
            <Text style={s.bannerTitle}>Tài khoản hệ thống ({totalElements})</Text>
            <Pressable style={s.auditShortcutBtn} onPress={() => router.push('/admin/audit-logs' as never)}>
              <Text style={s.auditShortcutText}>Nhật ký kiểm toán ›</Text>
            </Pressable>
          </View>
          <Text style={s.caption}>Tìm kiếm, khóa/mở khóa, phân quyền quản trị và theo dõi lịch sử kiểm toán.</Text>
        </View>

        {stats ? (
          <View style={s.kpiSection}>
            <View style={s.kpiGrid}>
              <Pressable
                style={[s.kpiCard, statusFilter === '' && s.kpiCardActive]}
                onPress={() => setStatusFilter('')}
              >
                <Text style={s.kpiValue}>{stats.totalUsers}</Text>
                <Text style={s.kpiLabel}>Tổng tài khoản</Text>
              </Pressable>
              <Pressable
                style={[s.kpiCard, statusFilter === 'active' && s.kpiCardActive]}
                onPress={() => setStatusFilter((prev) => (prev === 'active' ? '' : 'active'))}
              >
                <Text style={[s.kpiValue, { color: C.forest }]}>{stats.activeUsers}</Text>
                <Text style={s.kpiLabel}>Đã kích hoạt</Text>
              </Pressable>
              <Pressable
                style={[s.kpiCard, statusFilter === 'pending_verification' && s.kpiCardActive]}
                onPress={() => setStatusFilter((prev) => (prev === 'pending_verification' ? '' : 'pending_verification'))}
              >
                <Text style={[s.kpiValue, { color: '#9A6B16' }]}>{stats.pendingUsers}</Text>
                <Text style={s.kpiLabel}>Chờ xác minh</Text>
              </Pressable>
              <Pressable
                style={[s.kpiCard, statusFilter === 'locked' && s.kpiCardActive]}
                onPress={() => setStatusFilter((prev) => (prev === 'locked' ? '' : 'locked'))}
              >
                <Text style={[s.kpiValue, { color: '#B42318' }]}>{stats.lockedOrDisabledUsers}</Text>
                <Text style={s.kpiLabel}>Bị khóa / Tắt</Text>
              </Pressable>
            </View>
            <Text style={s.kpiSubRow}>
              Admin: {stats.adminUsers} · Mới 7 ngày: {stats.newUsersLast7Days} · Hoạt động 7 ngày: {stats.recentActiveUsers7Days}
            </Text>
          </View>
        ) : null}

        <View style={s.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => setAppliedQuery(query.trim())}
            placeholder="Tìm theo tên hoặc email..."
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
          {STATUS_FILTERS.map((item) => (
            <Pressable
              key={item.key || 'all-status'}
              onPress={() => setStatusFilter(item.key)}
              style={[s.pill, statusFilter === item.key && s.pillActive]}>
              <Text style={[s.pillText, statusFilter === item.key && s.pillTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
          {ROLE_FILTERS.map((item) => (
            <Pressable
              key={item.key || 'all-role'}
              onPress={() => setRoleFilter(item.key)}
              style={[s.pill, roleFilter === item.key && s.pillActive]}>
              <Text style={[s.pillText, roleFilter === item.key && s.pillTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
          {ACTIVITY_FILTERS.map((item) => (
            <Pressable
              key={item.key || 'all-activity'}
              onPress={() => setActivityFilter(item.key)}
              style={[s.pill, activityFilter === item.key && s.pillActive]}>
              <Text style={[s.pillText, activityFilter === item.key && s.pillTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {error ? <Text style={s.errorText}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 18 }} /> : null}
        {detailLoading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 8 }} /> : null}

        {!loading && users.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.userTitle}>Không tìm thấy tài khoản phù hợp</Text>
            <Text style={s.caption}>Thử đổi từ khóa tìm kiếm hoặc bỏ bộ lọc trạng thái/vai trò.</Text>
          </View>
        ) : null}

        {(() => {
          const adminUsers = users.filter((item) => item.roles.includes('admin'));
          const memberUsers = users.filter((item) => !item.roles.includes('admin'));

          const renderUserCard = (item: ApiAdminUserSummary) => {
            const statusMeta = STATUS_META[item.status] ?? STATUS_META.active;
            const activityMeta = getActivityBadge(item);
            const isAdmin = item.roles.includes('admin');
            const isSelf = item.id === user.id;
            return (
              <Pressable key={item.id} onPress={() => void openDetail(item.id)} style={s.userCard}>
                <View style={s.userTop}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{item.displayName.trim().charAt(0).toUpperCase() || 'G'}</Text>
                  </View>
                  <View style={s.flex}>
                    <Text style={s.userTitle} numberOfLines={1}>
                      {item.displayName}{isSelf ? ' (Bạn)' : ''}
                    </Text>
                    <Text style={s.caption} numberOfLines={1}>{item.email}</Text>
                  </View>
                  <Text style={s.chevron}>›</Text>
                </View>
                <View style={s.badgeRow}>
                  <Text style={[s.badge, { backgroundColor: statusMeta.bg, color: statusMeta.fg }]}>
                    {statusMeta.label}
                  </Text>
                  <Text style={[s.badge, { backgroundColor: activityMeta.bg, color: activityMeta.fg }]}>
                    {activityMeta.label}
                  </Text>
                  <Text style={[s.badge, isAdmin ? s.adminBadge : s.memberBadge]}>
                    {isAdmin ? 'Quản trị viên' : 'Thành viên'}
                  </Text>
                  <Text style={s.metaText}>{item.gardenCount} vườn · {item.plantCount} cây</Text>
                </View>
              </Pressable>
            );
          };

          const renderSection = (
            title: string,
            items: ApiAdminUserSummary[],
            collapsed: boolean,
            onToggle: () => void,
            emptyText: string,
          ) => (
            <View style={s.groupBlock}>
              <View style={s.sectionHeaderBar}>
                <Text style={s.sectionHeaderTitle}>{title} ({items.length})</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={collapsed ? `Mở rộng ${title}` : `Thu gọn ${title}`}
                  onPress={onToggle}
                  style={s.collapseBtn}>
                  <Text style={s.collapseBtnText}>{collapsed ? 'Mở rộng ▼' : 'Thu gọn danh sách ▲'}</Text>
                </Pressable>
              </View>
              {!collapsed ? (
                items.length === 0 ? (
                  <Text style={s.sectionEmptyText}>{emptyText}</Text>
                ) : (
                  items.map(renderUserCard)
                )
              ) : null}
            </View>
          );

          if (users.length === 0) return null;
          return (
            <>
              {roleFilter !== 'user'
                ? renderSection(
                    'Tài khoản admin',
                    adminUsers,
                    adminsCollapsed,
                    () => setAdminsCollapsed((v) => !v),
                    'Không có tài khoản admin phù hợp.',
                  )
                : null}
              {roleFilter !== 'admin'
                ? renderSection(
                    'Tài khoản người dùng',
                    memberUsers,
                    membersCollapsed,
                    () => setMembersCollapsed((v) => !v),
                    'Không có tài khoản người dùng phù hợp.',
                  )
                : null}
            </>
          );
        })()}

        {page + 1 < totalPages ? (
          <Pressable
            disabled={loadingMore}
            onPress={() => void loadUsers(page + 1, true)}
            style={s.loadMoreBtn}>
            <Text style={s.loadMoreText}>{loadingMore ? 'Đang tải...' : 'Tải thêm tài khoản'}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal visible={Boolean(detail)} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            {detail ? (
              <>
                <View style={s.modalHeaderPinned}>
                  <Text style={s.modalTitle}>Chi tiết tài khoản</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Đóng chi tiết tài khoản" onPress={() => setDetail(null)} style={s.closeBtn}>
                    <Text style={s.closeText}>✕</Text>
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalContent}>

                <View style={s.detailCard}>
                  <Text style={s.userTitle}>{detail.displayName}{detail.id === user.id ? ' (Bạn)' : ''}</Text>
                  <Text style={s.caption}>{detail.email}</Text>
                  <View style={s.badgeRow}>
                    <Text style={[s.badge, { backgroundColor: STATUS_META[detail.status].bg, color: STATUS_META[detail.status].fg }]}>
                      {STATUS_META[detail.status].label}
                    </Text>
                    <Text style={[s.badge, { backgroundColor: getActivityBadge(detail).bg, color: getActivityBadge(detail).fg }]}>
                      {getActivityBadge(detail).label}
                    </Text>
                    <Text style={[s.badge, detail.roles.includes('admin') ? s.adminBadge : s.memberBadge]}>
                      {detail.roles.includes('admin') ? 'Quản trị viên' : 'Thành viên'}
                    </Text>
                  </View>
                  <Text style={s.metaLine}>Đăng nhập gần nhất: {detail.lastLoginAt ? formatDateTimeVi(detail.lastLoginAt) : 'Chưa từng đăng nhập'}</Text>
                  <Text style={s.metaLine}>Hoạt động gần nhất: {detail.lastActiveAt ? formatDateTimeVi(detail.lastActiveAt) : 'Chưa ghi nhận'}</Text>
                  <Text style={s.metaLine}>Xác minh email: {detail.emailVerifiedAt ? formatDateTimeVi(detail.emailVerifiedAt) : 'Chưa xác minh'}</Text>
                  <Text style={s.metaLine}>Múi giờ: {detail.timezone}</Text>
                  <Text style={s.metaLine}>Tài nguyên: {detail.gardenCount} khu vườn · {detail.plantCount} cây</Text>
                  <Text style={s.metaLine}>Phiên đăng nhập đang mở: {detail.activeSessionCount}</Text>
                  <Text style={s.metaLine}>Ngày tạo: {formatDateTimeVi(detail.createdAt)}</Text>
                </View>

                <Text style={s.sectionLabel}>Lý do thao tác (tùy chọn)</Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Nhập lý do khóa, kích hoạt hoặc đổi quyền..."
                  placeholderTextColor={C.mutedText}
                  style={s.reasonInput}
                  maxLength={500}
                />

                <Text style={s.sectionLabel}>Hành động quản trị</Text>
                <View style={s.actionsGrid}>
                  {detail.id !== user.id && detail.status === 'pending_verification' ? (
                    <>
                      <Pressable
                        disabled={actionBusy}
                        onPress={() => confirmResendVerification(detail)}
                        style={[s.actionBtn, s.softAction]}>
                        <Text style={s.softActionText}>✉ Gửi lại email xác minh</Text>
                      </Pressable>
                      <Pressable
                        disabled={actionBusy}
                        onPress={() => confirmStatusChange(detail, 'active', 'Kích hoạt tài khoản', `Xác nhận kích hoạt thủ công tài khoản ${detail.email}?`)}
                        style={[s.actionBtn, s.primaryAction]}>
                        <Text style={s.primaryActionText}>✓ Kích hoạt tài khoản</Text>
                      </Pressable>
                    </>
                  ) : null}

                  {detail.id !== user.id && detail.status === 'active' ? (
                    <>
                      <Pressable
                        disabled={actionBusy}
                        onPress={() => confirmStatusChange(detail, 'locked', 'Khóa tài khoản', `Khóa tài khoản ${detail.email} và thu hồi mọi phiên đăng nhập?`)}
                        style={[s.actionBtn, s.dangerAction]}>
                        <Text style={s.dangerActionText}>Khóa tài khoản</Text>
                      </Pressable>
                      <Pressable
                        disabled={actionBusy}
                        onPress={() => confirmStatusChange(detail, 'disabled', 'Vô hiệu hóa tài khoản', `Vô hiệu hóa tài khoản ${detail.email} và thu hồi mọi phiên đăng nhập?`)}
                        style={[s.actionBtn, s.softAction]}>
                        <Text style={s.softActionText}>Vô hiệu hóa</Text>
                      </Pressable>
                    </>
                  ) : null}

                  {detail.id !== user.id && (detail.status === 'locked' || detail.status === 'disabled') ? (
                    <Pressable
                      disabled={actionBusy}
                      onPress={() => confirmStatusChange(detail, 'active', 'Mở khóa tài khoản', `Mở lại trạng thái hoạt động cho ${detail.email}?`)}
                      style={[s.actionBtn, s.primaryAction]}>
                      <Text style={s.primaryActionText}>Mở khóa / Kích hoạt lại</Text>
                    </Pressable>
                  ) : null}

                  {!detail.roles.includes('admin') && detail.status === 'active' ? (
                    <Pressable
                      disabled={actionBusy}
                      onPress={() => confirmRoleChange(detail, true)}
                      style={[s.actionBtn, s.softAction]}>
                      <Text style={s.softActionText}>Cấp quyền Quản trị (Admin)</Text>
                    </Pressable>
                  ) : null}

                  {detail.id !== user.id && detail.roles.includes('admin') ? (
                    <Pressable
                      disabled={actionBusy}
                      onPress={() => confirmRoleChange(detail, false)}
                      style={[s.actionBtn, s.dangerAction]}>
                      <Text style={s.dangerActionText}>Thu hồi quyền Quản trị</Text>
                    </Pressable>
                  ) : null}

                  {!detail.roles.includes('moderator') && detail.status === 'active' ? (
                    <Pressable
                      disabled={actionBusy}
                      onPress={() => confirmModeratorChange(detail, true)}
                      style={[s.actionBtn, s.softAction]}>
                      <Text style={s.softActionText}>Cấp quyền Moderator</Text>
                    </Pressable>
                  ) : null}

                  {detail.roles.includes('moderator') ? (
                    <Pressable
                      disabled={actionBusy}
                      onPress={() => confirmModeratorChange(detail, false)}
                      style={[s.actionBtn, s.dangerAction]}>
                      <Text style={s.dangerActionText}>Thu hồi quyền Moderator</Text>
                    </Pressable>
                  ) : null}

                  {detail.activeSessionCount > 0 ? (
                    <Pressable
                      disabled={actionBusy}
                      onPress={() => confirmRevokeSessions(detail)}
                      style={[s.actionBtn, s.softAction]}>
                      <Text style={s.softActionText}>Thu hồi phiên đăng nhập ({detail.activeSessionCount})</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={() => {
                      const targetId = detail.id;
                      const targetName = detail.displayName;
                      setDetail(null);
                      router.push({ pathname: '/admin/auth-history', params: { userId: targetId, userName: targetName } } as never);
                    }}
                    style={[s.actionBtn, s.softAction]}>
                    <Text style={s.softActionText}>Xem lịch sử phiên ›</Text>
                  </Pressable>
                </View>

                <Text style={s.sectionLabel}>Nhật ký kiểm toán gần đây ({detail.recentAuditLogs.length})</Text>
                {detail.recentAuditLogs.length === 0 ? (
                  <Text style={s.caption}>Chưa có thao tác quản trị nào được ghi nhận cho tài khoản này.</Text>
                ) : (
                  detail.recentAuditLogs.map((log) => (
                    <View key={log.id} style={s.auditRow}>
                      <Text style={s.auditAction}>{ACTION_LABELS[log.action] ?? log.action}</Text>
                      <Text style={s.metaLine}>
                        Bởi: {log.actorDisplayName || log.actorEmail || 'Hệ thống'} · {formatDateTimeVi(log.createdAt)}
                      </Text>
                      {log.previousValue || log.newValue ? (
                        <Text style={s.metaLine}>
                          Thay đổi: {log.previousValue ?? '—'} → {log.newValue ?? '—'}
                        </Text>
                      ) : null}
                      {log.reason ? <Text style={s.auditReason}>Lý do: {log.reason}</Text> : null}
                    </View>
                  ))
                )}
              </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  backText: { color: C.surface, fontSize: 22, lineHeight: 26 },
  headerTitle: { flex: 1, color: C.forest, fontFamily: F.semiBold, fontSize: 17 },
  headerSpacer: { width: 34 },
  refreshBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: C.forest, fontSize: 18, fontFamily: F.bold },
  deniedWrap: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', gap: 8 },
  deniedTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 17 },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },
  banner: { padding: 15, borderRadius: 14, backgroundColor: '#E5F1E8', gap: 4 },
  bannerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  bannerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 16, flex: 1 },
  auditShortcutBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: '#DCE8DF' },
  auditShortcutText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  kpiSection: { gap: 6 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiCard: { flexGrow: 1, flexBasis: '47%', backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: '#DCE8DF', paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  kpiCardActive: { borderColor: C.forest, backgroundColor: '#F1F8F3' },
  kpiValue: { color: C.text, fontFamily: F.semiBold, fontSize: 18 },
  kpiLabel: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 12 },
  kpiSubRow: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, paddingHorizontal: 2 },
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
  groupBlock: { gap: 8, marginTop: 4 },
  sectionHeaderBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  sectionHeaderTitle: { color: C.forest, fontFamily: F.bold, fontSize: 14 },
  collapseBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: C.softSurface },
  collapseBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  sectionEmptyText: { color: C.mutedText, fontFamily: F.regular, fontSize: 12, paddingVertical: 6 },
  userCard: { padding: 13, borderRadius: 14, backgroundColor: C.surface, gap: 9 },
  userTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#DDECE1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.primary, fontFamily: F.bold, fontSize: 17 },
  flex: { flex: 1, gap: 2 },
  userTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  chevron: { color: '#A5B3A9', fontSize: 22 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  badge: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, fontFamily: F.semiBold, fontSize: 10 },
  adminBadge: { backgroundColor: '#E0E7FF', color: '#3730A3' },
  memberBadge: { backgroundColor: C.softSurface, color: C.secondaryText },
  metaText: { color: C.mutedText, fontFamily: F.regular, fontSize: 11, marginLeft: 'auto' },
  loadMoreBtn: { minHeight: 44, borderRadius: 10, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  loadMoreText: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 25, 20, 0.45)', justifyContent: 'flex-end' },
  modalSheet: { maxHeight: '88%', backgroundColor: C.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  modalContent: { gap: 10, paddingBottom: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalHeaderPinned: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDE7DF', marginBottom: 4 },
  modalTitle: { color: C.forest, fontFamily: F.bold, fontSize: 17 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: C.forest, fontFamily: F.bold, fontSize: 14 },
  detailCard: { padding: 13, borderRadius: 14, backgroundColor: C.surface, gap: 6 },
  metaLine: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  sectionLabel: { marginTop: 4, color: C.text, fontFamily: F.semiBold, fontSize: 13 },
  reasonInput: { minHeight: 42, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.surface, color: C.text, fontFamily: F.regular, fontSize: 12 },
  actionsGrid: { gap: 8 },
  actionBtn: { minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryAction: { backgroundColor: C.primary },
  primaryActionText: { color: C.surface, fontFamily: F.semiBold, fontSize: 13 },
  softAction: { backgroundColor: '#E7F0E9' },
  softActionText: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  dangerAction: { backgroundColor: '#FBDCD7' },
  dangerActionText: { color: '#B42318', fontFamily: F.semiBold, fontSize: 13 },
  auditRow: { padding: 10, borderRadius: 10, backgroundColor: C.surface, gap: 3 },
  auditAction: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  auditReason: { color: C.text, fontFamily: F.regular, fontSize: 11, fontStyle: 'italic' },
});
