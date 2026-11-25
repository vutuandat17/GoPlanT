import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { router } from 'expo-router';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { TabScreenTransition } from '@/components/tab-screen-transition';
import { GardenArtwork } from '@/features/gardens/GardenArtwork';
import { GardenPickerModal } from '@/features/gardens/GardenPickerModal';
import { resolvePlantPhotoUri, usePlantData, type OwnedPlant } from '@/features/plants/PlantDataStore';
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

function Section({ title, hint, expanded = true, onToggle, children }: { title: string; hint?: string; expanded?: boolean; onToggle?: () => void; children: ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeading}>
        <Text style={s.sectionTitle}>{title}</Text>
        <View style={s.sectionRight}>
          {hint ? <Text style={s.hint}>{hint}</Text> : null}
          {onToggle ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${expanded ? 'Thu gọn' : 'Mở rộng'} ${title}`}
              onPress={onToggle}
              style={s.toggleBtn}>
              <Text style={s.toggleBtnText}>{expanded ? 'Thu gọn ▲' : 'Mở rộng ▼'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {expanded ? children : null}
    </View>
  );
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
  const [ownedExpanded, setOwnedExpanded] = useState(true);
  const [favoritesExpanded, setFavoritesExpanded] = useState(true);
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
          const gardenPlantIds = new Set(gardenPlants.map((p) => p.id));
          const pendingTasksCount = todayTasks.filter((t) => t.status === 'pending' && gardenPlantIds.has(t.plantId)).length;
          const spaceBadgeMap: Record<string, string> = {
            balcony: '🌤️ Ban công',
            rooftop: '🏙️ Sân thượng',
            garden: '🏡 Sân vườn',
            indoor: '🪴 Trong nhà',
            greenhouse: '🌱 Nhà kính',
            other: '🌿 Khác',
          };
          const spaceBadge = spaceBadgeMap[garden.locationType] ?? '🌿 Khu vườn';
          return (
            <View key={garden.id} style={s.gardenItemCard}>
              <GardenArtwork locationType={garden.locationType} photoUri={getGardenPhotoUri(garden.id, garden.photoUpdatedAt)} accessToken={accessToken} style={s.gardenArt} glyphStyle={s.artGlyph} labelStyle={s.artLabel} />
              <View style={s.gardenCardBody}>
                <View style={s.gardenTitleRow}>
                  <Text style={s.gardenCardTitle} numberOfLines={1}>{garden.name}</Text>
                  <Text style={s.gardenTypePill}>{spaceBadge}</Text>
                </View>
                <Text style={s.gardenLocationText} numberOfLines={1}>
                  📍 {garden.locationDetail || 'Chưa có vị trí cụ thể'}{garden.provinceName ? ` · ${garden.provinceName}` : ''}
                </Text>
                {garden.description ? (
                  <Text style={s.gardenDescText} numberOfLines={1}>{garden.description}</Text>
                ) : null}
                <View style={s.gardenChipsRow}>
                  <Text style={s.gardenPlantChip}>🪴 {gardenPlants.length} cây đang trồng</Text>
                  {pendingTasksCount > 0 ? (
                    <Text style={s.gardenTaskChip}>💧 {pendingTasksCount} việc hôm nay</Text>
                  ) : garden.locationSource ? (
                    <Text style={s.gardenWeatherChip}>🌤️ Theo dõi thời tiết</Text>
                  ) : null}
                </View>
                <Action label="Quản lý vườn →" onPress={() => router.push({ pathname: '/garden-detail', params: { gardenId: garden.id } } as never)} />
              </View>
            </View>
          );
        })}
      </Section>
      <Section title="Cây chưa phân vườn" hint={`${unassignedPlants.length} cây`}>
        {unassignedPlants.length === 0 ? <EmptyCard icon="♧" title="Không có cây chờ sắp xếp" description="Cây chưa gắn vườn sẽ xuất hiện tại đây." /> : unassignedPlants.map((plant) => (
          <View key={plant.id} style={s.rowCard}>
            <Pressable
              style={s.rowPressMain}
              onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name, ownedId: plant.id } } as never)}>
              <PlantArtwork style={s.plantImage} category={plant.category} photoUri={resolvePlantPhotoUri(plant, catalog)} accessToken={accessToken} />
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
      && matchesPlantFilters(toOwnedFilterPlant(plant, journals, todayTasks, schedules, favorites.includes(plant.catalogId), gardens), pageFilters)
    ));
    const favoritePlants = catalog.filter((plant) => favorites.includes(plant.id));
    return <>
      <View style={s.search}><Text style={s.searchGlyph}>⌕</Text><TextInput value={plantQuery} onChangeText={setPlantQuery} placeholder="Tìm theo tên cây, loài hoặc vị trí..." placeholderTextColor={C.mutedText} style={s.searchInput} /></View>
      <View style={s.managementActions}><Action label="＋  Thêm cây" onPress={() => router.push('/garden/add-plant' as never)} /><Action label="Lọc cây" muted onPress={() => openFilter('plants')} /></View>
      <Section title="Khám phá và tìm cây">
        <View style={s.discoverCard}>
          <View style={s.discoverTop}>
            <View style={s.discoverIcon}>
              <Text style={s.discoverIconEmoji}>🌿</Text>
            </View>
            <View style={s.cardCopy}>
              <Text style={s.discoverTitle}>Bạn chưa chọn được loại cây trồng phù hợp?</Text>
              <Text style={s.discoverBody}>
                Tiếp tục khám phá nhé! Khám phá kho giống cây phong phú của GoPlant kèm hướng dẫn ánh sáng, lượng nước và mẹo chăm sóc để tìm ra chậu cây hợp nhất với không gian sống của bạn.
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Khám phá ngay"
            onPress={() => router.push({ pathname: '/search', params: { query: '' } } as never)}
            style={s.discoverCta}>
            <Text style={s.discoverCtaText}>Khám phá ngay →</Text>
          </Pressable>
        </View>
      </Section>
      <Section title="Cây đang sở hữu" hint={`${visiblePlants.length} cây`} expanded={ownedExpanded} onToggle={() => setOwnedExpanded((v) => !v)}>
        {visiblePlants.length === 0 ? <EmptyCard icon="♧" title={plantQuery ? 'Không tìm thấy cây phù hợp' : 'Vườn của bạn chưa có cây'} description={plantQuery ? 'Thử tên cây, tên khoa học hoặc vị trí khác.' : 'Thêm cây đầu tiên để bắt đầu quản lý hồ sơ cây trồng.'} action={plantQuery ? undefined : '＋  Thêm cây đầu tiên'} onPress={plantQuery ? undefined : () => router.push('/garden/add-plant' as never)} /> : visiblePlants.map((plant) => {
          const healthLabel = getLatestHealthLabel(plant.id, journals);
          const gardenName = gardens.find((g) => g.id === plant.gardenId)?.name ?? 'Chưa phân vườn';
          const pendingPlantTasks = todayTasks.filter((t) => t.plantId === plant.id && t.status === 'pending').length;
          const isAlertHealth = /cần|chú ý|nguy|yếu|sâu/i.test(healthLabel);
          const isGoodHealth = /khỏe|tốt/i.test(healthLabel);
          return (
            <View key={plant.id} style={s.ownedPlantCard}>
              <View style={s.rowTop}>
                <PlantArtwork
                  style={s.ownedPlantImage}
                  category={plant.category}
                  photoUri={resolvePlantPhotoUri(plant, catalog)}
                  accessToken={accessToken}
                />
                <View style={s.cardCopy}>
                  <View style={s.ownedTitleRow}>
                    <Text style={s.ownedPlantTitle} numberOfLines={1}>{plant.name}</Text>
                    <Text style={s.ownedCategoryPill}>{plant.category}</Text>
                  </View>
                  <Text style={s.latin} numberOfLines={1}>{plant.scientificName}</Text>
                  <Text style={s.ownedLocationText} numberOfLines={1}>
                    🏡 {gardenName}{plant.location ? ` · 📍 ${plant.location}` : ''}
                  </Text>
                </View>
              </View>
              <View style={s.ownedChipsRow}>
                <Text style={[s.ownedHealthChip, isAlertHealth ? s.ownedHealthAlert : isGoodHealth ? s.ownedHealthGood : null]}>
                  {isAlertHealth ? '⚠️' : isGoodHealth ? '💚' : '🩺'} {healthLabel}
                </Text>
                <Text style={s.ownedDateChip}>📅 {plant.plantedAt || 'Chưa rõ ngày'}</Text>
                {pendingPlantTasks > 0 ? (
                  <Text style={s.gardenTaskChip}>💧 {pendingPlantTasks} việc hôm nay</Text>
                ) : null}
              </View>
              <View style={s.ownedActionsRow}>
                <Action label="Chi tiết" muted onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name, ownedId: plant.id } } as never)} />
                <Action label="Chỉnh sửa" muted onPress={() => router.push({ pathname: '/garden/add-plant', params: { editId: plant.id } } as never)} />
                <Action label="Xóa" muted onPress={() => Alert.alert('Xóa cây', `Xóa hồ sơ “${plant.name}” khỏi danh sách của bạn?`, [{ text: 'Hủy', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => void removePlant(plant.id) }])} />
              </View>
            </View>
          );
        })}
      </Section>
      <Section title="Cây trồng mong muốn" hint={`${favoritePlants.length} cây đã lưu`} expanded={favoritesExpanded} onToggle={() => setFavoritesExpanded((v) => !v)}>
        {favoritePlants.length === 0 ? <EmptyCard icon="♡" title="Chưa có cây yêu thích" description="Khám phá thư viện cây để xem thông tin và đánh dấu yêu thích." action="Khám phá cây" onPress={() => router.push({ pathname: '/search', params: { query: '' } } as never)} /> : favoritePlants.map((plant) => (
          <View key={plant.id} style={s.rowCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Xem ${plant.name}`}
              onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name } } as never)}
              style={s.rowPressMain}>
              <PlantArtwork style={s.plantImage} category={plant.category} photoUri={resolvePlantPhotoUri(plant, catalog)} accessToken={accessToken} />
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
    const matchingJournalPlants = ownedPlants.filter((plant) => matchesPlantFilters(toOwnedFilterPlant(plant, journals, todayTasks, schedules, favorites.includes(plant.catalogId), gardens), pageFilters));
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
                <PlantArtwork style={s.plantImage} category={plant.category} accessToken={accessToken} photoUri={resolvePlantPhotoUri(plant, catalog)} />
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
              <Pressable key={entry.id} onPress={() => router.push({ pathname: '/journal/detail', params: { plantId: entry.plantId, date: entry.entryDate } } as never)} style={s.card}>
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

