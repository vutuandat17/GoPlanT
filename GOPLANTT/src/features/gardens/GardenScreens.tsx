import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { AccountButton } from '@/features/auth/AccountButton';
import { useAuthSession } from '@/features/auth/AuthSession';
import { PlantArtwork } from '@/features/plants/PlantArtwork';
import { usePlantData } from '@/features/plants/PlantDataStore';
import { ApiError, apiBaseUrl } from '@/services/api';

function GardenHeader({ title }: { title: string }) {
  return <View style={g.header}><Pressable onPress={() => router.back()} style={g.back}><Text style={g.backText}>‹</Text></Pressable><Text style={g.headerTitle}>{title}</Text><AccountButton size={29} /></View>;
}

function ActionButton({ label, secondary = false, onPress }: { label: string; secondary?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[g.action, secondary && g.actionSecondary]}><Text style={[g.actionText, secondary && g.actionTextSecondary]}>{label}</Text></Pressable>;
}

export function GardenDetailScreen() {
  const { gardenId } = useLocalSearchParams<{ gardenId?: string }>();
  const { gardens, ownedPlants, catalog, removePlant, removeGarden } = usePlantData();
  const { accessToken } = useAuthSession();
  const garden = gardens.find((item) => item.id === gardenId);
  const plants = ownedPlants.filter((plant) => plant.gardenId === gardenId);
  return <SafeAreaView style={g.safe} edges={['top']}><GardenHeader title="Chi tiết khu vườn"/><ScrollView contentContainerStyle={g.content}>
    {!garden ? <View style={g.card}><Text style={g.sectionTitle}>Không tìm thấy khu vườn</Text><Text style={g.body}>Danh sách có thể đã thay đổi hoặc khu vườn đã bị xóa.</Text><ActionButton label="Về danh sách vườn" onPress={() => router.replace('/gardens' as never)}/></View> : <>
      <View style={g.hero}><Text style={g.heroPlant}>♧</Text><Text style={g.heroLabel}>{garden.locationType.toLocaleUpperCase()}</Text></View>
      <Text style={g.title}>{garden.name}</Text><Text style={g.body}>⌖  {garden.locationDetail || 'Chưa có vị trí cụ thể'}</Text>
      <View style={g.card}><Text style={g.sectionTitle}>Tổng quan khu vườn</Text><Text style={g.body}>{garden.description || 'Chưa có mô tả.'}</Text><Text style={g.body}>{plants.length} cây đang trồng</Text></View>
      <View style={g.row}><Text style={g.sectionTitle}>Cây đang trồng ({plants.length})</Text><Pressable onPress={() => router.push({ pathname: '/garden/add-plant', params: { gardenId: garden.id } } as never)}><Text style={g.link}>＋ Thêm cây</Text></Pressable></View>
      {plants.map((plant) => <View key={plant.id} style={g.plantCard}><PlantArtwork category={catalog.find((item) => item.id === plant.catalogId)?.category ?? 'Cây trồng'} accessToken={accessToken} photoUri={plant.photoUpdatedAt ? `${apiBaseUrl}/api/v1/plants/${plant.id}/photo?v=${encodeURIComponent(plant.photoUpdatedAt)}` : null} style={g.plantImage}/><View style={g.plantCopy}><Text style={g.plantName}>{plant.name}</Text><Text style={g.body}>{plant.scientificName} • {plant.location || 'Chưa có vị trí cụ thể'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Xem chi tiết ${plant.name}`} onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name, ownedId: plant.id } } as never)}><Text style={g.link}>›</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Xóa ${plant.name} khỏi vườn`} onPress={() => Alert.alert('Xóa cây', `Xóa hồ sơ “${plant.name}” khỏi tài khoản?`, [{ text: 'Hủy', style: 'cancel' }, { text: 'Xóa cây', style: 'destructive', onPress: () => void removePlant(plant.id).catch((error) => Alert.alert('Không thể xóa cây', error instanceof Error ? error.message : 'Vui lòng thử lại.')) }])}><Text style={g.deleteLink}>Xóa</Text></Pressable></View>)}
      {plants.length === 0 ? <Text style={g.note}>Khu vườn chưa có cây.</Text> : null}
      <ActionButton label="Thêm cây vào khu vườn" onPress={() => router.push('/garden/add-plant' as never)}/>
      <ActionButton secondary label="Xóa khu vườn" onPress={() => Alert.alert('Xóa khu vườn', 'Cây trong vườn sẽ được giữ lại và chuyển sang trạng thái chưa phân vườn.', [{ text: 'Hủy', style: 'cancel' }, { text: 'Xóa vườn', style: 'destructive', onPress: () => void removeGarden(garden.id).then(() => router.replace('/gardens' as never)).catch((error) => Alert.alert('Không thể xóa vườn', error instanceof Error ? error.message : 'Vui lòng thử lại.')) }])}/>
    </>}
  </ScrollView></SafeAreaView>;
}

