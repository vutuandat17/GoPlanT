import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { AuthorizedImage } from '@/components/AuthorizedImage';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { safeBack } from '@/services/navigation';
import { AccountButton } from '@/features/auth/AccountButton';
import { useAuthSession } from '@/features/auth/AuthSession';
import { JOURNAL_HEALTH_META, JOURNAL_LOG_TYPE_META, useJournals } from '@/features/journal/JournalStore';
import { GrowthChart } from '@/features/monitoring/GrowthChart';
import { DailyCalendarView } from '@/features/monitoring/DailyCalendarView';
import { PlantArtwork } from '@/features/plants/PlantArtwork';
import { resolvePlantPhotoUri, usePlantData, type PlantProfile } from '@/features/plants/PlantDataStore';
import { pickOrCaptureOptimizedImage } from '@/services/imagePicker';
import { CARE_TASK_META, formatDateVi, formatScheduleRepeat, formatTimeShort, useCareSchedules } from '@/features/schedule/CareScheduleStore';
import {
  apiBaseUrl,
  createPlantGrowthRecord,
  deletePlantGrowthRecord,
  fetchGardenWeather,
  fetchPlantGrowthRecords,
  toLocalIsoDate,
  type ApiCareTask,
  type ApiGardenWeather,
  type ApiGrowthRecord,
  type ApiJournalEntry,
  type BloomStage,
} from '@/services/api';

const BLOOM_STAGE_META: Record<BloomStage, string> = {
  seedling: 'Mầm',
  budding: 'Nụ',
  flowering: 'Hoa',
  fruiting: 'Kết trái',
};
const BLOOM_STAGES: BloomStage[] = ['seedling', 'budding', 'flowering', 'fruiting'];

type TabKey = 'overview' | 'history' | 'care';

