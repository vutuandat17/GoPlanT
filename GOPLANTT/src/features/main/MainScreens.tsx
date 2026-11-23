import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { router } from 'expo-router';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { TabScreenTransition } from '@/components/tab-screen-transition';
import { GardenArtwork } from '@/features/gardens/GardenArtwork';
import { GardenPickerModal } from '@/features/gardens/GardenPickerModal';
import { usePlantData, type OwnedPlant } from '@/features/plants/PlantDataStore';
import { PlantArtwork } from '@/features/plants/PlantArtwork';
import { apiBaseUrl, getGardenPhotoUri } from '@/services/api';
import { useAuthSession } from '@/features/auth/AuthSession';
import { getLatestHealthLabel, matchesPlantFilters, toOwnedFilterPlant } from '@/features/plants/plantFilters';
import {
  filterJournalEntries,
  JournalFilterBar,
  type JournalHealthFilter,
  type JournalLogFilter,
} from '@/features/journal/JournalFilterBar';
import { JOURNAL_HEALTH_META, JOURNAL_LOG_TYPE_META, useJournals } from '@/features/journal/JournalStore';
import { MonitoringDashboard } from '@/features/monitoring/MonitoringDashboard';
import { formatDateVi, useCareSchedules } from '@/features/schedule/CareScheduleStore';

