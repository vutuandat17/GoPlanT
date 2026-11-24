import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from '@/components/app-primitives';
import { router } from 'expo-router';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/AuthSession';
import { JOURNAL_HEALTH_META, JOURNAL_LOG_TYPE_META, useJournals } from '@/features/journal/JournalStore';
import { PlantArtwork } from '@/features/plants/PlantArtwork';
import { resolvePlantPhotoUri, usePlantData, type GardenProfile, type OwnedPlant } from '@/features/plants/PlantDataStore';
import { matchesPlantFilters, toOwnedFilterPlant } from '@/features/plants/plantFilters';
import { CARE_TASK_META, formatDateVi, useCareSchedules } from '@/features/schedule/CareScheduleStore';
import {
  apiBaseUrl,
  fetchGardenWeather,
  toLocalIsoDate,
  type ApiCareTask,
  type ApiGardenWeather,
  type ApiJournalEntry,
  type PlantTemperatureAlert,
} from '@/services/api';

type Props = {
  filteredGardens: GardenProfile[];
  pageFilters: Record<string, string[]>;
  onOpenFilter: () => void;
};

type WeatherAlertBannerItem = PlantTemperatureAlert & {
  gardenId: string;
  gardenName: string;
  placeLabel: string;
  temperatureC: number | null;
};

function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + deltaDays);
  return toLocalIsoDate(date);
}

