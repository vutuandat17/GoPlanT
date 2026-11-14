import { useState, useCallback } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { SafeAreaView } from '@/components/app-primitives';
import { router } from 'expo-router';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { AccountButton } from '@/features/auth/AccountButton';
import { usePlantData } from '@/features/plants/PlantDataStore';

// ─── Types ───────────────────────────────────────────────────────────────────

type RepeatMode = 'Mỗi ngày' | 'Cách ngày' | 'Hàng tuần' | 'Tùy chỉnh';
type TaskType = 'Tưới nước' | 'Bón phân' | 'Cắt tỉa' | 'Kiểm tra sâu bệnh' | 'Phun sương' | 'Ghi nhận phát triển';
type FilterTab = 'Tất cả' | 'Tưới nước' | 'Bón phân' | 'Cắt tỉa';

export interface ScheduleEntry {
  id: string;
  plantId: string;
  plantName: string;
  plantCategory: string;
  task: TaskType;
  repeat: RepeatMode;
  startDate: string;
  time: string;
  active: boolean;
}

// In-memory store – shared across screens in the same app session
let globalSchedules: ScheduleEntry[] = [];
let listeners: Array<() => void> = [];

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function addSchedule(entry: Omit<ScheduleEntry, 'id'>) {
  globalSchedules = [{ ...entry, id: Date.now().toString() }, ...globalSchedules];
  notifyListeners();
}

function useSchedules(): [ScheduleEntry[], () => void] {
  const [, forceUpdate] = useState(0);
  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);
  if (!listeners.includes(refresh)) listeners = [...listeners, refresh];
  return [globalSchedules, refresh];
}

// ─── Shared Components ────────────────────────────────────────────────────────

function Header({ title, showCreate }: { title: string; showCreate?: boolean }) {
  return (
    <View style={sc.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quay lại"
        onPress={() => router.back()}
        style={sc.backBtn}>
        <Text style={sc.backIcon}>‹</Text>
      </Pressable>
      <Text style={sc.headerTitle} numberOfLines={1}>{title}</Text>
      {showCreate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tạo lịch chăm sóc mới"
          onPress={() => router.push('/schedule/create' as never)}
          style={sc.createBtn}>
          <Text style={sc.createBtnText}>＋ Tạo lịch</Text>
        </Pressable>
      ) : (
        <AccountButton size={30} />
      )}
    </View>
  );
}

const TASK_META: Record<TaskType, { emoji: string; color: string }> = {
  'Tưới nước':          { emoji: '💧', color: '#D1E9FF' },
  'Bón phân':           { emoji: '🌿', color: '#D5F2E1' },
  'Cắt tỉa':            { emoji: '✂️', color: '#FFE0CF' },
  'Kiểm tra sâu bệnh':  { emoji: '🔍', color: '#FFF3CD' },
  'Phun sương':         { emoji: '🌫️', color: '#E8F4FD' },
  'Ghi nhận phát triển':{ emoji: '📝', color: '#F3E5FF' },
};

const TASK_TYPES: TaskType[] = [
  'Tưới nước', 'Bón phân', 'Cắt tỉa',
  'Kiểm tra sâu bệnh', 'Phun sương', 'Ghi nhận phát triển',
];
const REPEAT_MODES: RepeatMode[] = ['Mỗi ngày', 'Cách ngày', 'Hàng tuần', 'Tùy chỉnh'];
const FILTER_TABS: FilterTab[] = ['Tất cả', 'Tưới nước', 'Bón phân', 'Cắt tỉa'];

// ─── ScheduleListScreen ───────────────────────────────────────────────────────

