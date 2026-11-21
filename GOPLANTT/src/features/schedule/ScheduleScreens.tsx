import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { SafeAreaView } from '@/components/app-primitives';
import { router, useLocalSearchParams } from 'expo-router';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { safeBack } from '@/services/navigation';
import { AccountButton } from '@/features/auth/AccountButton';
import { usePlantData } from '@/features/plants/PlantDataStore';
import {
  CARE_TASK_META,
  CARE_TASK_TYPES,
  formatDateVi,
  formatDueTimeLocal,
  formatScheduleRepeat,
  formatTimeShort,
  useCareSchedules,
} from '@/features/schedule/CareScheduleStore';
import {
  toLocalIsoDate,
  type ApiCareTask,
  type CareRepeatType,
  type CareTaskType,
  type JournalLogType,
} from '@/services/api';

type RepeatOption = 'daily' | 'alternate' | 'weekly' | 'custom';
type FilterTab = 'all' | CareTaskType;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'watering', label: 'Tưới nước' },
  { key: 'fertilizing', label: 'Bón phân' },
  { key: 'pruning', label: 'Cắt tỉa' },
  { key: 'weeding', label: 'Làm cỏ' },
  { key: 'repotting', label: 'Thay đất' },
  { key: 'cleaning', label: 'Vệ sinh' },
  { key: 'pest_control', label: 'Sâu bệnh' },
];

const WEEK_DAY_CHOICES: { isoDay: number; short: string; full: string }[] = [
  { isoDay: 1, short: 'T2', full: 'Thứ 2' },
  { isoDay: 2, short: 'T3', full: 'Thứ 3' },
  { isoDay: 3, short: 'T4', full: 'Thứ 4' },
  { isoDay: 4, short: 'T5', full: 'Thứ 5' },
  { isoDay: 5, short: 'T6', full: 'Thứ 6' },
  { isoDay: 6, short: 'T7', full: 'Thứ 7' },
  { isoDay: 7, short: 'CN', full: 'Chủ nhật' },
];

