import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { router } from 'expo-router';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/AuthSession';
import { TabScreenTransition } from '@/components/tab-screen-transition';
import { usePlantData } from '@/features/plants/PlantDataStore';
import { PlantArtwork } from '@/features/plants/PlantArtwork';
import { apiBaseUrl } from '@/services/api';
import { matchesPlantFilters } from '@/features/plants/plantFilters';
import { CARE_TASK_META, useCareSchedules } from '@/features/schedule/CareScheduleStore';

const categories = ['Tất cả', 'Cây ăn quả', 'Cây rau lá', 'Hoa cảnh', 'Cây mọng nước', 'Cây gia vị'];

function SectionTitle({ title, trailing }: { title: string; trailing?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {trailing ? <Text style={styles.sectionTrailing}>{trailing}</Text> : null}
    </View>
  );
}

export default function HomeScreen() {
  const { user, accessToken } = useAuthSession();
  const { catalog, gardens, ownedPlants, isLoading, apiError, filterStates } = usePlantData();
  const { todayTasks, todaySummary, completeTask } = useCareSchedules();
  const [category, setCategory] = useState(categories[0]);
  const [query, setQuery] = useState('');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  const pendingTodayTasks = todayTasks.filter((t) => t.status === 'pending');
  const nextTask = pendingTodayTasks[0];
  const nextTaskMeta = nextTask ? (CARE_TASK_META[nextTask.taskType] ?? CARE_TASK_META.other) : null;

  const navigate = (route: string) => router.push(route as never);
  const discoveries = catalog.filter((plant) => {
    const nameAndCategory = `${plant.name} ${plant.category}`.toLocaleLowerCase();
    const categoryMatch = category === 'Tất cả'
      || category === 'Cây ăn quả' && /ăn quả|trái cây/.test(nameAndCategory)
      || category === 'Cây rau lá' && /rau ăn lá|rau gia vị/.test(nameAndCategory)
      || category === 'Hoa cảnh' && /hoa/.test(nameAndCategory)
      || category === 'Cây mọng nước' && /nha đam|lưỡi hổ|mọng nước/.test(nameAndCategory)
      || category === 'Cây gia vị' && /gia vị/.test(nameAndCategory);
    return categoryMatch && matchesPlantFilters(plant, filterStates.home ?? {});
  });

  return (
    <TabScreenTransition>
      <ScrollView style={styles.contentScroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.greetingRow}>
          <View style={styles.greetingCopy}>
            <Text style={styles.greeting}>Chào buổi sáng, {user?.name ?? 'bạn'} 🌱</Text>
            <Text style={styles.subtitle}>Hôm nay là thời điểm lý tưởng để chăm vườn nhỏ!</Text>
          </View>
          <View style={styles.sunBadge}><Text style={styles.sun}>☼</Text></View>
        </View>

        <View style={styles.weatherCard}>
          <View style={[styles.roundIcon, { backgroundColor: '#E1F3E8' }]}><Text>☼</Text></View>
          <View style={styles.flexCopy}>
            <Text style={styles.cardTitle}>Thông tin thời tiết</Text>
            <Text style={styles.bodyText}>Chưa có dữ liệu thời tiết cho khu vườn.</Text>
          </View>
          <Text style={styles.lightPill}>Chưa có dữ liệu</Text>
        </View>

        {nextTask && nextTaskMeta ? (
          <Pressable
            onPress={() => navigate('/schedule')}
            style={todaySummary.overdue > 0 ? styles.reminderCard : styles.scheduleCard}>
            <View style={styles.scheduleIcon}>
              <Text style={styles.white}>{nextTaskMeta.emoji}</Text>
            </View>
            <View style={styles.flexCopy}>
              <Text style={todaySummary.overdue > 0 ? styles.reminderText : styles.scheduleTitle} numberOfLines={1}>
                {todaySummary.overdue > 0
                  ? `${todaySummary.overdue} việc quá hạn · ${nextTaskMeta.label}`
                  : `Hôm nay (${pendingTodayTasks.length} việc): ${nextTaskMeta.label}`}
              </Text>
              <Text style={styles.scheduleDescription} numberOfLines={1}>
                🌱 {nextTask.plantName} · Nhấn để xem toàn bộ lịch chăm sóc
              </Text>
            </View>
            <Pressable
              disabled={completingTaskId === nextTask.id}
              onPress={async (e) => {
                e.stopPropagation?.();
                setCompletingTaskId(nextTask.id);
                try {
                  await completeTask(nextTask.id);
                } finally {
                  setCompletingTaskId(null);
                }
              }}
              style={todaySummary.overdue > 0 ? styles.reminderButton : styles.scheduleButton}>
              <Text style={styles.white}>{completingTaskId === nextTask.id ? '...' : '✓ Xong'}</Text>
            </Pressable>
          </Pressable>
        ) : todaySummary.total > 0 ? (
          <Pressable onPress={() => navigate('/schedule')} style={styles.scheduleCard}>
            <View style={styles.scheduleIcon}><Text style={styles.white}>✓</Text></View>
            <View style={styles.flexCopy}>
              <Text style={styles.scheduleTitle}>Đã hoàn thành hết việc hôm nay!</Text>
              <Text style={styles.scheduleDescription}>Tuyệt vời! Tất cả {todaySummary.total} lượt chăm sóc hôm nay đã xong.</Text>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => router.push({ pathname: '/search', params: { query } } as never)} placeholder="Tìm kiếm giống cây, sâu bệnh, kỹ thuật..." placeholderTextColor="#7B8580" style={styles.searchInput} returnKeyType="search" />
          <Pressable accessibilityRole="button" accessibilityLabel="Bộ lọc" onPress={() => router.push({ pathname: '/filter', params: { context: 'home' } } as never)} style={styles.searchAction}><Text>☷</Text></Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {categories.map((item) => (
            <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipSelected]}>
              <Text style={[styles.chipText, category === item && styles.chipTextSelected]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.shortcuts}>
          {[
            ['◷', 'Lập lịch', '#D9F2E3', '/schedule'],
            ['♧', 'Quản lý cây', '#E8EFEB', '/plants'],
            ['▦', 'Quản lý vườn', C.brightMint, '/gardens'],
            ['▤', 'Nhật ký chăm', C.peach, '/journal'],
          ].map(([icon, label, color, route]) => (
            <Pressable key={label} onPress={() => navigate(route)} style={styles.shortcut}>
              <View style={[styles.shortcutIcon, { backgroundColor: color }]}><Text style={styles.shortcutGlyph}>{icon}</Text></View>
              <Text style={styles.shortcutLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Banner chuyển hướng Lập lịch chăm sóc */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mở màn hình Lập lịch chăm sóc"
          onPress={() => navigate('/schedule')}
          style={styles.scheduleBanner}>
          <View style={styles.scheduleBannerLeft}>
            <View style={styles.scheduleBannerIcon}>
              <Text style={styles.scheduleBannerIconGlyph}>◷</Text>
            </View>
            <View style={styles.scheduleBannerCopy}>
              <Text style={styles.scheduleBannerTitle}>Lập lịch chăm sóc</Text>
              <Text style={styles.scheduleBannerSub}>Thiết lập chu kỳ tưới, bón phân và chăm cây định kỳ.</Text>
            </View>
          </View>
          <View style={styles.scheduleBannerCta}>
            <Text style={styles.scheduleBannerCtaText}>Mở ›</Text>
          </View>
        </Pressable>

        <SectionTitle title="Vườn của bạn" trailing={`${gardens.length} khu vực`} />
        {gardens.map((garden) => <Pressable key={garden.id} onPress={() => router.push({ pathname: '/garden-detail', params: { gardenId: garden.id } } as never)} style={styles.suggestionCard}><Text style={styles.plantEmoji}>⌂</Text><View style={styles.flexCopy}><Text style={styles.cardTitle}>{garden.name}</Text><Text style={styles.bodyText}>{garden.locationDetail || garden.locationType}</Text></View></Pressable>)}
        {gardens.length === 0 ? <View style={styles.emptyHomeCard}>
          <Text style={styles.emptyHomeArt}>⌂</Text>
          <Text style={styles.emptyHomeTitle}>Bắt đầu tạo khu vườn đầu tiên</Text>
          <Text style={styles.bodyText}>Tạo không gian riêng để sắp xếp và chăm sóc cây.</Text>
          <Pressable onPress={() => navigate('/garden/create')} style={styles.emptyHomeButton}><Text style={styles.white}>＋  Tạo khu vườn mới</Text></Pressable>
        </View> : null}
        <SectionTitle title="Cây trồng & chăm sóc" trailing={`${ownedPlants.length} cây`} />
        {ownedPlants.map((plant) => <Pressable key={plant.id} onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name, ownedId: plant.id } } as never)} style={styles.suggestionCard}><PlantArtwork category={plant.category} accessToken={accessToken} photoUri={plant.photoUpdatedAt ? `${apiBaseUrl}/api/v1/plants/${plant.id}/photo?v=${encodeURIComponent(plant.photoUpdatedAt)}` : null} style={styles.suggestionPlantArtwork}/><View style={styles.flexCopy}><Text style={styles.cardTitle}>{plant.name}</Text><Text style={styles.bodyText}>{plant.location || plant.category}</Text></View></Pressable>)}
        {ownedPlants.length === 0 ? <View style={styles.emptyHomeCard}>
          <Text style={styles.emptyHomeArt}>♧</Text>
          <Text style={styles.emptyHomeTitle}>Chưa có cây nào trong vườn</Text>
          <Text style={styles.bodyText}>Thêm cây để bắt đầu theo dõi quá trình chăm sóc.</Text>
          <Pressable onPress={() => navigate('/garden/add-plant')} style={styles.emptyHomeButton}><Text style={styles.white}>＋  Thêm cây đầu tiên</Text></Pressable>
        </View> : null}
        {apiError ? <Text style={styles.bodyText}>{apiError}</Text> : null}
        {isLoading ? <Text style={styles.bodyText}>Đang tải dữ liệu…</Text> : null}
        <View style={styles.exploreTitleRow}><Text style={styles.sectionTitle}>Khám phá cây</Text><Pressable accessibilityRole="button" accessibilityLabel="Xem tất cả các loại cây" onPress={() => router.push({ pathname: '/search', params: { query: '' } } as never)} style={styles.exploreAll}><Text style={styles.sectionTrailing}>{catalog.length} cây</Text><Text style={styles.exploreArrow}>›</Text></Pressable></View>
        {discoveries.slice(0, 4).map((plant) => <Pressable key={plant.id} onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name } } as never)} style={styles.suggestionCard}><PlantArtwork category={plant.category} style={styles.suggestionPlantArtwork}/><View style={styles.flexCopy}><Text style={styles.cardTitle}>{plant.name}</Text><Text style={styles.bodyText}>{plant.scientificName} • {plant.category}</Text></View></Pressable>)}
      </ScrollView>
    </TabScreenTransition>
  );
}