type PageKind = 'gardens' | 'plants' | 'journal' | 'monitoring';

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
  const { apiError, catalog, gardens, ownedPlants, favorites, isLoading, removePlant, updatePlant, toggleFavorite, filterStates, setFilterState } = usePlantData();
  const { journals = [] } = useJournals();
  const { todayTasks, schedules } = useCareSchedules();
  const { accessToken } = useAuthSession();
  const [plantQuery, setPlantQuery] = useState('');
  const [journalQuery, setJournalQuery] = useState('');
  const [journalLogFilter, setJournalLogFilter] = useState<JournalLogFilter>('all');
  const [journalHealthFilter, setJournalHealthFilter] = useState<JournalHealthFilter>('all');
  const [assigningPlant, setAssigningPlant] = useState<OwnedPlant | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const pageFilters = filterStates[kind] ?? {};
  const locationLabels: Record<string, string> = {
    balcony: 'Ban công',
    rooftop: 'Sân thượng',
    garden: 'Sân vườn',
    indoor: 'Trong nhà',
    greenhouse: 'Nhà kính',
    other: 'Khác',
  };
  const filteredGardens = gardens.filter((garden) => matchesPlantFilters({ id: garden.id, name: garden.name, scientificName: '', category: locationLabels[garden.locationType] ?? 'Khác', location: garden.locationDetail }, pageFilters));
  const openFilter = (context: string) => router.push({ pathname: '/filter', params: { context } } as never);
  if (kind === 'gardens') {
    const locationOrder = ['balcony', 'rooftop', 'garden', 'indoor', 'greenhouse', 'other'];
    const dynamicPills = [
      { label: `Tất cả (${gardens.length})`, type: '' },
      ...locationOrder
        .map((code) => ({ code, count: gardens.filter((g) => g.locationType === code).length }))
        .filter((item) => item.count > 0)
        .map((item) => ({ label: `${locationLabels[item.code]} (${item.count})`, type: locationLabels[item.code] })),
    ];
    const unassignedPlants = ownedPlants.filter((plant) => !plant.gardenId);
    const handleAssignGarden = async (nextGardenId: string | null) => {
      if (!assigningPlant || !nextGardenId) return;
      setAssignBusy(true);
      try {
        await updatePlant(assigningPlant.id, { ...assigningPlant, gardenId: nextGardenId });
        setAssigningPlant(null);
      } catch (err) {
        Alert.alert('Không thể gán vào vườn', err instanceof Error ? err.message : 'Vui lòng thử lại.');
      } finally {
        setAssignBusy(false);
      }
    };
    return <>
      {apiError ? <Text style={s.helperNote}>{apiError}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
        {dynamicPills.map((item) => {
          const isSelected = !item.type ? !pageFilters.category?.length : Boolean(pageFilters.category?.includes(item.type));
          return (
            <Pressable key={item.label} onPress={() => setFilterState('gardens', item.type && pageFilters.category?.[0] !== item.type ? { category: [item.type] } : {})}>
              <Tag tone={isSelected ? 'mint' : 'plain'}>{item.label}</Tag>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={s.managementActions}><Action label="＋  Tạo khu vườn mới" onPress={() => router.push('/garden/create' as never)} /><Action label="Lọc vườn" muted onPress={() => openFilter('gardens')} /></View>
      <Section title="Khu vườn của bạn" hint={`${filteredGardens.length} / ${gardens.length} khu vực`}>
        {filteredGardens.length === 0 ? <EmptyCard icon="⌂" title={gardens.length && Object.values(pageFilters).some((values) => values.length) ? 'Không có vườn khớp bộ lọc' : isLoading ? 'Đang tải khu vườn…' : 'Chưa có khu vườn nào'} description="Tạo khu vườn để sắp xếp cây theo không gian và điều kiện chăm sóc." action={gardens.length ? undefined : '＋  Tạo khu vườn mới'} onPress={gardens.length ? undefined : () => router.push('/garden/create' as never)} /> : filteredGardens.map((garden) => {
          const gardenPlants = ownedPlants.filter((plant) => plant.gardenId === garden.id);
          return <View key={garden.id} style={s.card}><GardenArtwork locationType={garden.locationType} photoUri={getGardenPhotoUri(garden.id, garden.photoUpdatedAt)} accessToken={accessToken} style={s.gardenArt} glyphStyle={s.artGlyph} labelStyle={s.artLabel} /><View style={s.cardBody}><Text style={s.cardTitle}>{garden.name}</Text><Text style={s.body}>{garden.locationDetail || 'Chưa có vị trí'}</Text><Text style={s.body}>{gardenPlants.length} cây đang trồng</Text><Action label="Quản lý vườn →" onPress={() => router.push({ pathname: '/garden-detail', params: { gardenId: garden.id } } as never)} /></View></View>;
        })}
      </Section>
      <Section title="Cây chưa phân vườn" hint={`${unassignedPlants.length} cây`}>
        {unassignedPlants.length === 0 ? <EmptyCard icon="♧" title="Không có cây chờ sắp xếp" description="Cây chưa gắn vườn sẽ xuất hiện tại đây." /> : unassignedPlants.map((plant) => (
          <View key={plant.id} style={s.rowCard}>
            <Pressable
              style={s.rowPressMain}
              onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name, ownedId: plant.id } } as never)}>
              <PlantArtwork style={s.plantImage} category={plant.category} photoUri={plant.photoUpdatedAt ? `${apiBaseUrl}/api/v1/plants/${plant.id}/photo?v=${encodeURIComponent(plant.photoUpdatedAt)}` : undefined} accessToken={accessToken} />
              <View style={s.cardCopy}>
                <Text style={s.cardTitle}>{plant.name}</Text>
                <Text style={s.body}>{plant.location || 'Chưa có vị trí cụ thể'}</Text>
              </View>
            </Pressable>
            {gardens.length > 0 ? (
              <Action label="Gán vào vườn" onPress={() => setAssigningPlant(plant)} />
            ) : null}
          </View>
        ))}
      </Section>
      <GardenPickerModal
        visible={Boolean(assigningPlant)}
        title="Gán vào khu vườn"
        subtitle={assigningPlant ? `Chọn khu vườn để đưa “${assigningPlant.name}” vào quản lý.` : undefined}
        gardens={gardens}
        busy={assignBusy}
        onSelect={(id) => void handleAssignGarden(id)}
        onClose={() => setAssigningPlant(null)}
      />
    </>;
  }
  if (kind === 'plants') {
    const normalized = plantQuery.trim().toLocaleLowerCase();
    const visiblePlants = ownedPlants.filter((plant) => (
      `${plant.name} ${plant.scientificName} ${plant.location}`.toLocaleLowerCase().includes(normalized)
      && matchesPlantFilters(toOwnedFilterPlant(plant, journals, todayTasks, schedules, favorites.includes(plant.catalogId)), pageFilters)
    ));
    const favoritePlants = catalog.filter((plant) => favorites.includes(plant.id));
    return <>
      <View style={s.search}><Text style={s.searchGlyph}>⌕</Text><TextInput value={plantQuery} onChangeText={setPlantQuery} placeholder="Tìm theo tên cây, loài hoặc vị trí..." placeholderTextColor={C.mutedText} style={s.searchInput} /></View>
      <View style={s.managementActions}><Action label="＋  Thêm cây" onPress={() => router.push('/garden/add-plant' as never)} /><Action label="Lọc cây" muted onPress={() => openFilter('plants')} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{[`Cây đang sở hữu (${ownedPlants.length})`, 'Khám phá & tìm cây'].map((x, i) => <Pressable key={x} onPress={() => i === 1 && router.push('/search' as never)}><Tag tone={i === 0 ? 'mint' : 'plain'}>{x}</Tag></Pressable>)}</ScrollView>
      <Section title="Cây đang sở hữu" hint={`${visiblePlants.length} cây`}>
        {visiblePlants.length === 0 ? <EmptyCard icon="♧" title={plantQuery ? 'Không tìm thấy cây phù hợp' : 'Vườn của bạn chưa có cây'} description={plantQuery ? 'Thử tên cây, tên khoa học hoặc vị trí khác.' : 'Thêm cây đầu tiên để bắt đầu quản lý hồ sơ cây trồng.'} action={plantQuery ? undefined : '＋  Thêm cây đầu tiên'} onPress={plantQuery ? undefined : () => router.push('/garden/add-plant' as never)} /> : visiblePlants.map((plant) => {
          const healthLabel = getLatestHealthLabel(plant.id, journals);
          return <View key={plant.id} style={s.plantCard}>
            <View style={s.rowTop}><PlantArtwork style={s.plantImage} category={plant.category} photoUri={plant.photoUpdatedAt ? `${apiBaseUrl}/api/v1/plants/${plant.id}/photo?v=${encodeURIComponent(plant.photoUpdatedAt)}` : undefined} accessToken={accessToken} /><View style={s.cardCopy}><Text style={s.cardTitle}>{plant.name}</Text><Text style={s.latin}>{plant.scientificName}</Text><Text style={s.body}>{plant.category} • {plant.location || 'Chưa có vị trí'}</Text><Text style={s.body}>Ngày thêm: {plant.plantedAt || 'Chưa có dữ liệu'} • Tình trạng: {healthLabel}</Text></View></View>
            <View style={s.row}><Action label="Chi tiết" muted onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name, ownedId: plant.id } } as never)} /><Action label="Chỉnh sửa" muted onPress={() => router.push({ pathname: '/garden/add-plant', params: { editId: plant.id } } as never)} /><Action label="Xóa" muted onPress={() => Alert.alert('Xóa cây', `Xóa hồ sơ “${plant.name}” khỏi danh sách của bạn?`, [{ text: 'Hủy', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => void removePlant(plant.id) }])} /></View>
          </View>;
        })}
      </Section>
      <Section title="Cây trồng mong muốn" hint={`${favoritePlants.length} cây đã lưu`}>
        {favoritePlants.length === 0 ? <EmptyCard icon="♡" title="Chưa có cây yêu thích" description="Khám phá thư viện cây để xem thông tin và đánh dấu yêu thích." action="Khám phá cây" onPress={() => router.push('/search' as never)} /> : favoritePlants.map((plant) => (
          <View key={plant.id} style={s.rowCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Xem ${plant.name}`}
              onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name } } as never)}
              style={s.rowPressMain}>
              <PlantArtwork style={s.plantImage} category={plant.category} />
              <View style={s.cardCopy}>
                <Text style={s.cardTitle}>{plant.name}</Text>
                <Text style={s.latin}>{plant.scientificName}</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Bỏ yêu thích ${plant.name}`}
              onPress={() => void toggleFavorite(plant.id)}>
              <Text style={s.heart}>♥</Text>
            </Pressable>
          </View>
        ))}
      </Section>
      {apiError ? <Text style={s.helperNote}>{apiError}</Text> : null}
      {isLoading ? <Text style={s.helperNote}>Đang tải dữ liệu…</Text> : null}
    </>;
  }
  if (kind === 'journal') {
    const journalPlants = new Set(journals.map((item) => item.plantId)).size;
    const latestEntryDate = journals[0] ? formatDateVi(journals[0].entryDate) : '—';
    const matchingJournalPlants = ownedPlants.filter((plant) => matchesPlantFilters(toOwnedFilterPlant(plant, journals, todayTasks, schedules, favorites.includes(plant.catalogId)), pageFilters));
    const filteredJournals = filterJournalEntries(journals, {
      query: journalQuery,
      logType: journalLogFilter,
      healthStatus: journalHealthFilter,
    });
    return <>
      <View style={s.managementActions}>
        <Action label="＋ Thêm ghi nhận" onPress={() => router.push('/journal/new' as never)} />
        <Action label="Lọc cây" muted onPress={() => openFilter('journal')} />
      </View>
      <View style={s.metrics}>
        {[
          [String(journals.length), 'Ghi nhận'],
          [String(journalPlants), 'Cây có nhật ký'],
          [String(gardens.length), 'Khu vườn'],
          [latestEntryDate, 'Cập nhật gần nhất'],
        ].map(([value, label]) => (
          <View key={label} style={s.metric}>
            <Text style={s.metricValue}>{value}</Text>
            <Text style={s.body}>{label}</Text>
          </View>
        ))}
      </View>
      <Section title="Cây của bạn" hint={`${matchingJournalPlants.length} cây phù hợp`}>
        {matchingJournalPlants.length === 0 ? (
          <EmptyCard icon="♧" title="Chưa có cây nào" description="Thêm cây vào vườn để bắt đầu ghi nhật ký phát triển." action="Thêm cây" onPress={() => router.push('/garden/add-plant' as never)} />
        ) : (
          matchingJournalPlants.map((plant) => {
            const count = journals.filter((item) => item.plantId === plant.id).length;
            return (
              <Pressable key={plant.id} onPress={() => router.push({ pathname: '/journal/detail', params: { plantId: plant.id } } as never)} style={s.rowCard}>
                <PlantArtwork style={s.plantImage} category={plant.category} accessToken={accessToken} photoUri={plant.photoUpdatedAt ? `${apiBaseUrl}/api/v1/plants/${plant.id}/photo?v=${encodeURIComponent(plant.photoUpdatedAt)}` : null} />
                <View style={s.cardCopy}>
                  <Text style={s.cardTitle}>{plant.name}</Text>
                  <Text style={s.body}>{count > 0 ? `${count} ghi nhận` : (plant.location || 'Chưa có ghi nhận')}</Text>
                </View>
                <Action label="Xem" muted onPress={() => router.push({ pathname: '/journal/detail', params: { plantId: plant.id } } as never)} />
              </Pressable>
            );
          })
        )}
      </Section>
      <Section title="Nhật ký gần đây" hint={`${filteredJournals.length}/${journals.length} bài`}>
        {journals.length > 0 ? (
          <JournalFilterBar
            query={journalQuery}
            onQueryChange={setJournalQuery}
            logType={journalLogFilter}
            onLogTypeChange={setJournalLogFilter}
            healthStatus={journalHealthFilter}
            onHealthStatusChange={setJournalHealthFilter}
          />
        ) : null}
        {journals.length === 0 ? (
          <EmptyCard icon="▤" title="Chưa có nhật ký cây trồng" description="Hãy tạo ghi nhận đầu tiên để theo dõi sự phát triển của cây." action="Thêm ghi nhận" onPress={() => router.push('/journal/new' as never)} />
        ) : filteredJournals.length === 0 ? (
          <EmptyCard icon="⌕" title="Không có nhật ký phù hợp" description="Thử đổi từ khóa hoặc xóa bộ lọc loại ghi nhận / tình trạng." />
        ) : (
          filteredJournals.slice(0, 20).map((entry) => {
            const typeMeta = JOURNAL_LOG_TYPE_META[entry.logType] ?? JOURNAL_LOG_TYPE_META.other;
            const healthMeta = JOURNAL_HEALTH_META[entry.healthStatus] ?? JOURNAL_HEALTH_META.healthy;
            return (
              <Pressable key={entry.id} onPress={() => router.push({ pathname: '/journal/detail', params: { plantId: entry.plantId } } as never)} style={s.card}>
                <View style={s.rowTop}>
                  <Tag tone="mint">{typeMeta.emoji} {typeMeta.label}</Tag>
                  <Tag tone={entry.healthStatus === 'healthy' ? 'mint' : 'peach'}>{healthMeta.label}</Tag>
                  <Text style={s.hint}>{formatDateVi(entry.entryDate)}</Text>
                </View>
                <Text style={s.cardTitle}>{entry.plantName}{entry.title ? ` · ${entry.title}` : ''}</Text>
                <Text numberOfLines={2} style={s.body}>{entry.note}</Text>
                {entry.photoIds.length > 0 ? <Text style={s.hint}>📷 {entry.photoIds.length} ảnh đính kèm</Text> : null}
              </Pressable>
            );
          })
        )}
      </Section>
      <View style={s.recommend}><Text style={s.cardTitle}>Mẹo ghi nhật ký</Text><Text style={s.body}>Ghi lại việc chăm sóc thường xuyên để dễ theo dõi thay đổi theo thời gian.</Text></View>
    </>;
  }
  return (
    <MonitoringDashboard
      filteredGardens={filteredGardens}
      pageFilters={pageFilters}
      onOpenFilter={() => openFilter('monitoring')}
    />
  );
}

