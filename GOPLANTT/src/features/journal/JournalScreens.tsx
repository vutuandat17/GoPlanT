import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { AuthorizedImage } from '@/components/AuthorizedImage';
import { pickOrCaptureOptimizedImage } from '@/services/imagePicker';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { SafeAreaView } from '@/components/app-primitives';
import { router } from 'expo-router';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { safeBack } from '@/services/navigation';
import { AccountButton } from '@/features/auth/AccountButton';
import { useAuthSession } from '@/features/auth/AuthSession';
import { usePlantData } from '@/features/plants/PlantDataStore';
import {
  filterJournalEntries,
  JournalFilterBar,
  type JournalHealthFilter,
  type JournalLogFilter,
} from '@/features/journal/JournalFilterBar';
import {
  JOURNAL_HEALTH_META,
  JOURNAL_HEALTH_STATUSES,
  JOURNAL_LOG_TYPES,
  JOURNAL_LOG_TYPE_META,
  useJournals,
  validateJournalPhotoDraft,
  type LocalPhotoDraft,
} from '@/features/journal/JournalStore';
import { formatDateVi } from '@/features/schedule/CareScheduleStore';
import { DailyCalendarView } from '@/features/monitoring/DailyCalendarView';
import {
  apiBaseUrl,
  createPlantGrowthRecord,
  fetchPlantGrowthRecords,
  toLocalIsoDate,
  type ApiGrowthRecord,
  type BloomStage,
  type JournalHealthStatus,
  type JournalLogType,
} from '@/services/api';

const BLOOM_STAGE_META: Record<BloomStage, string> = {
  seedling: 'Mầm',
  budding: 'Nụ',
  flowering: 'Hoa',
  fruiting: 'Kết trái',
};
const BLOOM_STAGES: BloomStage[] = ['seedling', 'budding', 'flowering', 'fruiting'];

const MAX_PHOTOS = 5;

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

function calcPlantAgeDays(plantedAt: string | null | undefined): string {
  if (!plantedAt) return '—';
  const planted = new Date(plantedAt);
  if (Number.isNaN(planted.getTime())) return '—';
  const diff = Math.max(0, Math.floor((Date.now() - planted.getTime()) / (1000 * 60 * 60 * 24)));
  return `${diff} ngày`;
}

function Header({ title }: { title: string }) {
  return (
    <View style={j.header}>
      <Pressable onPress={() => safeBack('/journal')} accessibilityRole="button" accessibilityLabel="Quay lại">
        <Text style={j.back}>‹</Text>
      </Pressable>
      <Text style={j.headerTitle} numberOfLines={1}>{title}</Text>
      <AccountButton size={29} />
    </View>
  );
}