const styles = StyleSheet.create({
  contentScroll: { width: '100%', flex: 1, alignSelf: 'center' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 20, gap: 8 },
  greetingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greetingCopy: { flex: 1, gap: 2 },
  greeting: { color: C.forest, fontFamily: F.semiBold, fontSize: 16, lineHeight: 22 },
  subtitle: { color: C.secondaryText, fontFamily: F.regular, fontSize: 13, lineHeight: 19 },
  sunBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D9F1E3', alignItems: 'center', justifyContent: 'center' },
  sun: { color: C.forest, fontSize: 26, lineHeight: 30 },
  weatherCard: { minHeight: 72, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  flexCopy: { flex: 1, gap: 2 },
  cardTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 14, lineHeight: 19 },
  secondary: { color: C.secondaryText, fontFamily: F.regular },
  bodyText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  lightPill: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: C.surface, color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  reminderCard: { minHeight: 76, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: '#F9E6D4', flexDirection: 'row', alignItems: 'center', gap: 8 },
  reminderText: { color: '#8B3D13', fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
  reminderButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 99, backgroundColor: '#A94F1B' },
  white: { color: C.surface, fontFamily: F.semiBold, fontSize: 12 },
  scheduleCard: { minHeight: 72, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#BCE6CD', backgroundColor: '#D9F2E3', flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  scheduleTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13, lineHeight: 18 },
  scheduleDescription: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10, lineHeight: 14 },
  scheduleButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 99, backgroundColor: C.primary },
  searchBox: { minHeight: 46, marginTop: 2, paddingHorizontal: 10, borderRadius: 12, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 4 },
  searchIcon: { color: '#65706A', fontSize: 26, width: 24, textAlign: 'center' },
  searchInput: { flex: 1, paddingVertical: 8, color: C.text, fontFamily: F.regular, fontSize: 12 },
  searchAction: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: 7, paddingVertical: 2 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 99, backgroundColor: '#E7EEE8' },
  chipSelected: { backgroundColor: C.forest },
  chipText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  chipTextSelected: { color: C.surface, fontFamily: F.semiBold },
  shortcuts: { flexDirection: 'row', gap: 8, marginTop: 2 },
  shortcut: { flex: 1, minHeight: 76, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 5 },
  shortcutIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  shortcutGlyph: { color: C.forest, fontSize: 18 },
  shortcutLabel: { color: C.text, fontFamily: F.regular, fontSize: 10, textAlign: 'center' },
  sectionTitleRow: { marginTop: 8, marginBottom: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exploreTitleRow: { marginTop: 8, marginBottom: 1, minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exploreAll: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 7 },
  exploreArrow: { color: C.primary, fontFamily: F.bold, fontSize: 24, lineHeight: 28 },
  sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  sectionTrailing: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  horizontalCards: { gap: 10, paddingRight: 4 },
  gardenCard: { width: 208, padding: 8, borderRadius: 14, backgroundColor: C.surface },
  emptyHomeCard: { padding: 16, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 8 },
  emptyHomeArt: { width: 54, height: 54, borderRadius: 27, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', backgroundColor: '#E3F2E8', color: C.forest, fontSize: 30 },
  emptyHomeTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, textAlign: 'center' },
  emptyHomeButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  suggestionCard: { padding: 12, borderRadius: 13, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  suggestionPlantArtwork: { width: 48, height: 48, borderRadius: 10 },
  newUserTip: { padding: 12, borderRadius: 13, backgroundColor: '#E3F2E8', gap: 4 },
  gardenName: { marginTop: 7, color: C.forest, fontFamily: F.semiBold, fontSize: 12, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 7, backgroundColor: '#D8E2DA' },
  gardenStatus: { color: C.primary, fontFamily: F.semiBold, fontSize: 11, lineHeight: 16 },
  addGarden: { width: 104, minHeight: 158, borderRadius: 14, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center', gap: 4 },
  addPlus: { color: C.forest, fontSize: 28 },
  caption: { color: C.mutedText, fontFamily: F.regular, fontSize: 10, lineHeight: 14 },
  list: { gap: 8 },
  careCard: { minHeight: 68, padding: 9, borderRadius: 14, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 9 },
  plantThumb: { width: 42, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  plantEmoji: { fontSize: 23 },
  careAction: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, backgroundColor: '#E8F0E9' },
  careActionDark: { backgroundColor: C.primary },
  careActionText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 11 },
  emptyMessage: { padding: 14, color: C.mutedText, fontFamily: F.regular, textAlign: 'center' },
  wishCard: { padding: 9, borderRadius: 14, backgroundColor: C.surface, gap: 8 },
  wishTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  wishThumb: { width: 52, height: 52 },
  heart: { color: '#A94F1B', fontSize: 18 },
  wishButton: { minHeight: 34, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  wishButtonText: { color: C.surface, fontFamily: F.semiBold, fontSize: 11 },
  morePlants: { minHeight: 42, borderRadius: 12, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  morePlantsText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  // Schedule banner
  scheduleBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, backgroundColor: '#D9F2E3', borderWidth: 1, borderColor: '#BCE6CD' },
  scheduleBannerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  scheduleBannerIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  scheduleBannerIconGlyph: { color: '#FFFFFF', fontSize: 22, lineHeight: 26 },
  scheduleBannerCopy: { flex: 1, gap: 2 },
  scheduleBannerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  scheduleBannerSub: { color: '#3B6752', fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  scheduleBannerCta: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.primary, marginLeft: 8 },
  scheduleBannerCtaText: { color: '#FFFFFF', fontFamily: F.semiBold, fontSize: 12 },
});
