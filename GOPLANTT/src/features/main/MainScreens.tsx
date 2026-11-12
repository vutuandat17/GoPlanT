import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { router } from 'expo-router';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { TabScreenTransition } from '@/components/tab-screen-transition';
import { usePlantData } from '@/features/plants/PlantDataStore';

type PageKind = 'gardens' | 'plants' | 'journal' | 'schedule' | 'monitoring';

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <View style={s.section}><View style={s.sectionHeading}><Text style={s.sectionTitle}>{title}</Text>{hint ? <Text style={s.hint}>{hint}</Text> : null}</View>{children}</View>;
}

function Tag({ children, tone = 'mint' }: { children: ReactNode; tone?: 'mint' | 'peach' | 'plain' }) {
  return <Text style={[s.tag, tone === 'peach' ? s.tagPeach : tone === 'plain' ? s.tagPlain : s.tagMint]}>{children}</Text>;
}

function Action({ label, muted = false, onPress }: { label: string; muted?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[s.action, muted && s.actionMuted]}><Text style={[s.actionText, muted && s.actionMutedText]}>{label}</Text></Pressable>;
}

function EmptyCard({ icon, title, description, action, onPress }: { icon: string; title: string; description: string; action?: string; onPress?: () => void }) {
  return <View style={s.emptyCard}>
    <View style={s.emptyIcon}><Text style={s.emptyGlyph}>{icon}</Text></View>
    <Text style={s.cardTitle}>{title}</Text>
    <Text style={s.emptyDescription}>{description}</Text>
    {action && onPress ? <Action label={action} onPress={onPress} /> : null}
  </View>;
}