export function JournalDetailScreen({
  plantId,
  journalId,
  initialDate,
}: {
  plantId?: string;
  journalId?: string;
  initialDate?: string;
}) {
  const { accessToken } = useAuthSession();
  const { ownedPlants } = usePlantData();
  const { journals, isLoading, removeJournal, refresh } = useJournals();

  const [searchQuery, setSearchQuery] = useState('');
  const [logFilter, setLogFilter] = useState<JournalLogFilter>('all');
  const [healthFilter, setHealthFilter] = useState<JournalHealthFilter>('all');
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate ?? null);
  const [growthRecords, setGrowthRecords] = useState<ApiGrowthRecord[]>([]);

  const journalFromId = journalId ? journals.find((entry) => entry.id === journalId) : undefined;
  const targetPlantId = plantId ?? journalFromId?.plantId ?? journals[0]?.plantId ?? ownedPlants[0]?.id;
  const plant = ownedPlants.find((p) => p.id === targetPlantId);

  useEffect(() => {
    if (initialDate) setSelectedDate(initialDate);
    else if (journalFromId?.entryDate) setSelectedDate(journalFromId.entryDate);
  }, [initialDate, journalFromId?.entryDate]);

  useEffect(() => {
    if (!targetPlantId || !accessToken) {
      setGrowthRecords([]);
      return;
    }
    let active = true;
    void fetchPlantGrowthRecords(targetPlantId, accessToken)
      .then((rows) => {
        if (active) setGrowthRecords(rows);
      })
      .catch(() => {
        if (active) setGrowthRecords([]);
      });
    return () => {
      active = false;
    };
  }, [targetPlantId, accessToken]);

  const plantJournals = useMemo(
    () => (targetPlantId ? journals.filter((entry) => entry.plantId === targetPlantId) : []),
    [journals, targetPlantId],
  );
  const journalCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of plantJournals) {
      map.set(entry.entryDate, (map.get(entry.entryDate) ?? 0) + 1);
    }
    return map;
  }, [plantJournals]);
  const filteredJournals = useMemo(() => {
    const base = filterJournalEntries(plantJournals, { query: searchQuery, logType: logFilter, healthStatus: healthFilter });
    return selectedDate ? base.filter((entry) => entry.entryDate === selectedDate) : base;
  }, [plantJournals, searchQuery, logFilter, healthFilter, selectedDate]);
  const latestHealth = plantJournals[0]?.healthStatus;
  const latestHealthMeta = latestHealth ? JOURNAL_HEALTH_META[latestHealth] : null;
  const latestGrowth = growthRecords[growthRecords.length - 1];

  const confirmDelete = (journalId: string) => {
    Alert.alert('Xóa ghi nhận', 'Bài nhật ký và các ảnh đính kèm sẽ bị xóa vĩnh viễn.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeJournal(journalId);
          } catch (err) {
            Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể xóa bài nhật ký.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={j.safe} edges={['top']}>
      <Header title="Nhật ký phát triển" />
      <ScrollView contentContainerStyle={j.content} showsVerticalScrollIndicator={false}>
        {plant ? (
          <View style={j.plantCard}>
            <View style={j.thumb}><Text style={j.emoji}>🌱</Text></View>
            <View style={j.copy}>
              <Text style={j.title}>{plant.name}</Text>
              <Text style={j.body}>{plant.scientificName}{plant.location ? ` • ${plant.location}` : ''}</Text>
              {latestHealthMeta ? (
                <Text style={[j.tag, { backgroundColor: latestHealthMeta.bg, color: latestHealthMeta.fg }]}>
                  {latestHealthMeta.label}
                </Text>
              ) : (
                <Text style={j.tag}>Chưa có đánh giá</Text>
              )}
            </View>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/journal/new',
                  params: selectedDate ? { plantId: plant.id, date: selectedDate } : { plantId: plant.id },
                } as never)
              }
              style={j.addInlineBtn}>
              <Text style={j.addInlineText}>
                {selectedDate ? `＋ Ghi ngày ${formatDateVi(selectedDate)}` : '＋ Ghi mới'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={j.card}>
            <Text style={j.sectionTitle}>Chưa chọn cây</Text>
            <Text style={j.body}>Hãy thêm cây vào vườn hoặc chọn một cây để xem nhật ký.</Text>
          </View>
        )}

        <View style={j.card}>
          <View style={j.row}>
            <Text style={j.sectionTitle}>Hồ sơ phát triển</Text>
            <Pressable onPress={() => void refresh()}>
              <Text style={j.link}>{isLoading ? 'Đang tải...' : '↻ Làm mới'}</Text>
            </Pressable>
          </View>
          <View style={j.metrics}>
            {[
              [calcPlantAgeDays(plant?.plantedAt), 'Tuổi cây'],
              [`${plantJournals.length} lần`, 'Ghi nhận'],
              [latestHealthMeta?.label ?? '—', 'Tình trạng'],
            ].map(([val, label]) => (
              <View style={j.metric} key={label}>
                <Text style={j.metricValue} numberOfLines={1}>{val}</Text>
                <Text style={j.body}>{label}</Text>
              </View>
            ))}
          </View>
          {latestGrowth ? (
            <Text style={j.body}>
              Chỉ số gần nhất ({formatDateVi(latestGrowth.recordedDate)}):
              {latestGrowth.heightCm != null ? ` Cao ${latestGrowth.heightCm} cm` : ''}
              {latestGrowth.leafCount != null ? ` • ${latestGrowth.leafCount} lá` : ''}
              {latestGrowth.bloomStage ? ` • ${BLOOM_STAGE_META[latestGrowth.bloomStage]}` : ''}
            </Text>
          ) : null}
        </View>

        <View style={j.card}>
          <View style={j.row}>
            <Text style={j.sectionTitle}>Nhật ký theo lịch từng ngày</Text>
            <Text style={j.tag}>{filteredJournals.length}/{plantJournals.length} ghi nhận</Text>
          </View>

          {plantJournals.length > 0 ? (
            <>
              <DailyCalendarView
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                journalCountByDate={journalCountByDate}
                initialDate={initialDate}
              />
              <JournalFilterBar
                query={searchQuery}
                onQueryChange={setSearchQuery}
                logType={logFilter}
                onLogTypeChange={setLogFilter}
                healthStatus={healthFilter}
                onHealthStatusChange={setHealthFilter}
              />
            </>
          ) : null}

          {isLoading && plantJournals.length === 0 ? (
            <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} />
          ) : plantJournals.length === 0 ? (
            <View style={j.emptyTimeline}>
              <Text style={j.body}>Chưa có ghi nhận nào cho cây này.</Text>
              {plant ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/journal/new', params: { plantId: plant.id } } as never)}
                  style={j.submit}>
                  <Text style={j.submitText}>＋ Thêm ghi nhận đầu tiên</Text>
                </Pressable>
              ) : null}
            </View>
          ) : filteredJournals.length === 0 ? (
            <View style={j.emptyTimeline}>
              <Text style={j.body}>Không có bài nhật ký nào khớp bộ lọc hiện tại.</Text>
            </View>
          ) : (
            filteredJournals.map((entry) => {
              const typeMeta = JOURNAL_LOG_TYPE_META[entry.logType] ?? JOURNAL_LOG_TYPE_META.other;
              const healthMeta = JOURNAL_HEALTH_META[entry.healthStatus] ?? JOURNAL_HEALTH_META.healthy;
              return (
                <View key={entry.id} style={j.entry}>
                  <View style={j.row}>
                    <Text style={j.date}>
                      {formatDateVi(entry.entryDate)} • {typeMeta.emoji} {typeMeta.label}
                    </Text>
                    <Text style={[j.healthPill, { backgroundColor: healthMeta.bg, color: healthMeta.fg }]}>
                      {healthMeta.label}
                    </Text>
                  </View>
                  {entry.title ? <Text style={j.titleSmall}>{entry.title}</Text> : null}
                  <Text style={j.entryNote}>{entry.note}</Text>

                  {entry.photoIds.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={j.photoScroll}>
                      {entry.photoIds.map((photoId) => {
                        const uri = `${apiBaseUrl}/api/v1/journals/${entry.id}/photos/${photoId}`;
                        return (
                          <Pressable key={photoId} onPress={() => setPreviewPhotoUri(uri)} accessibilityRole="button" accessibilityLabel="Phóng to ảnh nhật ký">
                            <AuthorizedImage
                              uri={uri}
                              accessToken={accessToken}
                              contentFit="cover"
                              style={j.photoImage}
                            />
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : null}

                  <View style={j.entryActions}>
                    <Pressable onPress={() => router.push({ pathname: '/journal/edit', params: { journalId: entry.id } } as never)}>
                      <Text style={j.link}>Chỉnh sửa ghi nhận ›</Text>
                    </Pressable>
                    <Pressable onPress={() => confirmDelete(entry.id)}>
                      <Text style={j.deleteLink}>Xóa</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal visible={Boolean(previewPhotoUri)} transparent animationType="fade" onRequestClose={() => setPreviewPhotoUri(null)}>
        <Pressable style={j.lightboxBackdrop} onPress={() => setPreviewPhotoUri(null)}>
          <Pressable style={j.lightboxClose} onPress={() => setPreviewPhotoUri(null)} accessibilityRole="button" accessibilityLabel="Đóng ảnh">
            <Text style={j.lightboxCloseText}>✕</Text>
          </Pressable>
          {previewPhotoUri ? (
            <AuthorizedImage
              uri={previewPhotoUri}
              accessToken={accessToken}
              contentFit="contain"
              style={j.lightboxImage}
            />
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function JournalForm({
  editing = false,
  initialPlantId,
  careTaskId,
  initialLogType,
  initialDate,
  journalId,
}: {
  editing?: boolean;
  initialPlantId?: string;
  careTaskId?: string;
  initialLogType?: JournalLogType;
  initialDate?: string;
  journalId?: string;
}) {
  const { accessToken } = useAuthSession();
  const { ownedPlants } = usePlantData();
  const { journals, createJournal, updateJournal, removePhoto } = useJournals();

  const existing = editing && journalId ? journals.find((item) => item.id === journalId) : undefined;

  const [plantId, setPlantId] = useState(existing?.plantId ?? initialPlantId ?? '');
  const [plantQuery, setPlantQuery] = useState('');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [logType, setLogType] = useState<JournalLogType>(existing?.logType ?? initialLogType ?? 'growth');
  const [healthStatus, setHealthStatus] = useState<JournalHealthStatus>(existing?.healthStatus ?? 'healthy');
  const [entryDate, setEntryDate] = useState(() =>
    existing
      ? formatDateVi(existing.entryDate)
      : formatDateVi(initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : toLocalIsoDate()),
  );
  const [newPhotos, setNewPhotos] = useState<LocalPhotoDraft[]>([]);
  const [existingPhotoIds, setExistingPhotoIds] = useState<string[]>(existing?.photoIds ?? []);
  const [heightInput, setHeightInput] = useState('');
  const [leafInput, setLeafInput] = useState('');
  const [bloomInput, setBloomInput] = useState<BloomStage | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (existing) {
      setPlantId(existing.plantId);
      setTitle(existing.title ?? '');
      setNote(existing.note);
      setLogType(existing.logType);
      setHealthStatus(existing.healthStatus);
      setEntryDate(formatDateVi(existing.entryDate));
      setExistingPhotoIds(existing.photoIds);
    }
  }, [existing]);

  useEffect(() => {
    if (!editing || !existing?.plantId || !accessToken) return;
    let active = true;
    void fetchPlantGrowthRecords(existing.plantId, accessToken)
      .then((rows) => {
        if (!active) return;
        const matched = [...rows].reverse().find((r) => r.recordedDate === existing.entryDate);
        if (matched) {
          setHeightInput(matched.heightCm != null ? String(matched.heightCm) : '');
          setLeafInput(matched.leafCount != null ? String(matched.leafCount) : '');
          setBloomInput(matched.bloomStage ?? null);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [editing, existing?.plantId, existing?.entryDate, accessToken]);

  const selectedPlant = ownedPlants.find((p) => p.id === plantId);
  const matchingPlants = plantQuery.trim()
    ? ownedPlants.filter((item) =>
        `${item.name} ${item.scientificName} ${item.location}`
          .toLocaleLowerCase()
          .includes(plantQuery.trim().toLocaleLowerCase()),
      )
    : ownedPlants.slice(0, 20);

  const totalPhotoCount = existingPhotoIds.length + newPhotos.length;

  const pickPhoto = async () => {
    if (totalPhotoCount >= MAX_PHOTOS) {
      Alert.alert('Giới hạn ảnh', `Mỗi bài nhật ký chỉ đính kèm tối đa ${MAX_PHOTOS} ảnh.`);
      return;
    }
    const picked = await pickOrCaptureOptimizedImage({
      maxWidth: 1600,
      quality: 0.8,
      title: 'Đính kèm ảnh nhật ký',
    });
    if (!picked) return;
    const draft: LocalPhotoDraft = {
      uri: picked.uri,
      mimeType: picked.mimeType,
      fileName: picked.fileName,
      fileSize: picked.fileSize,
    };
    const validationError = validateJournalPhotoDraft(draft);
    if (validationError) {
      Alert.alert('Ảnh chưa hợp lệ', validationError);
      return;
    }
    setNewPhotos((prev) => [...prev, draft]);
  };

  const handleRemoveExistingPhoto = async (photoId: string) => {
    if (!existing) return;
    try {
      await removePhoto(existing.id, photoId);
      setExistingPhotoIds((prev) => prev.filter((id) => id !== photoId));
    } catch (err) {
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể xóa ảnh.');
    }
  };

  const save = async () => {
    setErrorMsg('');
    if (!plantId || !note.trim()) {
      setErrorMsg('Hãy chọn cây và nhập nội dung ghi chú để tiếp tục.');
      return;
    }
    const isoDate = parseUserDate(entryDate);
    if (!isoDate) {
      setErrorMsg('Ngày ghi nhận không đúng định dạng (DD/MM/YYYY hoặc YYYY-MM-DD).');
      return;
    }
    const parsedHeight = heightInput.trim() ? Number(heightInput.trim().replace(',', '.')) : null;
    if (parsedHeight !== null && (Number.isNaN(parsedHeight) || parsedHeight < 0 || parsedHeight > 9999.9)) {
      setErrorMsg('Chiều cao (cm) phải nằm trong khoảng 0 – 9999.9.');
      return;
    }
    const parsedLeaf = leafInput.trim() ? Number(leafInput.trim()) : null;
    if (parsedLeaf !== null && (!Number.isInteger(parsedLeaf) || parsedLeaf < 0 || parsedLeaf > 100000)) {
      setErrorMsg('Số lá phải là số nguyên từ 0 trở lên.');
      return;
    }
    const hasGrowthMetrics = parsedHeight !== null || parsedLeaf !== null || bloomInput !== null;
    setSaving(true);
    try {
      if (editing && existing) {
        const result = await updateJournal(
          existing.id,
          { entryDate: isoDate, logType, healthStatus, title: title.trim() || null, note: note.trim() },
          newPhotos,
        );
        if (hasGrowthMetrics && accessToken) {
          await createPlantGrowthRecord(existing.plantId, accessToken, {
            recordedDate: isoDate,
            heightCm: parsedHeight,
            leafCount: parsedLeaf,
            bloomStage: bloomInput,
            note: title.trim() || null,
          });
        }
        if (result.failedPhotoCount > 0) {
          Alert.alert(
            'Đã lưu nội dung nhật ký',
            `Đã lưu nội dung nhật ký nhưng ${result.failedPhotoCount} ảnh chưa tải lên được; bạn có thể vào Chỉnh sửa để thử lại.`,
            [{ text: 'OK', onPress: () => safeBack('/journal') }],
          );
        } else {
          Alert.alert('Đã cập nhật', 'Bài nhật ký đã được lưu thay đổi.', [
            { text: 'OK', onPress: () => safeBack('/journal') },
          ]);
        }
      } else {
        const result = await createJournal(
          plantId,
          {
            careTaskId: careTaskId || null,
            entryDate: isoDate,
            logType,
            healthStatus,
            title: title.trim() || null,
            note: note.trim(),
          },
          newPhotos,
        );
        if (hasGrowthMetrics && accessToken) {
          await createPlantGrowthRecord(plantId, accessToken, {
            recordedDate: isoDate,
            heightCm: parsedHeight,
            leafCount: parsedLeaf,
            bloomStage: bloomInput,
            note: title.trim() || null,
          });
        }
        if (result.failedPhotoCount > 0) {
          Alert.alert(
            'Đã lưu nội dung nhật ký',
            `Đã lưu nội dung nhật ký nhưng ${result.failedPhotoCount} ảnh chưa tải lên được; bạn có thể vào Chỉnh sửa để thử lại.`,
            [{ text: 'OK', onPress: () => safeBack('/journal') }],
          );
        } else {
          Alert.alert('Đã lưu ghi nhận', 'Nhật ký chăm sóc đã được thêm thành công.', [
            { text: 'OK', onPress: () => safeBack('/journal') },
          ]);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu ghi nhận. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={j.safe} edges={['top']}>
      <Header title={editing ? 'Chỉnh sửa nhật ký' : 'Thêm ghi nhận mới'} />
      <ScrollView contentContainerStyle={j.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={j.tip}>
          <Text style={j.sectionTitle}>{editing ? 'Cập nhật nhật ký cây' : 'Ghi nhận tình trạng cây'}</Text>
          <Text style={j.body}>Lưu lại tình trạng và tiến triển kèm hình ảnh để tiện theo dõi.</Text>
        </View>

        <Text style={j.label}>
          1. Chọn cây trong vườn của bạn <Text style={j.required}>*</Text>
        </Text>
        {editing && existing ? (
          <View style={[j.plantCard, j.selected]}>
            <View style={j.thumbSmall}><Text>♧</Text></View>
            <View style={j.copy}>
              <Text style={j.titleSmall}>{existing.plantName}</Text>
              <Text style={j.body}>{existing.plantScientificName}</Text>
            </View>
          </View>
        ) : ownedPlants.length ? (
          <>
            <TextInput
              value={plantQuery}
              onChangeText={setPlantQuery}
              placeholder="Tìm theo tên cây hoặc tên khoa học"
              placeholderTextColor={C.mutedText}
              style={j.input}
            />
            {selectedPlant ? (
              <View style={j.selectedBanner}>
                <Text style={j.selectedBannerText}>✓ Đã chọn: {selectedPlant.name}</Text>
                <Pressable onPress={() => { setPlantId(''); setPlantQuery(''); }}>
                  <Text style={j.deleteLink}>Bỏ chọn</Text>
                </Pressable>
              </View>
            ) : null}
            {matchingPlants.slice(0, 20).map((item) => (
              <Pressable
                key={item.id}
                onPress={() => { setPlantId(item.id); setPlantQuery(item.name); }}
                style={[j.plantCard, plantId === item.id && j.selected]}>
                <View style={j.thumbSmall}><Text>♧</Text></View>
                <View style={j.copy}>
                  <Text style={j.titleSmall}>{item.name}</Text>
                  <Text style={j.body}>{item.scientificName}{item.location ? ` • ${item.location}` : ''}</Text>
                </View>
                <Text style={j.radio}>{plantId === item.id ? '●' : '○'}</Text>
              </Pressable>
            ))}
            {plantQuery.trim() && matchingPlants.length === 0 ? (
              <Text style={j.note}>Không tìm thấy cây phù hợp với nội dung tìm kiếm.</Text>
            ) : null}
          </>
        ) : (
          <View style={j.card}>
            <Text style={j.body}>Bạn chưa có cây trong danh sách. Hãy thêm cây trước khi tạo nhật ký.</Text>
            <Pressable onPress={() => router.push('/garden/add-plant' as never)}>
              <Text style={j.link}>＋ Thêm cây của bạn</Text>
            </Pressable>
          </View>
        )}

        <Text style={j.label}>2. Loại ghi nhận</Text>
        <View style={j.chips}>
          {JOURNAL_LOG_TYPES.map((typeKey) => {
            const meta = JOURNAL_LOG_TYPE_META[typeKey];
            const active = logType === typeKey;
            return (
              <Pressable key={typeKey} onPress={() => setLogType(typeKey)} style={[j.chip, active && j.selected]}>
                <Text style={[j.chipText, active && j.chipTextSelected]}>{meta.emoji} {meta.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={j.label}>3. Tình trạng cây</Text>
        <View style={j.chips}>
          {JOURNAL_HEALTH_STATUSES.map((statusKey) => {
            const meta = JOURNAL_HEALTH_META[statusKey];
            const active = healthStatus === statusKey;
            return (
              <Pressable key={statusKey} onPress={() => setHealthStatus(statusKey)} style={[j.chip, active && j.selected]}>
                <Text style={[j.chipText, active && j.chipTextSelected]}>{meta.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={j.label}>4. Hình ảnh ({totalPhotoCount}/{MAX_PHOTOS})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={j.photoScroll}>
          {existing && existingPhotoIds.map((photoId) => (
            <View key={photoId} style={j.photoPreviewWrap}>
              <AuthorizedImage
                uri={`${apiBaseUrl}/api/v1/journals/${existing.id}/photos/${photoId}`}
                accessToken={accessToken}
                contentFit="cover"
                style={j.photoPreview}
              />
              <Pressable onPress={() => void handleRemoveExistingPhoto(photoId)} style={j.photoRemoveBtn}>
                <Text style={j.photoRemoveText}>✕</Text>
              </Pressable>
            </View>
          ))}
          {newPhotos.map((photo, index) => (
            <View key={`${photo.uri}-${index}`} style={j.photoPreviewWrap}>
              <ExpoImage source={{ uri: photo.uri }} contentFit="cover" style={j.photoPreview} />
              <Pressable
                onPress={() => setNewPhotos((prev) => prev.filter((_, i) => i !== index))}
                style={j.photoRemoveBtn}>
                <Text style={j.photoRemoveText}>✕</Text>
              </Pressable>
            </View>
          ))}
          {totalPhotoCount < MAX_PHOTOS ? (
            <Pressable onPress={() => void pickPhoto()} style={j.addPhoto}>
              <Text style={j.photoAdd}>＋</Text>
              <Text style={j.body}>Thêm ảnh</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <Text style={j.label}>5. Tiêu đề ngắn (tùy chọn)</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Ví dụ: Cây ra chồi non mới"
          placeholderTextColor={C.mutedText}
          style={j.input}
        />

        <Text style={j.label}>
          6. Ghi chú <Text style={j.required}>*</Text>
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Mô tả tình trạng lá, rễ, biện pháp chăm sóc..."
          placeholderTextColor={C.mutedText}
          style={[j.input, j.multiline, errorMsg && !note.trim() ? j.errorBorder : null]}
        />

        <Text style={j.label}>Ngày ghi nhận</Text>
        <TextInput
          value={entryDate}
          onChangeText={setEntryDate}
          placeholder="DD/MM/YYYY"
          placeholderTextColor={C.mutedText}
          style={j.input}
        />

        <Text style={j.label}>7. Chỉ số sinh trưởng (tùy chọn)</Text>
        <View style={j.growthRow}>
          <TextInput
            value={heightInput}
            onChangeText={setHeightInput}
            placeholder="Chiều cao (cm)"
            placeholderTextColor={C.mutedText}
            keyboardType="decimal-pad"
            style={[j.input, { flex: 1 }]}
          />
          <TextInput
            value={leafInput}
            onChangeText={setLeafInput}
            placeholder="Số lá"
            placeholderTextColor={C.mutedText}
            keyboardType="number-pad"
            style={[j.input, { flex: 1 }]}
          />
        </View>
        <View style={j.chips}>
          {BLOOM_STAGES.map((stage) => {
            const active = bloomInput === stage;
            return (
              <Pressable
                key={stage}
                onPress={() => setBloomInput((curr) => (curr === stage ? null : stage))}
                style={[j.chip, active && j.selected]}>
                <Text style={[j.chipText, active && j.chipTextSelected]}>{BLOOM_STAGE_META[stage]}</Text>
              </Pressable>
            );
          })}
        </View>

        {errorMsg ? <Text style={j.errorText}>⚠️ {errorMsg}</Text> : null}

        <Pressable disabled={saving} onPress={() => void save()} style={[j.submit, saving && j.btnDisabled]}>
          <Text style={j.submitText}>
            {saving ? 'Đang lưu...' : editing ? '✓ Lưu thay đổi' : '✓ Lưu ghi nhận'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export function NewJournalScreen({
  initialPlantId,
  careTaskId,
  initialLogType,
  initialDate,
}: {
  initialPlantId?: string;
  careTaskId?: string;
  initialLogType?: JournalLogType;
  initialDate?: string;
}) {
  return (
    <JournalForm
      initialPlantId={initialPlantId}
      careTaskId={careTaskId}
      initialLogType={initialLogType}
      initialDate={initialDate}
    />
  );
}

export function EditJournalScreen({ journalId }: { journalId?: string }) {
  return <JournalForm editing journalId={journalId} />;
}

const j = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { height: 52, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDE8E0' },
  back: { color: C.forest, fontSize: 29, width: 32 },
  headerTitle: { flex: 1, color: C.forest, fontFamily: F.semiBold, fontSize: 15, textAlign: 'center' },
  content: { padding: 13, gap: 10, paddingBottom: 28 },
  plantCard: { padding: 10, borderRadius: 12, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 9 },
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#E6F0E8', alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26 },
  copy: { flex: 1, gap: 3 },
  title: { color: C.forest, fontFamily: F.bold, fontSize: 15 },
  body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: '#DDF2E4', color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  addInlineBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: C.primary },
  addInlineText: { color: C.surface, fontFamily: F.semiBold, fontSize: 11 },
  card: { padding: 12, borderRadius: 13, backgroundColor: C.surface, gap: 8 },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 },
  metrics: { flexDirection: 'row', gap: 6 },
  metric: { flex: 1, padding: 8, borderRadius: 9, backgroundColor: C.softSurface },
  metricValue: { color: C.forest, fontFamily: F.bold, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  emptyTimeline: { paddingVertical: 14, gap: 10, alignItems: 'center' },
  entry: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DFE9E1', gap: 6 },
  date: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
  healthPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, fontFamily: F.semiBold, fontSize: 10 },
  titleSmall: { color: C.text, fontFamily: F.semiBold, fontSize: 13 },
  entryNote: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  photoScroll: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  photoImage: { width: 112, height: 90, borderRadius: 10, backgroundColor: '#E0EEE3' },
  entryActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  link: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
  deleteLink: { color: '#B42318', fontFamily: F.semiBold, fontSize: 11 },
  submit: { minHeight: 46, paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: C.surface, fontFamily: F.semiBold, fontSize: 13 },
  btnDisabled: { opacity: 0.55 },
  note: { color: C.mutedText, fontFamily: F.regular, textAlign: 'center', fontSize: 11 },
  tip: { padding: 12, borderRadius: 11, backgroundColor: C.softSurface, gap: 3 },
  label: { marginTop: 3, color: C.text, fontFamily: F.semiBold, fontSize: 12 },
  required: { color: C.terracotta },
  thumbSmall: { width: 34, height: 34, borderRadius: 8, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  selected: { borderWidth: 1.5, borderColor: C.primary, backgroundColor: '#E5F4E9' },
  selectedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 10, backgroundColor: '#D5F2E1' },
  selectedBannerText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  radio: { marginLeft: 'auto', color: C.primary, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: '#DDE8E0' },
  chipText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12 },
  chipTextSelected: { color: C.primary, fontFamily: F.semiBold },
  photoPreviewWrap: { position: 'relative', width: 96, height: 90 },
  photoPreview: { width: 96, height: 90, borderRadius: 10, backgroundColor: '#E0EEE3' },
  photoRemoveBtn: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  photoRemoveText: { color: '#FFFFFF', fontSize: 11, fontFamily: F.bold },
  addPhoto: { width: 96, height: 90, borderRadius: 10, borderWidth: 1, borderColor: '#D5E3D8', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  photoAdd: { color: C.primary, fontSize: 20 },
  growthRow: { flexDirection: 'row', gap: 8 },
  input: { minHeight: 44, paddingHorizontal: 12, borderRadius: 9, backgroundColor: C.surface, fontFamily: F.regular, fontSize: 13, color: C.text, borderWidth: StyleSheet.hairlineWidth, borderColor: '#DDE8E0' },
  multiline: { minHeight: 96, paddingTop: 10, textAlignVertical: 'top' },
  errorBorder: { borderWidth: 1, borderColor: '#B42318' },
  errorText: { color: '#B42318', fontFamily: F.regular, fontSize: 12, textAlign: 'center' },
  lightboxBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  lightboxImage: { width: '100%', height: '80%' },
  lightboxClose: { position: 'absolute', top: 44, right: 18, zIndex: 2, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  lightboxCloseText: { color: '#FFFFFF', fontSize: 18, fontFamily: F.bold },
});