function GardenForm({ addPlant = false }: { addPlant?: boolean }) {
  const params = useLocalSearchParams<{ editId?: string; plantId?: string; gardenId?: string }>();
  const { catalog, gardens, ownedPlants, addGarden, addPlant: createOwnedPlant, updatePlant, refresh } = usePlantData();
  const editId = params.editId;
  const editingPlant = editId ? ownedPlants.find((item) => item.id === editId) : undefined;
  const initialCatalogId = params.plantId ?? editingPlant?.catalogId ?? '';
  const initialCatalogPlant = catalog.find((plant) => plant.id === initialCatalogId);
  const [name, setName] = useState(editingPlant?.name ?? initialCatalogPlant?.name ?? '');
  const [place, setPlace] = useState(editingPlant?.location ?? '');
  const [error, setError] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [selected, setSelected] = useState(addPlant ? initialCatalogId : '');
  const [gardenType, setGardenType] = useState('balcony');
  const [gardenId, setGardenId] = useState(editingPlant?.gardenId ?? params.gardenId ?? '');
  const [description, setDescription] = useState('');
  const [plantedAt, setPlantedAt] = useState(editingPlant?.plantedAt ?? '');
  const [note, setNote] = useState(editingPlant?.note ?? '');
  const [plantQuery, setPlantQuery] = useState('');
  const title = editId ? 'Chỉnh sửa hồ sơ cây' : addPlant ? 'Thêm cây trồng' : 'Tạo khu vườn mới';
  const selectedProfile = catalog.find((plant) => plant.id === selected);

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

  const submit = async () => {
    setRequestError('');
    const invalid = (addPlant ? !selectedProfile || !name.trim() : !name.trim()) || Boolean(editId && !editingPlant);
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
        router.replace('/plants' as never);
        return;
      }
      await addGarden({ name: name.trim(), locationType: gardenType, locationDetail: place.trim(), description: description.trim() });
      await refresh();
      router.replace('/gardens' as never);
    } catch (submitError) {
      setRequestError(submitError instanceof ApiError ? submitError.message : 'Không thể lưu dữ liệu. Vui lòng thử lại.');
    }
  };
  return <SafeAreaView style={g.safe} edges={['top']}><GardenHeader title={title}/><ScrollView contentContainerStyle={g.content}>
    <View style={g.tip}><Text style={g.sectionTitle}>{addPlant ? 'Thêm cây vào khu vườn' : 'Thiết lập không gian xanh'}</Text><Text style={g.body}>{addPlant ? 'Chọn cây và khu vực trồng phù hợp.' : 'Tạo khu vườn để quản lý cây và lịch chăm sóc.'}</Text></View>
    {!addPlant ? <><Text style={g.label}>Tên khu vườn <Text style={g.required}>*</Text></Text><TextInput value={name} onChangeText={setName} placeholder="Ví dụ: Ban công tầng 3" style={[g.input, error && !name.trim() && g.inputError]}/><Text style={g.label}>Vị trí / khu vực</Text><TextInput value={place} onChangeText={setPlace} placeholder="Ban công, sân thượng..." style={g.input}/><Text style={g.label}>Loại không gian</Text><View style={g.choices}>{[['balcony', 'Ban công'], ['rooftop', 'Sân thượng'], ['garden', 'Sân vườn'], ['indoor', 'Trong nhà'], ['greenhouse', 'Nhà kính'], ['other', 'Khác']].map(([value, label]) => <Pressable key={value} onPress={() => setGardenType(value)} style={[g.choice, gardenType === value && g.choiceActive]}><Text style={g.body}>{label}</Text></Pressable>)}</View><Text style={g.label}>Mô tả (không bắt buộc)</Text><TextInput value={description} onChangeText={setDescription} placeholder="Thêm ghi chú cho khu vườn..." style={[g.input, g.multiline]} multiline/></> : <>
      <Text style={g.label}>Tìm cây trong thư viện</Text><TextInput value={plantQuery} onChangeText={setPlantQuery} placeholder="Nhập tên cây hoặc tên khoa học" style={g.input}/><Text style={g.label}>1. Chọn cây trồng</Text>{catalog.filter((plant) => `${plant.name} ${plant.scientificName}`.toLocaleLowerCase().includes(plantQuery.trim().toLocaleLowerCase())).map((plant) => <Pressable key={plant.id} onPress={() => { setSelected(plant.id); if (!name.trim() || catalog.some((item) => item.name === name)) setName(plant.name); }} style={[g.plantCard, selected === plant.id && g.choiceActive]}><PlantArtwork category={plant.category} style={g.plantImage}/><View style={g.plantCopy}><Text style={g.plantName}>{plant.name}</Text><Text style={g.body}>{plant.scientificName} • {plant.category}</Text></View><Text style={g.link}>{selected === plant.id ? '✓' : 'Chọn'}</Text></Pressable>)}
      {catalog.length === 0 ? <Text style={g.note}>Thư viện chưa có cây được duyệt. Hãy cập nhật catalog từ tài khoản quản trị.</Text> : null}
      {selectedProfile ? <><Text style={g.label}>Tên hiển thị <Text style={g.required}>*</Text></Text><TextInput value={name} onChangeText={setName} placeholder="Tên cây trong hồ sơ của bạn" style={[g.input, error && !name.trim() && g.inputError]}/><Text style={g.label}>Vườn (không bắt buộc)</Text><View style={g.choices}><Pressable onPress={() => setGardenId('')} style={[g.choice, !gardenId && g.choiceActive]}><Text style={g.body}>Chưa phân vườn</Text></Pressable>{gardens.map((garden) => <Pressable key={garden.id} onPress={() => setGardenId(garden.id)} style={[g.choice, gardenId === garden.id && g.choiceActive]}><Text style={g.body}>{garden.name}</Text></Pressable>)}</View><Text style={g.label}>Vị trí cụ thể</Text><TextInput value={place} onChangeText={setPlace} placeholder="Ví dụ: Kệ cạnh cửa sổ" style={g.input}/><Text style={g.label}>Ngày trồng / bắt đầu chăm sóc (không bắt buộc)</Text><TextInput value={plantedAt} onChangeText={setPlantedAt} placeholder="dd/mm/yyyy" style={g.input}/><Text style={g.label}>Ghi chú (không bắt buộc)</Text><TextInput value={note} onChangeText={setNote} placeholder="Ghi chú về cây" style={[g.input, g.multiline]} multiline/></> : null}
      </>}
    {error ? <Text style={g.error}>{editId && !editingPlant ? 'Không tìm thấy hồ sơ cây trong phiên hiện tại.' : 'Vui lòng nhập đầy đủ thông tin bắt buộc.'}</Text> : null}
    {requestError ? <Text style={g.error}>{requestError}</Text> : null}
    <ActionButton label={editId ? 'Lưu thay đổi' : addPlant ? 'Thêm cây vào danh sách' : 'Tạo khu vườn'} onPress={() => void submit()}/><Text style={g.note}>{addPlant ? 'Cây và ghi chú sẽ được lưu vào tài khoản của bạn.' : 'Vườn sẽ được lưu vào tài khoản của bạn.'}</Text>
  </ScrollView></SafeAreaView>;
}

