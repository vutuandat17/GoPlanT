import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from '@/components/app-primitives';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from '@/components/app-primitives';

import { pickOrCaptureOptimizedImage } from '@/services/imagePicker';
import { Linking } from 'react-native';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { usePlantData } from '@/features/plants/PlantDataStore';
import { getLatestHealthLabel } from '@/features/plants/plantFilters';
import { useAuthSession } from '@/features/auth/AuthSession';
import { useJournals } from '@/features/journal/JournalStore';
import { PlantArtwork } from '@/features/plants/PlantArtwork';
import { CARE_TASK_META, formatScheduleRepeat, formatTimeShort, useCareSchedules } from '@/features/schedule/CareScheduleStore';
import { apiBaseUrl } from '@/services/api';
import { safeBack } from '@/services/navigation';

const missing = 'Chưa có dữ liệu';

function InfoRow({ label, value }: { label: string; value?: string }) {
  return <View style={d.infoRow}><Text style={d.infoLabel}>{label}</Text><Text style={d.infoValue}>{value?.trim() || missing}</Text></View>;
}

export default function PlantDetailScreen() {
  const { name, ownedId } = useLocalSearchParams<{ name?: string; ownedId?: string }>();
  const { catalog, ownedPlants, gardens, favorites, toggleFavorite, updatePlantPhoto, removePlant } = usePlantData();
  const { journals } = useJournals();
  const { schedules } = useCareSchedules();
  const { accessToken } = useAuthSession();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const owned = ownedPlants.find((item) => item.id === ownedId);
  const currentGarden = owned?.gardenId ? gardens.find((item) => item.id === owned.gardenId) : undefined;
  const healthLabel = owned ? getLatestHealthLabel(owned.id, journals) : 'Chưa đánh giá';
  const plantSchedules = owned ? schedules.filter((s) => s.plantId === owned.id && s.active) : [];
  const plant = (owned && catalog.find((item) => item.id === owned.catalogId))
    ?? catalog.find((item) => item.name === name || item.scientificName === name)
    ?? { id: 'unknown-plant', name: name ?? 'Cây trồng', scientificName: missing, category: missing };
  const isFavorite = favorites.includes(plant.id);
  const photoUri = owned?.photoUpdatedAt
    ? `${apiBaseUrl}/api/v1/plants/${owned.id}/photo?v=${encodeURIComponent(owned.photoUpdatedAt)}`
    : null;

  const replacePhoto = async () => {
    if (!owned) return;
    const picked = await pickOrCaptureOptimizedImage({
      aspect: [4, 3],
      maxWidth: 1600,
      quality: 0.8,
      title: 'Cập nhật ảnh cây trồng',
    });
    if (!picked) return;
    setUploadingPhoto(true);
    try {
      await updatePlantPhoto(owned.id, picked);
      Alert.alert('Đã cập nhật ảnh', 'Ảnh mới đang được dùng thay ảnh mặc định của cây này.');
    } catch (error) {
      Alert.alert('Không tải được ảnh', error instanceof Error ? error.message : 'Vui lòng thử ảnh JPEG hoặc PNG dưới 5 MB.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  return <SafeAreaView style={d.safe} edges={['top']}>
    <View style={d.header}>
      <Pressable onPress={() => safeBack('/plants')} accessibilityRole="button" accessibilityLabel="Quay lại" style={d.back}><Text style={d.backText}>‹</Text></Pressable>
      <Text style={d.headerTitle}>Chi tiết cây trồng</Text>
      <Pressable onPress={() => toggleFavorite(plant.id)} accessibilityRole="button" accessibilityLabel={isFavorite ? 'Bỏ yêu thích' : 'Thêm yêu thích'}><Text style={d.heart}>{isFavorite ? '♥' : '♡'}</Text></Pressable>
    </View>
    <ScrollView contentContainerStyle={d.content}>
      <View style={d.hero}><PlantArtwork category={plant.category} photoUri={photoUri} accessToken={accessToken} style={d.heroArtwork}/><Text style={d.heroBadge}>{owned?.photoUpdatedAt ? 'ẢNH CÂY CỦA BẠN' : 'ẢNH MẶC ĐỊNH'}</Text></View>
      <View style={d.titleRow}><View style={d.copy}><Text style={d.title}>{owned?.name ?? plant.name}</Text><Text style={d.latin}>{plant.scientificName}</Text><View style={d.tags}><Text style={d.tag}>{plant.category}</Text><Text style={d.tag}>{owned ? 'Cây đang sở hữu' : 'Cây tham khảo'}</Text></View></View></View>

      {owned ? <View style={d.card}>
        <Text style={d.sectionTitle}>Hồ sơ cây của bạn</Text>
        <InfoRow label="Khu vườn hiện tại" value={currentGarden?.name ?? 'Chưa phân vườn'} />
        <InfoRow label="Ngày trồng / bắt đầu chăm sóc" value={owned.plantedAt} />
        <InfoRow label="Vị trí hiện tại" value={owned.location} />
        <InfoRow label="Ghi chú" value={owned.note} />
        <InfoRow label="Tình trạng" value={healthLabel} />
        <Text style={d.note}>Hồ sơ cây được lưu trong tài khoản GoPlant của bạn.</Text>
        <Pressable accessibilityRole="button" disabled={uploadingPhoto} onPress={() => void replacePhoto()} style={[d.photoButton, uploadingPhoto && d.photoButtonDisabled]}>
          <Text style={d.photoButtonText}>{uploadingPhoto ? 'Đang tải ảnh…' : owned.photoUpdatedAt ? 'Thay ảnh cây' : 'Tải ảnh lên thay ảnh mặc định'}</Text>
        </Pressable>
      </View> : null}

      {owned ? (
        <View style={d.card}>
          <View style={d.scheduleHeader}>
            <Text style={d.sectionTitle}>Theo dõi & Nhật ký</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/journal/new', params: { plantId: owned.id } } as never)}>
              <Text style={d.scheduleCreateLink}>＋ Ghi nhật ký</Text>
            </Pressable>
          </View>
          <View style={d.quickLinksRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/journal/detail', params: { plantId: owned.id } } as never)}
              style={d.quickLinkBtn}>
              <Text style={d.quickLinkText}>▤ Nhật ký cây ›</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/monitoring/detail', params: { plantId: owned.id } } as never)}
              style={d.quickLinkBtn}>
              <Text style={d.quickLinkText}>♡ Theo dõi sức khỏe ›</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={d.card}>
        <Text style={d.sectionTitle}>Thông tin nhận diện</Text>
        <InfoRow label="Tên cây" value={plant.name} />
        <InfoRow label="Tên khoa học" value={plant.scientificName} />
        <InfoRow label="Loại cây" value={plant.category} />
        <InfoRow label="Nguồn gốc" value={plant.origin} />
        <InfoRow label="Mô tả ngắn" value={plant.overview} />
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`https://powo.science.kew.org/results?q=${encodeURIComponent(plant.scientificName)}`)}><Text style={d.sourceLink}>Tra cứu phân loại và vùng phân bố tại Kew ↗</Text></Pressable>
      </View>

      <View style={d.card}>
        <Text style={d.sectionTitle}>Tổng quan về cây</Text>
        <InfoRow label="Đặc điểm hình thái" value={plant.morphology} />
        <InfoRow label="Nguồn gốc và phân bố" value={plant.origin} />
        <InfoRow label="Đặc điểm sinh trưởng" value={plant.overview} />
        <InfoRow label="Tuổi thọ" value={plant.lifespan} />
        <InfoRow label="Mùa hoa / mùa quả" value={plant.floweringSeason} />
        <InfoRow label="Công dụng và lưu ý" value={plant.usageAndCaution} />
      </View>

      <View style={d.card}>
        <Text style={d.sectionTitle}>Đặc tính và điều kiện sinh trưởng</Text>
        <InfoRow label="Độ khó chăm sóc" value={plant.difficulty} />
        <InfoRow label="Nhu cầu ánh sáng" value={plant.light} />
        <InfoRow label="Nhu cầu nước" value={plant.water} />
        <InfoRow label="Nhiệt độ phù hợp (°C)" value={plant.temperature} />
        <InfoRow label="Độ ẩm không khí (%)" value={plant.humidity} />
        <InfoRow label="Loại đất / giá thể" value={plant.medium} />
        <InfoRow label="Nhu cầu thoát nước" value={plant.drainage} />
        <InfoRow label="Kích thước trưởng thành" value={plant.matureSize} />
        <InfoRow label="Tốc độ phát triển" value={plant.growthRate} />
        <InfoRow label="Thời gian ra hoa / quả" value={plant.floweringSeason} />
        <InfoRow label="Tần suất tưới tham khảo" value={plant.wateringFrequency} />
        <InfoRow label="Độ pH đất" value={plant.soilPh} />
        <InfoRow label="Nhu cầu dinh dưỡng" value={plant.nutrition} />
        <Text style={d.note}>Các điều kiện chưa có nguồn dữ liệu được để trống về giá trị; đây không phải khuyến nghị chăm sóc.</Text>
      </View>

      {owned ? (
        <View style={d.card}>
          <View style={d.scheduleHeader}>
            <Text style={d.sectionTitle}>Lịch chăm sóc ({plantSchedules.length})</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/schedule/create', params: { plantId: owned.id } } as never)}>
              <Text style={d.scheduleCreateLink}>＋ Lên lịch chăm sóc</Text>
            </Pressable>
          </View>
          {plantSchedules.length === 0 ? (
            <Text style={d.infoLabel}>Cây chưa có lịch chăm sóc định kỳ.</Text>
          ) : (
            plantSchedules.map((sch) => {
              const meta = CARE_TASK_META[sch.taskType] ?? CARE_TASK_META.other;
              return (
                <Pressable
                  key={sch.id}
                  onPress={() => router.push({ pathname: '/schedule/detail', params: { scheduleId: sch.id } } as never)}
                  style={d.scheduleRow}>
                  <Text style={d.infoValue}>
                    {meta.emoji} {sch.title || meta.label} · {formatScheduleRepeat(sch)} ({formatTimeShort(sch.timeOfDay)})
                  </Text>
                  <Text style={d.scheduleCreateLink}>Chi tiết ›</Text>
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}

      <View style={d.actions}>
        {!owned ? (
          <Pressable onPress={() => router.push({ pathname: '/garden/add-plant', params: { plantId: plant.id } } as never)} style={d.primaryButton}>
            <Text style={d.primaryText}>＋  Thêm cây vào cây của tôi</Text>
          </Pressable>
        ) : (
          <>
            <Pressable onPress={() => router.push({ pathname: '/garden/add-plant', params: { editId: owned.id } } as never)} style={d.primaryButton}>
              <Text style={d.primaryText}>Chỉnh sửa hồ sơ cây</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => Alert.alert('Xóa cây', `Xóa hồ sơ “${owned.name}” khỏi danh sách của bạn?`, [
                { text: 'Hủy', style: 'cancel' },
                {
                  text: 'Xóa cây',
                  style: 'destructive',
                  onPress: () => void removePlant(owned.id)
                    .then(() => safeBack('/plants'))
                    .catch((error) => Alert.alert('Không thể xóa cây', error instanceof Error ? error.message : 'Vui lòng thử lại.')),
                },
              ])}
              style={d.deleteButton}>
              <Text style={d.deleteButtonText}>Xóa cây</Text>
            </Pressable>
          </>
        )}
      </View>
      <Text style={d.note}>Chỉ thông tin đã được duyệt mới xuất hiện trong thư viện. Các điều kiện sinh trưởng chưa có nguồn sẽ hiển thị là chưa có dữ liệu.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const d = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background }, header: { height: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { width: 36 }, backText: { color: C.forest, fontSize: 30 }, headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 15 }, heart: { color: C.terracotta, fontSize: 25 },
  sourceLink: { color: C.primary, fontFamily: F.semiBold, fontSize: 10, paddingVertical: 8 },
  content: { padding: 13, gap: 10, paddingBottom: 24 }, hero: { height: 174, borderRadius: 16, backgroundColor: '#D9EBDD', alignItems: 'center', justifyContent: 'center', gap: 5, overflow: 'hidden' }, heroArtwork: { width: '100%', height: 148 }, heroBadge: { color: C.forest, fontFamily: F.bold, fontSize: 9, letterSpacing: 0.8 }, titleRow: { flexDirection: 'row', alignItems: 'flex-start' }, copy: { flex: 1 }, title: { color: C.forest, fontFamily: F.bold, fontSize: 21 }, latin: { color: C.mutedText, fontFamily: F.regular, fontStyle: 'italic', fontSize: 12 }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 }, tag: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99, backgroundColor: '#DDF2E4', color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  card: { padding: 12, borderRadius: 14, backgroundColor: C.surface, gap: 3 }, sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, marginBottom: 3 }, infoRow: { paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2EAE3', gap: 2 }, infoLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 }, infoValue: { color: C.text, fontFamily: F.semiBold, fontSize: 11, lineHeight: 17 }, note: { color: C.mutedText, fontFamily: F.regular, fontSize: 9, lineHeight: 14 }, photoButton: { minHeight: 42, marginTop: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, photoButtonText: { color: C.surface, fontFamily: F.semiBold, fontSize: 11 }, photoButtonDisabled: { opacity: 0.6 }, actions: { gap: 8 }, primaryButton: { minHeight: 44, paddingHorizontal: 10, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  scheduleCreateLink: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2EAE3' },
  quickLinksRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  quickLinkBtn: { flex: 1, minHeight: 40, paddingHorizontal: 10, borderRadius: 10, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  quickLinkText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  deleteButton: { minHeight: 44, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FCEBE9', alignItems: 'center', justifyContent: 'center' },
  deleteButtonText: { color: '#A12D24', fontFamily: F.semiBold, fontSize: 12 },
});