function parseTempRange(text?: string): { min: number; max: number } | null {
  if (!text) return null;
  const match = text.match(/(-?\d+(?:[.,]\d+)?)\s*(?:°\s*C?)?\s*(?:–|—|-|~|to|đến|den)\s*(-?\d+(?:[.,]\d+)?)/i);
  if (!match) return null;
  const a = Number(match[1].replace(',', '.'));
  const b = Number(match[2].replace(',', '.'));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

function computePlantAgeText(plantedOn?: string): string {
  if (!plantedOn) return 'Chưa có ngày';
  const match = plantedOn.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return plantedOn;
  const planted = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((today.getTime() - planted.getTime()) / 86400000);
  if (diffDays < 0) return 'Chưa tới ngày trồng';
  if (diffDays === 0) return 'Hôm nay';
  return `${diffDays} ngày tuổi`;
}

type MicroclimateAssessment = {
  text: string;
  level: 'danger' | 'warning' | 'normal' | 'neutral';
};

function buildMicroclimateAssessment(weather: ApiGardenWeather | null, species?: PlantProfile): MicroclimateAssessment {
  if (!weather || weather.temperatureC == null) {
    return {
      text: 'Chưa có dữ liệu thời tiết từ khu vườn để đối chiếu vi khí hậu.',
      level: 'neutral',
    };
  }
  const temp = weather.temperatureC;
  const humidity = weather.humidityPct;
  const range = parseTempRange(species?.temperature);
  const parts: string[] = [];
  let level: MicroclimateAssessment['level'] = 'normal';

  if (range) {
    if (temp > range.max) {
      level = 'danger';
      parts.push(`Cảnh báo cao: Nhiệt độ (${Math.round(temp)}°C) vượt ngưỡng lý tưởng (${species?.temperature}) — nên che nắng và tăng ẩm.`);
    } else if (temp < range.min) {
      level = 'danger';
      parts.push(`Cảnh báo cao: Nhiệt độ (${Math.round(temp)}°C) thấp hơn ngưỡng lý tưởng (${species?.temperature}) — cần giữ ấm cho cây.`);
    } else {
      parts.push(`Bình thường: Nhiệt độ (${Math.round(temp)}°C) nằm trong khoảng sinh trưởng lý tưởng (${species?.temperature}).`);
    }
  } else {
    parts.push(`Nhiệt độ ngoài trời hiện tại là ${Math.round(temp)}°C.`);
  }

  if (humidity != null) {
    if (humidity < 35) {
      level = 'danger';
      parts.push(`Độ ẩm không khí (${humidity}%) quá khô — cần bổ sung ẩm ngay.`);
    } else if (humidity < 45) {
      if (level === 'normal') level = 'warning';
      parts.push(`Độ ẩm không khí (${humidity}%) hơi khô, cân nhắc phun sương nhẹ.`);
    } else if (humidity > 85) {
      level = 'danger';
      parts.push(`Độ ẩm không khí (${humidity}%) quá cao — lưu ý thông thoáng tránh nấm bệnh.`);
    } else {
      parts.push(`Độ ẩm không khí (${humidity}%) phù hợp.`);
    }
  }
  return { text: parts.join(' '), level };
}

export default function MonitoringDetailScreen() {
  const params = useLocalSearchParams<{ type?: string; plantId?: string; gardenId?: string; name?: string; tab?: string }>();
  const { accessToken } = useAuthSession();
  const { ownedPlants, gardens, catalog, updatePlantPhoto } = usePlantData();
  const { journals } = useJournals();
  const { schedules, todayTasks, loadCalendar, completeTask } = useCareSchedules();

  const isGardenMode = Boolean(params.gardenId) || params.type === 'garden';
  const [tab, setTab] = useState<TabKey>(
    params.tab === 'history' || params.tab === 'care' ? params.tab : 'overview',
  );
  const [weather, setWeather] = useState<ApiGardenWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [growthRecords, setGrowthRecords] = useState<ApiGrowthRecord[]>([]);
  const [showGrowthModal, setShowGrowthModal] = useState(false);
  const [recordedDateInput, setRecordedDateInput] = useState(() => toLocalIsoDate());
  const [heightInput, setHeightInput] = useState('');
  const [leafInput, setLeafInput] = useState('');
  const [bloomInput, setBloomInput] = useState<BloomStage | null>(null);
  const [growthNoteInput, setGrowthNoteInput] = useState('');
  const [growthError, setGrowthError] = useState('');
  const [savingGrowth, setSavingGrowth] = useState(false);
  const [uploadingInitialPhoto, setUploadingInitialPhoto] = useState(false);
  const [overviewLogsExpanded, setOverviewLogsExpanded] = useState(true);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [monthCareTasks, setMonthCareTasks] = useState<ApiCareTask[]>([]);
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  const plant = !isGardenMode && params.plantId ? ownedPlants.find((p) => p.id === params.plantId) : undefined;
  const species = plant ? catalog.find((c) => c.id === plant.catalogId) : undefined;
  const targetGardenId = isGardenMode ? params.gardenId : (plant?.gardenId ?? undefined);
  const garden = targetGardenId ? gardens.find((g) => g.id === targetGardenId) : undefined;

  const loadWeather = useCallback(
    async (refresh = false) => {
      if (!targetGardenId || !accessToken) {
        setWeather(null);
        return;
      }
      setWeatherLoading(true);
      try {
        const data = await fetchGardenWeather(targetGardenId, accessToken, refresh);
        setWeather(data);
      } catch {
        setWeather(null);
      } finally {
        setWeatherLoading(false);
      }
    },
    [targetGardenId, accessToken],
  );

  useEffect(() => {
    void loadWeather(false);
  }, [loadWeather]);

  const loadGrowth = useCallback(async () => {
    if (isGardenMode || !plant?.id || !accessToken) {
      setGrowthRecords([]);
      return;
    }
    try {
      const rows = await fetchPlantGrowthRecords(plant.id, accessToken);
      setGrowthRecords(rows);
    } catch {
      setGrowthRecords([]);
    }
  }, [isGardenMode, plant?.id, accessToken]);

  useEffect(() => {
    void loadGrowth();
  }, [loadGrowth]);

  const handleSaveGrowth = async () => {
    if (!plant?.id || !accessToken || savingGrowth) return;
    setGrowthError('');
    const dateTrimmed = recordedDateInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTrimmed)) {
      setGrowthError('Ngày ghi nhận cần theo định dạng YYYY-MM-DD.');
      return;
    }
    const parsedHeight = heightInput.trim() ? Number(heightInput.trim().replace(',', '.')) : null;
    if (parsedHeight !== null && (Number.isNaN(parsedHeight) || parsedHeight < 0 || parsedHeight > 9999.9)) {
      setGrowthError('Chiều cao (cm) phải nằm trong khoảng 0 – 9999.9.');
      return;
    }
    const parsedLeaf = leafInput.trim() ? Number(leafInput.trim()) : null;
    if (parsedLeaf !== null && (!Number.isInteger(parsedLeaf) || parsedLeaf < 0 || parsedLeaf > 100000)) {
      setGrowthError('Số lá phải là số nguyên từ 0 trở lên.');
      return;
    }
    if (parsedHeight === null && parsedLeaf === null && !bloomInput) {
      setGrowthError('Nhập ít nhất một chỉ số: chiều cao, số lá hoặc giai đoạn sinh trưởng.');
      return;
    }
    setSavingGrowth(true);
    try {
      const created = await createPlantGrowthRecord(plant.id, accessToken, {
        recordedDate: dateTrimmed,
        heightCm: parsedHeight,
        leafCount: parsedLeaf,
        bloomStage: bloomInput,
        note: growthNoteInput.trim() || null,
      });
      setGrowthRecords((prev) =>
        [...prev, created].sort((a, b) => a.recordedDate.localeCompare(b.recordedDate) || a.createdAt.localeCompare(b.createdAt)),
      );
      setHeightInput('');
      setLeafInput('');
      setBloomInput(null);
      setGrowthNoteInput('');
      setShowGrowthModal(false);
    } catch (error) {
      setGrowthError(error instanceof Error ? error.message : 'Không thể lưu chỉ số sinh trưởng.');
    } finally {
      setSavingGrowth(false);
    }
  };

  const handleDeleteGrowth = (recordId: string) => {
    if (!accessToken) return;
    Alert.alert('Xóa bản ghi sinh trưởng', 'Bạn có chắc muốn xóa lần đo này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          void deletePlantGrowthRecord(recordId, accessToken)
            .then(() => setGrowthRecords((prev) => prev.filter((r) => r.id !== recordId)))
            .catch((err) => Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể xóa bản ghi.'));
        },
      },
    ]);
  };

  const plantJournals = useMemo(() => {
    if (!plant) return [];
    return journals
      .filter((j) => j.plantId === plant.id)
      .sort((a, b) => {
        const cmp = b.entryDate.localeCompare(a.entryDate);
        return cmp !== 0 ? cmp : b.createdAt.localeCompare(a.createdAt);
      });
  }, [journals, plant]);

  const latestPlantJournal = plantJournals[0];
  const plantHealthMeta = latestPlantJournal ? JOURNAL_HEALTH_META[latestPlantJournal.healthStatus] : null;
  const plantSchedules = useMemo(
    () => (plant ? schedules.filter((s) => s.plantId === plant.id && s.active) : []),
    [schedules, plant],
  );

  const handleUploadInitialPhoto = async () => {
    if (!plant?.id || uploadingInitialPhoto) return;
    const picked = await pickOrCaptureOptimizedImage({
      maxWidth: 1600,
      quality: 0.85,
      title: 'Chọn ảnh ngày đầu trồng',
    });
    if (!picked) return;
    setUploadingInitialPhoto(true);
    try {
      await updatePlantPhoto(plant.id, picked);
      Alert.alert('Đã cập nhật', 'Đã bổ sung ảnh ngày đầu trồng cho cây.');
    } catch (error) {
      Alert.alert('Không thể tải ảnh', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setUploadingInitialPhoto(false);
    }
  };

  const handleMonthRangeChange = useCallback(
    (fromIso: string, toIso: string) => {
      if (isGardenMode || !plant?.id || !accessToken) {
        setMonthCareTasks([]);
        return;
      }
      void loadCalendar(fromIso, toIso)
        .then((view) => {
          setMonthCareTasks((view.tasks ?? []).filter((task) => task.plantId === plant.id));
        })
        .catch(() => {
          setMonthCareTasks([]);
        });
    },
    [isGardenMode, plant, accessToken, loadCalendar],
  );

  const journalCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of plantJournals) {
      map.set(entry.entryDate, (map.get(entry.entryDate) ?? 0) + 1);
    }
    return map;
  }, [plantJournals]);

  const careCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of monthCareTasks) {
      map.set(task.dueDate, (map.get(task.dueDate) ?? 0) + 1);
    }
    return map;
  }, [monthCareTasks]);

  const filteredDayJournals = useMemo(
    () => (selectedCalendarDate ? plantJournals.filter((j) => j.entryDate === selectedCalendarDate) : plantJournals),
    [plantJournals, selectedCalendarDate],
  );

  const filteredDayCareTasks = useMemo(
    () => (selectedCalendarDate ? monthCareTasks.filter((t) => t.dueDate === selectedCalendarDate) : []),
    [monthCareTasks, selectedCalendarDate],
  );

  const handleQuickCompleteTask = async (taskId: string) => {
    if (completingTaskId) return;
    setCompletingTaskId(taskId);
    try {
      await completeTask(taskId);
      setMonthCareTasks((prev) =>
        prev.map((item) => (item.id === taskId ? { ...item, status: 'completed' } : item)),
      );
    } catch (error) {
      Alert.alert('Không thể cập nhật', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setCompletingTaskId(null);
    }
  };

  // Plant initial/profile photo ("Ngày đầu trồng") vs newest journal photo ("Ảnh cây trồng mới nhất")
  const photoComparison = useMemo(() => {
    if (!plant) return null;
    const newestEntry = plantJournals.find((j) => j.photoIds.length > 0);
    const initialPhotoUri = plant.photoUpdatedAt
      ? `${apiBaseUrl}/api/v1/plants/${plant.id}/photo?v=${encodeURIComponent(plant.photoUpdatedAt)}`
      : null;
    const currentPhotoUri = newestEntry
      ? `${apiBaseUrl}/api/v1/journals/${newestEntry.id}/photos/${newestEntry.photoIds[0]}`
      : null;
    return {
      initialPhotoUri,
      initialDateLabel: plant.photoUpdatedAt
        ? plant.plantedAt
          ? formatDateVi(plant.plantedAt)
          : 'Ảnh ngày đầu trồng'
        : 'Chưa có ảnh ngày đầu',
      currentPhotoUri,
      currentDateLabel: newestEntry ? formatDateVi(newestEntry.entryDate) : 'Chưa có ảnh nhật ký mới',
    };
  }, [plant, plantJournals]);

  const latestGrowth = growthRecords[growthRecords.length - 1];

  const gardenPlants = useMemo(
    () => (garden ? ownedPlants.filter((p) => p.gardenId === garden.id) : []),
    [ownedPlants, garden],
  );
  const gardenPlantIds = useMemo(() => new Set(gardenPlants.map((p) => p.id)), [gardenPlants]);
  const gardenJournals = useMemo(
    () => journals.filter((j) => gardenPlantIds.has(j.plantId)),
    [journals, gardenPlantIds],
  );

  const gardenHealthyPct = useMemo(() => {
    if (gardenPlants.length === 0) return null;
    const latestByPlant = new Map<string, ApiJournalEntry>();
    for (const entry of gardenJournals) {
      if (!latestByPlant.has(entry.plantId)) latestByPlant.set(entry.plantId, entry);
    }
    let healthy = 0;
    for (const gp of gardenPlants) {
      const latest = latestByPlant.get(gp.id);
      if (!latest || latest.healthStatus === 'healthy') healthy += 1;
    }
    return Math.round((healthy / gardenPlants.length) * 100);
  }, [gardenPlants, gardenJournals]);

  const title = isGardenMode
    ? garden?.name || params.name || 'Khu vườn'
    : plant?.name || params.name || 'Cây trồng';

  const topMetrics: Array<[string, string]> = isGardenMode
    ? [
        [String(gardenPlants.length), 'Cây trong vườn'],
        [gardenHealthyPct != null ? `${gardenHealthyPct}%` : '—', 'Tỉ lệ khỏe mạnh'],
        [weather?.temperatureC != null ? `${Math.round(weather.temperatureC)}°C` : '—', 'Nhiệt độ'],
      ]
    : [
        [computePlantAgeText(plant?.plantedAt), 'Tuổi cây'],
        [plantHealthMeta?.label ?? 'Chưa đánh giá', 'Sức khỏe'],
        [String(plantSchedules.length), 'Lịch chăm sóc'],
      ];

  return (
    <SafeAreaView style={m.safe} edges={['top']}>
      <View style={m.header}>
        <Pressable onPress={() => safeBack('/monitoring')}>
          <Text style={m.back}>‹</Text>
        </Pressable>
        <Text style={m.headerTitle}>{isGardenMode ? 'Chỉ số khu vườn' : 'Chỉ số cây trồng'}</Text>
        <AccountButton size={29} />
      </View>

      <ScrollView contentContainerStyle={m.content}>
        <View style={m.identity}>
          {isGardenMode ? (
            <View style={m.plant}>
              <Text style={m.plantEmoji}>⌂</Text>
            </View>
          ) : (
            <PlantArtwork
              style={m.plant}
              category={plant?.category ?? 'Cây trồng'}
              accessToken={accessToken}
              photoUri={plant ? resolvePlantPhotoUri(plant, catalog) : null}
            />
          )}
          <View style={m.copy}>
            <Text style={m.title}>{title}</Text>
            <Text style={m.body}>
              {isGardenMode
                ? garden?.provinceName || garden?.locationDetail || 'Chưa thiết lập vị trí cụ thể'
                : `${plant?.scientificName ?? 'Chưa rõ loài'}${garden ? ` • ${garden.name}` : ''}`}
            </Text>
            <Text
              style={[
                m.tag,
                plantHealthMeta ? { backgroundColor: plantHealthMeta.bg, color: plantHealthMeta.fg } : null,
              ]}>
              {isGardenMode
                ? gardenHealthyPct != null
                  ? `${gardenHealthyPct}% cây khỏe mạnh`
                  : 'Chưa có cây'
                : plantHealthMeta?.label ?? 'Chưa có nhật ký'}
            </Text>
          </View>
        </View>

        <View style={m.tabs}>
          {(
            [
              ['overview', 'Tổng quan'],
              ['history', 'Lịch sử'],
              ['care', isGardenMode ? 'Cây trong vườn' : 'Chăm sóc'],
            ] as Array<[TabKey, string]>
          ).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[m.tabBtn, tab === key && m.tabBtnActive]}>
              <Text style={[m.tab, tab === key && m.tabActiveText]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={m.metrics}>
          {topMetrics.map(([value, label]) => (
            <View style={m.metric} key={label}>
              <Text style={m.metricValue} numberOfLines={1}>
                {value}
              </Text>
              <Text style={m.body}>{label}</Text>
            </View>
          ))}
        </View>

        {tab === 'overview' ? (
          <>
            <View style={m.card}>
              <View style={m.row}>
                <Text style={m.section}>{isGardenMode ? 'Thời tiết chi tiết khu vườn' : 'Môi trường & Vi khí hậu'}</Text>
                {targetGardenId ? (
                  <Pressable disabled={weatherLoading} onPress={() => void loadWeather(true)}>
                    <Text style={m.link}>{weatherLoading ? 'Đang tải…' : '↻ Làm mới'}</Text>
                  </Pressable>
                ) : null}
              </View>

              {weather && weather.temperatureC != null ? (
                <>
                  {!isGardenMode
                    ? (() => {
                        const assessment = buildMicroclimateAssessment(weather, species);
                        const boxStyle =
                          assessment.level === 'danger'
                            ? m.assessmentDanger
                            : assessment.level === 'warning'
                              ? m.assessmentWarning
                              : assessment.level === 'normal'
                                ? m.assessmentNormal
                                : m.assessmentBox;
                        const textStyle =
                          assessment.level === 'danger'
                            ? m.assessmentDangerText
                            : assessment.level === 'warning'
                              ? m.assessmentWarningText
                              : m.assessmentText;
                        return (
                          <View style={[m.assessmentBox, boxStyle]}>
                            <Text style={[m.assessmentText, textStyle]}>{assessment.text}</Text>
                          </View>
                        );
                      })()
                    : null}
                  {[
                    ['Nhiệt độ hiện tại', `${Math.round(weather.temperatureC)}°C${weather.feelsLikeC != null ? ` (Cảm giác ${Math.round(weather.feelsLikeC)}°C)` : ''}`],
                    ['Độ ẩm không khí', weather.humidityPct != null ? `${weather.humidityPct}%` : 'Chưa có dữ liệu'],
                    ['Sức gió', weather.windSpeedMs != null ? `${weather.windSpeedMs} m/s` : 'Chưa có dữ liệu'],
                    ['Trạng thái & Mây', `${weather.conditionDescription || weather.conditionMain || '—'}${weather.cloudsPct != null ? ` (${weather.cloudsPct}% mây)` : ''}`],
                  ].map(([label, val]) => (
                    <View key={label} style={m.dataRow}>
                      <Text style={m.body}>{label}</Text>
                      <Text style={m.value}>{val}</Text>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={m.body}>
                  {targetGardenId
                    ? 'Khu vườn chưa có vị trí (Tỉnh/Thành hoặc GPS) để lấy dữ liệu thời tiết.'
                    : 'Cây chưa được gán vào khu vườn nào nên chưa đối chiếu được thời tiết địa phương.'}
                </Text>
              )}

              {!isGardenMode && species ? (
                <>
                  <Text style={[m.section, { marginTop: 6 }]}>Yêu cầu sinh trưởng theo danh mục</Text>
                  {[
                    ['Độ khó chăm sóc', species.difficulty || 'Chưa cập nhật'],
                    ['Ánh sáng', species.light || 'Chưa cập nhật'],
                    ['Chu kỳ tưới nước', species.water || 'Chưa cập nhật'],
                    ['Nhiệt độ lý tưởng', species.temperature || 'Chưa cập nhật'],
                  ].map(([label, val]) => (
                    <View key={label} style={m.dataRow}>
                      <Text style={m.body}>{label}</Text>
                      <Text style={m.value}>{val}</Text>
                    </View>
                  ))}
                </>
              ) : null}
            </View>

            {isGardenMode && weather?.plantAlerts && weather.plantAlerts.length > 0 ? (
              <View style={m.alertCard}>
                <Text style={m.alertTitle}>⚠ Cảnh báo nhiệt độ ({weather.plantAlerts.length} cây)</Text>
                {weather.plantAlerts.map((alert) => (
                  <Text key={alert.plantId} style={m.alertText}>
                    • {alert.displayName}: {alert.level === 'too_hot' ? 'Nóng hơn' : 'Lạnh hơn'} ngưỡng ({alert.temperatureRange})
                  </Text>
                ))}
              </View>
            ) : null}

            {!isGardenMode && plant ? (
              <>
                {/* Diễn biến sinh trưởng & Biểu đồ đường */}
                <View style={m.card}>
                  <View style={m.row}>
                    <Text style={m.section}>Diễn biến sinh trưởng</Text>
                    <Pressable onPress={() => { setGrowthError(''); setShowGrowthModal(true); }}>
                      <Text style={m.link}>＋ Ghi nhận đo</Text>
                    </Pressable>
                  </View>
                  <View style={m.metrics}>
                    <View style={m.subMetric}>
                      <Text style={m.metricValue}>{latestGrowth?.heightCm != null ? `${latestGrowth.heightCm} cm` : '—'}</Text>
                      <Text style={m.body}>Chiều cao</Text>
                    </View>
                    <View style={m.subMetric}>
                      <Text style={m.metricValue}>{latestGrowth?.leafCount != null ? `${latestGrowth.leafCount}` : '—'}</Text>
                      <Text style={m.body}>Số lá</Text>
                    </View>
                    <View style={m.subMetric}>
                      <Text style={m.metricValue}>{latestGrowth?.bloomStage ? BLOOM_STAGE_META[latestGrowth.bloomStage] : '—'}</Text>
                      <Text style={m.body}>Giai đoạn</Text>
                    </View>
                  </View>
                  <GrowthChart records={growthRecords} />
                  {growthRecords.slice(-4).reverse().map((rec) => (
                    <View key={rec.id} style={m.dataRow}>
                      <Text style={m.body}>
                        {formatDateVi(rec.recordedDate)}
                        {rec.heightCm != null ? ` • ${rec.heightCm} cm` : ''}
                        {rec.leafCount != null ? ` • ${rec.leafCount} lá` : ''}
                        {rec.bloomStage ? ` • ${BLOOM_STAGE_META[rec.bloomStage]}` : ''}
                      </Text>
                      <Pressable onPress={() => handleDeleteGrowth(rec.id)}>
                        <Text style={m.deleteLink}>Xóa</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>

                {/* So sánh ảnh Ngày đầu trồng vs Ảnh cây trồng mới nhất */}
                {photoComparison ? (
                  <View style={m.card}>
                    <Text style={m.section}>So sánh phát triển qua hình ảnh</Text>
                    <View style={m.compareRow}>
                      <View style={m.compareCol}>
                        {photoComparison.initialPhotoUri ? (
                          <Pressable
                            style={{ width: '100%' }}
                            onPress={() => setPreviewPhotoUri(photoComparison.initialPhotoUri)}
                            accessibilityLabel="Phóng to ảnh ngày đầu trồng">
                            <AuthorizedImage
                              uri={photoComparison.initialPhotoUri}
                              accessToken={accessToken}
                              style={m.compareImg}
                            />
                          </Pressable>
                        ) : (
                          <View style={[m.compareImg, m.compareEmpty]}>
                            <Text style={m.body}>Chưa có ảnh</Text>
                          </View>
                        )}
                        <Text style={m.compareLabel}>Ngày đầu trồng</Text>
                        <Text style={m.body}>{photoComparison.initialDateLabel}</Text>
                        <Pressable
                          disabled={uploadingInitialPhoto}
                          onPress={() => void handleUploadInitialPhoto()}
                          style={m.initialPhotoBtn}>
                          <Text style={m.initialPhotoBtnText}>
                            {uploadingInitialPhoto
                              ? 'Đang tải...'
                              : photoComparison.initialPhotoUri
                                ? 'Đổi ảnh đầu'
                                : '＋ Bổ sung ảnh'}
                          </Text>
                        </Pressable>
                      </View>
                      <View style={m.compareCol}>
                        {photoComparison.currentPhotoUri ? (
                          <Pressable
                            style={{ width: '100%' }}
                            onPress={() => setPreviewPhotoUri(photoComparison.currentPhotoUri)}
                            accessibilityLabel="Phóng to ảnh cây trồng mới nhất">
                            <AuthorizedImage
                              uri={photoComparison.currentPhotoUri}
                              accessToken={accessToken}
                              style={m.compareImg}
                            />
                          </Pressable>
                        ) : (
                          <View style={[m.compareImg, m.compareEmpty]}>
                            <Text style={m.body}>Chưa có ảnh</Text>
                          </View>
                        )}
                        <Text style={m.compareLabel}>Ảnh cây trồng mới nhất</Text>
                        <Text style={m.body}>{photoComparison.currentDateLabel}</Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'history' || tab === 'overview' ? (
          <View style={m.card}>
            {isGardenMode ? (
              <>
                <View style={m.row}>
                  <Text style={m.section}>Nhật ký cây trồng</Text>
                  <View style={m.rowRight}>
                    <Text style={m.body}>{gardenPlants.length} cây</Text>
                    {gardenPlants.length > 0 ? (
                      <Pressable onPress={() => setOverviewLogsExpanded((prev) => !prev)} style={m.toggleBtn}>
                        <Text style={m.toggleBtnText}>{overviewLogsExpanded ? 'Thu gọn ▲' : 'Mở rộng ▼'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {gardenPlants.length === 0 ? (
                  <Text style={m.body}>Khu vườn chưa có cây nào để ghi nhận nhật ký.</Text>
                ) : overviewLogsExpanded ? (
                  gardenPlants.map((gp) => {
                    const gpJournals = gardenJournals.filter((j) => j.plantId === gp.id);
                    const gpSchedules = schedules.filter((s) => s.plantId === gp.id && s.active);
                    const latest = gpJournals[0];
                    const hMeta = latest ? JOURNAL_HEALTH_META[latest.healthStatus] : null;
                    return (
                      <Pressable
                        key={gp.id}
                        onPress={() =>
                          router.push({
                            pathname: '/monitoring/detail',
                            params: { type: 'plant', plantId: gp.id, name: gp.name, tab: 'history' },
                          } as never)
                        }
                        style={m.plantRowCard}>
                        <PlantArtwork
                          style={m.plantRowThumb}
                          category={gp.category}
                          accessToken={accessToken}
                          photoUri={resolvePlantPhotoUri(gp, catalog)}
                        />
                        <View style={m.copy}>
                          <Text style={m.journalTitle} numberOfLines={1}>{gp.name}</Text>
                          <Text style={m.body}>
                            {gpJournals.length} nhật ký • {gpSchedules.length} lịch chăm sóc
                            {latest ? ` • Gần nhất ${formatDateVi(latest.entryDate)}` : ''}
                          </Text>
                        </View>
                        {hMeta ? (
                          <Text style={[m.healthTag, { backgroundColor: hMeta.bg, color: hMeta.fg }]}>
                            {hMeta.label}
                          </Text>
                        ) : null}
                        <Text style={m.link}>Lịch ngày ›</Text>
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={m.body}>Đang thu gọn nhật ký của {gardenPlants.length} cây. Nhấn “Mở rộng” để xem.</Text>
                )}
              </>
            ) : tab === 'overview' ? (
              <>
                <View style={m.row}>
                  <Text style={m.section}>Nhật ký ghi nhận gần đây</Text>
                  <View style={m.rowRight}>
                    <Text style={m.body}>{plantJournals.length} bản ghi</Text>
                    {plantJournals.length > 0 ? (
                      <Pressable onPress={() => setOverviewLogsExpanded((prev) => !prev)} style={m.toggleBtn}>
                        <Text style={m.toggleBtnText}>{overviewLogsExpanded ? 'Thu gọn ▲' : 'Mở rộng ▼'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {plantJournals.length === 0 ? (
                  <Text style={m.body}>Chưa có ghi nhận chăm sóc hoặc sâu bệnh nào.</Text>
                ) : overviewLogsExpanded ? (
                  plantJournals.slice(0, 5).map((entry) => {
                    const logMeta = JOURNAL_LOG_TYPE_META[entry.logType] ?? JOURNAL_LOG_TYPE_META.other;
                    const healthMeta = JOURNAL_HEALTH_META[entry.healthStatus] ?? JOURNAL_HEALTH_META.healthy;
                    return (
                      <Pressable
                        key={entry.id}
                        onPress={() =>
                          router.push({
                            pathname: '/journal/detail',
                            params: { plantId: entry.plantId, date: entry.entryDate },
                          } as never)
                        }
                        style={m.journalRow}>
                        <View style={m.row}>
                          <Text style={m.journalTitle}>
                            {logMeta.emoji} {logMeta.label} ({formatDateVi(entry.entryDate)})
                          </Text>
                          <Text style={[m.healthTag, { backgroundColor: healthMeta.bg, color: healthMeta.fg }]}>
                            {healthMeta.label}
                          </Text>
                        </View>
                        <Text style={m.body} numberOfLines={2}>
                          {entry.title ? `${entry.title}: ` : ''}
                          {entry.note}
                        </Text>
                        {entry.photoIds.length > 0 ? (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={m.photoRow}>
                            {entry.photoIds.map((photoId) => (
                              <AuthorizedImage
                                key={photoId}
                                uri={`${apiBaseUrl}/api/v1/journals/${entry.id}/photos/${photoId}`}
                                accessToken={accessToken}
                                style={m.evidencePhoto}
                              />
                            ))}
                          </ScrollView>
                        ) : null}
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={m.body}>Đang thu gọn {plantJournals.length} bản ghi. Nhấn “Mở rộng” để xem.</Text>
                )}
              </>
            ) : (
              <>
                <View style={m.row}>
                  <Text style={m.section}>Lịch nhật ký & chăm sóc theo ngày</Text>
                  <Text style={m.body}>{filteredDayJournals.length} nhật ký</Text>
                </View>

                <DailyCalendarView
                  selectedDate={selectedCalendarDate}
                  onSelectDate={setSelectedCalendarDate}
                  journalCountByDate={journalCountByDate}
                  careCountByDate={careCountByDate}
                  onMonthRangeChange={handleMonthRangeChange}
                />

                {selectedCalendarDate && filteredDayCareTasks.length > 0 ? (
                  <View style={m.dayCareBox}>
                    <Text style={m.journalTitle}>Lịch chăm sóc ngày {formatDateVi(selectedCalendarDate)}</Text>
                    {filteredDayCareTasks.map((task) => {
                      const meta = CARE_TASK_META[task.taskType] ?? CARE_TASK_META.other;
                      const timeText = new Date(task.dueAt).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      return (
                        <View key={task.id} style={m.dataRow}>
                          <Text style={[m.body, { flex: 1 }]}>
                            {meta.emoji} {task.title || meta.label} ({timeText})
                          </Text>
                          {task.status === 'pending' ? (
                            <Pressable
                              disabled={completingTaskId === task.id}
                              onPress={() => void handleQuickCompleteTask(task.id)}
                              style={m.quickDoneBtn}>
                              <Text style={m.quickDoneText}>
                                {completingTaskId === task.id ? 'Đang lưu...' : '✓ Hoàn thành'}
                              </Text>
                            </Pressable>
                          ) : (
                            <Text style={m.value}>
                              {task.status === 'completed' ? 'Đã xong' : 'Bỏ qua'}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {filteredDayJournals.length === 0 ? (
                  <Text style={m.body}>
                    {selectedCalendarDate
                      ? `Không có bản nhật ký nào vào ngày ${formatDateVi(selectedCalendarDate)}.`
                      : 'Chưa có ghi nhận chăm sóc hoặc sâu bệnh nào.'}
                  </Text>
                ) : (
                  filteredDayJournals.map((entry) => {
                    const logMeta = JOURNAL_LOG_TYPE_META[entry.logType] ?? JOURNAL_LOG_TYPE_META.other;
                    const healthMeta = JOURNAL_HEALTH_META[entry.healthStatus] ?? JOURNAL_HEALTH_META.healthy;
                    return (
                      <Pressable
                        key={entry.id}
                        onPress={() =>
                          router.push({
                            pathname: '/journal/detail',
                            params: { plantId: entry.plantId, date: entry.entryDate },
                          } as never)
                        }
                        style={m.journalRow}>
                        <View style={m.row}>
                          <Text style={m.journalTitle}>
                            {logMeta.emoji} {logMeta.label} ({formatDateVi(entry.entryDate)})
                          </Text>
                          <Text style={[m.healthTag, { backgroundColor: healthMeta.bg, color: healthMeta.fg }]}>
                            {healthMeta.label}
                          </Text>
                        </View>
                        <Text style={m.body} numberOfLines={2}>
                          {entry.title ? `${entry.title}: ` : ''}
                          {entry.note}
                        </Text>
                        {entry.photoIds.length > 0 ? (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={m.photoRow}>
                            {entry.photoIds.map((photoId) => (
                              <AuthorizedImage
                                key={photoId}
                                uri={`${apiBaseUrl}/api/v1/journals/${entry.id}/photos/${photoId}`}
                                accessToken={accessToken}
                                style={m.evidencePhoto}
                              />
                            ))}
                          </ScrollView>
                        ) : null}
                      </Pressable>
                    );
                  })
                )}
              </>
            )}

            <Pressable
              onPress={() =>
                router.push(
                  plant
                    ? ({
                        pathname: '/journal/new',
                        params: selectedCalendarDate ? { plantId: plant.id, date: selectedCalendarDate } : { plantId: plant.id },
                      } as never)
                    : ('/journal/new' as never),
                )
              }
              style={m.button}>
              <Text style={m.buttonText}>
                {selectedCalendarDate && !isGardenMode && tab === 'history'
                  ? `＋ Ghi nhật ký ngày ${formatDateVi(selectedCalendarDate)}`
                  : '＋ Mở biểu mẫu ghi nhận'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {tab === 'care' ? (
          <View style={m.card}>
            {isGardenMode ? (
              <>
                <Text style={m.section}>Cây đang trồng trong vườn ({gardenPlants.length})</Text>
                {gardenPlants.length === 0 ? (
                  <Text style={m.body}>Khu vườn chưa có cây nào.</Text>
                ) : (
                  gardenPlants.map((gp) => (
                    <Pressable
                      key={gp.id}
                      onPress={() =>
                        router.push({ pathname: '/monitoring/detail', params: { type: 'plant', plantId: gp.id } } as never)
                      }
                      style={m.dataRow}>
                      <Text style={m.value}>{gp.name}</Text>
                      <Text style={m.link}>Xem chỉ số ›</Text>
                    </Pressable>
                  ))
                )}
              </>
            ) : (
              <>
                <Text style={m.section}>Lịch chăm sóc đang áp dụng ({plantSchedules.length})</Text>
                {plantSchedules.length === 0 ? (
                  <Text style={m.body}>Cây này chưa có lịch chăm sóc định kỳ.</Text>
                ) : (
                  plantSchedules.map((sch) => {
                    const meta = CARE_TASK_META[sch.taskType] ?? CARE_TASK_META.other;
                    const pendingCount = todayTasks.filter((t) => t.scheduleId === sch.id && t.status === 'pending').length;
                    return (
                      <Pressable
                        key={sch.id}
                        onPress={() => router.push({ pathname: '/schedule/detail', params: { scheduleId: sch.id } } as never)}
                        style={m.dataRow}>
                        <Text style={m.value}>
                          {meta.emoji} {sch.title || meta.label} · {formatScheduleRepeat(sch)} ({formatTimeShort(sch.timeOfDay)})
                        </Text>
                        <Text style={m.link}>{pendingCount > 0 ? `${pendingCount} việc hôm nay` : 'Chi tiết ›'}</Text>
                      </Pressable>
                    );
                  })
                )}
                {plant ? (
                  <Pressable
                    onPress={() => router.push({ pathname: '/schedule/create', params: { plantId: plant.id } } as never)}
                    style={m.button}>
                    <Text style={m.buttonText}>＋ Tạo lịch chăm sóc cho cây</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={showGrowthModal} transparent animationType="fade" onRequestClose={() => setShowGrowthModal(false)}>
        <View style={m.modalBackdrop}>
          <View style={m.modalCard}>
            <Text style={m.section}>Ghi nhận chỉ số sinh trưởng</Text>
            <Text style={m.body}>Cập nhật chiều cao, số lá hoặc giai đoạn hoa/quả cho {title}.</Text>
            <TextInput
              value={recordedDateInput}
              onChangeText={setRecordedDateInput}
              placeholder="Ngày đo (YYYY-MM-DD)"
              placeholderTextColor={C.mutedText}
              style={m.modalInput}
            />
            <View style={m.modalRow}>
              <TextInput
                value={heightInput}
                onChangeText={setHeightInput}
                placeholder="Chiều cao (cm)"
                placeholderTextColor={C.mutedText}
                keyboardType="decimal-pad"
                style={[m.modalInput, { flex: 1 }]}
              />
              <TextInput
                value={leafInput}
                onChangeText={setLeafInput}
                placeholder="Số lá"
                placeholderTextColor={C.mutedText}
                keyboardType="number-pad"
                style={[m.modalInput, { flex: 1 }]}
              />
            </View>
            <View style={m.stageRow}>
              {BLOOM_STAGES.map((stage) => (
                <Pressable
                  key={stage}
                  onPress={() => setBloomInput((curr) => (curr === stage ? null : stage))}
                  style={[m.stageChip, bloomInput === stage && m.stageChipActive]}>
                  <Text style={[m.stageText, bloomInput === stage && m.stageTextActive]}>{BLOOM_STAGE_META[stage]}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={growthNoteInput}
              onChangeText={setGrowthNoteInput}
              placeholder="Ghi chú (không bắt buộc)"
              placeholderTextColor={C.mutedText}
              style={m.modalInput}
            />
            {growthError ? <Text style={m.errorText}>{growthError}</Text> : null}
            <View style={m.modalRow}>
              <Pressable onPress={() => setShowGrowthModal(false)} style={m.modalSecondary}>
                <Text style={m.link}>Hủy</Text>
              </Pressable>
              <Pressable disabled={savingGrowth} onPress={() => void handleSaveGrowth()} style={[m.button, { flex: 1, marginTop: 0 }]}>
                <Text style={m.buttonText}>{savingGrowth ? 'Đang lưu…' : 'Lưu chỉ số'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(previewPhotoUri)} transparent animationType="fade" onRequestClose={() => setPreviewPhotoUri(null)}>
        <Pressable style={m.lightboxBackdrop} onPress={() => setPreviewPhotoUri(null)}>
          <Pressable style={m.lightboxClose} onPress={() => setPreviewPhotoUri(null)} accessibilityRole="button" accessibilityLabel="Đóng ảnh">
            <Text style={m.lightboxCloseText}>✕</Text>
          </Pressable>
          {previewPhotoUri ? (
            <AuthorizedImage
              uri={previewPhotoUri}
              accessToken={accessToken}
              contentFit="contain"
              style={m.lightboxImage}
            />
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const m = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { height: 52, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { color: C.forest, fontSize: 29 },
  headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  content: { padding: 13, gap: 10, paddingBottom: 24 },
  identity: { padding: 11, borderRadius: 13, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  plant: { width: 58, height: 58, borderRadius: 12, backgroundColor: '#DDEDE1', alignItems: 'center', justifyContent: 'center' },
  plantEmoji: { color: '#568568', fontSize: 28 },
  copy: { flex: 1, gap: 3 },
  title: { color: C.forest, fontFamily: F.bold, fontSize: 16 },
  body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  tag: { alignSelf: 'flex-start', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, backgroundColor: '#DFF2E5', color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  tabs: { minHeight: 40, padding: 4, borderRadius: 10, backgroundColor: '#E6EEE8', flexDirection: 'row', gap: 4 },
  tabBtn: { flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 7 },
  tabBtnActive: { backgroundColor: C.primary },
  tab: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  tabActiveText: { color: C.surface, fontFamily: F.semiBold },
  metrics: { flexDirection: 'row', gap: 6 },
  metric: { flex: 1, padding: 9, borderRadius: 10, backgroundColor: C.surface, gap: 2 },
  metricValue: { color: C.forest, fontFamily: F.bold, fontSize: 13 },
  card: { padding: 12, borderRadius: 13, backgroundColor: C.surface, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  section: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  link: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
  assessmentBox: { padding: 10, borderRadius: 10, backgroundColor: '#E6F5ED' },
  assessmentNormal: { backgroundColor: '#E6F5ED', borderWidth: 1, borderColor: 'rgba(30, 75, 56, 0.16)' },
  assessmentWarning: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.3)' },
  assessmentDanger: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.35)' },
  assessmentText: { color: C.forest, fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
  assessmentWarningText: { color: '#92400E', fontFamily: F.semiBold },
  assessmentDangerText: { color: '#991B1B', fontFamily: F.semiBold },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleBtn: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, backgroundColor: C.softSurface, borderWidth: 1, borderColor: '#CBE3D3' },
  toggleBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  initialPhotoBtn: { marginTop: 2, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: C.softSurface, borderWidth: 1, borderColor: '#CBE3D3' },
  initialPhotoBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  plantRowCard: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E3EBE5', flexDirection: 'row', alignItems: 'center', gap: 10 },
  plantRowThumb: { width: 42, height: 42, borderRadius: 10 },
  dayCareBox: { padding: 10, borderRadius: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.25)', gap: 4 },
  quickDoneBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: C.primary },
  quickDoneText: { color: C.surface, fontFamily: F.semiBold, fontSize: 10 },
  lightboxBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.88)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  lightboxClose: { position: 'absolute', top: 44, right: 18, zIndex: 2, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  lightboxCloseText: { color: '#FFFFFF', fontFamily: F.bold, fontSize: 16 },
  lightboxImage: { width: '100%', height: '75%' },
  dataRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E3EBE5', paddingVertical: 4 },
  value: { color: C.forest, fontFamily: F.semiBold, fontSize: 11, flexShrink: 1, textAlign: 'right' },
  alertCard: { padding: 12, borderRadius: 13, backgroundColor: C.peach, gap: 4 },
  alertTitle: { color: C.terracotta, fontFamily: F.bold, fontSize: 12 },
  alertText: { color: '#7A2F01', fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  journalRow: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E3EBE5', gap: 5 },
  journalTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 12, flex: 1 },
  healthTag: { overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, fontFamily: F.semiBold, fontSize: 9 },
  photoRow: { gap: 8, paddingTop: 4 },
  evidencePhoto: { width: 72, height: 72, borderRadius: 10, backgroundColor: C.softSurface },
  button: { minHeight: 40, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 },
  subMetric: { flex: 1, padding: 8, borderRadius: 10, backgroundColor: C.softSurface, gap: 2 },
  deleteLink: { color: '#B42318', fontFamily: F.semiBold, fontSize: 11 },
  compareRow: { flexDirection: 'row', gap: 10 },
  compareCol: { flex: 1, gap: 4, alignItems: 'center' },
  compareImg: { width: '100%', height: 116, borderRadius: 12, backgroundColor: C.softSurface },
  compareEmpty: { alignItems: 'center', justifyContent: 'center' },
  compareLabel: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  modalBackdrop: { flex: 1, padding: 18, backgroundColor: 'rgba(35, 42, 38, 0.45)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: '100%', maxWidth: 420, padding: 16, borderRadius: 16, backgroundColor: C.surface, gap: 10 },
  modalInput: { minHeight: 42, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.softSurface, color: C.text, fontFamily: F.regular, fontSize: 12 },
  modalRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  stageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stageChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 99, backgroundColor: C.softSurface },
  stageChipActive: { backgroundColor: C.primary },
  stageText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  stageTextActive: { color: C.surface },
  errorText: { color: '#BA1A1A', fontFamily: F.regular, fontSize: 11 },
  modalSecondary: { minHeight: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
});