export function MonitoringDashboard({ filteredGardens, pageFilters, onOpenFilter }: Props) {
  const { accessToken } = useAuthSession();
  const { ownedPlants, gardens, catalog } = usePlantData();
  const { journals } = useJournals();
  const { todayTasks, schedules, loadCalendar } = useCareSchedules();

  const [calendarTasks30d, setCalendarTasks30d] = useState<ApiCareTask[]>([]);
  const [weatherByGarden, setWeatherByGarden] = useState<Record<string, ApiGardenWeather>>({});

  const todayIso = toLocalIsoDate();
  const thirtyDaysAgoIso = useMemo(() => addDaysIso(todayIso, -29), [todayIso]);
  const locatedGardenIdsKey = useMemo(
    () =>
      gardens
        .filter((g) => Boolean(g.locationSource) || (g.latitude != null && g.longitude != null))
        .map((g) => g.id)
        .join(','),
    [gardens],
  );

  useEffect(() => {
    if (!accessToken) {
      setCalendarTasks30d([]);
      return;
    }
    let active = true;
    void loadCalendar(thirtyDaysAgoIso, todayIso)
      .then((view) => {
        if (active) setCalendarTasks30d(view.tasks ?? []);
      })
      .catch(() => {
        if (active) setCalendarTasks30d([]);
      });
    return () => {
      active = false;
    };
  }, [accessToken, loadCalendar, thirtyDaysAgoIso, todayIso, todayTasks]);

  useEffect(() => {
    if (!accessToken || !locatedGardenIdsKey) {
      setWeatherByGarden({});
      return;
    }
    const ids = locatedGardenIdsKey.split(',').filter(Boolean);
    let active = true;
    void Promise.allSettled(ids.map((id) => fetchGardenWeather(id, accessToken))).then((results) => {
      if (!active) return;
      const next: Record<string, ApiGardenWeather> = {};
      results.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          next[ids[idx]] = res.value;
        }
      });
      setWeatherByGarden(next);
    });
    return () => {
      active = false;
    };
  }, [accessToken, locatedGardenIdsKey]);

  const filteredPlants = useMemo(
    () => ownedPlants.filter((plant) => matchesPlantFilters(toOwnedFilterPlant(plant, journals, todayTasks, schedules), pageFilters)),
    [ownedPlants, journals, todayTasks, schedules, pageFilters],
  );

  // Latest journal per owned plant (journals from API are ordered newest-first, sort defensively by entryDate/createdAt).
  const latestJournalByPlant = useMemo(() => {
    const map = new Map<string, ApiJournalEntry>();
    const sorted = [...journals].sort((a, b) => {
      const dateCmp = b.entryDate.localeCompare(a.entryDate);
      return dateCmp !== 0 ? dateCmp : b.createdAt.localeCompare(a.createdAt);
    });
    for (const entry of sorted) {
      if (!map.has(entry.plantId)) {
        map.set(entry.plantId, entry);
      }
    }
    return map;
  }, [journals]);

  // Overdue pending care tasks per owned plant.
  const overdueTasksByPlant = useMemo(() => {
    const map = new Map<string, ApiCareTask[]>();
    for (const task of todayTasks) {
      const isOverdue = task.status === 'pending' && (task.overdue || task.dueDate < todayIso);
      if (!isOverdue) continue;
      const existing = map.get(task.plantId) ?? [];
      existing.push(task);
      map.set(task.plantId, existing);
    }
    return map;
  }, [todayTasks, todayIso]);

  // Weather alerts across all located gardens.
  const weatherAlerts = useMemo<WeatherAlertBannerItem[]>(() => {
    const items: WeatherAlertBannerItem[] = [];
    for (const garden of gardens) {
      const w = weatherByGarden[garden.id];
      if (!w || w.status === 'NO_LOCATION' || !w.plantAlerts.length) continue;
      const placeLabel = w.provinceName || w.locationName || garden.name;
      for (const alert of w.plantAlerts) {
        items.push({
          ...alert,
          gardenId: garden.id,
          gardenName: garden.name,
          placeLabel,
          temperatureC: w.temperatureC,
        });
      }
    }
    return items;
  }, [gardens, weatherByGarden]);

  const weatherAlertPlantIds = useMemo(
    () => new Set(weatherAlerts.map((a) => a.plantId)),
    [weatherAlerts],
  );

  // Classify every owned plant into Attention vs Stable, plus compute the 4 dashboard metrics.
  const intelligence = useMemo(() => {
    const totalPlants = ownedPlants.length;
    let healthyCount = 0;
    let attentionCount = 0;

    const attentionPlants: Array<{ plant: OwnedPlant; reasons: string[]; latest?: ApiJournalEntry }> = [];
    const stablePlants: Array<{ plant: OwnedPlant; latest?: ApiJournalEntry }> = [];

    const classify = (plant: OwnedPlant) => {
      const latest = latestJournalByPlant.get(plant.id);
      const overdue = overdueTasksByPlant.get(plant.id) ?? [];
      const hasHealthIssue = latest?.healthStatus === 'warning' || latest?.healthStatus === 'critical';
      const hasTempAlert = weatherAlertPlantIds.has(plant.id);

      const reasons: string[] = [];
      if (latest?.healthStatus === 'critical') reasons.push('Sức khỏe: Cần can thiệp');
      else if (latest?.healthStatus === 'warning') reasons.push('Sức khỏe: Cần theo dõi');
      if (overdue.length > 0) {
        const firstTaskLabel = CARE_TASK_META[overdue[0].taskType]?.label ?? 'Chăm sóc';
        reasons.push(overdue.length === 1 ? `Trễ hạn: ${firstTaskLabel}` : `Trễ ${overdue.length} việc chăm sóc`);
      }
      if (hasTempAlert) reasons.push('Nhiệt độ vượt ngưỡng');

      return { latest, hasHealthIssue, needsAttention: hasHealthIssue || overdue.length > 0 || hasTempAlert, reasons };
    };

    for (const plant of ownedPlants) {
      const { hasHealthIssue, needsAttention } = classify(plant);
      if (!hasHealthIssue) healthyCount += 1;
      if (needsAttention) attentionCount += 1;
    }

    for (const plant of filteredPlants) {
      const { latest, needsAttention, reasons } = classify(plant);
      if (needsAttention) attentionPlants.push({ plant, reasons, latest });
      else stablePlants.push({ plant, latest });
    }

    const healthyPct = totalPlants > 0 ? Math.round((healthyCount / totalPlants) * 100) : null;

    // Eco Care Score (0 - 100):
    // 70 pts from 30-day care task completion rate (completed / active tasks; neutral 70% of 70 if no tasks scheduled yet)
    // 30 pts from 30-day journal logging frequency relative to plant count
    const relevantTasks30d = calendarTasks30d.filter((t) => t.status === 'completed' || t.status === 'pending');
    const completedTasks30d = relevantTasks30d.filter((t) => t.status === 'completed').length;
    const recentJournals30d = journals.filter((j) => j.entryDate >= thirtyDaysAgoIso);

    let ecoScore: number | null = null;
    if (totalPlants > 0) {
      const taskRatio = relevantTasks30d.length > 0 ? completedTasks30d / relevantTasks30d.length : 0.7;
      const taskPoints = taskRatio * 70;
      const journalTarget = Math.max(totalPlants * 2, 4);
      const journalPoints = Math.min(1, recentJournals30d.length / journalTarget) * 30;
      ecoScore = Math.round(taskPoints + journalPoints);
    }

    return {
      totalPlants,
      healthyPct,
      attentionCount,
      ecoScore,
      completedTasks30d,
      totalTasks30d: relevantTasks30d.length,
      recentJournalsCount: recentJournals30d.length,
      attentionPlants,
      stablePlants,
    };
  }, [
    ownedPlants,
    filteredPlants,
    latestJournalByPlant,
    overdueTasksByPlant,
    weatherAlertPlantIds,
    calendarTasks30d,
    journals,
    thirtyDaysAgoIso,
  ]);

  const locatedWeatherList = useMemo(
    () =>
      gardens
        .map((g) => ({ garden: g, weather: weatherByGarden[g.id] }))
        .filter((item) => item.weather && item.weather.temperatureC != null),
    [gardens, weatherByGarden],
  );

  const ecoLabel =
    intelligence.ecoScore == null
      ? 'Chưa có dữ liệu đánh giá'
      : intelligence.ecoScore >= 85
        ? 'Khu vườn đang được chăm sóc rất tốt'
        : intelligence.ecoScore >= 60
          ? 'Nhịp chăm sóc ổn định'
          : 'Cần tăng cường chăm sóc & ghi nhật ký';

  const recentJournals = useMemo(() => journals.slice(0, 5), [journals]);

  return (
    <>
      <View style={s.managementActions}>
        <ActionChip label="Lọc cây theo dõi" onPress={onOpenFilter} />
        <ActionChip label="＋ Ghi nhật ký" primary onPress={() => router.push('/journal/new' as never)} />
      </View>

      {/* Cảnh báo thời tiết khu vườn (từ OpenWeatherMap + temperature_range) */}
      {weatherAlerts.length > 0 ? (
        <View style={s.weatherAlertCard}>
          <Text style={s.weatherAlertTitle}>⚠ Cảnh báo thời tiết khu vườn ({weatherAlerts.length})</Text>
          {weatherAlerts.slice(0, 3).map((alert) => (
            <Pressable
              key={`${alert.gardenId}-${alert.plantId}`}
              onPress={() => router.push({ pathname: '/garden-detail', params: { gardenId: alert.gardenId } } as never)}
              style={s.weatherAlertRow}>
              <Text style={s.weatherAlertText}>
                {alert.placeLabel} đang {alert.temperatureC != null ? `${Math.round(alert.temperatureC)}°C` : 'biến động'} —{' '}
                {alert.level === 'too_hot' ? 'Cảnh báo sốc nhiệt' : 'Cảnh báo nhiệt độ thấp'} cho{' '}
                <Text style={s.bold}>{alert.displayName}</Text> ({alert.temperatureRange})
              </Text>
            </Pressable>
          ))}
        </View>
      ) : locatedWeatherList.length > 0 ? (
        <View style={s.weatherOkCard}>
          <Text style={s.weatherOkTitle}>☀ Môi trường ngoài trời hiện tại</Text>
          <Text style={s.weatherOkBody}>
            {locatedWeatherList
              .slice(0, 2)
              .map(
                ({ garden, weather }) =>
                  `${weather.provinceName || garden.name}: ${Math.round(weather.temperatureC!)}°C, ẩm ${weather.humidityPct ?? '—'}%`,
              )
              .join('  •  ')}
          </Text>
        </View>
      ) : null}

      {/* 4 chỉ số thực tế */}
      <View style={s.metrics}>
        <View style={s.metric}>
          <Text style={s.metricValue}>{intelligence.totalPlants}</Text>
          <Text style={s.metricLabel}>Cây theo dõi</Text>
        </View>
        <View style={s.metric}>
          <Text style={s.metricValue}>{intelligence.healthyPct != null ? `${intelligence.healthyPct}%` : '—'}</Text>
          <Text style={s.metricLabel}>Khỏe mạnh</Text>
        </View>
        <View style={[s.metric, intelligence.attentionCount > 0 && s.metricAlert]}>
          <Text style={[s.metricValue, intelligence.attentionCount > 0 && s.metricAlertValue]}>
            {intelligence.attentionCount}
          </Text>
          <Text style={s.metricLabel}>Cần xử lý</Text>
        </View>
        <View style={s.metric}>
          <Text style={s.metricValue}>{intelligence.ecoScore ?? '—'}</Text>
          <Text style={s.metricLabel}>Điểm Eco</Text>
        </View>
      </View>

      {/* Thẻ Eco Care Score */}
      <View style={s.eco}>
        <Text style={s.ecoScore}>{intelligence.ecoScore ?? '—'}</Text>
        <View style={s.cardCopy}>
          <Text style={s.cardTitle}>{ecoLabel}</Text>
          <Text style={s.body}>
            {intelligence.totalPlants === 0
              ? 'Thêm vườn và cây để bắt đầu chấm điểm chăm sóc.'
              : `30 ngày qua: hoàn thành ${intelligence.completedTasks30d}/${intelligence.totalTasks30d} việc • ${intelligence.recentJournalsCount} ghi nhận nhật ký`}
          </Text>
        </View>
      </View>

      {/* Nhóm 1: Cây cần chú ý hôm nay (Terracotta / Error) */}
      <Section title="Cây cần chú ý hôm nay" hint={`${intelligence.attentionPlants.length} cây`}>
        {intelligence.attentionPlants.length === 0 ? (
          <View style={s.mintEmptyBox}>
            <Text style={s.mintEmptyText}>Tuyệt vời! Hiện chưa có cây nào bị bệnh hay trễ lịch chăm sóc.</Text>
          </View>
        ) : (
          intelligence.attentionPlants.map(({ plant, reasons }) => (
            <Pressable
              key={plant.id}
              onPress={() =>
                router.push({ pathname: '/monitoring/detail', params: { type: 'plant', plantId: plant.id, name: plant.name } } as never)
              }
              style={s.attentionCard}>
              <PlantArtwork
                style={s.plantImage}
                category={plant.category}
                accessToken={accessToken}
                photoUri={resolvePlantPhotoUri(plant, catalog)}
              />
              <View style={s.cardCopy}>
                <Text style={s.attentionTitle}>{plant.name}</Text>
                <Text style={s.attentionReason} numberOfLines={2}>
                  {reasons.join(' • ')}
                </Text>
              </View>
              <Text style={s.attentionBadge}>Xử lý ›</Text>
            </Pressable>
          ))
        )}
      </Section>

      {/* Nhóm 2: Cây đang phát triển ổn định (Mint Leaf) */}
      <Section title="Cây đang phát triển ổn định" hint={`${intelligence.stablePlants.length} cây`}>
        {intelligence.stablePlants.length === 0 ? (
          ownedPlants.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.cardTitle}>Chưa có cây được theo dõi</Text>
              <Text style={s.body}>Thêm cây để ghi nhận sức khỏe và tiến triển chăm sóc.</Text>
              <ActionChip label="＋ Thêm cây" primary onPress={() => router.push('/garden/add-plant' as never)} />
            </View>
          ) : (
            <Text style={s.body}>Các cây phù hợp bộ lọc hiện đều đang nằm ở nhóm cần chú ý phía trên.</Text>
          )
        ) : (
          intelligence.stablePlants.map(({ plant, latest }) => (
            <Pressable
              key={plant.id}
              onPress={() =>
                router.push({ pathname: '/monitoring/detail', params: { type: 'plant', plantId: plant.id, name: plant.name } } as never)
              }
              style={s.stableCard}>
              <PlantArtwork
                style={s.plantImage}
                category={plant.category}
                accessToken={accessToken}
                photoUri={resolvePlantPhotoUri(plant, catalog)}
              />
              <View style={s.cardCopy}>
                <Text style={s.stableTitle}>{plant.name}</Text>
                <Text style={s.body} numberOfLines={1}>
                  {latest ? `Ghi nhận gần nhất: ${formatDateVi(latest.entryDate)}` : plant.location || 'Đang phát triển ổn định'}
                </Text>
              </View>
              <Text style={s.stableBadge}>Khỏe mạnh</Text>
            </Pressable>
          ))
        )}
      </Section>

      {/* Khu vườn */}
      <Section title="Khu vườn" hint={`${filteredGardens.length} khu vực`}>
        {filteredGardens.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.cardTitle}>{gardens.length ? 'Không có vườn khớp bộ lọc' : 'Chưa có khu vườn'}</Text>
            <Text style={s.body}>Tạo hoặc chọn một khu vườn để mở chi tiết thời tiết & cây trồng.</Text>
            {gardens.length === 0 ? (
              <ActionChip label="Tạo khu vườn" primary onPress={() => router.push('/garden/create' as never)} />
            ) : null}
          </View>
        ) : (
          filteredGardens.map((garden) => {
            const w = weatherByGarden[garden.id];
            const count = ownedPlants.filter((plant) => plant.gardenId === garden.id).length;
            const weatherSummary =
              w && w.temperatureC != null ? ` • ${Math.round(w.temperatureC)}°C (${w.humidityPct ?? '—'}%)` : '';
            return (
              <View key={garden.id} style={s.rowCard}>
                <View style={s.emptyIcon}>
                  <Text style={s.emptyGlyph}>⌂</Text>
                </View>
                <View style={s.cardCopy}>
                  <Text style={s.cardTitle}>{garden.name}</Text>
                  <Text style={s.body}>
                    {count} cây • {garden.provinceName || garden.locationDetail || garden.locationType}
                    {weatherSummary}
                  </Text>
                </View>
                <ActionChip
                  label="Chỉ số"
                  onPress={() =>
                    router.push({ pathname: '/monitoring/detail', params: { type: 'garden', gardenId: garden.id, name: garden.name } } as never)
                  }
                />
              </View>
            );
          })
        )}
      </Section>

      {/* Lịch sử ghi nhận gần đây */}
      <Section title="Lịch sử ghi nhận gần đây" hint={`${recentJournals.length} mục`}>
        {recentJournals.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.cardTitle}>Chưa có ghi nhận</Text>
            <Text style={s.body}>Ghi nhật ký chăm sóc đầu tiên để theo dõi diễn biến sức khỏe cây.</Text>
          </View>
        ) : (
          recentJournals.map((entry) => {
            const healthMeta = JOURNAL_HEALTH_META[entry.healthStatus] ?? JOURNAL_HEALTH_META.healthy;
            const logMeta = JOURNAL_LOG_TYPE_META[entry.logType] ?? JOURNAL_LOG_TYPE_META.other;
            return (
              <Pressable
                key={entry.id}
                onPress={() => router.push({ pathname: '/journal/detail', params: { journalId: entry.id } } as never)}
                style={s.rowCard}>
                <View style={[s.logBadge, { backgroundColor: logMeta.color }]}>
                  <Text style={s.logEmoji}>{logMeta.emoji}</Text>
                </View>
                <View style={s.cardCopy}>
                  <Text style={s.cardTitle} numberOfLines={1}>
                    {entry.plantName} · {logMeta.label}
                  </Text>
                  <Text style={s.body} numberOfLines={1}>
                    {formatDateVi(entry.entryDate)} — {entry.title || entry.note}
                  </Text>
                </View>
                <Text style={[s.healthPill, { backgroundColor: healthMeta.bg, color: healthMeta.fg }]}>
                  {healthMeta.label}
                </Text>
              </Pressable>
            );
          })
        )}
      </Section>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeading}>
        <Text style={s.sectionTitle}>{title}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ActionChip({ label, primary = false, onPress }: { label: string; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.action, primary && s.actionPrimary]}>
      <Text style={[s.actionText, primary && s.actionPrimaryText]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  managementActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: { backgroundColor: C.primary },
  actionText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  actionPrimaryText: { color: C.surface },
  weatherAlertCard: { padding: 12, borderRadius: 14, backgroundColor: C.peach, borderWidth: 1, borderColor: 'rgba(153, 70, 25, 0.25)', gap: 6 },
  weatherAlertTitle: { color: C.terracotta, fontFamily: F.bold, fontSize: 13 },
  weatherAlertRow: { paddingVertical: 2 },
  weatherAlertText: { color: '#7A2F01', fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
  bold: { fontFamily: F.bold },
  weatherOkCard: { padding: 12, borderRadius: 14, backgroundColor: '#E6F5ED', borderWidth: 1, borderColor: 'rgba(30, 75, 56, 0.12)', gap: 4 },
  weatherOkTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  weatherOkBody: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
  metrics: { flexDirection: 'row', gap: 6 },
  metric: { flex: 1, padding: 9, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(30, 75, 56, 0.06)', gap: 2 },
  metricAlert: { backgroundColor: '#FFF5F3', borderColor: 'rgba(186, 26, 26, 0.2)' },
  metricValue: { color: C.forest, fontFamily: F.bold, fontSize: 16 },
  metricAlertValue: { color: '#BA1A1A' },
  metricLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 },
  eco: { padding: 12, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(30, 75, 56, 0.08)', flexDirection: 'row', alignItems: 'center', gap: 10 },
  ecoScore: { width: 46, height: 46, overflow: 'hidden', borderRadius: 23, backgroundColor: C.mint, color: C.forest, fontFamily: F.bold, fontSize: 16, lineHeight: 46, textAlign: 'center' },
  section: { gap: 8 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  hint: { color: C.mutedText, fontFamily: F.regular, fontSize: 10 },
  attentionCard: { padding: 10, borderRadius: 14, backgroundColor: '#F9EFE9', borderWidth: 1, borderColor: 'rgba(153, 70, 25, 0.22)', flexDirection: 'row', alignItems: 'center', gap: 10 },
  attentionTitle: { color: '#7A2F01', fontFamily: F.semiBold, fontSize: 13 },
  attentionReason: { color: C.terracotta, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  attentionBadge: { overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9999, backgroundColor: '#FFDAD6', color: '#93000A', fontFamily: F.semiBold, fontSize: 10 },
  stableCard: { padding: 10, borderRadius: 14, backgroundColor: '#E6F5ED', borderWidth: 1, borderColor: 'rgba(30, 75, 56, 0.12)', flexDirection: 'row', alignItems: 'center', gap: 10 },
  stableTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  stableBadge: { overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9999, backgroundColor: C.mint, color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  mintEmptyBox: { padding: 12, borderRadius: 12, backgroundColor: '#E6F5ED' },
  mintEmptyText: { color: C.forest, fontFamily: F.regular, fontSize: 12 },
  rowCard: { padding: 10, borderRadius: 14, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  plantImage: { width: 46, height: 46, borderRadius: 10 },
  cardCopy: { flex: 1, gap: 2 },
  cardTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  emptyCard: { padding: 14, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 6 },
  emptyIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  emptyGlyph: { color: C.forest, fontSize: 20 },
  logBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  logEmoji: { fontSize: 18 },
  healthPill: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999, fontFamily: F.semiBold, fontSize: 10 },
});
