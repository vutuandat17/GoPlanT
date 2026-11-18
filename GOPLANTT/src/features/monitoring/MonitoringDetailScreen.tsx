import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { AccountButton } from '@/features/auth/AccountButton';
import { useAuthSession } from '@/features/auth/AuthSession';
import { JOURNAL_HEALTH_META, JOURNAL_LOG_TYPE_META, useJournals } from '@/features/journal/JournalStore';
import { GrowthChart } from '@/features/monitoring/GrowthChart';
import { PlantArtwork } from '@/features/plants/PlantArtwork';
import { usePlantData, type PlantProfile } from '@/features/plants/PlantDataStore';
import { CARE_TASK_META, formatDateVi, formatScheduleRepeat, formatTimeShort, useCareSchedules } from '@/features/schedule/CareScheduleStore';
import {
  apiBaseUrl,
  createPlantGrowthRecord,
  deletePlantGrowthRecord,
  fetchGardenWeather,
  fetchPlantGrowthRecords,
  toLocalIsoDate,
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

function buildMicroclimateAssessment(weather: ApiGardenWeather | null, species?: PlantProfile): string {
  if (!weather || weather.temperatureC == null) {
    return 'Chưa có dữ liệu thời tiết từ khu vườn để đối chiếu vi khí hậu.';
  }
  const temp = weather.temperatureC;
  const humidity = weather.humidityPct;
  const range = parseTempRange(species?.temperature);
  const parts: string[] = [];

  if (range) {
    if (temp > range.max) {
      parts.push(`Nhiệt độ (${Math.round(temp)}°C) đang cao hơn ngưỡng lý tưởng (${species?.temperature}) — nên che nắng và tăng ẩm.`);
    } else if (temp < range.min) {
      parts.push(`Nhiệt độ (${Math.round(temp)}°C) đang thấp hơn ngưỡng lý tưởng (${species?.temperature}) — cần giữ ấm cho cây.`);
    } else {
      parts.push(`Nhiệt độ (${Math.round(temp)}°C) nằm trong khoảng sinh trưởng lý tưởng (${species?.temperature}).`);
    }
  } else {
    parts.push(`Nhiệt độ ngoài trời hiện tại là ${Math.round(temp)}°C.`);
  }

  if (humidity != null) {
    if (humidity < 45) parts.push(`Độ ẩm không khí (${humidity}%) hơi khô, cân nhắc phun sương nhẹ.`);
    else if (humidity > 85) parts.push(`Độ ẩm không khí (${humidity}%) cao, lưu ý thông thoáng tránh nấm bệnh.`);
    else parts.push(`Độ ẩm không khí (${humidity}%) phù hợp.`);
  }
  return parts.join(' ');
}

export default function MonitoringDetailScreen() {
  const params = useLocalSearchParams<{ type?: string; plantId?: string; gardenId?: string; name?: string }>();
  const { accessToken } = useAuthSession();
  const { ownedPlants, gardens, catalog } = usePlantData();
  const { journals } = useJournals();
  const { schedules, todayTasks } = useCareSchedules();

  const isGardenMode = Boolean(params.gardenId) || params.type === 'garden';
  const [tab, setTab] = useState<TabKey>('overview');
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
  const specialCareJournals = useMemo(
    () => plantJournals.filter((j) => j.logType === 'pest' || j.logType === 'pruning' || j.healthStatus !== 'healthy'),
    [plantJournals],
  );

  // Oldest journal photo vs current plant photo (or newest journal photo) for growth comparison
  const photoComparison = useMemo(() => {
    if (!plant) return null;
    const withPhotosOldestFirst = [...plantJournals]
      .filter((j) => j.photoIds.length > 0)
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.createdAt.localeCompare(b.createdAt));
    const oldestEntry = withPhotosOldestFirst[0];
    const newestEntry = withPhotosOldestFirst[withPhotosOldestFirst.length - 1];
    const initialPhotoUri = oldestEntry
      ? `${apiBaseUrl}/api/v1/journals/${oldestEntry.id}/photos/${oldestEntry.photoIds[0]}`
      : null;
    const currentPhotoUri = plant.photoUpdatedAt
      ? `${apiBaseUrl}/api/v1/plants/${plant.id}/photo?v=${encodeURIComponent(plant.photoUpdatedAt)}`
      : newestEntry
        ? `${apiBaseUrl}/api/v1/journals/${newestEntry.id}/photos/${newestEntry.photoIds[0]}`
        : null;
    return {
      initialPhotoUri,
      initialDateLabel: oldestEntry ? formatDateVi(oldestEntry.entryDate) : 'Chưa có ảnh nhật ký đầu',
      currentPhotoUri,
      currentDateLabel: plant.photoUpdatedAt
        ? 'Ảnh hồ sơ hiện tại'
        : newestEntry
          ? formatDateVi(newestEntry.entryDate)
          : 'Chưa có ảnh hiện tại',
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
        <Pressable onPress={() => router.back()}>
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
              photoUri={
                plant?.photoUpdatedAt
                  ? `${apiBaseUrl}/api/v1/plants/${plant.id}/photo?v=${encodeURIComponent(plant.photoUpdatedAt)}`
                  : null
              }
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
                  {!isGardenMode ? (
                    <View style={m.assessmentBox}>
                      <Text style={m.assessmentText}>{buildMicroclimateAssessment(weather, species)}</Text>
                    </View>
                  ) : null}
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

                {/* So sánh ảnh Ngày đầu trồng vs Ảnh hiện tại */}
                {photoComparison ? (
                  <View style={m.card}>
                    <Text style={m.section}>So sánh phát triển qua hình ảnh</Text>
                    <View style={m.compareRow}>
                      <View style={m.compareCol}>
                        {photoComparison.initialPhotoUri ? (
                          <Image
                            source={{
                              uri: photoComparison.initialPhotoUri,
                              headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                            }}
                            style={m.compareImg}
                          />
                        ) : (
                          <View style={[m.compareImg, m.compareEmpty]}>
                            <Text style={m.body}>Chưa có ảnh</Text>
                          </View>
                        )}
                        <Text style={m.compareLabel}>Ngày đầu trồng</Text>
                        <Text style={m.body}>{photoComparison.initialDateLabel}</Text>
                      </View>
                      <View style={m.compareCol}>
                        {photoComparison.currentPhotoUri ? (
                          <Image
                            source={{
                              uri: photoComparison.currentPhotoUri,
                              headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                            }}
                            style={m.compareImg}
                          />
                        ) : (
                          <View style={[m.compareImg, m.compareEmpty]}>
                            <Text style={m.body}>Chưa có ảnh</Text>
                          </View>
                        )}
                        <Text style={m.compareLabel}>Ảnh hiện tại</Text>
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
            <View style={m.row}>
              <Text style={m.section}>
                {isGardenMode
                  ? 'Nhật ký vườn gần đây'
                  : tab === 'overview'
                    ? 'Sâu bệnh, Cắt tỉa & Chú ý gần nhất'
                    : 'Toàn bộ lịch sử nhật ký'}
              </Text>
              <Text style={m.body}>
                {isGardenMode
                  ? `${gardenJournals.length} bản ghi`
                  : `${(tab === 'overview' ? specialCareJournals : plantJournals).length} bản ghi`}
              </Text>
            </View>

            {(isGardenMode
              ? gardenJournals.slice(0, 6)
              : (tab === 'overview' ? (specialCareJournals.length > 0 ? specialCareJournals : plantJournals).slice(0, 5) : plantJournals)
            ).length === 0 ? (
              <Text style={m.body}>Chưa có ghi nhận chăm sóc hoặc sâu bệnh nào.</Text>
            ) : (
              (isGardenMode
                ? gardenJournals.slice(0, 6)
                : (tab === 'overview' ? (specialCareJournals.length > 0 ? specialCareJournals : plantJournals).slice(0, 5) : plantJournals)
              ).map((entry) => {
                const logMeta = JOURNAL_LOG_TYPE_META[entry.logType] ?? JOURNAL_LOG_TYPE_META.other;
                const healthMeta = JOURNAL_HEALTH_META[entry.healthStatus] ?? JOURNAL_HEALTH_META.healthy;
                return (
                  <Pressable
                    key={entry.id}
                    onPress={() => router.push({ pathname: '/journal/detail', params: { journalId: entry.id } } as never)}
                    style={m.journalRow}>
                    <View style={m.row}>
                      <Text style={m.journalTitle}>
                        {logMeta.emoji} {isGardenMode ? `${entry.plantName} · ` : ''}
                        {logMeta.label} ({formatDateVi(entry.entryDate)})
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
                          <Image
                            key={photoId}
                            source={{
                              uri: `${apiBaseUrl}/api/v1/journals/${entry.id}/photos/${photoId}`,
                              headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
                            }}
                            style={m.evidencePhoto}
                          />
                        ))}
                      </ScrollView>
                    ) : null}
                  </Pressable>
                );
              })
            )}

            <Pressable
              onPress={() =>
                router.push(
                  plant
                    ? ({ pathname: '/journal/new', params: { plantId: plant.id } } as never)
                    : ('/journal/new' as never),
                )
              }
              style={m.button}>
              <Text style={m.buttonText}>＋ Mở biểu mẫu ghi nhận</Text>
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
  assessmentText: { color: C.forest, fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
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
