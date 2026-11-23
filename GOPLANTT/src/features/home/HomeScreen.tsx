import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { router } from 'expo-router';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/AuthSession';
import { TabScreenTransition } from '@/components/tab-screen-transition';
import { usePlantData } from '@/features/plants/PlantDataStore';
import { PlantArtwork } from '@/features/plants/PlantArtwork';
import { apiBaseUrl, fetchGardenWeather, type ApiGardenWeather } from '@/services/api';
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

function getWeatherEmoji(conditionMain?: string | null): string {
  const main = conditionMain?.toLocaleLowerCase() ?? '';
  if (main.includes('thunder')) return '⛈️';
  if (main.includes('rain') || main.includes('drizzle')) return '🌧️';
  if (main.includes('snow')) return '❄️';
  if (main.includes('mist') || main.includes('fog') || main.includes('haze') || main.includes('smoke')) return '🌫️';
  if (main.includes('cloud')) return '⛅';
  if (main.includes('clear')) return '☀️';
  return '🌤️';
}

function getTimeBasedGreeting(now: Date): {
  prefix: string;
  emoji: string;
  subtitle: string;
  badgeGlyph: string;
} {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) {
    return {
      prefix: 'Chào buổi sáng',
      emoji: '🌱',
      subtitle: 'Hôm nay là thời điểm lý tưởng để chăm vườn nhỏ!',
      badgeGlyph: '☀️',
    };
  }
  if (hour >= 11 && hour < 14) {
    return {
      prefix: 'Chào buổi trưa',
      emoji: '☀️',
      subtitle: 'Kiểm tra độ ẩm đất và che nắng nhẹ cho cây nhé!',
      badgeGlyph: '🌞',
    };
  }
  if (hour >= 14 && hour < 18) {
    return {
      prefix: 'Chào buổi chiều',
      emoji: '🌤️',
      subtitle: 'Buổi chiều mát mẻ rất hợp để tưới nước cho vườn!',
      badgeGlyph: '🌤️',
    };
  }
  return {
    prefix: 'Chào buổi tối',
    emoji: '🌙',
    subtitle: 'Cùng nhìn lại tình trạng khu vườn sau một ngày nhé!',
    badgeGlyph: '🌙',
  };
}

