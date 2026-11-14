import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { router } from 'expo-router';
import { SafeAreaView } from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/AuthSession';
import { usePlantData } from '@/features/plants/PlantDataStore';
import { apiRequest, type PlantCatalogItem } from '@/services/api';

type FormField =
  | 'commonName'
  | 'scientificName'
  | 'category'
  | 'sourceTitle'
  | 'sourceUrl'
  | 'difficulty'
  | 'lightRequirement'
  | 'waterFrequencyDays'
  | 'temperatureRange'
  | 'origin'
  | 'overview'
  | 'morphology'
  | 'toxicityWarning';
const emptyForm: Record<FormField, string> = {
  commonName: '',
  scientificName: '',
  category: '',
  sourceTitle: '',
  sourceUrl: '',
  difficulty: '',
  lightRequirement: '',
  waterFrequencyDays: '',
  temperatureRange: '',
  origin: '',
  overview: '',
  morphology: '',
  toxicityWarning: '',
};

export default function AdminPlantCatalogScreen() {
  const { user, accessToken } = useAuthSession();
  const { refresh } = usePlantData();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const set = (key: FormField, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const createPlant = async () => {
    if (user?.role !== 'admin' || !accessToken) {
      Alert.alert('Không có quyền', 'Chỉ tài khoản quản trị mới được thêm cây vào danh mục.');
      return;
    }
    if (!form.commonName.trim() || !form.scientificName.trim() || !form.category.trim()) {
      Alert.alert('Thiếu thông tin', 'Nhập tên thường gọi, tên khoa học và nhóm cây.');
      return;
    }
    if (!form.sourceTitle.trim() && !form.sourceUrl.trim()) {
      Alert.alert('Thiếu nguồn', 'Cung cấp tên nguồn hoặc đường dẫn tham khảo.');
      return;
    }

    const parsedWaterDays = form.waterFrequencyDays.trim() ? Number(form.waterFrequencyDays.trim()) : null;
    if (parsedWaterDays !== null && (!Number.isInteger(parsedWaterDays) || parsedWaterDays < 1 || parsedWaterDays > 365)) {
      Alert.alert('Số liệu không hợp lệ', 'Chu kỳ tưới nước (ngày) phải là số nguyên từ 1 đến 365.');
      return;
    }

    setSaving(true);
    try {
      await apiRequest<PlantCatalogItem>('/api/v1/admin/catalog/plants', {
        method: 'POST', token: accessToken,
        body: {
          commonName: form.commonName.trim(),
          scientificName: form.scientificName.trim(),
          category: form.category.trim(),
          sourceTitle: form.sourceTitle.trim() || null,
          sourceUrl: form.sourceUrl.trim() || null,
          difficulty: form.difficulty.trim() || null,
          lightRequirement: form.lightRequirement.trim() || null,
          waterFrequencyDays: parsedWaterDays,
          temperatureRange: form.temperatureRange.trim() || null,
          origin: form.origin.trim() || null,
          overview: form.overview.trim() || null,
          morphology: form.morphology.trim() || null,
          toxicityWarning: form.toxicityWarning.trim() || null,
        },
      });
      await refresh();
      setForm(emptyForm);
      Alert.alert('Đã thêm cây', 'Cây đã được duyệt và xuất hiện trong danh mục dùng chung.');
    } catch (error) {
      Alert.alert('Không thể thêm cây', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={() => router.back()} style={s.back}><Text style={s.backText}>←</Text></Pressable>
      <Text style={s.title}>Danh mục cây</Text><View style={s.headerSpacer}/>
    </View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.banner}><Text style={s.bannerTitle}>Thêm cây mới</Text><Text style={s.caption}>Cây sẽ được xuất bản ngay sau khi lưu. Hãy kiểm tra tên khoa học và ghi nguồn đáng tin cậy.</Text></View>
      <Field label="Tên thường gọi *" placeholder="Ví dụ: Trầu bà lá xẻ" value={form.commonName} onChangeText={(value) => set('commonName', value)}/>
      <Field label="Tên khoa học *" placeholder="Ví dụ: Monstera deliciosa" value={form.scientificName} onChangeText={(value) => set('scientificName', value)}/>
      <Field label="Nhóm cây *" placeholder="Cây nội thất, Cây hoa, Rau ăn lá…" value={form.category} onChangeText={(value) => set('category', value)}/>
      <Field label="Tên nguồn tham khảo" placeholder="Ví dụ: Kew Plants of the World Online" value={form.sourceTitle} onChangeText={(value) => set('sourceTitle', value)}/>
      <Field label="Đường dẫn nguồn" placeholder="https://…" value={form.sourceUrl} onChangeText={(value) => set('sourceUrl', value)} autoCapitalize="none" keyboardType="url"/>
      <Field label="Độ khó chăm sóc" placeholder="Ví dụ: Dễ / Trung bình" value={form.difficulty} onChangeText={(value) => set('difficulty', value)}/>
      <Field label="Nhu cầu ánh sáng" placeholder="Ví dụ: Ánh sáng gián tiếp" value={form.lightRequirement} onChangeText={(value) => set('lightRequirement', value)}/>
      <Field label="Chu kỳ tưới nước (ngày)" placeholder="Ví dụ: 3" value={form.waterFrequencyDays} onChangeText={(value) => set('waterFrequencyDays', value)} keyboardType="number-pad"/>
      <Field label="Khoảng nhiệt độ phù hợp" placeholder="Ví dụ: 18–28°C" value={form.temperatureRange} onChangeText={(value) => set('temperatureRange', value)}/>
      <Field label="Nguồn gốc" placeholder="Ví dụ: Trung Mỹ và Nam Mỹ" value={form.origin} onChangeText={(value) => set('origin', value)}/>
      <Field label="Tổng quan" placeholder="Mô tả tổng quan về loài cây" value={form.overview} onChangeText={(value) => set('overview', value)} multiline/>
      <Field label="Đặc điểm hình thái" placeholder="Mô tả lá, thân, rễ, hoa…" value={form.morphology} onChangeText={(value) => set('morphology', value)} multiline/>
      <Field label="Lưu ý & Độc tính" placeholder="Cảnh báo thú cưng/trẻ nhỏ hoặc công dụng" value={form.toxicityWarning} onChangeText={(value) => set('toxicityWarning', value)} multiline/>
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void createPlant()} style={[s.button, saving && s.disabled]}>
        <Text style={s.buttonText}>{saving ? 'Đang lưu…' : 'Thêm và xuất bản cây'}</Text>
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput {...props} placeholderTextColor={C.mutedText} style={s.input}/></View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  backText: { color: C.primary, fontSize: 25, fontFamily: F.semiBold },
  title: { flex: 1, color: C.text, fontFamily: F.bold, fontSize: 18 }, headerSpacer: { width: 40 },
  content: { padding: 18, gap: 16, paddingBottom: 40 },
  banner: { backgroundColor: C.softSurface, padding: 18, borderRadius: 18, gap: 6 },
  bannerTitle: { color: C.forest, fontFamily: F.bold, fontSize: 20 },
  caption: { color: C.secondaryText, fontFamily: F.regular, fontSize: 13, lineHeight: 20 },
  field: { gap: 7 }, label: { color: C.text, fontFamily: F.semiBold, fontSize: 13 },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: '#DCE8DE', backgroundColor: C.surface, paddingHorizontal: 14, color: C.text, fontFamily: F.regular, fontSize: 15 },
  button: { minHeight: 52, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { color: C.surface, fontFamily: F.bold, fontSize: 15 }, disabled: { opacity: 0.55 },
});
