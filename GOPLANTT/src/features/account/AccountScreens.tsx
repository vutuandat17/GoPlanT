import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from '@/components/app-primitives';
import { router } from 'expo-router';
import { SafeAreaView } from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { BackButton } from '@/components/BackButton';
import { useAuthSession } from '@/features/auth/AuthSession';
import { useAppPreferences } from '@/features/preferences/AppPreferences';
import { ensureCareNotificationPermissions } from '@/features/schedule/localNotifications';
import { useCareSchedules } from '@/features/schedule/CareScheduleStore';
import { changePassword, fetchMyAuthEvents, forgotPassword, type ApiAuthEvent } from '@/services/api';
import { AUTH_EVENT_META, formatAuthEventTime } from '@/features/account/AdminAuthHistoryScreen';
import { safeBack } from '@/services/navigation';

type AccountPage = 'overview' | 'profile' | 'credentials' | 'security' | 'notifications' | 'settings' | 'privacy';
const paths: Record<Exclude<AccountPage, 'overview'>, string> = {
  profile: '/account/profile', credentials: '/account/credentials', security: '/account/security',
  notifications: '/account/notifications', settings: '/account/settings', privacy: '/account/privacy',
};
const titles: Record<AccountPage, string> = {
  overview: 'Quản lý tài khoản', profile: 'Thông tin cá nhân', credentials: 'Thông tin đăng nhập',
  security: 'Bảo mật tài khoản', notifications: 'Quản lý thông báo', settings: 'Cài đặt ứng dụng', privacy: 'Quyền riêng tư & dữ liệu',
};
const menu: { page: Exclude<AccountPage, 'overview'>; icon: string; title: string; caption: string }[] = [
  { page: 'profile', icon: '♙', title: 'Thông tin cá nhân', caption: 'Ảnh đại diện, họ tên và thông tin hồ sơ' },
  { page: 'credentials', icon: '⚿', title: 'Quản lý thông tin đăng nhập', caption: 'Email, tên đăng nhập và mật khẩu' },
  { page: 'security', icon: '⬡', title: 'Bảo mật tài khoản', caption: 'Xác minh và phiên đăng nhập' },
  { page: 'notifications', icon: '♧', title: 'Quản lý thông báo', caption: 'Nhắc lịch chăm sóc và thông báo ứng dụng' },
  { page: 'settings', icon: '⚙', title: 'Cài đặt ứng dụng', caption: 'Ngôn ngữ, giao diện và tùy chọn' },
  { page: 'privacy', icon: '▣', title: 'Quyền riêng tư & dữ liệu', caption: 'Chính sách và quản lý dữ liệu' },
];

