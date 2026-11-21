import { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { safeBack } from '@/services/navigation';
import { AccountButton } from '@/features/auth/AccountButton';
import { useAuthSession } from '@/features/auth/AuthSession';
import { GardenArtwork } from '@/features/gardens/GardenArtwork';
import { GardenPickerModal } from '@/features/gardens/GardenPickerModal';
import { useJournals } from '@/features/journal/JournalStore';
import { PlantArtwork } from '@/features/plants/PlantArtwork';
import { usePlantData, type OwnedPlant } from '@/features/plants/PlantDataStore';
import { CARE_TASK_META, useCareSchedules } from '@/features/schedule/CareScheduleStore';
import { ApiError, apiBaseUrl, fetchGardenWeather, fetchWeatherProvinces, getGardenPhotoUri, type ApiGardenWeather, type ApiProvince } from '@/services/api';

function GardenHeader({ title }: { title: string }) {
  return <View style={g.header}><Pressable onPress={() => safeBack('/gardens')} style={g.back}><Text style={g.backText}>‹</Text></Pressable><Text style={g.headerTitle}>{title}</Text><AccountButton size={29} /></View>;
}

function ActionButton({ label, secondary = false, onPress }: { label: string; secondary?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[g.action, secondary && g.actionSecondary]}><Text style={[g.actionText, secondary && g.actionTextSecondary]}>{label}</Text></Pressable>;
}

export function GardenDetailScreen() {
  const { gardenId } = useLocalSearchParams<{ gardenId?: string }>();
  const { gardens, ownedPlants, catalog, updatePlant, removePlant, removeGarden, updateGardenPhoto, removeGardenPhoto } = usePlantData();
  const { todayTasks, completeTask } = useCareSchedules();
  const { journals } = useJournals();
  const { accessToken } = useAuthSession();
  const garden = gardens.find((item) => item.id === gardenId);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const replaceGardenPhoto = async () => {
    if (!garden) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần quyền truy cập ảnh', 'Cho phép GoPlant truy cập thư viện ảnh để chọn ảnh khu vườn.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    setUploadingPhoto(true);
    try {
      const asset = result.assets[0];
      await updateGardenPhoto(garden.id, { uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
      Alert.alert('Đã cập nhật ảnh', 'Ảnh bìa khu vườn đã được lưu.');
    } catch (error) {
      Alert.alert('Không tải được ảnh', error instanceof Error ? error.message : 'Vui lòng thử ảnh JPEG hoặc PNG dưới 5 MB.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const confirmDeleteGardenPhoto = () => {
    if (!garden || !garden.photoUpdatedAt) return;
    Alert.alert('Xóa ảnh bìa', 'Khôi phục ảnh mặc định cho khu vườn này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa ảnh',
        style: 'destructive',
        onPress: () => {
          setUploadingPhoto(true);
          void removeGardenPhoto(garden.id)
            .catch((error) => Alert.alert('Không xóa được ảnh', error instanceof Error ? error.message : 'Vui lòng thử lại.'))
            .finally(() => setUploadingPhoto(false));
        },
      },
    ]);
  };
  const plants = ownedPlants.filter((plant) => plant.gardenId === gardenId);
  const gardenPlantIds = new Set(plants.map((p) => p.id));
  const gardenPendingTasks = todayTasks.filter((t) => t.status === 'pending' && gardenPlantIds.has(t.plantId));
  const pendingTodayCount = gardenPendingTasks.length;

  // Health summary from latest journal of each plant in this garden
  const healthSummary = (() => {
    const latestStatus = new Map<string, string>();
    const sorted = [...journals].sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt));
    for (const entry of sorted) {
      if (gardenPlantIds.has(entry.plantId) && !latestStatus.has(entry.plantId)) {
        latestStatus.set(entry.plantId, entry.healthStatus);
      }
    }
    let healthy = 0;
    let attention = 0;
    for (const p of plants) {
      const st = latestStatus.get(p.id);
      if (st === 'warning' || st === 'critical') attention += 1;
      else healthy += 1;
    }
    return { healthy, attention };
  })();

  const [movingPlant, setMovingPlant] = useState<OwnedPlant | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  const handleMovePlant = async (nextGardenId: string | null) => {
    if (!movingPlant) return;
    setMoveBusy(true);
    try {
      await updatePlant(movingPlant.id, { ...movingPlant, gardenId: nextGardenId });
      setMovingPlant(null);
    } catch (err) {
      Alert.alert('Không thể chuyển vườn', err instanceof Error ? err.message : 'Vui lòng thử lại.');
    } finally {
      setMoveBusy(false);
    }
  };
  const [weather, setWeather] = useState<ApiGardenWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');

  const loadWeather = useCallback(async (forceRefresh = false) => {
    if (!gardenId || !accessToken) return;
    setWeatherLoading(true);
    setWeatherError('');
    try {
      const data = await fetchGardenWeather(gardenId, accessToken, forceRefresh);
      setWeather(data);
    } catch (error) {
      setWeatherError(error instanceof ApiError ? error.message : 'Không tải được dữ liệu thời tiết.');
    } finally {
      setWeatherLoading(false);
    }
  }, [gardenId, accessToken]);

  useEffect(() => {
    void loadWeather(false);
  }, [loadWeather]);

  const locationSummary = garden?.provinceName
    ? garden.provinceName
    : garden?.latitude != null && garden?.longitude != null
      ? `GPS (${garden.latitude.toFixed(3)}, ${garden.longitude.toFixed(3)})`
      : null;

  return <SafeAreaView style={g.safe} edges={['top']}><GardenHeader title="Chi tiết khu vườn"/><ScrollView contentContainerStyle={g.content}>
    {!garden ? <View style={g.card}><Text style={g.sectionTitle}>Không tìm thấy khu vườn</Text><Text style={g.body}>Danh sách có thể đã thay đổi hoặc khu vườn đã bị xóa.</Text><ActionButton label="Về danh sách vườn" onPress={() => router.replace('/gardens' as never)}/></View> : <>
      <GardenArtwork
        locationType={garden.locationType}
        photoUri={getGardenPhotoUri(garden.id, garden.photoUpdatedAt)}
        accessToken={accessToken}
        style={g.hero}
        glyphStyle={g.heroPlant}
        labelStyle={g.heroLabel}
      />
      <View style={g.photoActionsRow}>
        <Pressable
          accessibilityRole="button"
          disabled={uploadingPhoto}
          onPress={() => void replaceGardenPhoto()}
          style={[g.photoBtn, uploadingPhoto && g.photoBtnDisabled]}>
          <Text style={g.photoBtnText}>{uploadingPhoto ? 'Đang tải ảnh…' : 'Đổi ảnh khu vườn'}</Text>
        </Pressable>
        {garden.photoUpdatedAt ? (
          <Pressable
            accessibilityRole="button"
            disabled={uploadingPhoto}
            onPress={confirmDeleteGardenPhoto}
            style={[g.photoDeleteBtn, uploadingPhoto && g.photoBtnDisabled]}>
            <Text style={g.photoDeleteBtnText}>Xóa ảnh</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={g.title}>{garden.name}</Text>
      <Text style={g.body}>⌖  {garden.locationDetail || 'Chưa có vị trí cụ thể'}{locationSummary ? ` • ${locationSummary}` : ''}</Text>
      <View style={g.card}>
        <Text style={g.sectionTitle}>Tổng quan khu vườn</Text>
        <Text style={g.body}>{garden.description || 'Chưa có mô tả.'}</Text>
        <Text style={g.body}>{plants.length} cây đang trồng</Text>
        {plants.length > 0 ? (
          <View style={g.healthBadgesRow}>
            <Text style={g.healthMintBadge}>🌿 {healthSummary.healthy} khỏe mạnh</Text>
            {healthSummary.attention > 0 ? (
              <Text style={g.healthWarnBadge}>⚠ {healthSummary.attention} cần theo dõi</Text>
            ) : null}
          </View>
        ) : null}
        <Pressable onPress={() => router.push('/schedule' as never)}><Text style={g.link}>{pendingTodayCount > 0 ? `◷ ${pendingTodayCount} việc chăm sóc cần làm hôm nay ›` : '◷ Xem lịch chăm sóc ›'}</Text></Pressable>
      </View>

      {gardenPendingTasks.length > 0 ? (
        <View style={g.taskBannerCard}>
          <View style={g.row}>
            <Text style={g.sectionTitle}>Hôm nay vườn này có {gardenPendingTasks.length} việc cần làm</Text>
            <Pressable onPress={() => router.push('/schedule' as never)}><Text style={g.link}>Tất cả ›</Text></Pressable>
          </View>
          {gardenPendingTasks.slice(0, 4).map((task) => {
            const meta = CARE_TASK_META[task.taskType] ?? CARE_TASK_META.other;
            const busy = completingTaskId === task.id;
            return (
              <View key={task.id} style={g.gardenTaskRow}>
                <View style={g.plantCopy}>
                  <Text style={g.plantName}>{meta.emoji} {task.title || meta.label} · {task.plantName}</Text>
                </View>
                <Pressable
                  disabled={busy}
                  onPress={() => {
                    setCompletingTaskId(task.id);
                    void completeTask(task.id).finally(() => setCompletingTaskId(null));
                  }}
                  style={g.quickDoneBtn}>
                  <Text style={g.quickDoneText}>{busy ? '...' : '✓ Xong'}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={g.card}>
        <View style={g.row}>
          <Text style={g.sectionTitle}>Thời tiết & Môi trường</Text>
          {garden.locationSource ? (
            <Pressable accessibilityRole="button" disabled={weatherLoading} onPress={() => void loadWeather(true)}>
              <Text style={g.link}>{weatherLoading ? 'Đang cập nhật…' : '↻ Làm mới'}</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/garden/create', params: { editGardenId: garden.id } } as never)}>
              <Text style={g.link}>＋ Thiết lập vị trí</Text>
            </Pressable>
          )}
        </View>
        {weatherError ? <Text style={g.error}>{weatherError}</Text> : null}
        {!weather && weatherLoading ? <Text style={g.body}>Đang lấy dữ liệu thời tiết…</Text> : null}
        {weather?.status === 'NO_LOCATION' ? (
          <Text style={g.body}>Khu vườn chưa có tỉnh/thành hoặc tọa độ GPS. Hãy thiết lập vị trí để xem nhiệt độ và độ ẩm ngoài trời.</Text>
        ) : weather?.status === 'NOT_CONFIGURED' && weather.temperatureC == null ? (
          <Text style={g.body}>Máy chủ chưa cấu hình khóa OpenWeatherMap.</Text>
        ) : weather?.status === 'UNAVAILABLE' && weather.temperatureC == null ? (
          <Text style={g.body}>Không thể kết nối OpenWeatherMap lúc này. Vui lòng thử lại sau.</Text>
        ) : weather && weather.temperatureC != null ? (
          <>
            <View style={g.weatherTop}>
              <Text style={g.weatherTemp}>{Math.round(weather.temperatureC)}°C</Text>
              <View style={g.plantCopy}>
                <Text style={g.plantName}>{weather.conditionDescription || weather.conditionMain || 'Thời tiết hiện tại'}</Text>
                <Text style={g.body}>
                  {weather.provinceName || weather.locationName || 'Khu vực vườn'}
                  {weather.feelsLikeC != null ? ` • Cảm giác ${Math.round(weather.feelsLikeC)}°C` : ''}
                </Text>
              </View>
            </View>
            <View style={g.metrics}>
              <View style={g.metric}><Text style={g.metricValue}>{weather.humidityPct != null ? `${weather.humidityPct}%` : '—'}</Text><Text style={g.body}>Độ ẩm</Text></View>
              <View style={g.metric}><Text style={g.metricValue}>{weather.windSpeedMs != null ? `${weather.windSpeedMs} m/s` : '—'}</Text><Text style={g.body}>Gió</Text></View>
              <View style={g.metric}><Text style={g.metricValue}>{weather.cloudsPct != null ? `${weather.cloudsPct}%` : '—'}</Text><Text style={g.body}>Mây che</Text></View>
            </View>
            {!weather.outdoor ? <Text style={g.note}>Đây là nhiệt độ ngoài trời tham khảo; khu vườn trong nhà/nhà kính có thể chênh lệch.</Text> : null}
            {weather.stale ? <Text style={g.note}>Đang hiển thị dữ liệu lưu gần nhất do chưa làm mới được từ OpenWeatherMap.</Text> : null}
            {weather.plantAlerts.length > 0 ? (
              <View style={g.alertBox}>
                <Text style={g.alertTitle}>Cảnh báo ngưỡng nhiệt độ ({weather.plantAlerts.length} cây)</Text>
                {weather.plantAlerts.map((alert) => (
                  <Text key={alert.plantId} style={g.alertText}>
                    • {alert.displayName}: {alert.level === 'too_hot' ? 'Đang nóng hơn' : 'Đang lạnh hơn'} ngưỡng khuyến nghị ({alert.temperatureRange})
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </View>
      <View style={g.row}><Text style={g.sectionTitle}>Cây đang trồng ({plants.length})</Text><Pressable onPress={() => router.push({ pathname: '/garden/add-plant', params: { gardenId: garden.id } } as never)}><Text style={g.link}>＋ Thêm cây</Text></Pressable></View>
      {plants.map((plant) => (
        <View key={plant.id} style={g.plantCard}>
          <PlantArtwork category={catalog.find((item) => item.id === plant.catalogId)?.category ?? 'Cây trồng'} accessToken={accessToken} photoUri={plant.photoUpdatedAt ? `${apiBaseUrl}/api/v1/plants/${plant.id}/photo?v=${encodeURIComponent(plant.photoUpdatedAt)}` : null} style={g.plantImage}/>
          <View style={g.plantCopy}>
            <Text style={g.plantName}>{plant.name}</Text>
            <Text style={g.body}>{plant.scientificName} • {plant.location || 'Chưa có vị trí cụ thể'}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Chuyển vườn cho ${plant.name}`} onPress={() => setMovingPlant(plant)} style={g.moveBtn}>
            <Text style={g.moveBtnText}>Chuyển</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Xem chi tiết ${plant.name}`} onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name, ownedId: plant.id } } as never)}>
            <Text style={g.link}>›</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ${plant.name} khỏi vườn`} onPress={() => Alert.alert('Xóa cây', `Xóa hồ sơ “${plant.name}” khỏi tài khoản?`, [{ text: 'Hủy', style: 'cancel' }, { text: 'Xóa cây', style: 'destructive', onPress: () => void removePlant(plant.id).catch((error) => Alert.alert('Không thể xóa cây', error instanceof Error ? error.message : 'Vui lòng thử lại.')) }])}>
            <Text style={g.deleteLink}>Xóa</Text>
          </Pressable>
        </View>
      ))}
      {plants.length === 0 ? <Text style={g.note}>Khu vườn chưa có cây.</Text> : null}
      <ActionButton label="Chỉnh sửa thông tin vườn" onPress={() => router.push({ pathname: '/garden/create', params: { editGardenId: garden.id } } as never)}/>
      <ActionButton secondary label="Xóa khu vườn" onPress={() => Alert.alert('Xóa khu vườn', 'Cây trong vườn sẽ được giữ lại và chuyển sang trạng thái chưa phân vườn.', [{ text: 'Hủy', style: 'cancel' }, { text: 'Xóa vườn', style: 'destructive', onPress: () => void removeGarden(garden.id).then(() => router.replace('/gardens' as never)).catch((error) => Alert.alert('Không thể xóa vườn', error instanceof Error ? error.message : 'Vui lòng thử lại.')) }])}/>
    </>}
  </ScrollView>
  <GardenPickerModal
    visible={Boolean(movingPlant)}
    title="Chuyển cây sang vườn khác"
    subtitle={movingPlant ? `Chọn khu vườn mới cho “${movingPlant.name}”.` : undefined}
    gardens={gardens}
    currentGardenId={garden?.id}
    allowUnassign
    busy={moveBusy}
    onSelect={(id) => void handleMovePlant(id)}
    onClose={() => setMovingPlant(null)}
  />
  </SafeAreaView>;
}

function GardenForm({ addPlant = false }: { addPlant?: boolean }) {
  const params = useLocalSearchParams<{ editId?: string; plantId?: string; gardenId?: string; editGardenId?: string }>();
  const { catalog, gardens, ownedPlants, addGarden, updateGarden, addPlant: createOwnedPlant, updatePlant, refresh } = usePlantData();
  const editId = params.editId;
  const editGardenId = params.editGardenId;
  const editingGarden = !addPlant && editGardenId ? gardens.find((item) => item.id === editGardenId) : undefined;
  const editingPlant = editId ? ownedPlants.find((item) => item.id === editId) : undefined;
  const initialCatalogId = params.plantId ?? editingPlant?.catalogId ?? '';
  const initialCatalogPlant = catalog.find((plant) => plant.id === initialCatalogId);
  const [name, setName] = useState(editingPlant?.name ?? editingGarden?.name ?? initialCatalogPlant?.name ?? '');
  const [place, setPlace] = useState(editingPlant?.location ?? editingGarden?.locationDetail ?? '');
  const [error, setError] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [selected, setSelected] = useState(addPlant ? initialCatalogId : '');
  const [gardenType, setGardenType] = useState(editingGarden?.locationType ?? 'balcony');
  const [gardenId, setGardenId] = useState(editingPlant?.gardenId ?? params.gardenId ?? '');
  const [description, setDescription] = useState(editingGarden?.description ?? '');
  const [plantedAt, setPlantedAt] = useState(editingPlant?.plantedAt ?? '');
  const [note, setNote] = useState(editingPlant?.note ?? '');
  const [plantQuery, setPlantQuery] = useState('');
  const [locationMode, setLocationMode] = useState<'none' | 'province' | 'gps'>(editingGarden?.locationSource ?? 'none');
  const [provinces, setProvinces] = useState<ApiProvince[]>([]);
  const [provinceCode, setProvinceCode] = useState(editingGarden?.provinceCode ?? '');
  const [provinceQuery, setProvinceQuery] = useState('');
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(
    editingGarden?.locationSource === 'gps' && editingGarden.latitude != null && editingGarden.longitude != null
      ? { latitude: editingGarden.latitude, longitude: editingGarden.longitude }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(true);
  const suggestedCatalog = useMemo(() => {
    if (!addPlant || editId || catalog.length === 0) return [];
    const copy = [...catalog];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, 5);
  }, [addPlant, editId, catalog]);
  const title = editId ? 'Chỉnh sửa hồ sơ cây' : editGardenId ? 'Cập nhật khu vườn' : addPlant ? 'Thêm cây trồng' : 'Tạo khu vườn mới';
  const selectedProfile = catalog.find((plant) => plant.id === selected);
  const matchingCatalog = plantQuery.trim()
    ? catalog.filter((plant) => `${plant.name} ${plant.scientificName}`.toLocaleLowerCase().includes(plantQuery.trim().toLocaleLowerCase()))
    : [];
  const filteredCatalog = matchingCatalog.slice(0, 20);
  const filteredProvinces = provinceQuery.trim()
    ? provinces.filter((item) => item.name.toLocaleLowerCase().includes(provinceQuery.trim().toLocaleLowerCase()) || item.center.toLocaleLowerCase().includes(provinceQuery.trim().toLocaleLowerCase()))
    : provinces;

  useEffect(() => {
    if (addPlant) return;
    let active = true;
    void fetchWeatherProvinces().then((rows) => {
      if (active) setProvinces(rows);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [addPlant]);

  useEffect(() => {
    if (initialCatalogPlant && (!name || name === initialCatalogPlant.name)) setName(initialCatalogPlant.name);
  }, [initialCatalogPlant, name]);
  useEffect(() => {
    if (editingPlant) {
      setName(editingPlant.name);
      setPlace(editingPlant.location);
      setPlantedAt(editingPlant.plantedAt);
      setNote(editingPlant.note);
      setSelected(editingPlant.catalogId);
      setGardenId(editingPlant.gardenId ?? '');
    }
  }, [editingPlant]);
  useEffect(() => {
    if (editingGarden) {
      setName(editingGarden.name);
      setPlace(editingGarden.locationDetail);
      setGardenType(editingGarden.locationType);
      setDescription(editingGarden.description);
      setLocationMode(editingGarden.locationSource ?? 'none');
      setProvinceCode(editingGarden.provinceCode ?? '');
      setGpsCoords(editingGarden.locationSource === 'gps' && editingGarden.latitude != null && editingGarden.longitude != null
        ? { latitude: editingGarden.latitude, longitude: editingGarden.longitude }
        : null);
    }
  }, [editingGarden]);

  const pickCurrentGps = async () => {
    setLocationError('');
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationError('Ứng dụng chưa được cấp quyền vị trí. Bạn vẫn có thể chọn Tỉnh/Thành phố.');
        return;
      }
      let pos = await Location.getLastKnownPositionAsync({ maxAge: 300000 });
      if (!pos) {
        pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      }
      setGpsCoords({
        latitude: Math.round(pos.coords.latitude * 1000) / 1000,
        longitude: Math.round(pos.coords.longitude * 1000) / 1000,
      });
    } catch {
      setLocationError('Không thể lấy tọa độ GPS. Kiểm tra dịch vụ vị trí hoặc chọn Tỉnh/Thành phố.');
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    setRequestError('');
    const missingLocation = !addPlant && (
      (locationMode === 'province' && !provinceCode)
      || (locationMode === 'gps' && !gpsCoords)
    );
    const invalid = (addPlant ? !selectedProfile || !name.trim() : !name.trim())
      || Boolean(editId && !editingPlant)
      || Boolean(editGardenId && !editingGarden)
      || missingLocation;
    setError(invalid);
    if (invalid) return;
    try {
      if (addPlant && selectedProfile) {
        const profile = {
          catalogId: selectedProfile.id,
          gardenId: gardenId || null,
          name: name.trim(),
          scientificName: selectedProfile.scientificName,
          category: selectedProfile.category,
          plantedAt: plantedAt.trim(),
          location: place,
          note: note.trim(),
        };
        if (editId) await updatePlant(editId, profile);
        else await createOwnedPlant(profile);
        if (gardenId) router.replace({ pathname: '/garden-detail', params: { gardenId } } as never);
        else router.replace('/plants' as never);
        return;
      }
      const gardenPayload = {
        name: name.trim(),
        locationType: gardenType,
        locationDetail: place.trim(),
        description: description.trim(),
        locationSource: locationMode === 'none' ? null : locationMode,
        provinceCode: locationMode === 'province' ? provinceCode : null,
        latitude: locationMode === 'gps' ? gpsCoords?.latitude ?? null : null,
        longitude: locationMode === 'gps' ? gpsCoords?.longitude ?? null : null,
      };
      if (editGardenId) {
        await updateGarden(editGardenId, gardenPayload);
        router.replace({ pathname: '/garden-detail', params: { gardenId: editGardenId } } as never);
        return;
      }
      await addGarden(gardenPayload);
      await refresh();
      router.replace('/gardens' as never);
    } catch (submitError) {
      setRequestError(submitError instanceof ApiError ? submitError.message : 'Không thể lưu dữ liệu. Vui lòng thử lại.');
    }
  };
  return <SafeAreaView style={g.safe} edges={['top']}><GardenHeader title={title}/><ScrollView contentContainerStyle={g.content}>
    <View style={g.tip}><Text style={g.sectionTitle}>{editId ? 'Cập nhật nơi trồng và thông tin cây' : editGardenId ? 'Cập nhật khu vườn & vị trí' : addPlant ? 'Thêm cây vào khu vườn' : 'Thiết lập không gian xanh'}</Text><Text style={g.body}>{editId ? 'Cây đã chọn được giữ nguyên. Cập nhật khu vườn, vị trí hoặc ghi chú bên dưới.' : addPlant ? 'Tìm một loại cây trong thư viện, sau đó chọn vườn và vị trí trồng.' : 'Tạo khu vườn để quản lý cây, lịch chăm sóc và theo dõi thời tiết ngoài trời.'}</Text></View>
    {!addPlant ? <><Text style={g.label}>Tên khu vườn <Text style={g.required}>*</Text></Text><TextInput value={name} onChangeText={setName} placeholder="Ví dụ: Ban công tầng 3" style={[g.input, error && !name.trim() && g.inputError]}/><Text style={g.label}>Vị trí / khu vực</Text><TextInput value={place} onChangeText={setPlace} placeholder="Ban công, sân thượng..." style={g.input}/><Text style={g.label}>Loại không gian</Text><View style={g.choices}>{[['balcony', 'Ban công'], ['rooftop', 'Sân thượng'], ['garden', 'Sân vườn'], ['indoor', 'Trong nhà'], ['greenhouse', 'Nhà kính'], ['other', 'Khác']].map(([value, label]) => <Pressable key={value} onPress={() => setGardenType(value)} style={[g.choice, gardenType === value && g.choiceActive]}><Text style={g.body}>{label}</Text></Pressable>)}</View>
    <Text style={g.label}>Vị trí thời tiết (OpenWeatherMap)</Text>
    <View style={g.choices}>
      {[['none', 'Chưa chọn'], ['province', 'Chọn Tỉnh/Thành'], ['gps', 'Dùng GPS hiện tại']].map(([mode, label]) => (
        <Pressable key={mode} onPress={() => { setLocationMode(mode as 'none' | 'province' | 'gps'); setLocationError(''); }} style={[g.choice, locationMode === mode && g.choiceActive]}>
          <Text style={g.body}>{label}</Text>
        </Pressable>
      ))}
    </View>
    {locationMode === 'province' ? (
      <View style={g.card}>
        <TextInput value={provinceQuery} onChangeText={setProvinceQuery} placeholder="Tìm tỉnh/thành phố..." style={g.input}/>
        <View style={g.choices}>
          {filteredProvinces.slice(0, 18).map((item) => (
            <Pressable key={item.code} onPress={() => setProvinceCode(item.code)} style={[g.choice, provinceCode === item.code && g.choiceActive]}>
              <Text style={g.body}>{item.name}</Text>
            </Pressable>
          ))}
        </View>
        {provinceCode ? <Text style={g.note}>Đã chọn: {provinces.find((p) => p.code === provinceCode)?.name ?? provinceCode}</Text> : null}
        {error && !provinceCode ? <Text style={g.error}>Vui lòng chọn một tỉnh/thành phố.</Text> : null}
      </View>
    ) : null}
    {locationMode === 'gps' ? (
      <View style={g.card}>
        <ActionButton secondary label={locating ? 'Đang lấy tọa độ GPS…' : gpsCoords ? 'Cập nhật lại tọa độ GPS' : 'Lấy tọa độ hiện tại'} onPress={() => { if (!locating) void pickCurrentGps(); }}/>
        {gpsCoords ? <Text style={g.note}>Tọa độ đã lưu (làm tròn ~110m): {gpsCoords.latitude.toFixed(3)}, {gpsCoords.longitude.toFixed(3)}</Text> : null}
        {locationError ? <Text style={g.error}>{locationError}</Text> : null}
        {error && !gpsCoords ? <Text style={g.error}>Hãy nhấn lấy tọa độ GPS hoặc chuyển sang chọn Tỉnh/Thành.</Text> : null}
      </View>
    ) : null}
    <Text style={g.label}>Mô tả (không bắt buộc)</Text><TextInput value={description} onChangeText={setDescription} placeholder="Thêm ghi chú cho khu vườn..." style={[g.input, g.multiline]} multiline/></> : <>
      {!editId ? <>
        <Text style={g.label}>1. Chọn loại cây</Text>
        {selectedProfile ? <View style={[g.plantCard, g.selectedPlant]}><PlantArtwork category={selectedProfile.category} style={g.plantImage}/><View style={g.plantCopy}><Text style={g.plantName}>{selectedProfile.name}</Text><Text style={g.body}>{selectedProfile.scientificName} • {selectedProfile.category}</Text></View><Text style={g.link}>Đã chọn</Text></View> : null}
        <TextInput value={plantQuery} onChangeText={setPlantQuery} placeholder="Tìm tên cây hoặc tên khoa học" style={g.input}/>
        {!plantQuery.trim() && !selectedProfile ? <Text style={g.note}>Nhập tên cây để tìm trong thư viện {catalog.length} loại. Danh sách chỉ hiện kết quả phù hợp.</Text> : null}
        {filteredCatalog.map((plant) => <Pressable key={plant.id} onPress={() => { setSelected(plant.id); if (!name.trim() || catalog.some((item) => item.name === name)) setName(plant.name); }} style={[g.plantCard, selected === plant.id && g.choiceActive]}><PlantArtwork category={plant.category} style={g.plantImage}/><View style={g.plantCopy}><Text style={g.plantName}>{plant.name}</Text><Text style={g.body}>{plant.scientificName} • {plant.category}</Text></View><Text style={g.link}>{selected === plant.id ? '✓ Đã chọn' : 'Chọn'}</Text></Pressable>)}
        {plantQuery.trim() && filteredCatalog.length === 0 ? <Text style={g.note}>Không tìm thấy loại cây phù hợp. Thử tên thường gọi hoặc tên khoa học khác.</Text> : null}
        {matchingCatalog.length > 20 ? <Text style={g.note}>Hiển thị 20 kết quả đầu. Nhập thêm ký tự để thu hẹp tìm kiếm.</Text> : null}
        {catalog.length === 0 ? <Text style={g.note}>Thư viện chưa có cây nào. Vui lòng thử lại sau.</Text> : null}
      </> : selectedProfile ? <View style={g.plantCard}><PlantArtwork category={selectedProfile.category} style={g.plantImage}/><View style={g.plantCopy}><Text style={g.plantName}>{selectedProfile.name}</Text><Text style={g.body}>{selectedProfile.scientificName}</Text></View></View> : <Text style={g.note}>Không tìm thấy loại cây của hồ sơ này.</Text>}
      {selectedProfile ? <><Text style={g.label}>Tên hiển thị <Text style={g.required}>*</Text></Text><TextInput value={name} onChangeText={setName} placeholder="Tên cây trong hồ sơ của bạn" style={[g.input, error && !name.trim() && g.inputError]}/><Text style={g.label}>2. Chọn vườn nhận cây</Text><Text style={g.body}>{gardenId ? `Cây sẽ được thêm vào ${gardens.find((garden) => garden.id === gardenId)?.name ?? 'vườn đã chọn'}. Bạn có thể đổi vườn bên dưới.` : 'Chọn nơi trồng hoặc để cây ở trạng thái chưa phân vườn.'}</Text><View style={g.choices}><Pressable onPress={() => setGardenId('')} style={[g.choice, !gardenId && g.choiceActive]}><Text style={g.body}>Chưa phân vườn</Text></Pressable>{gardens.map((garden) => <Pressable key={garden.id} onPress={() => setGardenId(garden.id)} style={[g.choice, gardenId === garden.id && g.choiceActive]}><Text style={g.body}>{garden.name}</Text></Pressable>)}</View>{gardens.length === 0 ? <Text style={g.note}>Bạn chưa tạo vườn. Có thể tiếp tục và phân vườn sau.</Text> : null}<Text style={g.label}>Vị trí cụ thể trong vườn (không bắt buộc)</Text><TextInput value={place} onChangeText={setPlace} placeholder="Ví dụ: Kệ cạnh cửa sổ" style={g.input}/><Text style={g.label}>Ngày trồng / bắt đầu chăm sóc (không bắt buộc)</Text><TextInput value={plantedAt} onChangeText={setPlantedAt} placeholder="dd/mm/yyyy" style={g.input}/><Text style={g.label}>Ghi chú (không bắt buộc)</Text><TextInput value={note} onChangeText={setNote} placeholder="Ghi chú về cây" style={[g.input, g.multiline]} multiline/></> : null}
      </>}
    {addPlant && !editId && suggestedCatalog.length > 0 ? (
      <View style={g.suggestSection}>
        <View style={g.row}>
          <Text style={g.sectionTitle}>Danh sách cây gợi ý</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={suggestionsExpanded ? 'Thu gọn danh sách cây gợi ý' : 'Mở rộng danh sách cây gợi ý'}
            onPress={() => setSuggestionsExpanded((prev) => !prev)}
            style={g.toggleBtn}>
            <Text style={g.toggleBtnText}>{suggestionsExpanded ? 'Thu gọn ▲' : 'Mở rộng ▼'}</Text>
          </Pressable>
        </View>
        {suggestionsExpanded ? (
          <View style={g.suggestList}>
            {suggestedCatalog.map((plant) => {
              const isSelected = selected === plant.id;
              return (
                <View key={plant.id} style={[g.plantCard, isSelected && g.choiceActive]}>
                  <PlantArtwork category={plant.category} style={g.plantImage} />
                  <View style={g.plantCopy}>
                    <Text style={g.plantName}>{plant.name}</Text>
                    <Text style={g.body}>{plant.scientificName} • {plant.category}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Chọn cây ${plant.name}`}
                    onPress={() => {
                      setSelected(plant.id);
                      if (!name.trim() || catalog.some((item) => item.name === name)) setName(plant.name);
                    }}
                    style={[g.pickBtn, isSelected && g.pickBtnActive]}>
                    <Text style={[g.pickBtnText, isSelected && g.pickBtnTextActive]}>
                      {isSelected ? '✓ Đã chọn' : 'Chọn'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    ) : null}
    {error ? <Text style={g.error}>{editId && !editingPlant ? 'Không tìm thấy hồ sơ cây trong phiên hiện tại.' : 'Vui lòng nhập đầy đủ thông tin bắt buộc.'}</Text> : null}
    {requestError ? <Text style={g.error}>{requestError}</Text> : null}
    <ActionButton label={editId || editGardenId ? 'Lưu thay đổi' : addPlant ? 'Thêm cây vào danh sách' : 'Tạo khu vườn'} onPress={() => void submit()}/><Text style={g.note}>{addPlant ? 'Cây và ghi chú sẽ được lưu vào tài khoản của bạn.' : 'Vườn sẽ được lưu vào tài khoản của bạn.'}</Text>
  </ScrollView></SafeAreaView>;
}

export function CreateGardenScreen() { return <GardenForm/>; }
export function AddGardenPlantScreen() { return <GardenForm addPlant/>; }

const g = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background }, header: { height: 52, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { width: 34 }, backText: { color: C.forest, fontSize: 29 }, headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 }, profile: { width: 29, height: 29, borderRadius: 15, overflow: 'hidden', backgroundColor: C.forest, color: C.surface, textAlign: 'center', textAlignVertical: 'center', fontFamily: F.bold }, deleteLink: { color: '#A12D24', fontFamily: F.semiBold, fontSize: 10 },
  content: { padding: 13, gap: 9, paddingBottom: 24 }, hero: { height: 180, borderRadius: 15, backgroundColor: '#DCEDE0', alignItems: 'center', justifyContent: 'center' }, heroPlant: { color: '#508664', fontSize: 64 }, heroLabel: { color: C.forest, fontFamily: F.bold, fontSize: 10, letterSpacing: 1 }, title: { color: C.forest, fontFamily: F.bold, fontSize: 19 }, body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 }, metrics: { flexDirection: 'row', gap: 7 }, metric: { flex: 1, padding: 9, borderRadius: 11, backgroundColor: C.surface }, metricValue: { color: C.forest, fontFamily: F.bold, fontSize: 15 }, card: { padding: 11, borderRadius: 14, backgroundColor: C.surface, gap: 8 }, sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' }, link: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 }, icon: { color: C.forest, fontSize: 16 }, time: { color: C.primary, fontFamily: F.semiBold, fontSize: 10 }, plantCard: { minHeight: 66, padding: 8, borderRadius: 12, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 9 }, selectedPlant: { borderWidth: 1, borderColor: C.primary, backgroundColor: '#E5F4E9' }, plantImage: { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.softSurface }, plantEmoji: { fontSize: 22 }, plantCopy: { flex: 1 }, plantName: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 }, action: { minHeight: 44, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, actionText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 }, actionSecondary: { backgroundColor: C.softSurface }, actionTextSecondary: { color: C.forest }, note: { color: C.mutedText, fontFamily: F.regular, fontSize: 9, textAlign: 'center' },
  tip: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, gap: 4 }, label: { color: C.text, fontFamily: F.semiBold, fontSize: 12, marginTop: 4 }, required: { color: C.terracotta }, input: { minHeight: 44, paddingHorizontal: 12, borderRadius: 9, backgroundColor: C.surface, color: C.text, fontFamily: F.regular, fontSize: 12 }, inputError: { borderWidth: 1, borderColor: '#C62828' }, multiline: { height: 80, textAlignVertical: 'top', paddingTop: 10 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 9, backgroundColor: C.surface }, choiceActive: { borderWidth: 1, borderColor: C.primary, backgroundColor: '#E0F2E6' }, heroSmall: { height: 100, borderRadius: 12, backgroundColor: '#E0EEE3', alignItems: 'center', justifyContent: 'center' }, error: { color: '#B42318', fontFamily: F.regular, fontSize: 11 },
  weatherTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  weatherTemp: { color: C.forest, fontFamily: F.bold, fontSize: 28 },
  alertBox: { padding: 10, borderRadius: 10, backgroundColor: C.peach, gap: 4 },
  alertTitle: { color: C.terracotta, fontFamily: F.bold, fontSize: 11 },
  alertText: { color: C.terracotta, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  suggestSection: { gap: 8, marginTop: 4 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: C.softSurface, borderWidth: 1, borderColor: '#CBE3D3' },
  toggleBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  suggestList: { gap: 8 },
  pickBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: C.softSurface, borderWidth: 1, borderColor: '#CBE3D3' },
  pickBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  pickBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  pickBtnTextActive: { color: C.surface },
  healthBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  healthMintBadge: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, backgroundColor: '#D5F2E1', color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  healthWarnBadge: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, backgroundColor: C.peach, color: C.terracotta, fontFamily: F.semiBold, fontSize: 10 },
  taskBannerCard: { padding: 11, borderRadius: 14, backgroundColor: '#E6F5ED', borderWidth: 1, borderColor: '#BCE6CD', gap: 8 },
  gardenTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#C8E5D3' },
  quickDoneBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: C.primary },
  quickDoneText: { color: C.surface, fontFamily: F.semiBold, fontSize: 11 },
  moveBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: C.softSurface },
  moveBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  photoActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoBtn: { flex: 1, minHeight: 38, borderRadius: 10, backgroundColor: C.softSurface, borderWidth: 1, borderColor: '#CBE3D3', alignItems: 'center', justifyContent: 'center' },
  photoBtnDisabled: { opacity: 0.6 },
  photoBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  photoDeleteBtn: { minHeight: 38, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#FCEBE9', alignItems: 'center', justifyContent: 'center' },
  photoDeleteBtnText: { color: '#A12D24', fontFamily: F.semiBold, fontSize: 12 },
});