function EmptyPage({ kind }: { kind: PageKind }) {
  const { apiError, catalog, gardens, ownedPlants, favorites, isLoading, removePlant } = usePlantData();
  const [plantQuery, setPlantQuery] = useState('');
  if (kind === 'gardens') return <>
    {apiError ? <Text style={s.helperNote}>{apiError}</Text> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{[`Tất cả (${gardens.length})`, `Ban công (${gardens.filter((garden) => garden.locationType === 'balcony').length})`, `Trong nhà (${gardens.filter((garden) => garden.locationType === 'indoor').length})`].map((x, i) => <Tag key={x} tone={i === 0 ? 'mint' : 'plain'}>{x}</Tag>)}</ScrollView>
    <View style={s.managementActions}><Action label="＋  Tạo khu vườn mới" onPress={() => router.push('/garden/create' as never)} /></View>
    <Section title="Khu vườn của bạn" hint={`${gardens.length} khu vực`}>
      {gardens.length === 0 ? <EmptyCard icon="⌂" title={isLoading ? 'Đang tải khu vườn…' : 'Chưa có khu vườn nào'} description="Tạo khu vườn để sắp xếp cây theo không gian và điều kiện chăm sóc." action="＋  Tạo khu vườn mới" onPress={() => router.push('/garden/create' as never)} /> : gardens.map((garden) => {
        const gardenPlants = ownedPlants.filter((plant) => plant.gardenId === garden.id);
        return <View key={garden.id} style={s.card}><View style={s.gardenArt}><Text style={s.artGlyph}>♧</Text><Text style={s.artLabel}>{garden.locationType.toLocaleUpperCase()}</Text></View><View style={s.cardBody}><Text style={s.cardTitle}>{garden.name}</Text><Text style={s.body}>{garden.locationDetail || 'Chưa có vị trí'}</Text><Text style={s.body}>{gardenPlants.length} cây đang trồng</Text><Action label="Quản lý vườn →" onPress={() => router.push({ pathname: '/garden-detail', params: { gardenId: garden.id } } as never)} /></View></View>;
      })}
    </Section>
    <Section title="Cây chưa phân vườn" hint={`${ownedPlants.filter((plant) => !plant.gardenId).length} cây`}>
      {ownedPlants.filter((plant) => !plant.gardenId).length === 0 ? <EmptyCard icon="♧" title="Không có cây chờ sắp xếp" description="Cây chưa gắn vườn sẽ xuất hiện tại đây." /> : ownedPlants.filter((plant) => !plant.gardenId).map((plant) => <View key={plant.id} style={s.rowCard}><View style={s.plantImage}><Text style={s.plantEmoji}>♧</Text></View><View style={s.cardCopy}><Text style={s.cardTitle}>{plant.name}</Text><Text style={s.body}>{plant.location || 'Chưa có vị trí cụ thể'}</Text></View></View>)}
    </Section>
  </>;
  if (kind === 'plants') {
    const normalized = plantQuery.trim().toLocaleLowerCase();
    const visiblePlants = ownedPlants.filter((plant) => `${plant.name} ${plant.scientificName} ${plant.location}`.toLocaleLowerCase().includes(normalized));
    const favoritePlants = catalog.filter((plant) => favorites.includes(plant.id));
    return <>
      <View style={s.search}><Text style={s.searchGlyph}>⌕</Text><TextInput value={plantQuery} onChangeText={setPlantQuery} placeholder="Tìm theo tên cây, loài hoặc vị trí..." placeholderTextColor={C.mutedText} style={s.searchInput} /></View>
      <View style={s.managementActions}><Action label="＋  Thêm cây" onPress={() => router.push('/garden/add-plant' as never)} /><Action label="Lọc cây" muted onPress={() => router.push({ pathname: '/filter', params: { scope: 'owned' } } as never)} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{[`Cây đang sở hữu (${ownedPlants.length})`, 'Khám phá & tìm cây'].map((x, i) => <Pressable key={x} onPress={() => i === 1 && router.push('/search' as never)}><Tag tone={i === 0 ? 'mint' : 'plain'}>{x}</Tag></Pressable>)}</ScrollView>
      <Section title="Cây đang sở hữu" hint={`${visiblePlants.length} cây`}>
        {visiblePlants.length === 0 ? <EmptyCard icon="♧" title={plantQuery ? 'Không tìm thấy cây phù hợp' : 'Vườn của bạn chưa có cây'} description={plantQuery ? 'Thử tên cây, tên khoa học hoặc vị trí khác.' : 'Thêm cây đầu tiên để bắt đầu quản lý hồ sơ cây trồng.'} action={plantQuery ? undefined : '＋  Thêm cây đầu tiên'} onPress={plantQuery ? undefined : () => router.push('/garden/add-plant' as never)} /> : visiblePlants.map((plant) => <View key={plant.id} style={s.plantCard}>
          <View style={s.rowTop}><View style={s.plantImage}><Text style={s.plantEmoji}>♧</Text></View><View style={s.cardCopy}><Text style={s.cardTitle}>{plant.name}</Text><Text style={s.latin}>{plant.scientificName}</Text><Text style={s.body}>{plant.category} • {plant.location}</Text><Text style={s.body}>Ngày thêm: {plant.plantedAt || 'Chưa có dữ liệu'} • Tình trạng: Chưa đánh giá</Text></View></View>
          <View style={s.row}><Action label="Chi tiết" muted onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name, ownedId: plant.id } } as never)} /><Action label="Chỉnh sửa" muted onPress={() => router.push({ pathname: '/garden/add-plant', params: { editId: plant.id } } as never)} /><Action label="Xóa" muted onPress={() => Alert.alert('Xóa cây', `Xóa hồ sơ “${plant.name}” khỏi danh sách của bạn?`, [{ text: 'Hủy', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => void removePlant(plant.id) }])} /></View>
        </View>)}
      </Section>
      <Section title="Cây trồng mong muốn" hint={`${favoritePlants.length} cây đã lưu`}>
        {favoritePlants.length === 0 ? <EmptyCard icon="♡" title="Chưa có cây yêu thích" description="Khám phá thư viện cây để xem thông tin và đánh dấu yêu thích." action="Khám phá cây" onPress={() => router.push('/search' as never)} /> : favoritePlants.map((plant) => <View key={plant.id} style={s.rowCard}><View style={s.plantImage}><Text style={s.plantEmoji}>♧</Text></View><View style={s.cardCopy}><Text style={s.cardTitle}>{plant.name}</Text><Text style={s.latin}>{plant.scientificName}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Xem ${plant.name}`} onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name } } as never)}><Text style={s.heart}>♡</Text></Pressable></View>)}
      </Section>
      {apiError ? <Text style={s.helperNote}>{apiError}</Text> : null}
      {isLoading ? <Text style={s.helperNote}>Đang tải dữ liệu…</Text> : null}
    </>;
  }
  if (kind === 'journal') return <>
    <View style={s.metrics}>{[['0', 'Ghi nhận'], ['0', 'Cây có nhật ký'], ['0', 'Khu vườn'], ['—', 'Cập nhật gần nhất']].map(([value, label]) => <View key={label} style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.body}>{label}</Text></View>)}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{['Tất cả vườn', 'Nhật ký từng cây'].map((x, i) => <Tag key={x} tone={i === 0 ? 'mint' : 'plain'}>{x}</Tag>)}</ScrollView>
    <Section title="Nhật ký khu vườn"><EmptyCard icon="▤" title="Chưa có nhật ký khu vườn" description="Nhật ký chưa có dữ liệu." /></Section>
    <Section title="Nhật ký từng cây"><EmptyCard icon="♧" title="Chưa có nhật ký cây trồng" description="Nhật ký chưa có dữ liệu." /></Section>
    <View style={s.recommend}><Text style={s.cardTitle}>Mẹo ghi nhật ký</Text><Text style={s.body}>Ghi lại việc chăm sóc thường xuyên để dễ theo dõi thay đổi theo thời gian.</Text></View>
  </>;
  if (kind === 'monitoring') return <>
    <View style={s.metrics}>{[['0', 'Cây đang theo dõi'], ['—', 'Tỉ lệ khỏe mạnh'], ['0', 'Cần xử lý'], ['—', 'Chỉ số sinh thái']].map(([value, label]) => <View key={label} style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.body}>{label}</Text></View>)}</View>
    <View style={s.eco}><Text style={s.ecoScore}>—</Text><View style={s.cardCopy}><Text style={s.cardTitle}>Chưa có dữ liệu đánh giá</Text><Text style={s.body}>Thêm vườn và cây để bắt đầu theo dõi.</Text></View></View>
    <Section title="Khu vườn"><EmptyCard icon="⌂" title="Chưa có khu vườn để theo dõi" description="Tạo khu vườn đầu tiên để ghi nhận tình trạng không gian trồng." action="Tạo khu vườn" onPress={() => router.push('/garden/create' as never)} /></Section>
    <Section title="Cây trồng theo dõi"><EmptyCard icon="♧" title="Chưa có cây được theo dõi" description="Thêm cây để ghi nhận sức khỏe và tiến triển chăm sóc." action="Thêm cây" onPress={() => router.push('/garden/add-plant' as never)} /></Section>
    <Section title="Lịch sử ghi nhận"><EmptyCard icon="▤" title="Chưa có ghi nhận" description="Chưa có dữ liệu theo dõi." /></Section>
  </>;
  return <>
    <View style={s.scheduleBanner}><Text style={s.bannerIcon}>◷</Text><View style={s.cardCopy}><Text style={s.cardTitle}>Lịch chăm sóc của bạn</Text><Text style={s.body}>Theo dõi các công việc chăm cây sắp tới.</Text></View></View>
    <View style={s.metrics}><View style={s.metric}><Text style={s.metricValue}>0%</Text><Text style={s.body}>Tiến độ hoàn thành</Text></View><View style={s.metric}><Text style={s.metricValue}>0</Text><Text style={s.body}>Lịch đang hoạt động</Text></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{['Tất cả', 'Hôm nay', 'Tuần này'].map((x, i) => <Tag key={x} tone={i === 0 ? 'mint' : 'plain'}>{x}</Tag>)}</ScrollView>
    <Section title="Lịch chăm sóc"><EmptyCard icon="◷" title="Chưa có lịch chăm sóc" description="Chưa có lịch chăm sóc được lưu." /></Section>
  </>;
}

function PageContent({ kind }: { kind: PageKind }) {
  const config: Record<PageKind, { title: string; subtitle: string; intro: string }> = {
    gardens: { title: 'Trang Chủ', subtitle: 'Vườn của tôi', intro: 'Bắt đầu tạo khu vườn đầu tiên của bạn' },
    plants: { title: 'Cây Trồng', subtitle: 'Quản lý cây trồng', intro: 'Tổng số 0 cây • 0 khu vườn' },
    journal: { title: 'Nhật ký', subtitle: 'Nhật ký phát triển', intro: 'Chưa có ghi nhận nào' },
    schedule: { title: 'Lịch Chăm Sóc', subtitle: 'Lập lịch chăm sóc', intro: 'Chưa có lịch chăm sóc nào' },
    monitoring: { title: 'Theo dõi & Ghi nhận', subtitle: 'Tổng quan sức khỏe vườn', intro: 'Chưa có cây hoặc khu vườn để theo dõi' },
  };
  const { subtitle, intro } = config[kind];
  return <TabScreenTransition>
    <ScrollView style={s.contentScroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.introRow}><View style={s.cardCopy}><Text style={s.pageTitle}>{subtitle}</Text><Text style={s.body}>{intro}</Text></View></View>
      <EmptyPage kind={kind} />
    </ScrollView>
  </TabScreenTransition>;
}

export function GardensScreen() { return <PageContent kind="gardens" />; }
export function PlantsScreen() { return <PageContent kind="plants" />; }
export function JournalScreen() { return <PageContent kind="journal" />; }
export function ScheduleScreen() { return <PageContent kind="schedule" />; }
export function MonitoringScreen() { return <PageContent kind="monitoring" />; }

const s = StyleSheet.create({
  contentScroll: { width: '100%', flex: 1, alignSelf: 'center' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 14, paddingTop: 18, paddingBottom: 20, gap: 9 },
  introRow: { minHeight: 54, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }, pageTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 18, lineHeight: 24 },
  section: { gap: 8, marginTop: 5 }, sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 15, lineHeight: 21 }, hint: { color: C.mutedText, fontFamily: F.regular, fontSize: 11 },
  card: { padding: 10, borderRadius: 14, backgroundColor: C.surface, gap: 7 }, gardenArt: { minHeight: 104, borderRadius: 11, backgroundColor: '#DDEFE3', alignItems: 'center', justifyContent: 'center' }, artGlyph: { color: '#49815E', fontSize: 38 }, artLabel: { color: '#446751', fontFamily: F.semiBold, fontSize: 9, letterSpacing: 1 },
  cardBody: { gap: 5 }, cardTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13, lineHeight: 19 }, body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 }, rowTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, cardCopy: { flex: 1, gap: 2 },
  tag: { overflow: 'hidden', alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, fontFamily: F.semiBold, fontSize: 10, lineHeight: 14 }, tagMint: { color: C.forest, backgroundColor: '#D5F2E1' }, tagPeach: { color: '#914218', backgroundColor: '#FFE0CF' }, tagPlain: { color: C.secondaryText, backgroundColor: '#E7EEE8' },
  action: { minHeight: 34, paddingHorizontal: 10, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, actionText: { color: C.surface, fontFamily: F.semiBold, fontSize: 11 }, actionMuted: { flex: 1, backgroundColor: C.softSurface }, actionMutedText: { color: C.secondaryText },
  pills: { flexDirection: 'row', gap: 7, paddingVertical: 3 }, recommend: { padding: 13, borderRadius: 13, backgroundColor: '#D9F2E3', gap: 6 },
  search: { minHeight: 44, paddingHorizontal: 9, borderRadius: 11, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 6 }, searchGlyph: { width: 23, textAlign: 'center', color: C.secondaryText, fontSize: 24 }, searchInput: { flex: 1, paddingVertical: 7, color: C.text, fontFamily: F.regular, fontSize: 12 },
  plantCard: { padding: 9, borderRadius: 14, backgroundColor: C.surface, gap: 7 }, plantImage: { width: 54, height: 54, borderRadius: 10, backgroundColor: '#E4F0E7', alignItems: 'center', justifyContent: 'center' }, plantEmoji: { fontSize: 25 }, latin: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, fontStyle: 'italic' }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#DEE8E0' }, rowCard: { padding: 9, borderRadius: 13, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 9 }, heart: { color: '#A84B20', fontSize: 18 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, metric: { width: '48%', minHeight: 54, padding: 9, borderRadius: 12, backgroundColor: C.surface }, metricValue: { color: C.forest, fontFamily: F.bold, fontSize: 15 }, eco: { marginVertical: 8, padding: 10, borderRadius: 12, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 12 }, ecoScore: { color: C.forest, fontFamily: F.bold, fontSize: 23 },
  plantCardActions: { flexDirection: 'row', gap: 5 }, scheduleBanner: { padding: 12, borderRadius: 13, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 9 }, bannerIcon: { color: C.forest, fontSize: 22 }, taskCard: { padding: 10, borderRadius: 13, backgroundColor: C.surface, gap: 8 },
  helperNote: { marginTop: 8, color: C.mutedText, fontFamily: F.regular, fontSize: 10, textAlign: 'center' },
  emptyCard: { padding: 16, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 9 },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#E2F1E7', alignItems: 'center', justifyContent: 'center' },
  emptyGlyph: { color: C.forest, fontSize: 30, lineHeight: 36 },
  emptyDescription: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  managementActions: { flexDirection: 'row', gap: 8 },
});