export function CreateGardenScreen() { return <GardenForm/>; }
export function AddGardenPlantScreen() { return <GardenForm addPlant/>; }

const g = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background }, header: { height: 52, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { width: 34 }, backText: { color: C.forest, fontSize: 29 }, headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 }, profile: { width: 29, height: 29, borderRadius: 15, overflow: 'hidden', backgroundColor: C.forest, color: C.surface, textAlign: 'center', textAlignVertical: 'center', fontFamily: F.bold }, deleteLink: { color: '#A12D24', fontFamily: F.semiBold, fontSize: 10 },
  content: { padding: 13, gap: 9, paddingBottom: 24 }, hero: { height: 180, borderRadius: 15, backgroundColor: '#DCEDE0', alignItems: 'center', justifyContent: 'center' }, heroPlant: { color: '#508664', fontSize: 64 }, heroLabel: { color: C.forest, fontFamily: F.bold, fontSize: 10, letterSpacing: 1 }, title: { color: C.forest, fontFamily: F.bold, fontSize: 19 }, body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 }, metrics: { flexDirection: 'row', gap: 7 }, metric: { flex: 1, padding: 9, borderRadius: 11, backgroundColor: C.surface }, metricValue: { color: C.forest, fontFamily: F.bold, fontSize: 15 }, card: { padding: 11, borderRadius: 14, backgroundColor: C.surface, gap: 8 }, sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' }, link: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 }, icon: { color: C.forest, fontSize: 16 }, time: { color: C.primary, fontFamily: F.semiBold, fontSize: 10 }, plantCard: { minHeight: 66, padding: 8, borderRadius: 12, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 9 }, plantImage: { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.softSurface }, plantEmoji: { fontSize: 22 }, plantCopy: { flex: 1 }, plantName: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 }, action: { minHeight: 44, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, actionText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 }, actionSecondary: { backgroundColor: C.softSurface }, actionTextSecondary: { color: C.forest }, note: { color: C.mutedText, fontFamily: F.regular, fontSize: 9, textAlign: 'center' },
  tip: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, gap: 4 }, label: { color: C.text, fontFamily: F.semiBold, fontSize: 12, marginTop: 4 }, required: { color: C.terracotta }, input: { minHeight: 44, paddingHorizontal: 12, borderRadius: 9, backgroundColor: C.surface, color: C.text, fontFamily: F.regular, fontSize: 12 }, inputError: { borderWidth: 1, borderColor: '#C62828' }, multiline: { height: 80, textAlignVertical: 'top', paddingTop: 10 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 9, backgroundColor: C.surface }, choiceActive: { borderWidth: 1, borderColor: C.primary, backgroundColor: '#E0F2E6' }, heroSmall: { height: 100, borderRadius: 12, backgroundColor: '#E0EEE3', alignItems: 'center', justifyContent: 'center' }, error: { color: '#B42318', fontFamily: F.regular, fontSize: 11 },
});