function getIsoDayToday(): number {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function parseUserDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return toLocalIsoDate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseUserTime(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return '08:00';
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function Header({ title, showCreate }: { title: string; showCreate?: boolean }) {
  return (
    <View style={sc.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quay lại"
        onPress={() => safeBack('/schedule')}
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

const WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const SPECIAL_JOURNAL_LOG_MAP: Partial<Record<CareTaskType, JournalLogType>> = {
  fertilizing: 'fertilizing',
  pest_control: 'pest',
  pruning: 'pruning',
  repotting: 'other',
};

function getWeekBounds(weekOffset: number): { monday: Date; dates: Date[] } {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) + weekOffset * 7);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  return { monday, dates };
}

// ─── ScheduleListScreen ───────────────────────────────────────────────────────

export function ScheduleListScreen() {
  const { ownedPlants, gardens } = usePlantData();
  const { schedules, todayTasks, todaySummary, isLoading, error, completeTask, skipTask, loadCalendar, refresh } = useCareSchedules();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [selectedGardenId, setSelectedGardenId] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [weekOffset, setWeekOffset] = useState(0);
  const todayIso = toLocalIsoDate();
  const [selectedIso, setSelectedIso] = useState(todayIso);
  const [calendarTasks, setCalendarTasks] = useState<ApiCareTask[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<{ task: ApiCareTask; action: 'complete' | 'skip' } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [journalPromptTask, setJournalPromptTask] = useState<ApiCareTask | null>(null);

  const plantGardenMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const p of ownedPlants) map.set(p.id, p.gardenId ?? null);
    return map;
  }, [ownedPlants]);

  const matchesGarden = useCallback(
    (plantId: string) => selectedGardenId === 'all' || plantGardenMap.get(plantId) === selectedGardenId,
    [selectedGardenId, plantGardenMap],
  );

  const { dates: weekDates } = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);

  const fetchGlobalWeek = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const from = toLocalIsoDate(weekDates[0]);
      const to = toLocalIsoDate(weekDates[6]);
      const view = await loadCalendar(from, to);
      setCalendarTasks(view.tasks ?? []);
    } catch {
      setCalendarTasks([]);
    } finally {
      setCalendarLoading(false);
    }
  }, [loadCalendar, weekDates]);

  useEffect(() => {
    if (viewMode === 'calendar') {
      void fetchGlobalWeek();
    }
  }, [viewMode, fetchGlobalWeek]);

  const filteredSchedules = schedules.filter(
    (s) => (activeFilter === 'all' || s.taskType === activeFilter) && matchesGarden(s.plantId),
  );
  const pendingToday = todayTasks.filter(
    (t) => t.status === 'pending' && (activeFilter === 'all' || t.taskType === activeFilter) && matchesGarden(t.plantId),
  );
  const selectedDayTasks = calendarTasks.filter(
    (t) => t.dueDate === selectedIso && (activeFilter === 'all' || t.taskType === activeFilter) && matchesGarden(t.plantId),
  );

  const todayPercent = todaySummary.total > 0
    ? Math.round(((todaySummary.completed + todaySummary.skipped) / todaySummary.total) * 100)
    : 0;

  const executeTaskAction = async (task: ApiCareTask, action: 'complete' | 'skip', note?: string) => {
    setBusyTaskId(task.id);
    try {
      if (action === 'complete') {
        await completeTask(task.id, note);
        setJournalPromptTask(task);
      } else {
        await skipTask(task.id, note);
      }
      if (viewMode === 'calendar') {
        void fetchGlobalWeek();
      }
    } catch (err) {
      Alert.alert('Không thể cập nhật', err instanceof Error ? err.message : 'Vui lòng thử lại.');
    } finally {
      setBusyTaskId(null);
    }
  };

  const openNoteModal = (task: ApiCareTask, action: 'complete' | 'skip') => {
    setNoteInput('');
    setNoteModal({ task, action });
  };

  return (
    <SafeAreaView style={sc.safe} edges={['top']}>
      <Header title="Lập lịch chăm sóc" />
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

        {/* ── Tiến độ hôm nay ── */}
        <View style={sc.weekMetricCard}>
          <View style={sc.weekMetricRow}>
            <View style={sc.weekMetricItem}>
              <Text style={sc.weekMetricValue}>{todayPercent}%</Text>
              <Text style={sc.weekMetricLabel}>Hoàn thành hôm nay</Text>
            </View>
            <View style={sc.weekMetricDivider} />
            <View style={sc.weekMetricItem}>
              <Text style={sc.weekMetricValue}>{schedules.length}</Text>
              <Text style={sc.weekMetricLabel}>Lịch đang hoạt động</Text>
            </View>
            <View style={sc.weekMetricDivider} />
            <View style={sc.weekMetricItem}>
              <Text style={[sc.weekMetricValue, todaySummary.overdue > 0 && { color: '#C53030' }]}>
                {todaySummary.pending}
              </Text>
              <Text style={sc.weekMetricLabel}>
                {todaySummary.overdue > 0 ? `Cần làm (${todaySummary.overdue} quá hạn)` : 'Việc cần làm'}
              </Text>
            </View>
          </View>
          <View style={sc.progressBg}>
            <View style={[sc.progressFill, { width: `${todayPercent}%` as `${number}%` }]} />
          </View>
          <View style={sc.progressFooter}>
            <Text style={sc.progressNote}>
              Hôm nay · {new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: 'long', year: 'numeric' })}
            </Text>
            <Pressable onPress={() => void refresh()}>
              <Text style={sc.refreshText}>{isLoading ? 'Đang tải...' : '↻ Làm mới'}</Text>
            </Pressable>
          </View>
        </View>

        {error ? <Text style={sc.errorText}>{error}</Text> : null}

        {/* ── Việc cần làm hôm nay ── */}
        {pendingToday.length > 0 ? (
          <View style={sc.todayBlock}>
            <View style={sc.sectionHeader}>
              <Text style={sc.sectionTitle}>Cần chăm sóc hôm nay</Text>
              <Text style={sc.sectionHint}>{pendingToday.length} việc chờ</Text>
            </View>
            {pendingToday.map((task) => {
              const meta = CARE_TASK_META[task.taskType] ?? CARE_TASK_META.other;
              const busy = busyTaskId === task.id;
              const localTime = formatDueTimeLocal(task.dueAt);
              const dueMs = Date.parse(task.dueAt);
              const isTimeReached = Number.isFinite(dueMs) && dueMs <= Date.now();
              return (
                <View key={task.id} style={[sc.todayTaskCard, task.overdue && sc.todayTaskOverdue]}>
                  <View style={[sc.taskIconBox, { backgroundColor: meta.color }]}>
                    <Text style={sc.taskIconEmoji}>{meta.emoji}</Text>
                  </View>
                  <View style={sc.taskCopy}>
                    <View style={sc.taskTopRow}>
                      <Text style={sc.taskTitle} numberOfLines={1}>{task.title || meta.label}</Text>
                      {task.overdue ? (
                        <View style={sc.overduePill}>
                          <Text style={sc.overduePillText}>Quá hạn ({formatDateVi(task.dueDate)})</Text>
                        </View>
                      ) : isTimeReached ? (
                        <View style={sc.dueNowPill}>
                          <Text style={sc.dueNowPillText}>Đến giờ · {localTime}</Text>
                        </View>
                      ) : (
                        <View style={sc.upcomingPill}>
                          <Text style={sc.upcomingPillText}>Sắp tới · {localTime}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={sc.taskPlant} numberOfLines={1}>🌱 {task.plantName}</Text>
                    <View style={sc.taskActions}>
                      <Pressable
                        disabled={busy}
                        onPress={() => void executeTaskAction(task, 'complete')}
                        onLongPress={() => openNoteModal(task, 'complete')}
                        style={[sc.actionDoneBtn, busy && sc.btnDisabled]}>
                        <Text style={sc.actionDoneText}>{busy ? '...' : '✓ Hoàn thành'}</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy}
                        onPress={() => openNoteModal(task, 'skip')}
                        style={[sc.actionSkipBtn, busy && sc.btnDisabled]}>
                        <Text style={sc.actionSkipText}>Bỏ qua</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* ── Chế độ xem & Bộ lọc nhanh ── */}
        <View style={sc.modeSwitch}>
          <Pressable
            onPress={() => setViewMode('list')}
            style={[sc.modeBtn, viewMode === 'list' && sc.modeBtnActive]}>
            <Text style={[sc.modeText, viewMode === 'list' && sc.modeTextActive]}>Danh sách lịch</Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode('calendar')}
            style={[sc.modeBtn, viewMode === 'calendar' && sc.modeBtnActive]}>
            <Text style={[sc.modeText, viewMode === 'calendar' && sc.modeTextActive]}>Lịch tuần tổng hợp</Text>
          </Pressable>
        </View>

        {gardens.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sc.filterRow}>
            <Pressable
              onPress={() => setSelectedGardenId('all')}
              style={[sc.filterTab, selectedGardenId === 'all' && sc.filterTabActive]}>
              <Text style={[sc.filterTabText, selectedGardenId === 'all' && sc.filterTabTextActive]}>
                Tất cả vườn
              </Text>
            </Pressable>
            {gardens.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => setSelectedGardenId(g.id)}
                style={[sc.filterTab, selectedGardenId === g.id && sc.filterTabActive]}>
                <Text style={[sc.filterTabText, selectedGardenId === g.id && sc.filterTabTextActive]}>
                  🏡 {g.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={sc.filterRow}>
          {FILTER_TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveFilter(tab.key)}
              style={[sc.filterTab, activeFilter === tab.key && sc.filterTabActive]}>
              <Text style={[sc.filterTabText, activeFilter === tab.key && sc.filterTabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {viewMode === 'calendar' ? (
          <>
            <View style={sc.monthRow}>
              <Pressable onPress={() => setWeekOffset((w) => w - 1)} style={sc.weekArrowBtn}>
                <Text style={sc.monthArrow}>‹</Text>
              </Pressable>
              <Text style={sc.monthLabel}>
                Tháng {weekDates[0].toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
              </Text>
              <Pressable onPress={() => setWeekOffset((w) => w + 1)} style={sc.weekArrowBtn}>
                <Text style={sc.monthArrow}>›</Text>
              </Pressable>
            </View>
            <View style={sc.weekStrip}>
              {weekDates.map((d, i) => {
                const iso = toLocalIsoDate(d);
                const active = selectedIso === iso;
                const isToday = iso === todayIso;
                const hasTask = calendarTasks.some(
                  (t) => t.dueDate === iso && (activeFilter === 'all' || t.taskType === activeFilter) && matchesGarden(t.plantId),
                );
                return (
                  <Pressable
                    key={iso}
                    onPress={() => setSelectedIso(iso)}
                    style={[sc.dayCell, active && sc.dayCellActive]}>
                    <Text style={[sc.dayLabel, active && sc.dayLabelActive]}>{WEEK_DAYS[i]}</Text>
                    <Text style={[sc.dayDate, active && sc.dayDateActive]}>{d.getDate()}</Text>
                    <View style={sc.dayDotRow}>
                      {isToday ? <View style={[sc.todayDot, active && sc.todayDotActive]} /> : null}
                      {hasTask && !isToday ? <View style={[sc.taskDot, active && sc.todayDotActive]} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View style={sc.sectionHeader}>
              <Text style={sc.sectionTitle}>Công việc ngày {formatDateVi(selectedIso)}</Text>
              <Text style={sc.sectionHint}>{selectedDayTasks.length} việc</Text>
            </View>
            {calendarLoading ? (
              <View style={sc.loadingWrap}>
                <ActivityIndicator color={C.primary} />
              </View>
            ) : selectedDayTasks.length === 0 ? (
              <View style={sc.emptyDayCard}>
                <Text style={sc.hintText}>Không có công việc phù hợp bộ lọc trong ngày này.</Text>
              </View>
            ) : (
              selectedDayTasks.map((task) => {
                const meta = CARE_TASK_META[task.taskType] ?? CARE_TASK_META.other;
                const busy = busyTaskId === task.id;
                return (
                  <View key={task.id} style={[sc.timelineCard, task.overdue && sc.timelineCardUrgent]}>
                    <View style={sc.timelineTop}>
                      <Text style={sc.timelineTime}>{meta.emoji} {formatDueTimeLocal(task.dueAt)}</Text>
                      <Text style={sc.sectionHint}>
                        {task.status === 'completed' ? '✓ Đã xong' : task.status === 'skipped' ? 'Đã bỏ qua' : task.overdue ? 'Quá hạn' : 'Chờ làm'}
                      </Text>
                    </View>
                    <Text style={sc.timelineTitle}>{task.title || meta.label} · {task.plantName}</Text>
                    {task.note ? <Text style={sc.timelineDesc}>{task.note}</Text> : null}
                    {task.status === 'pending' ? (
                      <View style={sc.taskActions}>
                        <Pressable
                          disabled={busy}
                          onPress={() => void executeTaskAction(task, 'complete')}
                          onLongPress={() => openNoteModal(task, 'complete')}
                          style={[sc.actionDoneBtn, busy && sc.btnDisabled]}>
                          <Text style={sc.actionDoneText}>{busy ? '...' : '✓ Hoàn thành'}</Text>
                        </Pressable>
                        <Pressable
                          disabled={busy}
                          onPress={() => openNoteModal(task, 'skip')}
                          style={[sc.actionSkipBtn, busy && sc.btnDisabled]}>
                          <Text style={sc.actionSkipText}>Bỏ qua</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </>
        ) : (
          <>
            {/* ── Danh sách lịch ── */}
        <View style={sc.sectionHeader}>
          <Text style={sc.sectionTitle}>Lịch định kỳ của bạn</Text>
          <Text style={sc.sectionHint}>{filteredSchedules.length} lịch</Text>
        </View>

        {isLoading && schedules.length === 0 ? (
          <View style={sc.loadingWrap}>
            <ActivityIndicator color={C.primary} />
            <Text style={sc.hintText}>Đang tải lịch chăm sóc...</Text>
          </View>
        ) : filteredSchedules.length === 0 ? (
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
          filteredSchedules.map((entry) => {
            const meta = CARE_TASK_META[entry.taskType] ?? CARE_TASK_META.other;
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityLabel={`Xem chi tiết lịch ${meta.label} cho ${entry.plantName}`}
                onPress={() => router.push({ pathname: '/schedule/detail', params: { scheduleId: entry.id } } as never)}
                style={sc.scheduleCard}>
                <View style={[sc.scheduleCardIcon, { backgroundColor: meta.color }]}>
                  <Text style={sc.scheduleCardEmoji}>{meta.emoji}</Text>
                </View>
                <View style={sc.scheduleCardBody}>
                  <View style={sc.scheduleCardTop}>
                    <Text style={sc.scheduleCardTask} numberOfLines={1}>{meta.label}</Text>
                    <View style={sc.scheduleCardBadge}>
                      <Text style={sc.scheduleCardBadgeText} numberOfLines={1}>{formatScheduleRepeat(entry)}</Text>
                    </View>
                  </View>
                  <Text style={sc.scheduleCardPlant} numberOfLines={1}>🌱 {entry.plantName}</Text>
                  <Text style={sc.scheduleCardTime}>
                    ⏰ {formatTimeShort(entry.timeOfDay)} · Bắt đầu {formatDateVi(entry.startDate)}
                  </Text>
                </View>
                <Text style={sc.scheduleCardArrow}>›</Text>
              </Pressable>
            );
          })
        )}
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Modal nhập lý do bỏ qua / ghi chú hoàn thành */}
      <Modal visible={Boolean(noteModal)} transparent animationType="fade" onRequestClose={() => setNoteModal(null)}>
        <View style={sc.modalBackdrop}>
          <View style={sc.modalCard}>
            <Text style={sc.sectionTitle}>
              {noteModal?.action === 'skip' ? 'Bỏ qua công việc' : 'Hoàn thành kèm ghi chú'}
            </Text>
            <Text style={sc.timelineDesc}>
              {noteModal ? `${CARE_TASK_META[noteModal.task.taskType]?.label ?? 'Chăm sóc'} · ${noteModal.task.plantName}` : ''}
            </Text>
            <TextInput
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder={noteModal?.action === 'skip' ? 'Lý do bỏ qua (vd: Trời mưa, đất còn ẩm...)' : 'Ghi chú khi hoàn thành (tùy chọn)'}
              placeholderTextColor={C.mutedText}
              style={sc.searchInput}
            />
            <View style={sc.taskActions}>
              <Pressable onPress={() => setNoteModal(null)} style={sc.actionSkipBtn}>
                <Text style={sc.actionSkipText}>Hủy</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!noteModal) return;
                  const target = noteModal;
                  const trimmed = noteInput.trim();
                  setNoteModal(null);
                  void executeTaskAction(target.task, target.action, trimmed || undefined);
                }}
                style={sc.actionDoneBtn}>
                <Text style={sc.actionDoneText}>
                  {noteModal?.action === 'skip' ? 'Xác nhận bỏ qua' : '✓ Xác nhận hoàn thành'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal gợi ý ghi nhanh nhật ký sau công việc đặc biệt */}
      <Modal visible={Boolean(journalPromptTask)} transparent animationType="fade" onRequestClose={() => setJournalPromptTask(null)}>
        <View style={sc.modalBackdrop}>
          <View style={sc.modalCard}>
            <Text style={sc.sectionTitle}>Đã hoàn thành! Ghi vào nhật ký?</Text>
            <Text style={sc.timelineDesc}>
              {journalPromptTask
                ? `Bạn vừa xong "${CARE_TASK_META[journalPromptTask.taskType]?.label}" cho ${journalPromptTask.plantName}. Lưu lại vào nhật ký chăm sóc để tiện theo dõi?`
                : ''}
            </Text>
            <View style={sc.taskActions}>
              <Pressable onPress={() => setJournalPromptTask(null)} style={sc.actionSkipBtn}>
                <Text style={sc.actionSkipText}>Để sau</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const target = journalPromptTask;
                  setJournalPromptTask(null);
                  if (!target) return;
                  router.push({
                    pathname: '/journal/new',
                    params: {
                      plantId: target.plantId,
                      careTaskId: target.id,
                      logType: SPECIAL_JOURNAL_LOG_MAP[target.taskType] ?? 'other',
                    },
                  } as never);
                }}
                style={sc.actionDoneBtn}>
                <Text style={sc.actionDoneText}>Ghi nhận vào nhật ký</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── CreateScheduleScreen ─────────────────────────────────────────────────────

export function CreateScheduleScreen() {
  const params = useLocalSearchParams<{ scheduleId?: string; plantId?: string }>();
  const { ownedPlants } = usePlantData();
  const { schedules, createSchedule, updateSchedule } = useCareSchedules();
  const editingSchedule = params.scheduleId ? schedules.find((s) => s.id === params.scheduleId) : undefined;
  const isEditing = Boolean(editingSchedule);

  const [plantId, setPlantId] = useState(editingSchedule?.plantId ?? params.plantId ?? '');
  const [plantQuery, setPlantQuery] = useState('');
  const [taskType, setTaskType] = useState<CareTaskType | ''>(editingSchedule?.taskType ?? '');
  const [title, setTitle] = useState(editingSchedule?.title ?? '');
  const [repeatOption, setRepeatOption] = useState<RepeatOption>(() => {
    if (!editingSchedule) return 'daily';
    if (editingSchedule.repeatType === 'WEEKLY') return 'weekly';
    if (editingSchedule.frequencyDays === 1) return 'daily';
    if (editingSchedule.frequencyDays === 2) return 'alternate';
    return 'custom';
  });
  const [customDays, setCustomDays] = useState(String(editingSchedule?.frequencyDays ?? 3));
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    editingSchedule?.daysOfWeek?.length ? editingSchedule.daysOfWeek : [getIsoDayToday()],
  );
  const [startDate, setStartDate] = useState(() => formatDateVi(editingSchedule?.startDate ?? toLocalIsoDate()));
  const [endDate, setEndDate] = useState(() => (editingSchedule?.endDate ? formatDateVi(editingSchedule.endDate) : ''));
  const [time, setTime] = useState(() => formatTimeShort(editingSchedule?.timeOfDay ?? '08:00'));
  const [note, setNote] = useState(editingSchedule?.note ?? '');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingSchedule) {
      setPlantId(editingSchedule.plantId);
      setPlantQuery(editingSchedule.plantName);
      setTaskType(editingSchedule.taskType);
      setTitle(editingSchedule.title ?? '');
      setNote(editingSchedule.note ?? '');
      setStartDate(formatDateVi(editingSchedule.startDate));
      setEndDate(editingSchedule.endDate ? formatDateVi(editingSchedule.endDate) : '');
      setTime(formatTimeShort(editingSchedule.timeOfDay));
      if (editingSchedule.repeatType === 'WEEKLY') {
        setRepeatOption('weekly');
        if (editingSchedule.daysOfWeek?.length) setDaysOfWeek(editingSchedule.daysOfWeek);
      } else if (editingSchedule.frequencyDays === 1) {
        setRepeatOption('daily');
      } else if (editingSchedule.frequencyDays === 2) {
        setRepeatOption('alternate');
      } else {
        setRepeatOption('custom');
        setCustomDays(String(editingSchedule.frequencyDays ?? 3));
      }
      return;
    }
    if (params.plantId) {
      setPlantId(params.plantId);
      const matched = ownedPlants.find((p) => p.id === params.plantId);
      if (matched) setPlantQuery(matched.name);
    }
  }, [editingSchedule, params.plantId, ownedPlants]);

  const matchingPlants = plantQuery.trim()
    ? ownedPlants.filter((p) =>
        `${p.name} ${p.scientificName} ${p.location}`
          .toLocaleLowerCase()
          .includes(plantQuery.trim().toLocaleLowerCase()),
      )
    : ownedPlants.slice(0, 20);

  const selectedPlant = ownedPlants.find((p) => p.id === plantId);

  const toggleWeekDay = (isoDay: number) => {
    setDaysOfWeek((current) => {
      if (current.includes(isoDay)) {
        return current.length > 1 ? current.filter((d) => d !== isoDay) : current;
      }
      return [...current, isoDay].sort((a, b) => a - b);
    });
  };

  const handleSave = async () => {
    setErrorMsg('');
    if (!plantId || !taskType) {
      setErrorMsg('Hãy chọn cây và loại công việc trước khi tiếp tục.');
      return;
    }

    const isoStartDate = parseUserDate(startDate);
    if (!isoStartDate) {
      setErrorMsg('Ngày bắt đầu không đúng định dạng (DD/MM/YYYY hoặc YYYY-MM-DD).');
      return;
    }

    let isoEndDate: string | null = null;
    if (endDate.trim()) {
      isoEndDate = parseUserDate(endDate);
      if (!isoEndDate) {
        setErrorMsg('Ngày kết thúc không đúng định dạng (DD/MM/YYYY hoặc YYYY-MM-DD).');
        return;
      }
      if (isoEndDate < isoStartDate) {
        setErrorMsg('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
        return;
      }
    }

    const formattedTime = parseUserTime(time);
    if (!formattedTime) {
      setErrorMsg('Giờ nhắc không đúng định dạng (HH:mm, ví dụ 08:00).');
      return;
    }

    let repeatType: CareRepeatType = 'DAILY_INTERVAL';
    let frequencyDays: number | null = 1;
    let selectedWeekDays: number[] | null = null;

    if (repeatOption === 'daily') {
      frequencyDays = 1;
    } else if (repeatOption === 'alternate') {
      frequencyDays = 2;
    } else if (repeatOption === 'custom') {
      const parsed = Number.parseInt(customDays.trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) {
        setErrorMsg('Số ngày lặp lại tùy chỉnh phải từ 1 đến 365.');
        return;
      }
      frequencyDays = parsed;
    } else if (repeatOption === 'weekly') {
      repeatType = 'WEEKLY';
      frequencyDays = null;
      if (daysOfWeek.length === 0) {
        setErrorMsg('Hãy chọn ít nhất 1 thứ trong tuần.');
        return;
      }
      selectedWeekDays = daysOfWeek;
    }

    setSaving(true);
    try {
      const payload = {
        taskType,
        title: title.trim() || null,
        note: note.trim() || null,
        repeatType,
        frequencyDays,
        daysOfWeek: selectedWeekDays,
        timeOfDay: formattedTime,
        startDate: isoStartDate,
        endDate: isoEndDate,
      };
      if (editingSchedule) {
        await updateSchedule(editingSchedule.id, payload);
        Alert.alert('Cập nhật thành công', `Đã lưu thay đổi cho lịch "${title.trim() || CARE_TASK_META[taskType].label}".`, [
          { text: 'OK', onPress: () => safeBack('/schedule') },
        ]);
      } else {
        await createSchedule(plantId, payload);
        const label = title.trim() || CARE_TASK_META[taskType].label;
        Alert.alert('Tạo lịch thành công', `Đã tạo lịch "${label}" cho ${selectedPlant?.name ?? ''}.`, [
          { text: 'OK', onPress: () => safeBack('/schedule') },
        ]);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu lịch chăm sóc. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={sc.safe} edges={['top']}>
      <Header title={isEditing ? 'Chỉnh sửa lịch chăm sóc' : 'Tạo lịch chăm sóc'} />
      <ScrollView style={sc.scroll} contentContainerStyle={sc.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={sc.tipCard}>
          <Text style={sc.tipTitle}>Lập lịch chăm sóc cây 🌿</Text>
          <Text style={sc.tipBody}>
            Chọn cây, loại công việc và chu kỳ lặp để hệ thống tự động tạo nhắc việc hàng ngày.
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
          {CARE_TASK_TYPES.map((typeKey) => {
            const meta = CARE_TASK_META[typeKey];
            const selected = taskType === typeKey;
            return (
              <Pressable
                key={typeKey}
                accessibilityRole="button"
                accessibilityLabel={`Chọn công việc ${meta.label}`}
                onPress={() => setTaskType(typeKey)}
                style={[sc.taskChip, selected && sc.taskChipSelected]}>
                <Text style={sc.taskChipEmoji}>{meta.emoji}</Text>
                <Text style={[sc.taskChipText, selected && sc.taskChipTextSelected]}>{meta.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── PHẦN 3: Thời gian ── */}
        <Text style={sc.sectionLabel}>3. Thời gian bắt đầu, kết thúc & Giờ nhắc</Text>
        <View style={sc.timeRow}>
          <TextInput
            value={startDate}
            onChangeText={setStartDate}
            placeholder="Bắt đầu (DD/MM/YYYY)"
            placeholderTextColor={C.mutedText}
            style={[sc.timeInput, { flex: 1 }]}
          />
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="Giờ (vd: 08:00)"
            placeholderTextColor={C.mutedText}
            style={[sc.timeInput, { flex: 1 }]}
          />
        </View>
        <TextInput
          value={endDate}
          onChangeText={setEndDate}
          placeholder="Ngày kết thúc (tùy chọn, DD/MM/YYYY — để trống nếu lặp vô thời hạn)"
          placeholderTextColor={C.mutedText}
          style={sc.searchInput}
        />

        {/* ── PHẦN 4: Chu kỳ lặp lại ── */}
        <Text style={sc.sectionLabel}>4. Chu kỳ lặp lại</Text>
        <View style={sc.repeatGrid}>
          {([
            { key: 'daily', label: 'Mỗi ngày' },
            { key: 'alternate', label: 'Cách ngày' },
            { key: 'weekly', label: 'Theo thứ trong tuần' },
            { key: 'custom', label: 'Tùy chỉnh số ngày' },
          ] as { key: RepeatOption; label: string }[]).map((opt) => (
            <Pressable
              key={opt.key}
              accessibilityRole="button"
              accessibilityLabel={`Chu kỳ ${opt.label}`}
              onPress={() => setRepeatOption(opt.key)}
              style={[sc.repeatChip, repeatOption === opt.key && sc.repeatChipSelected]}>
              <Text style={[sc.repeatChipText, repeatOption === opt.key && sc.repeatChipTextSelected]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Bộ chọn các thứ trong tuần (WEEKLY) */}
        {repeatOption === 'weekly' ? (
          <View style={sc.repeatDetailCard}>
            <View style={sc.repeatDetailHeader}>
              <Text style={sc.repeatDetailTitle}>Chọn các ngày lặp trong tuần</Text>
              <Text style={sc.repeatDetailHint}>Đã chọn {daysOfWeek.length} ngày</Text>
            </View>
            <View style={sc.weekDayPickerRow}>
              {WEEK_DAY_CHOICES.map((d) => {
                const active = daysOfWeek.includes(d.isoDay);
                return (
                  <Pressable
                    key={d.isoDay}
                    accessibilityRole="button"
                    accessibilityLabel={d.full}
                    accessibilityState={{ selected: active }}
                    onPress={() => toggleWeekDay(d.isoDay)}
                    style={[sc.weekDayChip, active && sc.weekDayChipActive]}>
                    <Text style={[sc.weekDayChipText, active && sc.weekDayChipTextActive]}>{d.short}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={sc.repeatDetailSub}>
              Lặp lại vào: {daysOfWeek.map((d) => WEEK_DAY_CHOICES.find((c) => c.isoDay === d)?.full).join(', ')}
            </Text>
          </View>
        ) : null}

        {/* Bộ nhập số ngày tùy chỉnh (DAILY_INTERVAL) */}
        {repeatOption === 'custom' ? (
          <View style={sc.repeatDetailCard}>
            <Text style={sc.repeatDetailTitle}>Khoảng cách giữa các lần thực hiện</Text>
            <View style={sc.customIntervalRow}>
              <Text style={sc.customIntervalLabel}>Lặp lại mỗi</Text>
              <TextInput
                value={customDays}
                onChangeText={(text) => setCustomDays(text.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
                style={sc.customIntervalInput}
              />
              <Text style={sc.customIntervalLabel}>ngày một lần (1 – 365 ngày)</Text>
            </View>
          </View>
        ) : null}

        {/* ── PHẦN 5: Tiêu đề & Ghi chú ── */}
        <Text style={sc.sectionLabel}>5. Tiêu đề lịch (tùy chọn)</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Ví dụ: Tưới đẫm gốc buổi sáng"
          placeholderTextColor={C.mutedText}
          style={sc.searchInput}
        />

        <Text style={sc.sectionLabel}>6. Ghi chú chăm sóc (tùy chọn)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Ví dụ: Tưới đẫm gốc vào sáng sớm, tránh nước đọng lá..."
          placeholderTextColor={C.mutedText}
          style={[sc.searchInput, { minHeight: 74, textAlignVertical: 'top', paddingTop: 10 }]}
        />

        {errorMsg ? <Text style={sc.errorText}>⚠️ {errorMsg}</Text> : null}

        {/* ── Nút xác nhận ── */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isEditing ? 'Lưu thay đổi lịch chăm sóc' : 'Xác nhận tạo lịch chăm sóc'}
          disabled={saving}
          onPress={() => void handleSave()}
          style={[sc.submitBtn, saving && sc.btnDisabled]}>
          <Text style={sc.submitBtnText}>
            {saving ? 'Đang lưu lịch...' : isEditing ? '✓  Lưu thay đổi lịch' : '✓  Xác nhận tạo lịch chăm sóc'}
          </Text>
        </Pressable>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── ScheduleDetailScreen ─────────────────────────────────────────────────────

export function ScheduleDetailScreen({ scheduleId }: { scheduleId?: string }) {
  const { schedules, loadCalendar, completeTask, skipTask, removeSchedule } = useCareSchedules();
  const [weekOffset, setWeekOffset] = useState(0);
  const { dates: weekDates } = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);
  const todayIso = toLocalIsoDate();
  const [selectedIso, setSelectedIso] = useState(todayIso);
  const [calendarTasks, setCalendarTasks] = useState<ApiCareTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const entry = scheduleId ? schedules.find((s) => s.id === scheduleId) : schedules[0];

  const fetchWeekTasks = useCallback(async () => {
    if (!entry) return;
    setLoadingTasks(true);
    try {
      const from = toLocalIsoDate(weekDates[0]);
      const to = toLocalIsoDate(weekDates[6]);
      const view = await loadCalendar(from, to, { scheduleId: entry.id });
      setCalendarTasks(view.tasks);
    } catch {
      setCalendarTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [entry, weekDates, loadCalendar]);

  useEffect(() => {
    void fetchWeekTasks();
  }, [fetchWeekTasks]);

  useEffect(() => {
    const inWeek = weekDates.some((d) => toLocalIsoDate(d) === selectedIso);
    if (!inWeek) setSelectedIso(toLocalIsoDate(weekDates[0]));
  }, [weekDates, selectedIso]);

  const tasksForDay = calendarTasks.filter((t) => t.dueDate === selectedIso);

  const handleAction = async (taskId: string, action: 'complete' | 'skip') => {
    setBusyTaskId(taskId);
    try {
      if (action === 'complete') await completeTask(taskId);
      else await skipTask(taskId);
      await fetchWeekTasks();
    } catch (err) {
      Alert.alert('Không thể cập nhật', err instanceof Error ? err.message : 'Vui lòng thử lại.');
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleDeleteSchedule = () => {
    if (!entry) return;
    Alert.alert(
      'Hủy lịch chăm sóc',
      'Lịch định kỳ và các công việc chưa thực hiện sẽ bị xóa. Lịch sử đã hoàn thành vẫn được giữ lại.',
      [
        { text: 'Giữ lại', style: 'cancel' },
        {
          text: 'Hủy lịch',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeSchedule(entry.id);
              safeBack('/schedule');
            } catch (err) {
              Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể hủy lịch.');
            }
          },
        },
      ],
    );
  };

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

  const meta = CARE_TASK_META[entry.taskType] ?? CARE_TASK_META.other;
  const monthLabel = weekDates[0].toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

  const taskBadge = (task: ApiCareTask) => {
    if (task.status === 'completed') return { label: 'Đã hoàn thành', bg: '#D1FAE5', fg: '#1E4B38' };
    if (task.status === 'skipped') return { label: 'Đã bỏ qua', bg: '#E5E7EB', fg: '#4B5563' };
    if (task.overdue) return { label: 'Quá hạn', bg: '#FEE2E2', fg: '#C53030' };
    if (task.dueDate === todayIso) return { label: 'Đến hạn hôm nay', bg: '#FEF3C7', fg: '#B45309' };
    return { label: 'Sắp tới', bg: '#E0F2FE', fg: '#0369A1' };
  };

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
            <Text style={sc.plantHeroCat}>{entry.plantScientificName}</Text>
            <View style={sc.plantHeroBadge}>
              <Text style={sc.plantHeroBadgeText}>{meta.label}</Text>
            </View>
          </View>
        </View>

        {/* ── Thanh chọn tuần ── */}
        <View style={sc.monthRow}>
          <Pressable onPress={() => setWeekOffset((w) => w - 1)} style={sc.weekArrowBtn}>
            <Text style={sc.monthArrow}>‹</Text>
          </Pressable>
          <Text style={sc.monthLabel}>Tháng {monthLabel}</Text>
          <Pressable onPress={() => setWeekOffset((w) => w + 1)} style={sc.weekArrowBtn}>
            <Text style={sc.monthArrow}>›</Text>
          </Pressable>
        </View>

        {/* ── Lịch tuần ── */}
        <View style={sc.weekStrip}>
          {weekDates.map((d, i) => {
            const iso = toLocalIsoDate(d);
            const active = selectedIso === iso;
            const isToday = iso === todayIso;
            const hasTask = calendarTasks.some((t) => t.dueDate === iso);
            return (
              <Pressable
                key={iso}
                accessibilityRole="button"
                accessibilityLabel={`Ngày ${d.getDate()}`}
                onPress={() => setSelectedIso(iso)}
                style={[sc.dayCell, active && sc.dayCellActive]}>
                <Text style={[sc.dayLabel, active && sc.dayLabelActive]}>{WEEK_DAYS[i]}</Text>
                <Text style={[sc.dayDate, active && sc.dayDateActive]}>{d.getDate()}</Text>
                <View style={sc.dayDotRow}>
                  {isToday ? <View style={[sc.todayDot, active && sc.todayDotActive]} /> : null}
                  {hasTask && !isToday ? <View style={[sc.taskDot, active && sc.todayDotActive]} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* ── Tóm tắt ngày ── */}
        <View style={sc.summaryCard}>
          <Text style={sc.summaryTitle}>Ngày {formatDateVi(selectedIso)}</Text>
          <Text style={sc.summaryBody}>
            {tasksForDay.length > 0
              ? `${tasksForDay.length} lượt chăm sóc được lên lịch`
              : 'Không có lịch chăm sóc vào ngày này'}
          </Text>
        </View>

        {/* ── Danh sách công việc ngày đã chọn ── */}
        <View style={sc.sectionHeader}>
          <Text style={sc.sectionTitle}>Chi tiết công việc</Text>
          {loadingTasks ? <ActivityIndicator size="small" color={C.primary} /> : null}
        </View>

        {tasksForDay.length === 0 ? (
          <View style={sc.emptyDayCard}>
            <Text style={sc.hintText}>Ngày này không có lượt thực hiện theo chu kỳ đã cài.</Text>
          </View>
        ) : (
          tasksForDay.map((task) => {
            const badge = taskBadge(task);
            const busy = busyTaskId === task.id;
            const canComplete = task.status === 'pending' && task.dueDate <= todayIso;
            const canSkip = task.status === 'pending';
            return (
              <View key={task.id} style={[sc.timelineCard, task.overdue && sc.timelineCardUrgent]}>
                <View style={sc.timelineTop}>
                  <Text style={sc.timelineTime}>{formatTimeShort(entry.timeOfDay)}</Text>
                  <View style={[sc.statusBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[sc.statusText, { color: badge.fg }]}>{badge.label}</Text>
                  </View>
                </View>
                <Text style={sc.timelineTitle}>{meta.emoji} {meta.label}</Text>
                <Text style={sc.timelineDesc}>
                  {task.note || entry.note || `Thực hiện ${meta.label.toLocaleLowerCase()} cho ${entry.plantName}.`}
                </Text>
                {canSkip ? (
                  <View style={sc.taskActions}>
                    {canComplete ? (
                      <Pressable
                        disabled={busy}
                        onPress={() => void handleAction(task.id, 'complete')}
                        style={[sc.actionDoneBtn, busy && sc.btnDisabled]}>
                        <Text style={sc.actionDoneText}>{busy ? 'Đang lưu...' : '✓ Hoàn thành'}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      disabled={busy}
                      onPress={() => void handleAction(task.id, 'skip')}
                      style={[sc.actionSkipBtn, busy && sc.btnDisabled]}>
                      <Text style={sc.actionSkipText}>Bỏ qua</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        {/* ── Thông tin chu kỳ ── */}
        <View style={sc.repeatInfoCard}>
          <Text style={sc.repeatInfoLabel}>🔄 Chu kỳ lặp lại</Text>
          <Text style={sc.repeatInfoValue}>{formatScheduleRepeat(entry)}</Text>
        </View>
        <View style={sc.repeatInfoCard}>
          <Text style={sc.repeatInfoLabel}>⏰ Giờ nhắc & Múi giờ</Text>
          <Text style={sc.repeatInfoValue}>{formatTimeShort(entry.timeOfDay)} · {entry.timezone}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/schedule/create', params: { scheduleId: entry.id } } as never)}
          style={sc.editBtn}>
          <Text style={sc.editBtnText}>Chỉnh sửa lịch</Text>
        </Pressable>

        <Pressable onPress={handleDeleteSchedule} style={sc.deleteBtn}>
          <Text style={sc.deleteBtnText}>Hủy lịch chăm sóc này</Text>
        </Pressable>

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

  header: { height: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDE8E0' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: C.forest, fontSize: 30, lineHeight: 34 },
  headerTitle: { flex: 1, color: C.forest, fontFamily: F.semiBold, fontSize: 15, textAlign: 'center', marginHorizontal: 4 },
  createBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.primary },
  createBtnText: { color: '#FFFFFF', fontFamily: F.semiBold, fontSize: 11 },

  introBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, backgroundColor: '#D9F2E3' },
  introLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  introIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(2,52,35,0.12)', alignItems: 'center', justifyContent: 'center' },
  introIcon: { fontSize: 22 },
  introCopy: { flex: 1, gap: 2 },
  introTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  introSub: { color: '#3B6752', fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  introCta: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.primary, marginLeft: 8 },
  introCtaText: { color: '#FFFFFF', fontFamily: F.semiBold, fontSize: 12 },

  weekMetricCard: { padding: 14, borderRadius: 14, backgroundColor: C.surface, gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 1 },
  weekMetricRow: { flexDirection: 'row', alignItems: 'center' },
  weekMetricItem: { flex: 1, alignItems: 'center', gap: 2 },
  weekMetricDivider: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: '#DDE8E0' },
  weekMetricValue: { color: C.forest, fontFamily: F.bold, fontSize: 20, lineHeight: 26 },
  weekMetricLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 9, textAlign: 'center', lineHeight: 13 },
  progressBg: { height: 6, borderRadius: 3, backgroundColor: '#E5F2EA', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: C.primary },
  progressFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressNote: { color: C.mutedText, fontFamily: F.regular, fontSize: 10 },
  refreshText: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },

  todayBlock: { gap: 8 },
  todayTaskCard: { flexDirection: 'row', padding: 12, borderRadius: 14, backgroundColor: C.surface, gap: 10, borderLeftWidth: 3, borderLeftColor: C.primary },
  todayTaskOverdue: { borderLeftColor: '#E53E3E', backgroundColor: '#FFF9F9' },
  taskIconBox: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  taskIconEmoji: { fontSize: 20 },
  taskCopy: { flex: 1, gap: 4 },
  taskTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  taskTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 13, flex: 1 },
  taskTime: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
  overduePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, backgroundColor: '#FEE2E2' },
  overduePillText: { color: '#C53030', fontFamily: F.semiBold, fontSize: 9 },
  taskPlant: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12 },
  taskActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionDoneBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: C.primary },
  actionDoneText: { color: '#FFFFFF', fontFamily: F.semiBold, fontSize: 11 },
  actionSkipBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: C.softSurface },
  actionSkipText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 11 },
  btnDisabled: { opacity: 0.55 },

  filterRow: { gap: 8, paddingVertical: 2 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: '#E7EEE8' },
  filterTabActive: { backgroundColor: C.forest },
  filterTabText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12 },
  filterTabTextActive: { color: '#FFFFFF', fontFamily: F.semiBold },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  sectionHint: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },

  scheduleCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: C.surface, gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 1 },
  scheduleCardIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scheduleCardEmoji: { fontSize: 22 },
  scheduleCardBody: { flex: 1, gap: 3 },
  scheduleCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleCardTask: { color: C.text, fontFamily: F.semiBold, fontSize: 14, flex: 1 },
  scheduleCardBadge: { maxWidth: '54%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: '#D5F2E1' },
  scheduleCardBadgeText: { color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  scheduleCardPlant: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12 },
  scheduleCardTime: { color: C.mutedText, fontFamily: F.regular, fontSize: 11 },
  scheduleCardArrow: { color: C.mutedText, fontSize: 24, lineHeight: 28 },

  loadingWrap: { padding: 24, alignItems: 'center', gap: 8 },
  emptyCard: { padding: 24, borderRadius: 16, backgroundColor: C.surface, alignItems: 'center', gap: 10 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E3F2E8', alignItems: 'center', justifyContent: 'center' },
  emptyIconGlyph: { fontSize: 28 },
  emptyTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 15, textAlign: 'center' },
  emptyDesc: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  emptyBtn: { minHeight: 42, paddingHorizontal: 18, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { color: '#FFFFFF', fontFamily: F.semiBold, fontSize: 13 },
  centeredEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  tipCard: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, gap: 4 },
  tipTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  tipBody: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
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

  // Weekly / Custom repeat card
  repeatDetailCard: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#D0E2D6' },
  repeatDetailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  repeatDetailTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  repeatDetailHint: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
  repeatDetailSub: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  weekDayPickerRow: { flexDirection: 'row', gap: 6 },
  weekDayChip: { flex: 1, minHeight: 40, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#D0E2D6' },
  weekDayChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  weekDayChipText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 12 },
  weekDayChipTextActive: { color: '#FFFFFF' },
  customIntervalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customIntervalLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12 },
  customIntervalInput: { minWidth: 56, minHeight: 38, paddingHorizontal: 10, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: '#C9DDD0', textAlign: 'center', fontFamily: F.bold, fontSize: 14, color: C.forest },

  errorText: { color: '#E53E3E', fontFamily: F.regular, fontSize: 12, textAlign: 'center' },
  submitBtn: { minHeight: 48, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitBtnText: { color: '#FFFFFF', fontFamily: F.semiBold, fontSize: 14 },

  plantHeroCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, backgroundColor: C.surface, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 1 },
  plantHeroIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  plantHeroEmoji: { fontSize: 26 },
  plantHeroCopy: { flex: 1, gap: 4 },
  plantHeroName: { color: C.forest, fontFamily: F.semiBold, fontSize: 16 },
  plantHeroCat: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, fontStyle: 'italic' },
  plantHeroBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: '#D5F2E1' },
  plantHeroBadgeText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  weekArrowBtn: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  monthArrow: { color: C.forest, fontSize: 20 },
  monthLabel: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  weekStrip: { flexDirection: 'row', gap: 4 },
  dayCell: { flex: 1, minHeight: 60, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, gap: 2, paddingVertical: 6 },
  dayCellActive: { backgroundColor: C.primary },
  dayLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 },
  dayLabelActive: { color: '#FFFFFF', fontFamily: F.semiBold },
  dayDate: { color: C.text, fontFamily: F.semiBold, fontSize: 14 },
  dayDateActive: { color: '#FFFFFF' },
  dayDotRow: { height: 6, justifyContent: 'center', alignItems: 'center' },
  todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.primary },
  taskDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#75C99A' },
  todayDotActive: { backgroundColor: '#FFFFFF' },
  summaryCard: { padding: 12, borderRadius: 12, backgroundColor: '#D5F2E1', gap: 3 },
  summaryTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  summaryBody: { color: '#3B6752', fontFamily: F.regular, fontSize: 12 },
  emptyDayCard: { padding: 18, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center' },
  timelineCard: { padding: 12, borderRadius: 12, backgroundColor: C.surface, gap: 6, borderLeftWidth: 3, borderLeftColor: C.primary },
  timelineCardUrgent: { borderLeftColor: '#E53E3E' },
  timelineTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timelineTime: { color: C.primary, fontFamily: F.bold, fontSize: 13 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  statusText: { fontFamily: F.semiBold, fontSize: 10 },
  timelineTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 14 },
  timelineDesc: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
  repeatInfoCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, backgroundColor: C.softSurface },
  repeatInfoLabel: { color: C.text, fontFamily: F.semiBold, fontSize: 13 },
  repeatInfoValue: { color: C.primary, fontFamily: F.semiBold, fontSize: 12 },
  editBtn: { minHeight: 44, borderRadius: 10, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  editBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  deleteBtn: { minHeight: 44, borderRadius: 10, backgroundColor: '#FBDCD7', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  deleteBtnText: { color: '#B42318', fontFamily: F.semiBold, fontSize: 13 },
  modeSwitch: { flexDirection: 'row', padding: 4, borderRadius: 10, backgroundColor: '#E6EEE8', gap: 4 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modeBtnActive: { backgroundColor: C.primary },
  modeText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12 },
  modeTextActive: { color: '#FFFFFF', fontFamily: F.semiBold },
  modalBackdrop: { flex: 1, padding: 18, backgroundColor: 'rgba(35, 42, 38, 0.45)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: '100%', maxWidth: 400, padding: 16, borderRadius: 16, backgroundColor: C.surface, gap: 10 },
  dueNowPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: '#FEF3C7' },
  dueNowPillText: { color: '#B45309', fontFamily: F.semiBold, fontSize: 10 },
  upcomingPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: C.softSurface },
  upcomingPillText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10 },
});