const INTRO_BANNER_CONFIG: Record<PageKind, { kicker: string; icon: string; watermark: string; title: string; body: string }> = {
  gardens: {
    kicker: 'KHÔNG GIAN XANH',
    icon: '🏡',
    watermark: '🌿',
    title: 'Không gian xanh của riêng bạn',
    body: 'Giúp bạn phân chia khu vườn theo từng vị trí, sắp xếp cây trồng khoa học, theo dõi thời tiết từng khu vực và đồng hành cùng bạn chăm sóc vườn luôn xanh tốt.',
  },
  plants: {
    kicker: 'BỘ SƯU TẬP',
    icon: '🪴',
    watermark: '🌱',
    title: 'Hồ sơ từng chậu cây trong vườn',
    body: 'Lưu trữ thông tin giống cây, vị trí trồng, ngày bắt đầu chăm sóc và danh sách cây yêu thích để bạn dễ dàng theo dõi từng mầm xanh mỗi ngày.',
  },
  journal: {
    kicker: 'HÀNH TRÌNH SINH TRƯỞNG',
    icon: '📝',
    watermark: '🍃',
    title: 'Lưu giữ hành trình lớn lên của cây',
    body: 'Ghi chép lại những lần tưới nước, bón phân, cắt tỉa kèm hình ảnh thực tế để bạn nhìn lại sự thay đổi và rút kinh nghiệm chăm cây hiệu quả hơn.',
  },
  monitoring: {
    kicker: 'SỨC KHỎE KHU VƯỜN',
    icon: '🩺',
    watermark: '🌾',
    title: 'Theo dõi sức khỏe toàn khu vườn',
    body: 'Tổng hợp tình trạng sinh trưởng, phát hiện sớm cây cần chú ý và đánh giá mức độ ổn định của từng khu vườn để kịp thời xử lý.',
  },
};