export function ScheduleListScreen() {
  const [schedules] = useSchedules();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('Tất cả');

  const filtered = schedules.filter((s) =>
    activeFilter === 'Tất cả' || s.task === activeFilter,
  );

  const completedCount = schedules.length;
  const weekPercent = schedules.length > 0 ? Math.min(100, Math.round((completedCount / 7) * 100)) : 0;

  return (
    <SafeAreaView style={sc.safe} edges={['top']}>
      <Header title="Lập lịch chăm sóc" showCreate />
      <ScrollView style={sc.scroll} contentContainerStyle={sc.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Banner giới thiệu ── */}
        <View style={sc.introBanner}>
          <View style={sc.introLeft}>
            <View style={sc.introIconWrap}>
              <Text style={sc.introIcon}>📅</Text>
            </View>
            <View style={sc.introCopy}>
              <Text style={sc.introTitle}>Lập lịch chăm sóc</Text>
              <Text style={sc.introSub}>Thiết lập chu kỳ tưới, bón phân, cắt tỉa chủ động.</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tạo lịch mới"
            onPress={() => router.push('/schedule/create' as never)}
            style={sc.introCta}>
            <Text style={sc.introCtaText}>＋ Tạo lịch</Text>
          </Pressable>
        </View>

        {/* ── Tiến độ tuần ── */}
        <View style={sc.weekMetricCard}>
          <View style={sc.weekMetricRow}>
            <View style={sc.weekMetricItem}>
              <Text style={sc.weekMetricValue}>{weekPercent}%</Text>
              <Text style={sc.weekMetricLabel}>Tiến độ hoàn thành</Text>
            </View>
            <View style={sc.weekMetricDivider} />
            <View style={sc.weekMetricItem}>
              <Text style={sc.weekMetricValue}>{schedules.length}</Text>
              <Text style={sc.weekMetricLabel}>Lịch đang hoạt động</Text>
            </View>
            <View style={sc.weekMetricDivider} />
            <View style={sc.weekMetricItem}>
              <Text style={sc.weekMetricValue}>0</Text>
              <Text style={sc.weekMetricLabel}>Việc đến hạn hôm nay</Text>
            </View>
          </View>
          {/* Progress bar */}
          <View style={sc.progressBg}>
            <View style={[sc.progressFill, { width: `${weekPercent}%` as `${number}%` }]} />
          </View>
          <Text style={sc.progressNote}>Tuần này · {new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
        </View>

        {/* ── Bộ lọc nhanh ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={sc.filterRow}>
          {FILTER_TABS.map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveFilter(tab)}
              style={[sc.filterTab, activeFilter === tab && sc.filterTabActive]}>
              <Text style={[sc.filterTabText, activeFilter === tab && sc.filterTabTextActive]}>
                {tab}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Danh sách lịch ── */}
        <View style={sc.sectionHeader}>
          <Text style={sc.sectionTitle}>Lịch chăm sóc</Text>
          <Text style={sc.sectionHint}>{filtered.length} lịch</Text>
        </View>

        {filtered.length === 0 ? (
          /* Empty State */
          <View style={sc.emptyCard}>
            <View style={sc.emptyIconWrap}>
              <Text style={sc.emptyIconGlyph}>📅</Text>
            </View>
            <Text style={sc.emptyTitle}>Chưa có lịch chăm sóc</Text>
            <Text style={sc.emptyDesc}>
              Tạo lịch nhắc nhở để không bỏ lỡ việc tưới nước, bón phân và chăm sóc cây định kỳ.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tạo lịch chăm sóc đầu tiên"
              onPress={() => router.push('/schedule/create' as never)}
              style={sc.emptyBtn}>
              <Text style={sc.emptyBtnText}>＋  Tạo lịch chăm sóc đầu tiên</Text>
            </Pressable>
          </View>
        ) : (
          filtered.map((entry) => {
            const meta = TASK_META[entry.task];
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityLabel={`Xem chi tiết lịch ${entry.task} cho ${entry.plantName}`}
                onPress={() => router.push({ pathname: '/schedule/detail', params: { scheduleId: entry.id } } as never)}
                style={sc.scheduleCard}>
                {/* Icon */}
                <View style={[sc.scheduleCardIcon, { backgroundColor: meta.color }]}>
                  <Text style={sc.scheduleCardEmoji}>{meta.emoji}</Text>
                </View>
                {/* Info */}
                <View style={sc.scheduleCardBody}>
                  <View style={sc.scheduleCardTop}>
                    <Text style={sc.scheduleCardTask} numberOfLines={1}>{entry.task}</Text>
                    <View style={sc.scheduleCardBadge}>
                      <Text style={sc.scheduleCardBadgeText}>{entry.repeat}</Text>
                    </View>
                  </View>
                  <Text style={sc.scheduleCardPlant} numberOfLines={1}>🌱 {entry.plantName}</Text>
                  <Text style={sc.scheduleCardTime}>⏰ {entry.time || 'Chưa đặt giờ'} · Bắt đầu {entry.startDate || 'chưa xác định'}</Text>
                </View>
                {/* Arrow */}
                <Text style={sc.scheduleCardArrow}>›</Text>
              </Pressable>
            );
          })
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── CreateScheduleScreen ─────────────────────────────────────────────────────

export function CreateScheduleScreen() {
  const { ownedPlants } = usePlantData();
  const [plantId, setPlantId] = useState('');
  const [plantQuery, setPlantQuery] = useState('');
  const [task, setTask] = useState<TaskType | ''>('');
  const [repeat, setRepeat] = useState<RepeatMode>('Mỗi ngày');
  const [startDate, setStartDate] = useState('');
  const [time, setTime] = useState('');
  const [showError, setShowError] = useState(false);

  const matchingPlants = plantQuery.trim()
    ? ownedPlants.filter((p) =>
        `${p.name} ${p.scientificName} ${p.location}`
          .toLocaleLowerCase()
          .includes(plantQuery.trim().toLocaleLowerCase()),
      )
    : ownedPlants.slice(0, 20);

  const selectedPlant = ownedPlants.find((p) => p.id === plantId);

  const handleSave = () => {
    if (!plantId || !task) {
      setShowError(true);
      return;
    }
    addSchedule({
      plantId,
      plantName: selectedPlant?.name ?? '',
      plantCategory: selectedPlant?.category ?? '',
      task: task as TaskType,
      repeat,
      startDate: startDate || new Date().toLocaleDateString('vi-VN'),
      time: time || '08:00',
      active: true,
    });
    Alert.alert('Tạo lịch thành công', `Đã thêm lịch "${task}" cho ${selectedPlant?.name ?? ''}.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={sc.safe} edges={['top']}>
      <Header title="Tạo lịch chăm sóc" />
      <ScrollView style={sc.scroll} contentContainerStyle={sc.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Info tip */}
        <View style={sc.tipCard}>
          <Text style={sc.tipTitle}>Lập lịch chăm sóc cây 🌿</Text>
          <Text style={sc.tipBody}>
            Chọn cây, loại công việc và thời gian để tạo lịch nhắc chăm sóc định kỳ.
          </Text>
        </View>

        {/* ── PHẦN 1: Chọn cây ── */}
        <Text style={sc.sectionLabel}>
          1. Chọn cây cần chăm sóc <Text style={sc.required}>*</Text>
        </Text>

        {ownedPlants.length === 0 ? (
          <View style={sc.tipCard}>
            <Text style={sc.tipBody}>Bạn chưa có cây để lập lịch chăm sóc.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Thêm cây mới"
              onPress={() => router.push('/garden/add-plant' as never)}>
              <Text style={sc.linkText}>＋ Thêm cây của bạn</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              value={plantQuery}
              onChangeText={setPlantQuery}
              placeholder="Tìm theo tên cây hoặc tên khoa học..."
              placeholderTextColor={C.mutedText}
              style={sc.searchInput}
            />
            {selectedPlant && (
              <View style={sc.selectedBanner}>
                <Text style={sc.selectedBannerText}>✓ Đã chọn: {selectedPlant.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Bỏ chọn cây"
                  onPress={() => { setPlantId(''); setPlantQuery(''); }}>
                  <Text style={sc.clearText}>Bỏ chọn</Text>
                </Pressable>
              </View>
            )}
            {matchingPlants.slice(0, 20).map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Chọn cây ${item.name}`}
                onPress={() => { setPlantId(item.id); setPlantQuery(item.name); }}
                style={[sc.plantRow, plantId === item.id && sc.plantRowSelected]}>
                <View style={sc.plantIcon}>
                  <Text style={sc.plantIconGlyph}>♧</Text>
                </View>
                <View style={sc.plantCopy}>
                  <Text style={sc.plantName}>{item.name}</Text>
                  <Text style={sc.plantSub}>{item.scientificName || item.category}{item.location ? ` · ${item.location}` : ''}</Text>
                </View>
                <Text style={[sc.radio, plantId === item.id && sc.radioSelected]}>
                  {plantId === item.id ? '●' : '○'}
                </Text>
              </Pressable>
            ))}
            {plantQuery.trim() && matchingPlants.length === 0 && (
              <Text style={sc.hintText}>Không tìm thấy cây phù hợp.</Text>
            )}
          </>
        )}

        {/* ── PHẦN 2: Loại công việc ── */}
        <Text style={sc.sectionLabel}>
          2. Chọn loại công việc <Text style={sc.required}>*</Text>
        </Text>
        <View style={sc.taskGrid}>
          {TASK_TYPES.map((t) => {
            const meta = TASK_META[t];
            return (
              <Pressable
                key={t}
                accessibilityRole="button"
                accessibilityLabel={`Chọn công việc ${t}`}
                onPress={() => setTask(t)}
                style={[sc.taskChip, task === t && sc.taskChipSelected]}>
                <Text style={sc.taskChipEmoji}>{meta.emoji}</Text>
                <Text style={[sc.taskChipText, task === t && sc.taskChipTextSelected]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── PHẦN 3: Thời gian ── */}
        <Text style={sc.sectionLabel}>3. Thời gian bắt đầu</Text>
        <View style={sc.timeRow}>
          <TextInput
            value={startDate}
            onChangeText={setStartDate}
            placeholder="Ngày bắt đầu (vd: 15/11/2026)"
            placeholderTextColor={C.mutedText}
            style={[sc.timeInput, { flex: 1 }]}
          />
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="Giờ nhắc (vd: 08:00)"
            placeholderTextColor={C.mutedText}
            style={[sc.timeInput, { flex: 1 }]}
          />
        </View>

        {/* ── PHẦN 4: Chu kỳ ── */}
        <Text style={sc.sectionLabel}>4. Chu kỳ lặp lại</Text>
        <View style={sc.repeatGrid}>
          {REPEAT_MODES.map((r) => (
            <Pressable
              key={r}
              accessibilityRole="button"
              accessibilityLabel={`Chu kỳ ${r}`}
              onPress={() => setRepeat(r)}
              style={[sc.repeatChip, repeat === r && sc.repeatChipSelected]}>
              <Text style={[sc.repeatChipText, repeat === r && sc.repeatChipTextSelected]}>{r}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── PHẦN 5: Thông báo ── */}
        <View style={sc.noticeCard}>
          <Text style={sc.noticeTitle}>📲 Thông báo nhắc lịch</Text>
          <Text style={sc.tipBody}>
            Lịch nhắc sẽ hiển thị trong ứng dụng. Tính năng thông báo đẩy sẽ được tích hợp trong phiên bản tiếp theo.
          </Text>
        </View>

        {/* Error */}
        {showError && (
          <Text style={sc.errorText}>⚠️ Hãy chọn cây và loại công việc trước khi tiếp tục.</Text>
        )}

        {/* ── Nút xác nhận ── */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Xác nhận tạo lịch chăm sóc"
          onPress={handleSave}
          style={sc.submitBtn}>
          <Text style={sc.submitBtnText}>✓  Xác nhận tạo lịch chăm sóc</Text>
        </Pressable>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── ScheduleDetailScreen ─────────────────────────────────────────────────────

const WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function getTodayDayIndex(): number {
  const day = new Date().getDay(); // 0=Sun
  return day === 0 ? 6 : day - 1;
}

function getWeekDates(): string[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  return WEEK_DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.getDate().toString();
  });
}

export function ScheduleDetailScreen({ scheduleId }: { scheduleId?: string }) {
  const [schedules] = useSchedules();
  const todayIndex = getTodayDayIndex();
  const [selectedDay, setSelectedDay] = useState(todayIndex);
  const weekDates = getWeekDates();

  const entry = scheduleId ? schedules.find((s) => s.id === scheduleId) : schedules[0];

  const timelineItems = entry
    ? [
        { time: '08:00', title: entry.task, status: 'Đến hạn', desc: `Thực hiện ${entry.task.toLocaleLowerCase()} cho ${entry.plantName} theo đúng lịch.`, urgent: true },
        { time: '10:00', title: 'Kiểm tra độ ẩm đất', status: 'Định kỳ', desc: 'Kiểm tra lớp đất mặt trước khi tưới thêm.', urgent: false },
        { time: '16:30', title: 'Bón phân hữu cơ', status: 'Sắp tới', desc: 'Bón theo liều lượng phù hợp với loài cây.', urgent: false },
        { time: '18:00', title: 'Ghi nhận phát triển', status: 'Định kỳ', desc: 'Theo dõi tình trạng lá, thân và quả.', urgent: false },
      ]
    : [];

  const statusColor = (s: string) =>
    s === 'Đến hạn' ? '#E53E3E' : s === 'Sắp tới' ? '#D97706' : '#38A169';
  const statusBg = (s: string) =>
    s === 'Đến hạn' ? '#FEE2E2' : s === 'Sắp tới' ? '#FEF3C7' : '#D1FAE5';

  const monthLabel = new Date().toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

  if (!entry) {
    return (
      <SafeAreaView style={sc.safe} edges={['top']}>
        <Header title="Chi tiết lịch của cây" />
        <View style={sc.centeredEmpty}>
          <Text style={sc.emptyIconGlyph}>📅</Text>
          <Text style={sc.emptyTitle}>Chưa có lịch nào được chọn</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tạo lịch chăm sóc"
            onPress={() => router.push('/schedule/create' as never)}
            style={sc.emptyBtn}>
            <Text style={sc.emptyBtnText}>＋  Tạo lịch chăm sóc</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const meta = TASK_META[entry.task];

  return (
    <SafeAreaView style={sc.safe} edges={['top']}>
      <Header title="Chi tiết lịch của cây" />
      <ScrollView style={sc.scroll} contentContainerStyle={sc.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Thẻ cây ── */}
        <View style={sc.plantHeroCard}>
          <View style={[sc.plantHeroIcon, { backgroundColor: meta.color }]}>
            <Text style={sc.plantHeroEmoji}>{meta.emoji}</Text>
          </View>
          <View style={sc.plantHeroCopy}>
            <Text style={sc.plantHeroName}>{entry.plantName}</Text>
            <Text style={sc.plantHeroCat}>{entry.plantCategory}</Text>
            <View style={sc.plantHeroBadge}>
              <Text style={sc.plantHeroBadgeText}>{entry.task}</Text>
            </View>
          </View>
        </View>

        {/* ── Thanh chọn tháng ── */}
        <View style={sc.monthRow}>
          <Text style={sc.monthArrow}>‹</Text>
          <Text style={sc.monthLabel}>Tháng {monthLabel}</Text>
          <Text style={sc.monthArrow}>›</Text>
        </View>

        {/* ── Lịch tuần ── */}
        <View style={sc.weekStrip}>
          {WEEK_DAYS.map((day, i) => (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityLabel={`Ngày ${weekDates[i]}`}
              onPress={() => setSelectedDay(i)}
              style={[sc.dayCell, selectedDay === i && sc.dayCellActive]}>
              <Text style={[sc.dayLabel, selectedDay === i && sc.dayLabelActive]}>{day}</Text>
              <Text style={[sc.dayDate, selectedDay === i && sc.dayDateActive]}>{weekDates[i]}</Text>
              {i === todayIndex && <View style={[sc.todayDot, selectedDay === i && sc.todayDotActive]} />}
            </Pressable>
          ))}
        </View>

        {/* ── Tóm tắt ── */}
        <View style={sc.summaryCard}>
          <Text style={sc.summaryTitle}>Lịch chăm sóc · {WEEK_DAYS[selectedDay]}, {weekDates[selectedDay]}</Text>
          <Text style={sc.summaryBody}>{timelineItems.length} công việc · {timelineItems.filter((t) => t.urgent).length} việc cần thực hiện</Text>
        </View>

        {/* ── Timeline công việc ── */}
        <View style={sc.sectionHeader}>
          <Text style={sc.sectionTitle}>Chi tiết công việc</Text>
        </View>

        {timelineItems.map((item) => (
          <View key={item.time} style={[sc.timelineCard, item.urgent && sc.timelineCardUrgent]}>
            <View style={sc.timelineTop}>
              <Text style={sc.timelineTime}>{item.time}</Text>
              <View style={[sc.statusBadge, { backgroundColor: statusBg(item.status) }]}>
                <Text style={[sc.statusText, { color: statusColor(item.status) }]}>{item.status}</Text>
              </View>
            </View>
            <Text style={sc.timelineTitle}>{item.title}</Text>
            <Text style={sc.timelineDesc}>{item.desc}</Text>
          </View>
        ))}

        {/* Chu kỳ */}
        <View style={sc.repeatInfoCard}>
          <Text style={sc.repeatInfoLabel}>🔄 Chu kỳ lặp lại</Text>
          <Text style={sc.repeatInfoValue}>{entry.repeat}</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 20, gap: 10 },

  // Header
  header: { height: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDE8E0' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: C.forest, fontSize: 30, lineHeight: 34 },
  headerTitle: { flex: 1, color: C.forest, fontFamily: F.semiBold, fontSize: 15, textAlign: 'center', marginHorizontal: 4 },
  createBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.primary },
  createBtnText: { color: '#FFFFFF', fontFamily: F.semiBold, fontSize: 11 },

  // Intro banner
  introBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, backgroundColor: '#D9F2E3' },
  introLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  introIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(2,52,35,0.12)', alignItems: 'center', justifyContent: 'center' },
  introIcon: { fontSize: 22 },
  introCopy: { flex: 1, gap: 2 },
  introTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  introSub: { color: '#3B6752', fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  introCta: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.primary, marginLeft: 8 },
  introCtaText: { color: '#FFFFFF', fontFamily: F.semiBold, fontSize: 12 },

  // Week metric
  weekMetricCard: { padding: 14, borderRadius: 14, backgroundColor: C.surface, gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 1 },
  weekMetricRow: { flexDirection: 'row', alignItems: 'center' },
  weekMetricItem: { flex: 1, alignItems: 'center', gap: 2 },
  weekMetricDivider: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: '#DDE8E0' },
  weekMetricValue: { color: C.forest, fontFamily: F.bold, fontSize: 20, lineHeight: 26 },
  weekMetricLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 9, textAlign: 'center', lineHeight: 13 },
  progressBg: { height: 6, borderRadius: 3, backgroundColor: '#E5F2EA', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: C.primary },
  progressNote: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, textAlign: 'right' },

  // Filter tabs
  filterRow: { gap: 8, paddingVertical: 2 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: '#E7EEE8' },
  filterTabActive: { backgroundColor: C.forest },
  filterTabText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12 },
  filterTabTextActive: { color: '#FFFFFF', fontFamily: F.semiBold },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  sectionHint: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },

  // Schedule card
  scheduleCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: C.surface, gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 1 },
  scheduleCardIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scheduleCardEmoji: { fontSize: 22 },
  scheduleCardBody: { flex: 1, gap: 3 },
  scheduleCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleCardTask: { color: C.text, fontFamily: F.semiBold, fontSize: 14, flex: 1 },
  scheduleCardBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: '#D5F2E1' },
  scheduleCardBadgeText: { color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  scheduleCardPlant: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12 },
  scheduleCardTime: { color: C.mutedText, fontFamily: F.regular, fontSize: 11 },
  scheduleCardArrow: { color: C.mutedText, fontSize: 24, lineHeight: 28 },

  // Empty state
  emptyCard: { padding: 24, borderRadius: 16, backgroundColor: C.surface, alignItems: 'center', gap: 10 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E3F2E8', alignItems: 'center', justifyContent: 'center' },
  emptyIconGlyph: { fontSize: 28 },
  emptyTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 15, textAlign: 'center' },
  emptyDesc: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  emptyBtn: { minHeight: 42, paddingHorizontal: 18, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { color: '#FFFFFF', fontFamily: F.semiBold, fontSize: 13 },
  centeredEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  // Create form
  tipCard: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, gap: 4 },
  tipTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  tipBody: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  noticeCard: { padding: 12, borderRadius: 12, backgroundColor: '#FEF3C7', gap: 4 },
  noticeTitle: { color: '#92400E', fontFamily: F.semiBold, fontSize: 13 },
  sectionLabel: { color: C.text, fontFamily: F.semiBold, fontSize: 13, marginTop: 4 },
  required: { color: '#E53E3E' },
  searchInput: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.surface, fontFamily: F.regular, fontSize: 13, color: C.text, borderWidth: StyleSheet.hairlineWidth, borderColor: '#DDE8E0' },
  selectedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 10, backgroundColor: '#D5F2E1' },
  selectedBannerText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  clearText: { color: C.terracotta, fontFamily: F.regular, fontSize: 12 },
  plantRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: C.surface, gap: 10 },
  plantRowSelected: { borderWidth: 1.5, borderColor: C.primary, backgroundColor: '#E8F5ED' },
  plantIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  plantIconGlyph: { fontSize: 18, color: C.forest },
  plantCopy: { flex: 1 },
  plantName: { color: C.text, fontFamily: F.semiBold, fontSize: 13 },
  plantSub: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, fontStyle: 'italic' },
  radio: { color: C.mutedText, fontSize: 18 },
  radioSelected: { color: C.primary },
  hintText: { color: C.mutedText, fontFamily: F.regular, fontSize: 11, textAlign: 'center' },
  linkText: { color: C.primary, fontFamily: F.semiBold, fontSize: 12, marginTop: 4 },
  taskGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  taskChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: '#DDE8E0' },
  taskChipSelected: { borderColor: C.primary, backgroundColor: '#E8F5ED', borderWidth: 1.5 },
  taskChipEmoji: { fontSize: 16 },
  taskChipText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12 },
  taskChipTextSelected: { color: C.primary, fontFamily: F.semiBold },
  timeRow: { flexDirection: 'row', gap: 8 },
  timeInput: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.surface, fontFamily: F.regular, fontSize: 13, color: C.text, borderWidth: StyleSheet.hairlineWidth, borderColor: '#DDE8E0' },
  repeatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  repeatChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: '#DDE8E0' },
  repeatChipSelected: { borderColor: C.primary, backgroundColor: '#E8F5ED', borderWidth: 1.5 },
  repeatChipText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12 },
  repeatChipTextSelected: { color: C.primary, fontFamily: F.semiBold },
  errorText: { color: '#E53E3E', fontFamily: F.regular, fontSize: 12, textAlign: 'center' },
  submitBtn: { minHeight: 48, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitBtnText: { color: '#FFFFFF', fontFamily: F.semiBold, fontSize: 14 },

  // Detail screen
  plantHeroCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, backgroundColor: C.surface, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 1 },
  plantHeroIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  plantHeroEmoji: { fontSize: 26 },
  plantHeroCopy: { flex: 1, gap: 4 },
  plantHeroName: { color: C.forest, fontFamily: F.semiBold, fontSize: 16 },
  plantHeroCat: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, fontStyle: 'italic' },
  plantHeroBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: '#D5F2E1' },
  plantHeroBadgeText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  monthArrow: { color: C.mutedText, fontSize: 22, width: 32, textAlign: 'center' },
  monthLabel: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  weekStrip: { flexDirection: 'row', gap: 4 },
  dayCell: { flex: 1, minHeight: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, gap: 2, paddingVertical: 6 },
  dayCellActive: { backgroundColor: C.primary },
  dayLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 },
  dayLabelActive: { color: '#FFFFFF', fontFamily: F.semiBold },
  dayDate: { color: C.text, fontFamily: F.semiBold, fontSize: 14 },
  dayDateActive: { color: '#FFFFFF' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.primary },
  todayDotActive: { backgroundColor: '#FFFFFF' },
  summaryCard: { padding: 12, borderRadius: 12, backgroundColor: '#D5F2E1', gap: 3 },
  summaryTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  summaryBody: { color: '#3B6752', fontFamily: F.regular, fontSize: 12 },
  timelineCard: { padding: 12, borderRadius: 12, backgroundColor: C.surface, gap: 5, borderLeftWidth: 3, borderLeftColor: '#DDE8E0' },
  timelineCardUrgent: { borderLeftColor: '#E53E3E' },
  timelineTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timelineTime: { color: C.primary, fontFamily: F.bold, fontSize: 13 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  statusText: { fontFamily: F.semiBold, fontSize: 10 },
  timelineTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 14 },
  timelineDesc: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
  repeatInfoCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, backgroundColor: C.softSurface },
  repeatInfoLabel: { color: C.text, fontFamily: F.semiBold, fontSize: 13 },
  repeatInfoValue: { color: C.primary, fontFamily: F.semiBold, fontSize: 13 },
});