const INTRO_BANNER_CONFIG: Record<PageKind, { icon: string; title: string; body: string }> = {
  gardens: {
    icon: '🏡',
    title: 'Không gian xanh của riêng bạn',
    body: 'Giúp bạn phân chia khu vườn theo từng vị trí, sắp xếp cây trồng khoa học, theo dõi thời tiết từng khu vực và đồng hành cùng bạn chăm sóc vườn luôn xanh tốt.',
  },
  plants: {
    icon: '🪴',
    title: 'Hồ sơ từng chậu cây trong vườn',
    body: 'Lưu trữ thông tin giống cây, vị trí trồng, ngày bắt đầu chăm sóc và danh sách cây yêu thích để bạn dễ dàng theo dõi từng mầm xanh mỗi ngày.',
  },
  journal: {
    icon: '📝',
    title: 'Lưu giữ hành trình lớn lên của cây',
    body: 'Ghi chép lại những lần tưới nước, bón phân, cắt tỉa kèm hình ảnh thực tế để bạn nhìn lại sự thay đổi và rút kinh nghiệm chăm cây hiệu quả hơn.',
  },
  monitoring: {
    icon: '🩺',
    title: 'Theo dõi sức khỏe toàn khu vườn',
    body: 'Tổng hợp tình trạng sinh trưởng, phát hiện sớm cây cần chú ý và đánh giá mức độ ổn định của từng khu vườn để kịp thời xử lý.',
  },
};

