import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { SafeAreaView } from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/AuthSession';
import { PlantArtwork } from '@/features/plants/PlantArtwork';
import { usePlantData } from '@/features/plants/PlantDataStore';
import {
  createAdminCatalogPlant,
  deleteAdminCatalogPlant,
  deleteCatalogPlantPhoto,
  fetchAdminCatalogPlants,
  getCatalogPlantPhotoUri,
  restoreAdminCatalogPlant,
  updateAdminCatalogPlant,
  uploadCatalogPlantPhoto,
  type AdminCatalogPlantRequest,
  type PlantCatalogItem,
} from '@/services/api';
import { safeBack } from '@/services/navigation';

const SYSTEM_CATEGORIES: { name: string; emoji: string; bg: string; fg: string }[] = [
  { name: 'Cây nội thất', emoji: '🪴', bg: '#E3F3E8', fg: '#215E40' },
  { name: 'Cây gia dụng', emoji: '🏡', bg: '#E6EFF7', fg: '#224E7A' },
  { name: 'Cây hoa', emoji: '🌸', bg: '#FCEBE5', fg: '#9C3D22' },
  { name: 'Rau gia vị', emoji: '🌿', bg: '#E4F5DF', fg: '#2C6B29' },
  { name: 'Rau ăn lá', emoji: '🥬', bg: '#E1F5EA', fg: '#1F6844' },
  { name: 'Rau ăn quả', emoji: '🍅', bg: '#FFF0DC', fg: '#9A4D16' },
  { name: 'Cây ăn quả', emoji: '🍊', bg: '#FFF5D6', fg: '#8F5E11' },
];

const DIFFICULTY_OPTIONS = ['Dễ', 'Trung bình', 'Khó'];

type StatusFilter = 'all' | 'active' | 'inactive';

type FormState = {
  commonName: string;
  scientificName: string;
  category: string;
  sourceTitle: string;
  sourceUrl: string;
  difficulty: string;
  lightRequirement: string;
  waterFrequencyDays: string;
  temperatureRange: string;
  humidity: string;
  soilPh: string;
  medium: string;
  drainage: string;
  matureSize: string;
  growthRate: string;
  lifespan: string;
  floweringSeason: string;
  nutrition: string;
  origin: string;
  overview: string;
  morphology: string;
  toxicityWarning: string;
};

const EMPTY_FORM: FormState = {
  commonName: '',
  scientificName: '',
  category: 'Cây nội thất',
  sourceTitle: '',
  sourceUrl: '',
  difficulty: '',
  lightRequirement: '',
  waterFrequencyDays: '',
  temperatureRange: '',
  humidity: '',
  soilPh: '',
  medium: '',
  drainage: '',
  matureSize: '',
  growthRate: '',
  lifespan: '',
  floweringSeason: '',
  nutrition: '',
  origin: '',
  overview: '',
  morphology: '',
  toxicityWarning: '',
};

function toFormState(plant: PlantCatalogItem): FormState {
  return {
    commonName: plant.commonName ?? '',
    scientificName: plant.scientificName ?? '',
    category: plant.category ?? 'Cây nội thất',
    sourceTitle: '',
    sourceUrl: '',
    difficulty: plant.difficulty ?? '',
    lightRequirement: plant.lightRequirement ?? '',
    waterFrequencyDays: plant.waterFrequencyDays != null ? String(plant.waterFrequencyDays) : '',
    temperatureRange: plant.temperatureRange ?? '',
    humidity: plant.humidity ?? '',
    soilPh: plant.soilPh ?? '',
    medium: plant.medium ?? '',
    drainage: plant.drainage ?? '',
    matureSize: plant.matureSize ?? '',
    growthRate: plant.growthRate ?? '',
    lifespan: plant.lifespan ?? '',
    floweringSeason: plant.floweringSeason ?? '',
    nutrition: plant.nutrition ?? '',
    origin: plant.origin ?? '',
    overview: plant.overview ?? '',
    morphology: plant.morphology ?? '',
    toxicityWarning: plant.toxicityWarning ?? '',
  };
}

