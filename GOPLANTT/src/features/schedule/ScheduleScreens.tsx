import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { router } from 'expo-router';
import { SafeAreaView } from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { AccountButton } from '@/features/auth/AccountButton';
import { usePlantData } from '@/features/plants/PlantDataStore';

const tasks = ['Tưới nước', 'Bón phân', 'Cắt tỉa', 'Kiểm tra sâu bệnh', 'Phun sương', 'Ghi nhận phát triển'];

function Header({ title }: { title: string }) { return <View style={sc.header}><Pressable onPress={() => router.back()}><Text style={sc.back}>‹</Text></Pressable><Text style={sc.headerTitle}>{title}</Text><AccountButton size={29} /></View>; }

export function CreateScheduleScreen() {
  const { ownedPlants } = usePlantData();
  const [plant, setPlant] = useState('');
  const [plantQuery, setPlantQuery] = useState('');
  const [task, setTask] = useState('');
  const [repeat, setRepeat] = useState('Mỗi ngày');
  const [error, setError] = useState(false);
  const matchingPlants = plantQuery.trim() ? ownedPlants.filter((item) => `${item.name} ${item.scientificName} ${item.location}`.toLocaleLowerCase().includes(plantQuery.trim().toLocaleLowerCase())) : [];
  const save = () => { const invalid = !plant || !task; setError(invalid); if (!invalid) Alert.alert('Chưa thể lưu lịch', 'Máy chủ hiện chưa hỗ trợ lịch chăm sóc.'); };
  return <SafeAreaView style={sc.safe} edges={['top']}><Header title="Tạo lịch chăm sóc"/><ScrollView contentContainerStyle={sc.content}>
    <View style={sc.tip}><Text style={sc.title}>Lập lịch chăm sóc cây</Text><Text style={sc.body}>Chọn cây, công việc và thời gian để tạo lịch nhắc chăm sóc.</Text></View>
    <Text style={sc.label}>1. Chọn cây của bạn cần chăm sóc <Text style={sc.required}>*</Text></Text>{ownedPlants.length ? <><TextInput value={plantQuery} onChangeText={setPlantQuery} placeholder="Tìm theo tên cây hoặc tên khoa học" style={sc.input}/>{!plantQuery.trim() ? <Text style={sc.note}>Nhập tên cây để tìm trong danh sách {ownedPlants.length} cây của bạn.</Text> : null}{matchingPlants.slice(0, 20).map((item) => <Pressable key={item.id} onPress={() => setPlant(item.id)} style={[sc.plant, plant === item.id && sc.selected]}><View style={sc.plantIcon}><Text>♧</Text></View><View style={sc.plantCopy}><Text style={sc.bodyStrong}>{item.name}</Text><Text style={sc.body}>{item.scientificName}{item.location ? ` • ${item.location}` : ''}</Text></View><Text style={sc.radio}>{plant === item.id ? '●' : '○'}</Text></Pressable>)}{plantQuery.trim() && matchingPlants.length === 0 ? <Text style={sc.note}>Không tìm thấy cây phù hợp với nội dung tìm kiếm.</Text> : null}{matchingPlants.length > 20 ? <Text style={sc.note}>Có {matchingPlants.length} kết quả; hiển thị 20 cây đầu. Nhập thêm ký tự để thu hẹp.</Text> : null}</> : <View style={sc.tip}><Text style={sc.body}>Bạn chưa có cây để lập lịch chăm sóc.</Text><Pressable onPress={() => router.push('/garden/add-plant' as never)}><Text style={sc.link}>＋ Thêm cây của bạn</Text></Pressable></View>}
    <Text style={sc.label}>2. Chọn loại công việc <Text style={sc.required}>*</Text></Text><View style={sc.grid}>{tasks.map((name) => <Pressable key={name} onPress={() => setTask(name)} style={[sc.task, task === name && sc.selected]}><Text style={sc.body}>{name}</Text></Pressable>)}</View>
    <Text style={sc.label}>3. Thời gian bắt đầu</Text><View style={sc.row}><TextInput placeholder="Ngày bắt đầu" style={[sc.input, { flex: 1 }]} /><TextInput placeholder="Giờ nhắc" style={[sc.input, { flex: 1 }]} /></View>
    <Text style={sc.label}>4. Chu kỳ lặp lại</Text><View style={sc.grid}>{['Mỗi ngày', 'Cách ngày', 'Hàng tuần', 'Tùy chỉnh'].map((x) => <Pressable key={x} onPress={() => setRepeat(x)} style={[sc.task, repeat === x && sc.selected]}><Text style={sc.body}>{x}</Text></Pressable>)}</View>
    <View style={sc.tip}><Text style={sc.bodyStrong}>Thông báo nhắc lịch</Text><Text style={sc.body}>Lịch nhắc sẽ hiển thị trong ứng dụng khi tính năng thông báo được tích hợp.</Text></View>
    {error ? <Text style={sc.error}>Hãy chọn cây và công việc trước khi tiếp tục.</Text> : null}
    <Pressable onPress={save} style={sc.submit}><Text style={sc.submitText}>✓  Tạo lịch chăm sóc</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

export function ScheduleDetailScreen() {
  return <SafeAreaView style={sc.safe} edges={['top']}><Header title="Chi tiết lịch của cây"/><ScrollView contentContainerStyle={sc.content}>
    <View style={sc.plantHero}><Text style={sc.heroEmoji}>🍅</Text><View style={sc.plantHeroCopy}><Text style={sc.title}>Cà chua bi Cherry</Text><Text style={sc.body}>Solanum lycopersicum var. cerasiforme</Text><Text style={sc.tag}>Ban Công Tầng 3</Text></View></View>
    <View style={sc.dateRow}><Text style={sc.bodyStrong}>‹  Tháng 10, 2025</Text><Text style={sc.tag}>Hôm nay</Text><Text style={sc.bodyStrong}>›</Text></View>
    <View style={sc.week}>{['T2\n13', 'T3\n14', 'T4\n15', 'T5\n16', 'T6\n17', 'T7\n18', 'CN\n19'].map((day, i) => <View key={day} style={[sc.day, i === 2 && sc.daySelected]}><Text style={[sc.dayText, i === 2 && sc.dayTextSelected]}>{day}</Text></View>)}</View>
    <View style={sc.summary}><Text style={sc.sectionTitle}>Lịch chăm sóc cây</Text><Text style={sc.body}>4 công việc • 2 việc cần thực hiện hôm nay</Text></View>
    {[
      ['08:00', 'Tưới nước', 'Đến hạn', 'Tưới nhẹ quanh gốc, tránh để đất bị úng.'],
      ['10:00', 'Kiểm tra độ ẩm', 'Định kỳ', 'Kiểm tra lớp đất mặt trước khi tưới.'],
      ['16:30', 'Bón phân hữu cơ', 'Sắp tới', 'Bón theo liều lượng phù hợp với cây.'],
      ['18:00', 'Ghi nhận phát triển', 'Định kỳ', 'Theo dõi tình trạng lá và quả.'],
    ].map(([time, title, status, desc]) => <View key={title} style={sc.detailTask}><View style={sc.row}><Text style={sc.time}>{time}</Text><Text style={sc.tag}>{status}</Text></View><Text style={sc.sectionTitle}>{title}</Text><Text style={sc.body}>{desc}</Text></View>)}
    <Text style={sc.note}>Chưa có lịch chăm sóc được lưu.</Text>
  </ScrollView></SafeAreaView>;
}

const sc = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background }, header: { height: 52, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { color: C.forest, fontSize: 29 }, headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 }, profile: { width: 29, height: 29, borderRadius: 15, backgroundColor: C.forest, color: C.surface, fontFamily: F.bold, textAlign: 'center', textAlignVertical: 'center' }, content: { padding: 13, gap: 9, paddingBottom: 25 }, tip: { padding: 12, borderRadius: 12, backgroundColor: C.softSurface, gap: 3 }, title: { color: C.forest, fontFamily: F.bold, fontSize: 17 }, body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 }, bodyStrong: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 }, label: { marginTop: 4, color: C.text, fontFamily: F.semiBold, fontSize: 12 }, required: { color: C.terracotta }, plant: { minHeight: 48, padding: 7, borderRadius: 10, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 9 }, plantIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' }, plantCopy: { flex: 1 }, selected: { borderWidth: 1, borderColor: C.primary, backgroundColor: '#E1F2E7' }, radio: { marginLeft: 'auto', color: C.primary }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, task: { minHeight: 37, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: C.surface }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, input: { minHeight: 42, paddingHorizontal: 10, borderRadius: 9, backgroundColor: C.surface, fontFamily: F.regular, fontSize: 11 }, error: { color: '#B42318', fontFamily: F.regular, fontSize: 11 }, submit: { minHeight: 44, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, submitText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 }, note: { color: C.mutedText, fontFamily: F.regular, textAlign: 'center', fontSize: 9 }, plantHero: { padding: 12, borderRadius: 14, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 12 }, heroEmoji: { fontSize: 42 }, plantHeroCopy: { flex: 1, gap: 4 }, tag: { alignSelf: 'flex-start', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, backgroundColor: '#DDF2E4', color: C.forest, fontFamily: F.semiBold, fontSize: 9 }, dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, week: { flexDirection: 'row', gap: 5 }, day: { flex: 1, minHeight: 48, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }, daySelected: { backgroundColor: C.primary }, dayText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 9, textAlign: 'center' }, dayTextSelected: { color: C.surface }, summary: { padding: 11, borderRadius: 12, backgroundColor: '#DDF2E4', gap: 4 }, sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 }, detailTask: { padding: 11, borderRadius: 12, backgroundColor: C.surface, gap: 7 }, time: { color: C.primary, fontFamily: F.bold, fontSize: 12 }, link: { color: C.primary, fontFamily: F.semiBold, fontSize: 11 },
});