function PageContent({ kind }: { kind: PageKind }) {
  const { ownedPlants, gardens } = usePlantData();
  const { journals = [] } = useJournals();
  const config: Record<PageKind, { title: string; subtitle: string; intro: string }> = {
    gardens: { title: 'Trang Chủ', subtitle: 'Vườn của tôi', intro: gardens.length ? `Đang quản lý ${gardens.length} khu vườn` : 'Bắt đầu tạo khu vườn đầu tiên của bạn' },
    plants: { title: 'Cây Trồng', subtitle: 'Quản lý cây trồng', intro: `Tổng số ${ownedPlants.length} cây • ${gardens.length} khu vườn` },
    journal: { title: 'Nhật ký', subtitle: 'Nhật ký phát triển', intro: journals.length ? `${journals.length} ghi nhận phát triển` : 'Chưa có ghi nhận nào' },
    monitoring: { title: 'Theo dõi & Ghi nhận', subtitle: 'Tổng quan sức khỏe vườn', intro: ownedPlants.length || gardens.length ? `Theo dõi ${ownedPlants.length} cây • ${gardens.length} khu vườn` : 'Chưa có cây hoặc khu vườn để theo dõi' },
  };
  const { subtitle, intro } = config[kind];
  const banner = INTRO_BANNER_CONFIG[kind];
  return <TabScreenTransition>
    <ScrollView style={s.contentScroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.introRow}><View style={s.cardCopy}><Text style={s.pageTitle}>{subtitle}</Text><Text style={s.body}>{intro}</Text></View></View>
      <View style={s.introBanner}>
        <View style={s.introBannerIcon}>
          <Text style={s.introBannerEmoji}>{banner.icon}</Text>
        </View>
        <View style={s.cardCopy}>
          <Text style={s.introBannerTitle}>{banner.title}</Text>
          <Text style={s.introBannerBody}>{banner.body}</Text>
        </View>
      </View>
      <EmptyPage kind={kind} />
    </ScrollView>
  </TabScreenTransition>;
}