function getCategoryMeta(category: string) {
  return (
    SYSTEM_CATEGORIES.find((c) => c.name.toLocaleLowerCase() === category.toLocaleLowerCase())
    ?? { name: category, emoji: '🌱', bg: '#E7EFE9', fg: C.forest }
  );
}

export default function AdminPlantCatalogScreen() {
  const { user, accessToken } = useAuthSession();
  const { refresh: refreshGlobalCatalog } = usePlantData();

  const [plants, setPlants] = useState<PlantCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [busyPlantId, setBusyPlantId] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlant, setEditingPlant] = useState<PlantCatalogItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const isPrivileged = user?.role === 'admin' || user?.role === 'moderator';

  const loadPlants = useCallback(async () => {
    if (!accessToken || !isPrivileged) return;
    setLoading(true);
    setLoadError('');
    try {
      const firstPage = await fetchAdminCatalogPlants(accessToken, { page: 0, size: 100 });
      let allItems = [...firstPage.items];
      for (let p = 1; p < firstPage.totalPages; p++) {
        const nextPage = await fetchAdminCatalogPlants(accessToken, { page: p, size: 100 });
        allItems = [...allItems, ...nextPage.items];
      }
      setPlants(allItems);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không tải được danh mục cây.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, isPrivileged]);

  useEffect(() => {
    void loadPlants();
  }, [loadPlants]);

  const setField = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const filteredPlants = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return plants.filter((plant) => {
      const active = plant.isActive !== false;
      if (statusFilter === 'active' && !active) return false;
      if (statusFilter === 'inactive' && active) return false;
      if (!q) return true;
      return `${plant.commonName} ${plant.scientificName} ${plant.category}`.toLocaleLowerCase().includes(q);
    });
  }, [plants, query, statusFilter]);

  const groupedSections = useMemo(() => {
    const map = new Map<string, PlantCatalogItem[]>();
    for (const cat of SYSTEM_CATEGORIES) {
      map.set(cat.name, []);
    }
    for (const plant of filteredPlants) {
      const key = plant.category?.trim() || 'Khác';
      const existing = map.get(key) ?? [];
      existing.push(plant);
      map.set(key, existing);
    }
    return Array.from(map.entries())
      .filter(([, items]) => items.length > 0 || (!query.trim() && statusFilter === 'all'))
      .map(([category, items]) => ({
        category,
        meta: getCategoryMeta(category),
        items,
      }));
  }, [filteredPlants, query, statusFilter]);

  const stats = useMemo(() => {
    const activeCount = plants.filter((p) => p.isActive !== false).length;
    const withPhotoCount = plants.filter((p) => Boolean(p.photoUpdatedAt)).length;
    const nonEmptyCategories = new Set(plants.map((p) => p.category)).size;
    return {
      total: plants.length,
      activeCount,
      inactiveCount: plants.length - activeCount,
      withPhotoCount,
      categoryCount: nonEmptyCategories,
    };
  }, [plants]);

  const allCollapsed = groupedSections.length > 0 && groupedSections.every((sec) => Boolean(collapsedCategories[sec.category]));

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const toggleAllCategories = () => {
    if (allCollapsed) {
      setCollapsedCategories({});
    } else {
      const next: Record<string, boolean> = {};
      for (const sec of groupedSections) next[sec.category] = true;
      setCollapsedCategories(next);
    }
  };

  const openCreateModal = (defaultCategory?: string) => {
    setEditingPlant(null);
    setForm({ ...EMPTY_FORM, category: defaultCategory || 'Cây nội thất' });
    setModalVisible(true);
  };

  const openEditModal = (plant: PlantCatalogItem) => {
    setEditingPlant(plant);
    setForm(toFormState(plant));
    setModalVisible(true);
  };

  const handleSaveModal = async () => {
    if (!accessToken || !isPrivileged) {
      Alert.alert('Không có quyền', 'Chỉ tài khoản quản trị hoặc kiểm duyệt viên mới được thao tác.');
      return;
    }
    if (!form.commonName.trim() || !form.scientificName.trim() || !form.category.trim()) {
      Alert.alert('Thiếu thông tin', 'Hãy nhập tên thường gọi, tên khoa học và nhóm cây.');
      return;
    }
    if (!editingPlant && !form.sourceTitle.trim() && !form.sourceUrl.trim()) {
      Alert.alert('Thiếu nguồn tham khảo', 'Vui lòng cung cấp tên nguồn hoặc đường dẫn khi thêm loài cây mới.');
      return;
    }
    const parsedWaterDays = form.waterFrequencyDays.trim() ? Number(form.waterFrequencyDays.trim()) : null;
    if (parsedWaterDays !== null && (!Number.isInteger(parsedWaterDays) || parsedWaterDays < 1 || parsedWaterDays > 365)) {
      Alert.alert('Số liệu không hợp lệ', 'Chu kỳ tưới nước phải là số nguyên từ 1 đến 365 ngày.');
      return;
    }

    const body: AdminCatalogPlantRequest = {
      commonName: form.commonName.trim(),
      scientificName: form.scientificName.trim(),
      category: form.category.trim(),
      sourceTitle: form.sourceTitle.trim() || null,
      sourceUrl: form.sourceUrl.trim() || null,
      difficulty: form.difficulty.trim() || null,
      lightRequirement: form.lightRequirement.trim() || null,
      waterFrequencyDays: parsedWaterDays,
      temperatureRange: form.temperatureRange.trim() || null,
      humidity: form.humidity.trim() || null,
      soilPh: form.soilPh.trim() || null,
      medium: form.medium.trim() || null,
      drainage: form.drainage.trim() || null,
      matureSize: form.matureSize.trim() || null,
      growthRate: form.growthRate.trim() || null,
      lifespan: form.lifespan.trim() || null,
      floweringSeason: form.floweringSeason.trim() || null,
      nutrition: form.nutrition.trim() || null,
      origin: form.origin.trim() || null,
      overview: form.overview.trim() || null,
      morphology: form.morphology.trim() || null,
      toxicityWarning: form.toxicityWarning.trim() || null,
    };

    setSaving(true);
    try {
      if (editingPlant) {
        await updateAdminCatalogPlant(editingPlant.id, accessToken, body);
      } else {
        await createAdminCatalogPlant(accessToken, body);
      }
      setModalVisible(false);
      await Promise.all([loadPlants(), refreshGlobalCatalog()]);
      Alert.alert('Thành công', editingPlant ? 'Đã cập nhật thông tin loài cây.' : 'Đã thêm và xuất bản loài cây mới.');
    } catch (error) {
      Alert.alert('Không thể lưu', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const pickAndUploadPhoto = async (plant: PlantCatalogItem) => {
    if (!accessToken) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần quyền thư viện ảnh', 'Hãy cấp quyền truy cập ảnh để tải ảnh đại diện cho loài cây.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setBusyPlantId(plant.id);
    try {
      await uploadCatalogPlantPhoto(plant.id, accessToken, {
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      });
      await Promise.all([loadPlants(), refreshGlobalCatalog()]);
    } catch (error) {
      Alert.alert('Không tải được ảnh', error instanceof Error ? error.message : 'Vui lòng dùng ảnh JPEG hoặc PNG dưới 5 MB.');
    } finally {
      setBusyPlantId(null);
    }
  };

  const handlePhotoAction = (plant: PlantCatalogItem) => {
    if (!accessToken) return;
    if (!plant.photoUpdatedAt) {
      void pickAndUploadPhoto(plant);
      return;
    }
    Alert.alert(`Ảnh của "${plant.commonName}"`, 'Chọn thao tác với ảnh đại diện:', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đổi ảnh mới', onPress: () => void pickAndUploadPhoto(plant) },
      {
        text: 'Xóa ảnh',
        style: 'destructive',
        onPress: () => {
          setBusyPlantId(plant.id);
          void deleteCatalogPlantPhoto(plant.id, accessToken)
            .then(() => Promise.all([loadPlants(), refreshGlobalCatalog()]))
            .catch((err) => Alert.alert('Không xóa được ảnh', err instanceof Error ? err.message : 'Vui lòng thử lại.'))
            .finally(() => setBusyPlantId(null));
        },
      },
    ]);
  };

  const handleDeleteOrRestore = (plant: PlantCatalogItem) => {
    if (!accessToken) return;
    const isActive = plant.isActive !== false;
    if (isActive) {
      Alert.alert(
        'Ẩn / xóa khỏi danh mục',
        `Ẩn "${plant.commonName}" khỏi danh mục công khai? Cây người dùng đã trồng trước đó vẫn được giữ nguyên.`,
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Ẩn khỏi danh mục',
            style: 'destructive',
            onPress: () => {
              setBusyPlantId(plant.id);
              void deleteAdminCatalogPlant(plant.id, accessToken)
                .then(() => Promise.all([loadPlants(), refreshGlobalCatalog()]))
                .catch((err) => Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể ẩn cây.'))
                .finally(() => setBusyPlantId(null));
            },
          },
        ],
      );
    } else {
      setBusyPlantId(plant.id);
      void restoreAdminCatalogPlant(plant.id, accessToken)
        .then(() => Promise.all([loadPlants(), refreshGlobalCatalog()]))
        .catch((err) => Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể khôi phục cây.'))
        .finally(() => setBusyPlantId(null));
    }
  };

  if (!isPrivileged) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={() => safeBack('/account')} style={s.back}>
            <Text style={s.backText}>←</Text>
          </Pressable>
          <Text style={s.title}>Quản lý danh mục cây</Text>
          <View style={s.headerSpacer} />
        </View>
        <View style={s.deniedWrap}>
          <Text style={s.deniedTitle}>Không có quyền truy cập</Text>
          <Text style={s.caption}>Chỉ tài khoản quản trị hoặc kiểm duyệt viên mới có thể quản lý danh mục thực vật.</Text>
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
        <View style={s.headerCopy}>
          <Text style={s.title}>Danh mục cây hệ thống</Text>
          <Text style={s.headerSub}>Quản lý dữ liệu, ảnh & phân loại cây</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => openCreateModal()} style={s.addTopBtn}>
          <Text style={s.addTopBtnText}>Thêm danh mục mới</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.statsGrid}>
          <View style={[s.statCard, { backgroundColor: '#E3F3E8' }]}>
            <Text style={s.statValue}>{stats.total}</Text>
            <Text style={s.statLabel}>Tổng loài cây</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: '#E7EFF8' }]}>
            <Text style={s.statValue}>{stats.categoryCount}</Text>
            <Text style={s.statLabel}>Nhóm thực vật</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: '#FFF3DC' }]}>
            <Text style={s.statValue}>{stats.withPhotoCount}</Text>
            <Text style={s.statLabel}>Đã có ảnh</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: '#FCEBE5' }]}>
            <Text style={s.statValue}>{stats.inactiveCount}</Text>
            <Text style={s.statLabel}>Đang ẩn</Text>
          </View>
        </View>

        <View style={s.searchBox}>
          <Text style={s.searchGlyph}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm theo tên cây, tên khoa học, loại..."
            placeholderTextColor={C.mutedText}
            style={s.searchInput}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} accessibilityLabel="Xóa tìm kiếm">
              <Text style={s.clearBtn}>×</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={s.toolbarRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterChips}>
            {([
              ['all', `Tất cả (${stats.total})`],
              ['active', `Đang hiển thị (${stats.activeCount})`],
              ['inactive', `Đã ẩn (${stats.inactiveCount})`],
            ] as [StatusFilter, string][]).map(([key, label]) => {
              const active = statusFilter === key;
              return (
                <Pressable key={key} onPress={() => setStatusFilter(key)} style={[s.filterChip, active && s.filterChipActive]}>
                  <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable onPress={toggleAllCategories} style={s.collapseAllBtn}>
            <Text style={s.collapseAllText}>{allCollapsed ? '▼ Mở tất cả' : '▲ Thu gọn'}</Text>
          </Pressable>
        </View>

        {loadError ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{loadError}</Text>
            <Pressable onPress={() => void loadPlants()}>
              <Text style={s.retryText}>↻ Thử lại</Text>
            </Pressable>
          </View>
        ) : null}

        {loading && plants.length === 0 ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={s.caption}>Đang tải danh mục cây...</Text>
          </View>
        ) : groupedSections.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyEmoji}>🌿</Text>
            <Text style={s.emptyTitle}>Không tìm thấy loài cây phù hợp</Text>
            <Text style={s.caption}>Thử đổi từ khóa tìm kiếm hoặc bấm “＋ Thêm” để tạo mới.</Text>
          </View>
        ) : (
          groupedSections.map((section) => {
            const isCollapsed = Boolean(collapsedCategories[section.category]);
            return (
              <View key={section.category} style={s.groupCard}>
                <View style={s.groupHeader}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${isCollapsed ? 'Mở rộng' : 'Thu gọn'} nhóm ${section.category}`}
                    onPress={() => toggleCategory(section.category)}
                    style={s.groupToggleMain}>
                    <View style={[s.groupIcon, { backgroundColor: section.meta.bg }]}>
                      <Text style={s.groupEmoji}>{section.meta.emoji}</Text>
                    </View>
                    <View style={s.groupHeaderCopy}>
                      <Text style={s.groupTitle}>{section.category}</Text>
                      <Text style={s.groupCount}>{section.items.length} loài cây</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Thêm cây vào nhóm ${section.category}`}
                    onPress={() => openCreateModal(section.category)}
                    style={s.groupQuickAdd}>
                    <Text style={s.groupQuickAddText}>＋</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${isCollapsed ? 'Mở rộng' : 'Thu gọn'} nhóm ${section.category}`}
                    onPress={() => toggleCategory(section.category)}
                    style={[s.collapsePill, { backgroundColor: section.meta.bg }]}>
                    <Text style={[s.collapsePillText, { color: section.meta.fg }]}>
                      {isCollapsed ? 'Mở rộng ▼' : 'Thu gọn ▲'}
                    </Text>
                  </Pressable>
                </View>

                {!isCollapsed ? (
                  <View style={s.groupBody}>
                    {section.items.length === 0 ? (
                      <Text style={s.groupEmptyText}>Chưa có loài cây nào trong nhóm này.</Text>
                    ) : (
                      section.items.map((plant) => {
                        const isActive = plant.isActive !== false;
                        const isBusy = busyPlantId === plant.id;
                        const photoUri = getCatalogPlantPhotoUri(plant.id, plant.photoUpdatedAt);
                        return (
                          <View key={plant.id} style={[s.plantCard, !isActive && s.plantCardInactive]}>
                            <View style={s.plantTopRow}>
                              <PlantArtwork
                                category={plant.category}
                                photoUri={photoUri}
                                accessToken={accessToken}
                                style={s.plantThumb}
                              />
                              <View style={s.plantCopy}>
                                <View style={s.plantTitleRow}>
                                  <Text style={s.plantName} numberOfLines={1}>{plant.commonName}</Text>
                                  <Text style={[s.statusBadge, isActive ? s.statusActive : s.statusInactive]}>
                                    {isActive ? 'Hiển thị' : 'Đã ẩn'}
                                  </Text>
                                </View>
                                <Text style={s.plantLatin} numberOfLines={1}>{plant.scientificName}</Text>
                                <Text style={s.plantMeta} numberOfLines={1}>
                                  {plant.difficulty || 'Chưa rõ độ khó'}
                                  {plant.waterFrequencyDays ? ` • Tưới ${plant.waterFrequencyDays} ngày/lần` : ''}
                                  {plant.photoUpdatedAt ? ' • 📷 Có ảnh' : ''}
                                </Text>
                              </View>
                            </View>

                            <View style={s.plantActions}>
                              <Pressable
                                disabled={isBusy}
                                onPress={() => handlePhotoAction(plant)}
                                style={[s.actBtn, s.actPhoto]}>
                                <Text style={s.actPhotoText}>{isBusy ? '...' : plant.photoUpdatedAt ? '📷 Đổi ảnh' : '📷 Thêm ảnh'}</Text>
                              </Pressable>
                              <Pressable
                                disabled={isBusy}
                                onPress={() => openEditModal(plant)}
                                style={[s.actBtn, s.actEdit]}>
                                <Text style={s.actEditText}>✎ Sửa</Text>
                              </Pressable>
                              <Pressable
                                disabled={isBusy}
                                onPress={() => handleDeleteOrRestore(plant)}
                                style={[s.actBtn, isActive ? s.actDelete : s.actRestore]}>
                                <Text style={isActive ? s.actDeleteText : s.actRestoreText}>
                                  {isActive ? 'Ẩn / Xóa' : '↺ Khôi phục'}
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setModalVisible(false)} style={s.back}>
              <Text style={s.backText}>✕</Text>
            </Pressable>
            <Text style={s.title}>{editingPlant ? 'Chỉnh sửa loài cây' : 'Thêm loài cây mới'}</Text>
            <Pressable disabled={saving} onPress={() => void handleSaveModal()} style={[s.saveHeaderBtn, saving && s.disabled]}>
              <Text style={s.saveHeaderText}>{saving ? 'Đang lưu...' : 'Lưu'}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
            <View style={s.formSection}>
              <Text style={s.formSectionTitle}>1. Thông tin cơ bản</Text>
              <Field label="Tên thường gọi *" placeholder="Ví dụ: Trầu bà lá xẻ" value={form.commonName} onChangeText={(v) => setField('commonName', v)} />
              <Field label="Tên khoa học *" placeholder="Ví dụ: Monstera deliciosa" value={form.scientificName} onChangeText={(v) => setField('scientificName', v)} />
              <Text style={s.label}>Nhóm cây *</Text>
              <View style={s.chipGrid}>
                {SYSTEM_CATEGORIES.map((cat) => {
                  const selected = form.category === cat.name;
                  return (
                    <Pressable key={cat.name} onPress={() => setField('category', cat.name)} style={[s.selectChip, selected && s.selectChipActive]}>
                      <Text style={[s.selectChipText, selected && s.selectChipTextActive]}>{cat.emoji} {cat.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Field label="Hoặc nhập tên nhóm khác" placeholder="Tên nhóm cây" value={form.category} onChangeText={(v) => setField('category', v)} />
              <Text style={s.label}>Độ khó chăm sóc</Text>
              <View style={s.chipGrid}>
                {DIFFICULTY_OPTIONS.map((opt) => {
                  const selected = form.difficulty === opt;
                  return (
                    <Pressable key={opt} onPress={() => setField('difficulty', selected ? '' : opt)} style={[s.selectChip, selected && s.selectChipActive]}>
                      <Text style={[s.selectChipText, selected && s.selectChipTextActive]}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {!editingPlant ? (
              <View style={s.formSection}>
                <Text style={s.formSectionTitle}>2. Nguồn tham khảo (bắt buộc khi tạo mới)</Text>
                <Field label="Tên nguồn" placeholder="Ví dụ: Kew Plants of the World Online" value={form.sourceTitle} onChangeText={(v) => setField('sourceTitle', v)} />
                <Field label="Đường dẫn URL" placeholder="https://..." value={form.sourceUrl} onChangeText={(v) => setField('sourceUrl', v)} autoCapitalize="none" keyboardType="url" />
              </View>
            ) : null}

            <View style={s.formSection}>
              <Text style={s.formSectionTitle}>{editingPlant ? '2.' : '3.'} Điều kiện sinh trưởng</Text>
              <Field label="Nhu cầu ánh sáng" placeholder="Ánh sáng gián tiếp vừa" value={form.lightRequirement} onChangeText={(v) => setField('lightRequirement', v)} />
              <Field label="Chu kỳ tưới nước (ngày)" placeholder="Ví dụ: 3" value={form.waterFrequencyDays} onChangeText={(v) => setField('waterFrequencyDays', v)} keyboardType="number-pad" />
              <Field label="Khoảng nhiệt độ phù hợp" placeholder="Ví dụ: 18–28°C" value={form.temperatureRange} onChangeText={(v) => setField('temperatureRange', v)} />
              <Field label="Độ ẩm không khí" placeholder="Ví dụ: 60–80%" value={form.humidity} onChangeText={(v) => setField('humidity', v)} />
              <Field label="Độ pH đất" placeholder="Ví dụ: 5.5–7.0" value={form.soilPh} onChangeText={(v) => setField('soilPh', v)} />
              <Field label="Loại đất / giá thể" placeholder="Thoát nước tốt, giàu mùn" value={form.medium} onChangeText={(v) => setField('medium', v)} />
              <Field label="Nhu cầu thoát nước" placeholder="Thoát nước nhanh" value={form.drainage} onChangeText={(v) => setField('drainage', v)} />
              <Field label="Kích thước trưởng thành" placeholder="Ví dụ: 1–2 m" value={form.matureSize} onChangeText={(v) => setField('matureSize', v)} />
              <Field label="Tốc độ phát triển" placeholder="Trung bình / Nhanh" value={form.growthRate} onChangeText={(v) => setField('growthRate', v)} />
            </View>

            <View style={s.formSection}>
              <Text style={s.formSectionTitle}>{editingPlant ? '3.' : '4.'} Mô tả & Lưu ý</Text>
              <Field label="Nguồn gốc" placeholder="Ví dụ: Trung Mỹ và Nam Mỹ" value={form.origin} onChangeText={(v) => setField('origin', v)} />
              <Field label="Tuổi thọ" placeholder="Ví dụ: Cây lâu năm" value={form.lifespan} onChangeText={(v) => setField('lifespan', v)} />
              <Field label="Mùa hoa / quả" placeholder="Ví dụ: Mùa xuân – hè" value={form.floweringSeason} onChangeText={(v) => setField('floweringSeason', v)} />
              <Field label="Nhu cầu dinh dưỡng" placeholder="Bón phân cân đối mỗi 4 tuần" value={form.nutrition} onChangeText={(v) => setField('nutrition', v)} multiline />
              <Field label="Tổng quan" placeholder="Mô tả tổng quan về loài cây" value={form.overview} onChangeText={(v) => setField('overview', v)} multiline />
              <Field label="Đặc điểm hình thái" placeholder="Mô tả lá, thân, rễ, hoa..." value={form.morphology} onChangeText={(v) => setField('morphology', v)} multiline />
              <Field label="Lưu ý & Độc tính" placeholder="Cảnh báo thú cưng/trẻ nhỏ hoặc công dụng" value={form.toxicityWarning} onChangeText={(v) => setField('toxicityWarning', v)} multiline />
            </View>

            <Pressable disabled={saving} onPress={() => void handleSaveModal()} style={[s.submitBtn, saving && s.disabled]}>
              <Text style={s.submitText}>{saving ? 'Đang lưu...' : editingPlant ? '✓ Lưu thay đổi' : '✓ Thêm và xuất bản cây'}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, multiline, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={C.mutedText}
        style={[s.input, multiline && s.multiline]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDE8E0',
  },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  backText: { color: C.primary, fontSize: 22, fontFamily: F.semiBold },
  headerCopy: { flex: 1 },
  headerSub: { color: C.mutedText, fontFamily: F.regular, fontSize: 11 },
  title: { color: C.forest, fontFamily: F.bold, fontSize: 16 },
  headerSpacer: { width: 38 },
  addTopBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.primary },
  addTopBtnText: { color: C.surface, fontFamily: F.bold, fontSize: 12 },
  content: { padding: 14, gap: 12, paddingBottom: 36 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { flex: 1, minWidth: '45%', padding: 11, borderRadius: 14, gap: 2 },
  statValue: { color: C.forest, fontFamily: F.bold, fontSize: 20 },
  statLabel: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 11 },
  searchBox: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#DCE8DE',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchGlyph: { color: C.secondaryText, fontSize: 19 },
  searchInput: { flex: 1, color: C.text, fontFamily: F.regular, fontSize: 13, paddingVertical: 8 },
  clearBtn: { color: C.secondaryText, fontSize: 20, paddingHorizontal: 4 },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterChips: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: C.surface, borderWidth: 1, borderColor: '#DCE8DE' },
  filterChipActive: { backgroundColor: C.forest, borderColor: C.forest },
  filterChipText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 11 },
  filterChipTextActive: { color: C.surface },
  collapseAllBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: C.softSurface },
  collapseAllText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  errorBox: { padding: 12, borderRadius: 12, backgroundColor: '#FCEBE9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  errorText: { color: '#A12D24', fontFamily: F.regular, fontSize: 12, flex: 1 },
  retryText: { color: C.primary, fontFamily: F.bold, fontSize: 12 },
  loadingWrap: { paddingVertical: 32, alignItems: 'center', gap: 8 },
  emptyBox: { padding: 24, borderRadius: 16, backgroundColor: C.surface, alignItems: 'center', gap: 6 },
  emptyEmoji: { fontSize: 34 },
  emptyTitle: { color: C.forest, fontFamily: F.bold, fontSize: 15 },
  caption: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  groupCard: { borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: '#E3ECE5', overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, backgroundColor: '#FAFDFB' },
  groupToggleMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  groupEmoji: { fontSize: 20 },
  groupHeaderCopy: { flex: 1, gap: 1 },
  groupTitle: { color: C.forest, fontFamily: F.bold, fontSize: 14 },
  groupCount: { color: C.mutedText, fontFamily: F.regular, fontSize: 11 },
  groupQuickAdd: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  groupQuickAddText: { color: C.forest, fontFamily: F.bold, fontSize: 16 },
  collapsePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99 },
  collapsePillText: { fontFamily: F.semiBold, fontSize: 11 },
  groupBody: { padding: 10, gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5EDE6' },
  groupEmptyText: { color: C.mutedText, fontFamily: F.regular, fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  plantCard: { padding: 10, borderRadius: 13, backgroundColor: C.background, gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E1EAE3' },
  plantCardInactive: { opacity: 0.65, backgroundColor: '#F3F4F3' },
  plantTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plantThumb: { width: 58, height: 58, borderRadius: 11 },
  plantCopy: { flex: 1, gap: 2 },
  plantTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  plantName: { flex: 1, color: C.forest, fontFamily: F.bold, fontSize: 13 },
  statusBadge: { overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, fontFamily: F.semiBold, fontSize: 9 },
  statusActive: { backgroundColor: '#D5F2E1', color: C.forest },
  statusInactive: { backgroundColor: '#E5E7EB', color: '#4B5563' },
  plantLatin: { color: C.mutedText, fontFamily: F.regular, fontStyle: 'italic', fontSize: 11 },
  plantMeta: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  plantActions: { flexDirection: 'row', gap: 6 },
  actBtn: { flex: 1, minHeight: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  actPhoto: { backgroundColor: '#E7EFF8' },
  actPhotoText: { color: '#1F4B7A', fontFamily: F.semiBold, fontSize: 11 },
  actEdit: { backgroundColor: '#E3F3E8' },
  actEditText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  actDelete: { backgroundColor: '#FCEBE9' },
  actDeleteText: { color: '#A12D24', fontFamily: F.semiBold, fontSize: 11 },
  actRestore: { backgroundColor: '#D5F2E1' },
  actRestoreText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  deniedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  deniedTitle: { color: C.forest, fontFamily: F.bold, fontSize: 17 },
  modalHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDE8E0',
  },
  saveHeaderBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9, backgroundColor: C.primary },
  saveHeaderText: { color: C.surface, fontFamily: F.bold, fontSize: 13 },
  modalContent: { padding: 14, gap: 12, paddingBottom: 40 },
  formSection: { padding: 12, borderRadius: 14, backgroundColor: C.surface, gap: 10 },
  formSectionTitle: { color: C.forest, fontFamily: F.bold, fontSize: 14 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selectChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, backgroundColor: C.background, borderWidth: 1, borderColor: '#DCE8DE' },
  selectChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  selectChipText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 11 },
  selectChipTextActive: { color: C.surface },
  field: { gap: 5 },
  label: { color: C.text, fontFamily: F.semiBold, fontSize: 12 },
  input: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: '#DCE8DE', backgroundColor: C.background, paddingHorizontal: 12, color: C.text, fontFamily: F.regular, fontSize: 13 },
  multiline: { minHeight: 80, paddingTop: 10, textAlignVertical: 'top' },
  submitBtn: { minHeight: 48, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitText: { color: C.surface, fontFamily: F.bold, fontSize: 14 },
  disabled: { opacity: 0.55 },
});