function PageContent({ kind }: { kind: PageKind }) {
  const { ownedPlants, gardens } = usePlantData();
  const { journals = [] } = useJournals();
  const config: Record<PageKind, { subtitle: string; summaryPill: string }> = {
    gardens: { subtitle: 'Vườn của tôi', summaryPill: gardens.length ? `${gardens.length} khu vườn` : 'Chưa có vườn' },
    plants: { subtitle: 'Quản lý cây trồng', summaryPill: `${ownedPlants.length} cây` },
    journal: { subtitle: 'Nhật ký phát triển', summaryPill: journals.length ? `${journals.length} ghi chép` : '0 ghi chép' },
    monitoring: { subtitle: 'Theo dõi & Ghi nhận', summaryPill: `${ownedPlants.length} cây • ${gardens.length} vườn` },
  };
  const { subtitle, summaryPill } = config[kind];
  const banner = INTRO_BANNER_CONFIG[kind];
  return <TabScreenTransition>
    <ScrollView style={s.contentScroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.editorialHeader}>
        <View style={s.kickerRow}>
          <View style={s.kickerDot} />
          <Text style={s.kickerText}>{banner.kicker}</Text>
        </View>
        <View style={s.titlePillRow}>
          <Text style={s.pageTitle}>{subtitle}</Text>
          <Text style={s.summaryPill}>{summaryPill}</Text>
        </View>
      </View>
      <View style={s.introBanner}>
        <Text style={s.introWatermark}>{banner.watermark}</Text>
        <View style={s.introBannerTop}>
          <View style={s.introBannerIcon}>
            <Text style={s.introBannerEmoji}>{banner.icon}</Text>
          </View>
          <View style={s.cardCopy}>
            <Text style={s.introBannerTitle}>{banner.title}</Text>
            <Text style={s.introBannerBody}>{banner.body}</Text>
          </View>
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
  introRow: { minHeight: 54, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }, pageTitle: { color: C.forest, fontFamily: F.bold, fontSize: 21, lineHeight: 28, flex: 1 },
  editorialHeader: { gap: 4, paddingTop: 2 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.primary },
  kickerText: { color: C.primary, fontFamily: F.bold, fontSize: 10, letterSpacing: 0.8 },
  titlePillRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  summaryPill: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: '#D9F2E3', color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  section: { gap: 8, marginTop: 5 }, sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, sectionRight: { flexDirection: 'row', alignItems: 'center', gap: 8 }, sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 15, lineHeight: 21, flex: 1 }, hint: { color: C.mutedText, fontFamily: F.regular, fontSize: 11 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: C.softSurface, borderWidth: 1, borderColor: '#CBE3D3' },
  toggleBtnText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
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
  introBanner: { overflow: 'hidden', position: 'relative', paddingHorizontal: 13, paddingVertical: 12, borderRadius: 16, backgroundColor: '#EAF7EE' },
  introWatermark: { position: 'absolute', right: 8, bottom: -6, fontSize: 54, opacity: 0.1 },
  introBannerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  introBannerIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#D5EFE0', alignItems: 'center', justifyContent: 'center' },
  introBannerEmoji: { fontSize: 22, lineHeight: 26 },
  introBannerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13.5, lineHeight: 19 },
  introBannerBody: { color: '#3B6752', fontFamily: F.regular, fontSize: 11.5, lineHeight: 16.5 },
  discoverCard: { padding: 14, borderRadius: 15, backgroundColor: C.surface, gap: 11, borderWidth: 1, borderColor: '#DCECE1' },
  discoverTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  discoverIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#E1F3E8', alignItems: 'center', justifyContent: 'center' },
  discoverIconEmoji: { fontSize: 22, lineHeight: 26 },
  discoverTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13.5, lineHeight: 19 },
  discoverBody: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11.5, lineHeight: 17 },
  discoverCta: { minHeight: 40, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  discoverCtaText: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 },
  gardenItemCard: { padding: 11, borderRadius: 16, backgroundColor: C.surface, gap: 10, borderWidth: 1, borderColor: '#E1ECE4' },
  gardenCardBody: { gap: 7 },
  gardenTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  gardenCardTitle: { flex: 1, color: C.forest, fontFamily: F.bold, fontSize: 16, lineHeight: 22 },
  gardenTypePill: { overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, backgroundColor: '#E3F3E8', color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  gardenLocationText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
  gardenDescText: { color: C.mutedText, fontFamily: F.regular, fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  gardenChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 2, paddingBottom: 2 },
  gardenPlantChip: { overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: C.softSurface, color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  gardenTaskChip: { overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: '#FFE8DC', color: '#914218', fontFamily: F.semiBold, fontSize: 11 },
  gardenWeatherChip: { overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: '#E3F2FD', color: '#145A8A', fontFamily: F.semiBold, fontSize: 11 },
  ownedPlantCard: { padding: 12, borderRadius: 16, backgroundColor: C.surface, gap: 9, borderWidth: 1, borderColor: '#E1ECE4' },
  ownedPlantImage: { width: 62, height: 62, borderRadius: 12, backgroundColor: '#E4F0E7', alignItems: 'center', justifyContent: 'center' },
  ownedTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  ownedPlantTitle: { flex: 1, color: C.forest, fontFamily: F.bold, fontSize: 15, lineHeight: 20 },
  ownedCategoryPill: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, backgroundColor: '#E3F3E8', color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  ownedLocationText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11.5, lineHeight: 16 },
  ownedChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ownedHealthChip: { overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: C.softSurface, color: C.secondaryText, fontFamily: F.semiBold, fontSize: 11 },
  ownedHealthGood: { backgroundColor: '#DFF3E6', color: C.forest },
  ownedHealthAlert: { backgroundColor: '#FFE8DC', color: '#914218' },
  ownedDateChip: { overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: '#EFF4F0', color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  ownedActionsRow: { flexDirection: 'row', gap: 7 },
});