export function GardensScreen() { return <PageContent kind="gardens" />; }
export function PlantsScreen() { return <PageContent kind="plants" />; }
export function JournalScreen() { return <PageContent kind="journal" />; }
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
  plantCard: { padding: 9, borderRadius: 14, backgroundColor: C.surface, gap: 7 }, plantImage: { width: 54, height: 54, borderRadius: 10, backgroundColor: '#E4F0E7', alignItems: 'center', justifyContent: 'center' }, plantEmoji: { fontSize: 25 }, latin: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, fontStyle: 'italic' }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#DEE8E0' }, rowCard: { padding: 9, borderRadius: 13, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 9 }, rowPressMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 }, heart: { color: '#A84B20', fontSize: 18 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, metric: { width: '48%', minHeight: 54, padding: 9, borderRadius: 12, backgroundColor: C.surface }, metricValue: { color: C.forest, fontFamily: F.bold, fontSize: 15 }, eco: { marginVertical: 8, padding: 10, borderRadius: 12, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 12 }, ecoScore: { color: C.forest, fontFamily: F.bold, fontSize: 23 },
  plantCardActions: { flexDirection: 'row', gap: 5 }, scheduleBanner: { padding: 12, borderRadius: 13, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 9 }, bannerIcon: { color: C.forest, fontSize: 22 }, taskCard: { padding: 10, borderRadius: 13, backgroundColor: C.surface, gap: 8 },
  helperNote: { marginTop: 8, color: C.mutedText, fontFamily: F.regular, fontSize: 10, textAlign: 'center' },
  emptyCard: { padding: 16, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 9 },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#E2F1E7', alignItems: 'center', justifyContent: 'center' },
  emptyGlyph: { color: C.forest, fontSize: 30, lineHeight: 36 },
  emptyDescription: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  managementActions: { flexDirection: 'row', gap: 8 },
  introBanner: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 14, backgroundColor: '#EAF7EE', borderWidth: 1, borderColor: '#CBE8D4', flexDirection: 'row', alignItems: 'center', gap: 10 },
  introBannerIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#D5EFE0', alignItems: 'center', justifyContent: 'center' },
  introBannerEmoji: { fontSize: 20, lineHeight: 24 },
  introBannerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13, lineHeight: 18 },
  introBannerBody: { color: '#3B6752', fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
});