export default function HomeScreen() {
  const { user, accessToken } = useAuthSession();
  const { catalog, gardens, ownedPlants, favorites, isLoading, apiError, filterStates } = usePlantData();
  const { schedules, todayTasks, todaySummary, completeTask } = useCareSchedules();
  const [category, setCategory] = useState(categories[0]);
  const [query, setQuery] = useState('');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const locatedGardens = gardens.filter((g) => Boolean(g.locationSource) || (g.latitude != null && g.longitude != null));
  const [selectedWeatherGardenId, setSelectedWeatherGardenId] = useState<string | null>(null);
  const weatherGarden = locatedGardens.find((g) => g.id === selectedWeatherGardenId) ?? locatedGardens[0] ?? null;
  const [weather, setWeather] = useState<ApiGardenWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    if (!accessToken || !weatherGarden) {
      setWeather(null);
      return;
    }
    let active = true;
    setWeatherLoading(true);
    void fetchGardenWeather(weatherGarden.id, accessToken)
      .then((data) => {
        if (active) setWeather(data);
      })
      .catch(() => {
        if (active) setWeather(null);
      })
      .finally(() => {
        if (active) setWeatherLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, weatherGarden?.id]);

  const cycleWeatherGarden = () => {
    if (locatedGardens.length <= 1 || !weatherGarden) return;
    const idx = locatedGardens.findIndex((g) => g.id === weatherGarden.id);
    const next = locatedGardens[(idx + 1) % locatedGardens.length];
    setSelectedWeatherGardenId(next.id);
  };

  const pendingTodayTasks = todayTasks.filter((t) => t.status === 'pending');
  const nextTask = pendingTodayTasks[0];
  const nextTaskMeta = nextTask ? (CARE_TASK_META[nextTask.taskType] ?? CARE_TASK_META.other) : null;

  const navigate = (route: string) => router.push(route as never);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const greetingMeta = getTimeBasedGreeting(now);
  const ownedCatalogIds = useMemo(() => new Set(ownedPlants.map((plant) => plant.catalogId)), [ownedPlants]);
  const discoveries = catalog.filter((plant) => {
    if (ownedCatalogIds.has(plant.id)) return false;
    const nameAndCategory = `${plant.name} ${plant.category}`.toLocaleLowerCase();
    const categoryMatch = category === 'Tất cả'
      || category === 'Cây ăn quả' && /ăn quả|trái cây/.test(nameAndCategory)
      || category === 'Cây rau lá' && /rau ăn lá|rau gia vị/.test(nameAndCategory)
      || category === 'Hoa cảnh' && /hoa/.test(nameAndCategory)
      || category === 'Cây mọng nước' && /nha đam|lưỡi hổ|mọng nước/.test(nameAndCategory)
      || category === 'Cây gia vị' && /gia vị/.test(nameAndCategory);
    return categoryMatch && matchesPlantFilters(plant, filterStates.home ?? {});
  });
  const featuredPlants = useMemo(() => {
    const shuffle = <T,>(items: T[]) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };
    const unfavorited = shuffle(discoveries.filter((plant) => !favorites.includes(plant.id)));
    const favorited = shuffle(discoveries.filter((plant) => favorites.includes(plant.id)));
    return [...unfavorited, ...favorited].slice(0, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, ownedCatalogIds, favorites, category, filterStates.home]);

  return (
    <TabScreenTransition>
      <ScrollView style={styles.contentScroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.greetingRow}>
          <View style={styles.greetingCopy}>
            <Text style={styles.greeting}>{greetingMeta.prefix}, {user?.name ?? 'bạn'} {greetingMeta.emoji}</Text>
            <Text style={styles.subtitle}>{greetingMeta.subtitle}</Text>
          </View>
          <View style={styles.sunBadge}><Text style={styles.sun}>{greetingMeta.badgeGlyph}</Text></View>
        </View>

        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Text style={styles.introEmoji}>🌿</Text>
          </View>
          <View style={styles.flexCopy}>
            <Text style={styles.introTitle}>GoPlant — Vườn xanh trong tay bạn</Text>
            <Text style={styles.introBody}>
              Đồng hành cùng bạn theo dõi từng chậu cây, nhắc lịch tưới nước, bón phân đúng hẹn và lưu giữ hành trình phát triển mỗi ngày.
            </Text>
          </View>
        </View>

        <View style={styles.weatherCard}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (weatherGarden) {
                router.push({ pathname: '/garden-detail', params: { gardenId: weatherGarden.id } } as never);
              } else if (gardens.length > 0) {
                router.push({ pathname: '/garden/create', params: { editGardenId: gardens[0].id } } as never);
              } else {
                navigate(accessToken ? '/garden/create' : '/auth/login');
              }
            }}
            style={styles.weatherMain}>
            <View style={[styles.roundIcon, { backgroundColor: '#E1F3E8' }]}><Text style={styles.weatherEmoji}>{getWeatherEmoji(weather?.conditionMain)}</Text></View>
            <View style={styles.flexCopy}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {weatherGarden ? `Thời tiết · ${weatherGarden.name}` : 'Thông tin thời tiết'}
              </Text>
              <Text style={styles.bodyText} numberOfLines={2}>
                {weatherGarden
                  ? weatherLoading && !weather
                    ? 'Đang cập nhật thời tiết...'
                    : weather && weather.temperatureC != null
                      ? `${weather.conditionDescription || weather.conditionMain || 'Ngoài trời'}${weather.humidityPct != null ? ` · 💧 ${weather.humidityPct}%` : ''}${weather.plantAlerts.length > 0 ? ` · ⚠️ ${weather.plantAlerts.length} cây cần chú ý` : ''}`
                      : 'Chưa lấy được dữ liệu thời tiết.'
                  : gardens.length > 0
                    ? 'Chưa thiết lập vị trí cho khu vườn.'
                    : 'Tạo khu vườn kèm vị trí để xem thời tiết.'}
              </Text>
            </View>
          </Pressable>
          <View style={styles.weatherActions}>
            <Text style={styles.lightPill}>
              {weatherGarden && weather?.temperatureC != null
                ? `${Math.round(weather.temperatureC)}°C`
                : gardens.length > 0 && !weatherGarden
                  ? 'Thiết lập'
                  : !weatherGarden
                    ? 'Tạo vườn'
                    : weatherLoading
                      ? '...'
                      : 'Xem'}
            </Text>
            {locatedGardens.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đổi khu vườn xem thời tiết"
                onPress={cycleWeatherGarden}>
                <Text style={styles.switchGardenText}>Đổi vườn ↻</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {nextTask && nextTaskMeta ? (
          <View style={todaySummary.overdue > 0 ? styles.reminderCard : styles.scheduleCard}>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigate('/schedule')}
              style={styles.taskMain}>
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
            </Pressable>
            <Pressable
              disabled={completingTaskId === nextTask.id}
              onPress={async () => {
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
          </View>
        ) : todaySummary.total > 0 ? (
          <Pressable onPress={() => navigate('/schedule')} style={styles.scheduleCard}>
            <View style={styles.scheduleIcon}><Text style={styles.white}>✓</Text></View>
            <View style={styles.flexCopy}>
              <Text style={styles.scheduleTitle}>Đã hoàn thành hết việc hôm nay!</Text>
              <Text style={styles.scheduleDescription}>Tuyệt vời! Tất cả {todaySummary.total} lượt chăm sóc hôm nay đã xong.</Text>
            </View>
          </Pressable>
        ) : null}

        {/* Banner chuyển hướng Lập lịch chăm sóc */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mở màn hình Lập lịch chăm sóc"
          onPress={() => navigate('/schedule')}
          style={styles.scheduleBanner}>
          <View style={styles.scheduleBannerLeft}>
            <View style={styles.scheduleBannerIcon}>
              <Text style={styles.scheduleBannerIconGlyph}>📅</Text>
            </View>
            <View style={styles.scheduleBannerCopy}>
              <Text style={styles.scheduleBannerTitle}>Lập lịch chăm sóc cây trồng</Text>
              <Text style={styles.scheduleBannerSub}>Tự động hóa chu kỳ tưới nước, bón phân & tỉa cành để cây luôn xanh tốt.</Text>
            </View>
          </View>
          <View style={styles.scheduleBannerCta}>
            <Text style={styles.scheduleBannerCtaText}>Tạo lịch ngay →</Text>
          </View>
        </Pressable>

        {schedules.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quản lý lịch chăm sóc của bạn"
            onPress={() => navigate('/schedule')}
            style={styles.myScheduleBanner}>
            <View style={styles.scheduleBannerLeft}>
              <View style={styles.myScheduleBannerIcon}>
                <Text style={styles.myScheduleBannerIconGlyph}>✓</Text>
              </View>
              <View style={styles.scheduleBannerCopy}>
                <Text style={styles.scheduleBannerTitle}>Lịch chăm sóc của bạn</Text>
                <Text style={styles.scheduleBannerSub}>
                  Đang theo dõi {schedules.length} lịch chăm sóc định kỳ (nhắc nhở tưới nước, bón phân, tỉa cành đúng hạn).
                </Text>
              </View>
            </View>
            <View style={styles.myScheduleBannerCta}>
              <Text style={styles.myScheduleBannerCtaText}>Quản lý lịch</Text>
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
            ['🪴', 'Quản lý cây', '#E8EFEB', '/plants'],
            ['🏡', 'Quản lý vườn', C.brightMint, '/gardens'],
            ['📝', 'Nhật ký', C.peach, '/journal'],
            ['🐞', 'Sâu bệnh', '#FAD8D3', '/monitoring'],
          ].map(([icon, label, color, route]) => (
            <Pressable key={label} onPress={() => navigate(route)} style={styles.shortcut}>
              <View style={[styles.shortcutIcon, { backgroundColor: color }]}><Text style={styles.shortcutGlyph}>{icon}</Text></View>
              <Text style={styles.shortcutLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.exploreTitleRow}>
          <Text style={styles.sectionTitle}>Các cây nổi bật</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Khám phá ngay" onPress={() => router.push({ pathname: '/search', params: { query: '' } } as never)} style={styles.exploreAll}>
            <Text style={styles.featuredCta}>Khám phá ngay</Text>
            <Text style={styles.exploreArrow}>›</Text>
          </Pressable>
        </View>
        {featuredPlants.map((plant) => {
          const shortInfo = plant.overview || plant.morphology || (plant.light && plant.water ? `Ánh sáng: ${plant.light} • Tưới: ${plant.water}` : plant.scientificName);
          return (
            <Pressable key={plant.id} onPress={() => router.push({ pathname: '/plant-detail', params: { name: plant.name } } as never)} style={styles.suggestionCard}>
              <PlantArtwork category={plant.category} style={styles.suggestionPlantArtwork} />
              <View style={styles.flexCopy}>
                <View style={styles.featuredHeaderRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{plant.name}</Text>
                  <Text style={styles.featuredCategory}>{plant.category}</Text>
                </View>
                <Text style={styles.bodyText} numberOfLines={2}>{shortInfo}</Text>
              </View>
            </Pressable>
          );
        })}

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
  introCard: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 14, backgroundColor: '#EAF7EE', borderWidth: 1, borderColor: '#CBE8D4', flexDirection: 'row', alignItems: 'center', gap: 10 },
  introIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#D5EFE0', alignItems: 'center', justifyContent: 'center' },
  introEmoji: { fontSize: 20, lineHeight: 24 },
  introTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13, lineHeight: 18 },
  introBody: { color: '#3B6752', fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
  weatherCard: { minHeight: 72, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  weatherMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  weatherEmoji: { fontSize: 19, lineHeight: 23 },
  flexCopy: { flex: 1, gap: 2 },
  cardTitle: { color: C.text, fontFamily: F.semiBold, fontSize: 14, lineHeight: 19 },
  secondary: { color: C.secondaryText, fontFamily: F.regular },
  bodyText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 18 },
  lightPill: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: C.surface, color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  weatherActions: { alignItems: 'flex-end', gap: 4 },
  switchGardenText: { color: C.primary, fontFamily: F.semiBold, fontSize: 10 },
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
  myScheduleBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: '#CBE3D3' },
  myScheduleBannerIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E1F3E8', alignItems: 'center', justifyContent: 'center' },
  myScheduleBannerIconGlyph: { color: C.forest, fontFamily: F.bold, fontSize: 20, lineHeight: 24 },
  myScheduleBannerCta: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.softSurface, borderWidth: 1, borderColor: '#CBE3D3', marginLeft: 8 },
  myScheduleBannerCtaText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
  featuredCta: { color: C.primary, fontFamily: F.semiBold, fontSize: 12 },
  featuredHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  featuredCategory: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: '#E1F3E8', color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
});