function Page({ page, children }: { page: AccountPage; children: ReactNode }) {
  return <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
    <View style={s.header}>
      <BackButton onPress={() => safeBack('/home')} />
      <Text numberOfLines={1} style={s.headerTitle}>{titles[page]}</Text>
      <View style={s.headerRight}><Text style={s.userMark}>♙</Text></View>
    </View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </SafeAreaView>;
}
function Card({ children, style }: { children: ReactNode; style?: object }) { return <View style={[s.card, style]}>{children}</View>; }
function Label({ children }: { children: ReactNode }) { return <Text style={s.label}>{children}</Text>; }
function Field({ label, value, onChangeText, placeholder, secureTextEntry = false }: { label: string; value: string; onChangeText?: (value: string) => void; placeholder?: string; secureTextEntry?: boolean }) {
  return <View style={s.field}><Label>{label}</Label><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.mutedText} secureTextEntry={secureTextEntry} editable={Boolean(onChangeText)} style={[s.input, !onChangeText && s.readOnly]} /></View>;
}
function ActionButton({ label, onPress, tone = 'primary', disabled = false }: { label: string; onPress: () => void; tone?: 'primary' | 'soft' | 'danger'; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.button, tone === 'soft' && s.buttonSoft, tone === 'danger' && s.buttonDanger, disabled && s.buttonDisabled]}><Text style={[s.buttonText, tone === 'soft' && s.buttonSoftText, tone === 'danger' && s.buttonDangerText]}>{label}</Text></Pressable>;
}
function unavailable(feature: string) { Alert.alert('Chưa có dịch vụ', `${feature} hiện chỉ là giao diện tham khảo. Tác vụ cần backend hoặc API hệ thống chưa được kết nối.`); }
function Row({ icon, title, caption, onPress }: { icon: string; title: string; caption: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.menuRow}><View style={s.menuIcon}><Text style={s.menuIconText}>{icon}</Text></View><View style={s.flex}><Text style={s.menuTitle}>{title}</Text><Text numberOfLines={2} style={s.caption}>{caption}</Text></View><Text style={s.chevron}>›</Text></Pressable>;
}
function SectionHeading({ children, detail }: { children: ReactNode; detail?: string }) { return <View style={s.sectionHeading}><Text style={s.sectionTitle}>{children}</Text>{detail ? <Text style={s.caption}>{detail}</Text> : null}</View>; }
function ToggleRow({ title, description, value, onValueChange }: { title: string; description: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return <View style={s.toggleRow}><View style={s.flex}><Text style={s.menuTitle}>{title}</Text><Text style={s.caption}>{description}</Text></View><Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#D8E2DA', true: C.primary }} thumbColor={C.surface} />
  </View>;
}

export function AccountOverviewScreen() {
  const { user, signOut } = useAuthSession();
  const logOut = () => Alert.alert('Đăng xuất', 'Bạn muốn kết thúc phiên đăng nhập hiện tại?', [{ text: 'Hủy', style: 'cancel' }, { text: 'Đăng xuất', style: 'destructive', onPress: () => { signOut(); router.replace('/auth/login'); } }]);
  return <Page page="overview">
    <Card style={s.identity}><View style={s.avatar}><Text style={s.avatarText}>{user?.name.trim().charAt(0).toUpperCase() || 'G'}</Text></View><View style={s.flex}><Text style={s.identityName}>{user?.name ?? 'Khách GoPlant'}</Text><Text style={s.caption}>{user?.email ?? 'Chưa đăng nhập'}</Text><Text style={s.roleBadge}>{user?.role === 'admin' ? 'Quản trị viên' : user?.role === 'moderator' ? 'Kiểm duyệt viên' : 'Thành viên'}</Text></View></Card>
    <SectionHeading detail="6 mục quản lý">Trung tâm cài đặt</SectionHeading>
    {user?.role === 'admin' || user?.role === 'moderator' ? <Row icon="♧" title="Quản lý danh mục cây" caption="Thêm và xuất bản cây mới cho mọi người dùng" onPress={() => router.push('/admin/catalog' as never)} /> : null}
    {user?.role === 'admin' ? <Row icon="♙" title="Quản lý tài khoản người dùng" caption="Xem danh sách, khóa/mở khóa và phân quyền quản trị" onPress={() => router.push('/admin/users' as never)} /> : null}
    {user?.role === 'admin' ? <Row icon="◷" title="Lịch sử đăng nhập & đăng xuất" caption="Theo dõi các lần vào/ra hệ thống của người dùng" onPress={() => router.push('/admin/auth-history' as never)} /> : null}
    {user?.role === 'admin' ? <Row icon="▤" title="Nhật ký kiểm toán quản trị" caption="Xem toàn bộ lịch sử khóa, mở khóa và đổi quyền" onPress={() => router.push('/admin/audit-logs' as never)} /> : null}
    {menu.map((item) => <Row key={item.page} icon={item.icon} title={item.title} caption={item.caption} onPress={() => router.push(paths[item.page] as never)} />)}
    <Card style={s.infoCard}><Text style={s.menuTitle}>GoPlant</Text><Text style={s.caption}>Quản lý tài khoản và thông tin khu vườn của bạn.</Text></Card>
    <ActionButton label="⇥  Đăng xuất tài khoản" tone="danger" onPress={logOut} />
  </Page>;
}

export function AccountProfileScreen() {
  const { user, updateDisplayName } = useAuthSession();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setName(user?.name ?? ''); }, [user?.name]);
  const save = async () => {
    const displayName = name.trim();
    if (!displayName || displayName.length > 120) {
      setError('Tên hiển thị cần có từ 1 đến 120 ký tự.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateDisplayName(displayName);
      Alert.alert('Đã lưu hồ sơ', 'Tên hiển thị đã được cập nhật.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Không thể lưu hồ sơ. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };
  return <Page page="profile">
    <Card style={s.profileHero}><View style={s.avatarLarge}><Text style={s.avatarText}>{name.trim().charAt(0).toUpperCase() || 'G'}</Text></View><Text style={s.identityName}>{name || 'Tên hiển thị'}</Text><Text style={s.caption}>Hồ sơ tài khoản</Text></Card>
    <Card><Field label="Họ và tên" value={name} onChangeText={setName} placeholder="Nhập họ và tên"/><Field label="Tên tài khoản" value={user?.email.split('@')[0] ?? ''}/><Field label="Hộp thư điện tử" value={user?.email ?? ''}/></Card>
    {error ? <Text style={s.error}>{error}</Text> : null}
    <ActionButton label={saving ? 'Đang lưu…' : '✓  Lưu thay đổi'} disabled={saving} onPress={() => void save()}/><ActionButton label="Hủy bỏ" tone="soft" disabled={saving} onPress={() => safeBack('/account')}/>
  </Page>;
}

export function AccountCredentialsScreen() {
  const { user, accessToken, signOut } = useAuthSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const handleChangePassword = async () => {
    setPwError('');
    if (!accessToken) {
      setPwError('Vui lòng đăng nhập lại để đổi mật khẩu.');
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError('Vui lòng điền đầy đủ mật khẩu hiện tại, mật khẩu mới và xác nhận.');
      return;
    }
    if (newPassword.length < 12 || newPassword.length > 72) {
      setPwError('Mật khẩu mới cần có từ 12 đến 72 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Mật khẩu mới và xác nhận chưa khớp.');
      return;
    }
    setSavingPw(true);
    try {
      await changePassword(accessToken, { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert(
        'Đổi mật khẩu thành công',
        'Mật khẩu đã được cập nhật và các phiên đăng nhập cũ đã được thu hồi. Vui lòng đăng nhập lại bằng mật khẩu mới.',
        [{ text: 'Đăng nhập lại', onPress: () => { void signOut().then(() => router.replace('/auth/login')); } }],
      );
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Không thể đổi mật khẩu.');
    } finally {
      setSavingPw(false);
    }
  };

  const handleSendResetLink = async () => {
    if (!user?.email) {
      Alert.alert('Thiếu email', 'Không tìm thấy email của tài khoản.');
      return;
    }
    setSendingReset(true);
    try {
      const res = await forgotPassword(user.email);
      Alert.alert('Đã gửi yêu cầu', res.resetToken ? `${res.message}\n\nMã đặt lại: ${res.resetToken}` : res.message);
    } catch (err) {
      Alert.alert('Không thể gửi', err instanceof Error ? err.message : 'Vui lòng thử lại sau.');
    } finally {
      setSendingReset(false);
    }
  };

  return <Page page="credentials">
    <Card style={s.banner}><Text style={s.bannerTitle}>Bảo mật khu vườn</Text><Text style={s.caption}>Thông tin đăng nhập của tài khoản GoPlant.</Text></Card>
    <Card><Label>Email đăng nhập</Label><Text style={s.value}>{user?.email ?? 'Chưa có email'}</Text><ActionButton label="Cập nhật email và xác minh" tone="soft" onPress={() => unavailable('Cập nhật và xác minh email')}/></Card>
    <Card><Field label="Tên đăng nhập" value={user?.email.split('@')[0] ?? '—'}/><Text style={s.caption}>Tên đăng nhập hiển thị dựa trên email tài khoản.</Text></Card>
    <Card>
      <SectionHeading>Thay đổi mật khẩu</SectionHeading>
      <Field label="Mật khẩu hiện tại" value={currentPassword} onChangeText={(v) => { setCurrentPassword(v); setPwError(''); }} placeholder="Nhập mật khẩu hiện tại" secureTextEntry/>
      <Field label="Mật khẩu mới" value={newPassword} onChangeText={(v) => { setNewPassword(v); setPwError(''); }} placeholder="Tối thiểu 12 ký tự" secureTextEntry/>
      <Field label="Xác nhận mật khẩu mới" value={confirmPassword} onChangeText={(v) => { setConfirmPassword(v); setPwError(''); }} placeholder="Nhập lại mật khẩu mới" secureTextEntry/>
      {pwError ? <Text style={s.error}>{pwError}</Text> : null}
      <ActionButton label={savingPw ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'} disabled={savingPw} onPress={() => void handleChangePassword()}/>
    </Card>
    <Card style={s.infoCard}>
      <Text style={s.menuTitle}>Khôi phục mật khẩu</Text>
      <Text style={s.caption}>Gửi liên kết đặt lại mật khẩu về email đăng nhập hiện tại của bạn.</Text>
      <ActionButton label={sendingReset ? 'Đang gửi…' : 'Gửi liên kết đặt lại mật khẩu'} tone="soft" disabled={sendingReset} onPress={() => void handleSendResetLink()}/>
    </Card>
    <Card><SectionHeading>Phương thức đăng nhập</SectionHeading><Text style={s.caption}>Email và mật khẩu</Text><Text style={s.caption}>Google Account và Apple ID chưa được bật.</Text></Card>
  </Page>;
}

export function AccountSecurityScreen() {
  return <Page page="security">
    <Card style={s.banner}><Text style={s.bannerTitle}>Bảo mật tài khoản</Text><Text style={s.caption}>Phiên đăng nhập được bảo vệ bằng mã truy cập tài khoản.</Text></Card>
    <Card><SectionHeading>Mật khẩu tài khoản</SectionHeading><Text style={s.caption}>Để thay đổi mật khẩu, vui lòng sử dụng mục Quản lý thông tin đăng nhập.</Text></Card>
    <Card><SectionHeading>Xác thực email</SectionHeading><Text style={s.value}>Trạng thái được quản lý bởi máy chủ</Text><Text style={s.caption}>Đăng nhập chỉ khả dụng sau khi xác minh email.</Text></Card>
    <Card><SectionHeading>Xác thực số điện thoại</SectionHeading><Text style={s.value}>Chưa liên kết</Text><Text style={s.caption}>OTP chưa được hỗ trợ.</Text></Card>
    <Card>
      <SectionHeading>Lịch sử đăng nhập & phiên</SectionHeading>
      <Text style={s.caption}>Xem chi tiết các lần đăng nhập, đăng xuất, đổi mật khẩu và thiết bị đã truy cập tài khoản của bạn.</Text>
      <ActionButton label="Xem lịch sử phiên ›" tone="soft" onPress={() => router.push('/account/auth-history' as never)} />
    </Card>
    <Card style={s.warning}><Text style={s.menuTitle}>Phiên đăng nhập hiện tại</Text><Text style={s.caption}>Bạn có thể kết thúc phiên từ trang tổng quan tài khoản.</Text><ActionButton label="Đăng xuất" tone="soft" onPress={() => router.replace('/account' as never)}/></Card>
  </Page>;
}

export function AccountAuthHistoryScreen() {
  const { accessToken } = useAuthSession();
  const [events, setEvents] = useState<ApiAuthEvent[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = (nextPage = 0, append = false) => {
    if (!accessToken) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    void fetchMyAuthEvents(accessToken, { page: nextPage, size: 20 })
      .then((res) => {
        setEvents((prev) => (append ? [...prev, ...res.items] : res.items));
        setPage(res.page);
        setTotalPages(res.totalPages);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  };

  useEffect(() => {
    load(0, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <BackButton onPress={() => safeBack('/account/security')} />
        <Text numberOfLines={1} style={s.headerTitle}>Lịch sử phiên đăng nhập</Text>
        <View style={s.headerRight}><Text style={s.userMark}>◷</Text></View>
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Card style={s.banner}>
          <Text style={s.bannerTitle}>Hoạt động đăng nhập & đăng xuất</Text>
          <Text style={s.caption}>Theo dõi các lần vào/ra hệ thống và thiết bị đã sử dụng tài khoản của bạn.</Text>
        </Card>
        {loading ? <Text style={s.caption}>Đang tải lịch sử phiên…</Text> : null}
        {!loading && events.length === 0 ? (
          <Card><Text style={s.caption}>Chưa có lịch sử đăng nhập/đăng xuất nào được ghi nhận.</Text></Card>
        ) : null}
        {events.map((ev) => {
          const meta = AUTH_EVENT_META[ev.eventType] ?? AUTH_EVENT_META.LOGIN_SUCCESS;
          return (
            <Card key={ev.id} style={s.authHistoryCard}>
              <View style={s.authEventTop}>
                <Text style={[s.authEventBadge, { backgroundColor: meta.bg, color: meta.fg }]}>{meta.label}</Text>
                <Text style={s.caption}>{formatAuthEventTime(ev.createdAt)}</Text>
              </View>
              <Text style={s.menuTitle}>{ev.deviceLabel || ev.platform || 'Thiết bị'}</Text>
              {ev.ipAddress ? <Text style={s.caption}>Địa chỉ IP: {ev.ipAddress}</Text> : null}
              {ev.detail ? <Text style={s.caption}>{ev.detail}</Text> : null}
            </Card>
          );
        })}
        {page + 1 < totalPages ? (
          <ActionButton label={loadingMore ? 'Đang tải…' : 'Tải thêm lịch sử'} tone="soft" disabled={loadingMore} onPress={() => load(page + 1, true)} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export function AccountNotificationsScreen() {
  const { careNotificationsEnabled, setCareNotificationsEnabled } = useAppPreferences();
  const { refresh } = useCareSchedules();
  const [plantAlerts, setPlantAlerts] = useState(true);
  const [updates, setUpdates] = useState(true);

  const handleToggleCare = async (next: boolean) => {
    if (next) {
      const granted = await ensureCareNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Chưa có quyền thông báo',
          'Hãy cấp quyền thông báo cho GoPlant trong phần Cài đặt của thiết bị (Android/iOS) để nhận nhắc lịch chăm sóc.',
        );
      }
    }
    setCareNotificationsEnabled(next);
  };

  return <Page page="notifications">
    <Card style={s.banner}><Text style={s.bannerTitle}>Tùy chỉnh thông báo</Text><Text style={s.caption}>Nhắc nhở cục bộ trên thiết bị được đồng bộ tự động cho các công việc trong 7 ngày tới.</Text></Card>
    <Card><ToggleRow title="Nhắc lịch chăm sóc" description="Tưới nước, bón phân và công việc đã tạo trong ứng dụng." value={careNotificationsEnabled} onValueChange={(v) => void handleToggleCare(v)}/><View style={s.divider}/><Text style={s.caption}>Khung giờ nhắc tuân theo giờ bạn đã chọn trên từng lịch chăm sóc.</Text></Card>
    <Card><ToggleRow title="Cảnh báo tình trạng cây" description="Thông báo khi có dữ liệu theo dõi cần chú ý." value={plantAlerts} onValueChange={setPlantAlerts}/><View style={s.divider}/><Text style={s.caption}>Cảnh báo nhiệt độ và sức khỏe được hiển thị trong tab Theo dõi & Chi tiết vườn.</Text></Card>
    <Card><ToggleRow title="Thông báo cập nhật ứng dụng" description="Thông tin về phiên bản và nội dung mới." value={updates} onValueChange={setUpdates}/></Card>
    <Card style={s.infoCard}><Text style={s.caption}>Quyền thông báo của Android được quản lý trong phần Cài đặt hệ thống.</Text></Card>
    <ActionButton label="Đồng bộ & Lưu cài đặt" onPress={() => { void refresh(); Alert.alert('Đã lưu cài đặt', careNotificationsEnabled ? 'Đã bật và đồng bộ nhắc lịch chăm sóc trên thiết bị này.' : 'Đã tắt nhắc lịch chăm sóc trên thiết bị này.'); }}/>
  </Page>;
}

export function AccountSettingsScreen() {
  const { language, setLanguage, theme, setTheme } = useAppPreferences();
  const [unit, setUnit] = useState('°C'); const [cloudSync, setCloudSync] = useState(false);
  const languageOptions = language === 'en' ? ['Vietnamese', 'English'] : ['Tiếng Việt', 'English'];
  const selectedLanguage = language === 'en' ? 'English' : 'Tiếng Việt';
  const themeOptions = language === 'en' ? ['Light', 'Dark', 'System'] : ['Sáng', 'Tối', 'Hệ thống'];
  const selectedTheme = theme === 'light' ? themeOptions[0] : theme === 'dark' ? themeOptions[1] : themeOptions[2];
  return <Page page="settings">
    <Card style={s.banner}><Text style={s.bannerTitle}>Cá nhân hóa</Text><Text style={s.caption}>Một số tùy chọn minh họa cho giao diện GoPlant.</Text></Card>
    <SectionHeading>Ngôn ngữ ứng dụng</SectionHeading><ChoiceCard values={languageOptions} selected={selectedLanguage} onSelect={(value) => setLanguage(value === 'English' ? 'en' : 'vi')}/>
    <SectionHeading>Chế độ giao diện</SectionHeading><ChoiceCard values={themeOptions} selected={selectedTheme} onSelect={(value) => { const index = themeOptions.indexOf(value); setTheme(index === 0 ? 'light' : index === 1 ? 'dark' : 'system'); }}/>
    <SectionHeading>Tiện ích chăm sóc</SectionHeading><Card><ChoiceRow title="Đơn vị nhiệt độ" values={['°C', '°F']} selected={unit} onSelect={setUnit}/><ToggleRow title="Đồng bộ đám mây" description="Chưa có dịch vụ đồng bộ được kết nối." value={cloudSync} onValueChange={setCloudSync}/></Card>
    <Card style={s.infoCard}><Text style={s.caption}>Tùy chọn ngôn ngữ và giao diện được áp dụng ngay trên toàn ứng dụng.</Text></Card>
    <Text style={s.caption}>{language === 'en' ? 'Your language and appearance preferences are saved automatically.' : 'Tùy chọn ngôn ngữ và giao diện được lưu tự động.'}</Text>
  </Page>;
}
function ChoiceCard({ values, selected, onSelect }: { values: string[]; selected: string; onSelect: (value: string) => void }) {
  return <Card><View style={s.choiceRow}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={[s.choice, selected === value && s.choiceSelected]}><Text style={[s.choiceText, selected === value && s.choiceTextSelected]}>{value}</Text></Pressable>)}</View></Card>;
}
function ChoiceRow({ title, values, selected, onSelect }: { title: string; values: string[]; selected: string; onSelect: (value: string) => void }) {
  return <View style={s.toggleRow}><Text style={s.menuTitle}>{title}</Text><View style={s.inlineChoices}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={[s.unitChoice, value === selected && s.choiceSelected]}><Text style={[s.choiceText, value === selected && s.choiceTextSelected]}>{value}</Text></Pressable>)}</View></View>;
}

export function AccountPrivacyScreen() {
  return <Page page="privacy">
    <Card style={s.banner}><Text style={s.bannerTitle}>Quyền riêng tư và dữ liệu</Text><Text style={s.caption}>Thông tin tài khoản và dữ liệu vườn được lưu trên máy chủ GoPlant.</Text></Card>
    <Card><SectionHeading>Chính sách quyền riêng tư</SectionHeading><Text style={s.caption}>Chưa có địa chỉ chính sách chính thức trong cấu hình ứng dụng.</Text><ActionButton label="Xem chính sách" tone="soft" onPress={() => unavailable('Mở chính sách quyền riêng tư')}/></Card>
    <Card><SectionHeading>Điều khoản sử dụng</SectionHeading><Text style={s.caption}>Tài liệu điều khoản chưa được cung cấp trong ứng dụng.</Text><ActionButton label="Đọc điều khoản dịch vụ" tone="soft" onPress={() => unavailable('Mở điều khoản dịch vụ')}/></Card>
    <SectionHeading>Quản lý dữ liệu tài khoản</SectionHeading>
    <Card><Text style={s.menuTitle}>Xuất dữ liệu nhật ký và ảnh vườn</Text><Text style={s.caption}>Chưa có dịch vụ xuất dữ liệu.</Text><ActionButton label="Tải tệp ZIP" tone="soft" onPress={() => unavailable('Xuất dữ liệu ZIP')}/><ActionButton label="Bản PDF" tone="soft" onPress={() => unavailable('Xuất dữ liệu PDF')}/></Card>
    <Card><Text style={s.menuTitle}>Xóa lịch sử tìm kiếm và gợi ý</Text><Text style={s.caption}>Ứng dụng chưa có lịch sử tìm kiếm được lưu trữ.</Text><ActionButton label="Xóa lịch sử & gợi ý" tone="soft" onPress={() => unavailable('Xóa lịch sử tìm kiếm')}/></Card>
    <Card style={s.warning}><Text style={s.dangerTitle}>Vùng nguy hiểm</Text><Text style={s.menuTitle}>Yêu cầu xóa tài khoản</Text><Text style={s.caption}>Liên hệ bộ phận hỗ trợ để yêu cầu xóa tài khoản.</Text></Card>
  </Page>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background }, header: { minHeight: 56, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, headerGlyph: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, headerGlyphText: { color: C.surface, fontSize: 20 }, headerTitle: { flex: 1, color: C.forest, fontFamily: F.semiBold, fontSize: 17 }, headerRight: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.forest, alignItems: 'center', justifyContent: 'center' }, userMark: { color: C.surface, fontSize: 17 }, headerSpacer: { width: 8 }, content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28, gap: 12 }, card: { padding: 14, borderRadius: 15, backgroundColor: C.surface, gap: 11 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, backgroundColor: C.surface }, avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#DDECE1', alignItems: 'center', justifyContent: 'center' }, avatarLarge: { width: 90, height: 90, borderRadius: 45, marginBottom: 8, backgroundColor: '#DDECE1', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: C.primary, fontFamily: F.bold, fontSize: 29 }, flex: { flex: 1, gap: 3 }, identityName: { color: C.forest, fontFamily: F.semiBold, fontSize: 18 }, caption: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 }, roleBadge: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, backgroundColor: '#E4F1E8', color: C.primary, fontFamily: F.semiBold, fontSize: 10 }, sectionHeading: { gap: 2, paddingTop: 4 }, sectionTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 17 }, menuRow: { minHeight: 74, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 15, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 12 }, menuIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: '#E7F0E9', alignItems: 'center', justifyContent: 'center' }, menuIconText: { color: C.forest, fontSize: 22 }, menuTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 15 }, chevron: { color: '#A5B3A9', fontSize: 25 }, infoCard: { backgroundColor: C.softSurface }, banner: { backgroundColor: '#E5F1E8', padding: 17 }, bannerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 18 }, profileHero: { alignItems: 'center', paddingVertical: 20 }, field: { gap: 6 }, label: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 12 }, input: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.softSurface, color: C.text, fontFamily: F.regular, fontSize: 14 }, readOnly: { color: C.secondaryText }, error: { color: '#B42318', fontFamily: F.regular, fontSize: 12 }, value: { color: C.forest, fontFamily: F.semiBold, fontSize: 15 }, button: { minHeight: 46, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, buttonDisabled: { opacity: 0.55 }, buttonText: { color: C.surface, fontFamily: F.semiBold, fontSize: 14 }, buttonSoft: { backgroundColor: '#E7F0E9' }, buttonSoftText: { color: C.forest }, buttonDanger: { backgroundColor: '#D92D20' }, buttonDangerText: { color: C.surface, fontFamily: F.bold }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { flexGrow: 1, minHeight: 38, paddingHorizontal: 11, borderRadius: 9, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' }, choiceSelected: { backgroundColor: C.primary }, choiceText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12 }, choiceTextSelected: { color: C.surface, fontFamily: F.semiBold }, toggleRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#DDE7DF' }, warning: { backgroundColor: '#FBEEEA' }, dangerTitle: { color: '#B42318', fontFamily: F.bold, fontSize: 17 }, inlineChoices: { flexDirection: 'row', gap: 5 }, unitChoice: { minWidth: 40, minHeight: 34, paddingHorizontal: 8, borderRadius: 8, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  authEventRow: { paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDE7DF', gap: 4 },
  authEventTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  authEventBadge: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, fontFamily: F.semiBold, fontSize: 10 },
  authHistoryCard: { gap: 5 },
});
