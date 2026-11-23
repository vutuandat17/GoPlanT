import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { usePlantData } from '@/features/plants/PlantDataStore';
import { useAuthSession } from '@/features/auth/AuthSession';
import { useJournals } from '@/features/journal/JournalStore';
import { useCareSchedules } from '@/features/schedule/CareScheduleStore';
import { PlantArtwork } from '@/features/plants/PlantArtwork';
import { apiBaseUrl } from '@/services/api';
import { safeBack } from '@/services/navigation';
import { getLatestHealthLabel, matchesPlantFilters, toOwnedFilterPlant, type FilterPlant, type PlantFilterState, ownedFilterGroups, catalogFilterGroups, gardenFilterGroups, vietnameseAlphabet } from '@/features/plants/plantFilters';

type SearchResultItem = FilterPlant & {
  owned: boolean;
  ownedId?: string;
  catalogId?: string;
  gardenName?: string;
  latin: string;
  detail: string;
  photoUri?: string | null;
};

function SearchHeader({ query, onQueryChange, onFilter }: { query: string; onQueryChange: (text: string) => void; onFilter: () => void }) {
  return <View style={ss.header}>
    <Pressable onPress={() => safeBack('/home')} accessibilityRole="button" accessibilityLabel="Quay lại" style={ss.back}><Text style={ss.backText}>‹</Text></Pressable>
    <View style={ss.searchBox}><Text style={ss.searchIcon}>⌕</Text><TextInput value={query} onChangeText={onQueryChange} placeholder="Tìm cây trồng, bệnh lý..." placeholderTextColor={C.mutedText} style={ss.searchInput} returnKeyType="search" /><Pressable onPress={() => onQueryChange('')}><Text style={ss.clear}>×</Text></Pressable></View>
    <Pressable onPress={onFilter} style={ss.filterButton}><Text style={ss.filterGlyph}>☷</Text></Pressable>
  </View>;
}

function SearchResult({ item, accessToken, onAdd, onFavorite }: { item: SearchResultItem; accessToken: string | null; onAdd: () => void; onFavorite: () => void }) {
  return <View style={ss.resultCard}>
    <View style={ss.resultTop}><PlantArtwork category={item.category} photoUri={item.photoUri} accessToken={accessToken} style={ss.resultImage}/><View style={ss.resultCopy}><Text style={ss.resultName}>{item.name}</Text><Text style={ss.latin}>{item.latin}</Text><Text style={ss.body}>{item.owned ? `Đang sở hữu • Vườn: ${item.gardenName}${item.location ? ` (${item.location})` : ''}` : `${item.category} • Thư viện mẫu`}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={item.isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'} onPress={onFavorite}><Text style={ss.favorite}>{item.isFavorite ? '♥' : '♡'}</Text></Pressable></View>
    <Text style={ss.statusLine}>{item.owned ? 'Đang trồng trong vườn của bạn • Bấm "Tiếp tục trồng" để trồng thêm' : 'Một số thông tin sinh trưởng chưa có dữ liệu trong thư viện mẫu.'}</Text>
    <View style={ss.actions}><Pressable onPress={() => router.push({ pathname: '/plant-detail', params: { name: item.name, ...(item.ownedId ? { ownedId: item.ownedId } : {}) } } as never)} style={[ss.action, ss.actionLight]}><Text style={ss.actionLightText}>Xem chi tiết</Text></Pressable><Pressable onPress={onAdd} style={ss.action}><Text style={ss.actionText}>{item.owned ? '＋ Tiếp tục trồng' : '＋ Thêm vào cây của tôi'}</Text></Pressable></View>
  </View>;
}

export function SearchScreen() {
  const params = useLocalSearchParams<{ query?: string }>();
  const { catalog, ownedPlants, gardens, favorites, toggleFavorite } = usePlantData();
  const { journals } = useJournals();
  const { todayTasks, schedules } = useCareSchedules();
  const { accessToken } = useAuthSession();
  const [query, setQuery] = useState(params.query ?? 'Trầu bà');
  const [scope, setScope] = useState('Tất cả');
  const filtersParam = (params as typeof params & { filters?: string | string[] }).filters;
  const filters = useMemo<PlantFilterState>(() => {
    try { return JSON.parse(Array.isArray(filtersParam) ? filtersParam[0] : filtersParam ?? '{}') as PlantFilterState; }
    catch { return {}; }
  }, [filtersParam]);
  const ownedCatalogIds = useMemo(() => new Set(ownedPlants.map((plant) => plant.catalogId)), [ownedPlants]);
  const rows = useMemo<SearchResultItem[]>(() => [
    ...ownedPlants.map((plant) => ({
      ...toOwnedFilterPlant(plant, journals, todayTasks, schedules, favorites.includes(plant.catalogId)),
      latin: plant.scientificName,
      owned: true,
      ownedId: plant.id,
      catalogId: plant.catalogId,
      gardenName: gardens.find((garden) => garden.id === plant.gardenId)?.name ?? 'Chưa phân vườn',
      detail: getLatestHealthLabel(plant.id, journals),
      photoUri: plant.photoUpdatedAt ? `${apiBaseUrl}/api/v1/plants/${plant.id}/photo?v=${encodeURIComponent(plant.photoUpdatedAt)}` : null,
    })),
    ...catalog.map((plant) => ({ ...plant, latin: plant.scientificName, owned: false, detail: 'Thông tin từ danh mục cây', isFavorite: favorites.includes(plant.id) })),
  ], [ownedPlants, gardens, catalog, favorites, journals, todayTasks, schedules]);
  const favoriteCount = useMemo(() => rows.filter((item) => Boolean(item.isFavorite) && (item.owned || !ownedCatalogIds.has(item.id))).length, [rows, ownedCatalogIds]);
  const relatedKeywords = useMemo(() => [...new Set(catalog.map((plant) => plant.name).filter(Boolean))].slice(0, 4), [catalog]);
  const list = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const isSearching = normalized.length > 0;
    const filtered = rows.filter((item) => {
      const inScope = scope === 'Tất cả'
        ? (isSearching ? (item.owned || !ownedCatalogIds.has(item.id)) : (!item.owned && !ownedCatalogIds.has(item.id)))
        : scope === 'Trong vườn của tôi'
          ? item.owned
          : Boolean(item.isFavorite) && (item.owned || !ownedCatalogIds.has(item.id));
      const matchesQuery = !normalized || `${item.name} ${item.latin}`.toLocaleLowerCase().includes(normalized);
      return inScope && matchesQuery && matchesPlantFilters(item, filters);
    });
    const priority = (item: SearchResultItem) => (item.owned ? 2 : item.isFavorite ? 1 : 0);
    return filtered.sort((a, b) => priority(a) - priority(b));
  }, [query, scope, rows, ownedCatalogIds, filters]);
  const openFilter = () => router.push({ pathname: '/filter', params: { query, scope, filters: JSON.stringify(filters) } } as never);

  return <SafeAreaView style={ss.safe} edges={['top']}>
    <SearchHeader query={query} onQueryChange={setQuery} onFilter={openFilter} />
    <ScrollView contentContainerStyle={ss.content} keyboardShouldPersistTaps="handled">
      <Text style={ss.kicker}>⌕ Đang tìm kiếm cho từ khóa: <Text style={ss.bold}>“{query || 'cây trồng'}”</Text></Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.pills}>{['Tất cả', 'Trong vườn của tôi', 'Cây yêu thích'].map((item) => { const label = item === 'Tất cả' ? item : item === 'Trong vườn của tôi' ? `${item}  ${ownedPlants.length}` : `${item}  ${favoriteCount}`; return <Pressable key={item} onPress={() => setScope(item)} style={[ss.scope, scope === item && ss.scopeActive]}><Text style={[ss.scopeText, scope === item && ss.scopeTextActive]}>{label}</Text></Pressable>; })}</ScrollView>
      {relatedKeywords.length > 0 ? <><Text style={ss.kicker}>GỢI Ý TỪ KHÓA LIÊN QUAN</Text><View style={ss.suggestions}>{relatedKeywords.map((item) => <Pressable key={item} onPress={() => setQuery(item)} style={ss.suggestion}><Text style={ss.body}>⌕  {item}</Text></Pressable>)}</View></> : null}
      {list.length ? <><View style={ss.sectionRow}><Text style={ss.sectionTitle}>{scope === 'Cây yêu thích' ? 'Cây yêu thích của bạn' : scope === 'Trong vườn của tôi' ? 'Cây đang sở hữu' : 'Cây trồng phù hợp'}</Text><Text style={ss.body}>{list.length} kết quả</Text></View>{list.map((item) => <SearchResult key={`${item.ownedId ?? item.id}`} item={item} accessToken={accessToken} onAdd={() => router.push({ pathname: '/garden/add-plant', params: { plantId: item.catalogId ?? item.id } } as never)} onFavorite={() => toggleFavorite(item.catalogId ?? item.id)} />)}</> : <View style={ss.emptyCard}><View style={ss.emptyIcon}><Text style={ss.emptyPlant}>♧</Text></View><Text style={ss.emptyTitle}>Không tìm thấy kết quả phù hợp</Text><Text style={ss.queryText}>“{query}”</Text><Text style={ss.bodyCenter}>Thử xóa bộ lọc hoặc tìm bằng tên thường gọi.</Text><Pressable onPress={openFilter} style={ss.action}><Text style={ss.actionText}>Mở bộ lọc</Text></Pressable></View>}
    </ScrollView>
  </SafeAreaView>;
}

export function FilterScreen() {
  const params = useLocalSearchParams<{ query?: string; scope?: string; filters?: string; context?: string }>();
  const { catalog, ownedPlants, gardens, favorites, filterStates, setFilterState } = usePlantData();
  const { journals } = useJournals();
  const { todayTasks, schedules } = useCareSchedules();
  const context = params.context ?? '';
  const [scope, setScope] = useState<'owned' | 'catalog'>(context === 'plants' || context === 'journal' || context === 'monitoring' ? 'owned' : params.scope === 'Trong vườn của tôi' || params.scope === 'owned' ? 'owned' : 'catalog');
  const [query, setQuery] = useState(params.query ?? '');
  const [selected, setSelected] = useState<PlantFilterState>(() => {
    try { return JSON.parse(params.filters ?? JSON.stringify(context ? filterStates[context] ?? {} : {})) as PlantFilterState; } catch { return {}; }
  });
  const rows = useMemo<FilterPlant[]>(() => [
    ...(context === 'gardens' || context === 'schedule' ? gardens.map((garden) => ({ id: garden.id, name: garden.name, scientificName: '', category: ({ balcony: 'Ban công', rooftop: 'Sân thượng', garden: 'Sân vườn', indoor: 'Trong nhà', greenhouse: 'Nhà kính', other: 'Khác' } as Record<string, string>)[garden.locationType] ?? 'Khác', location: garden.locationDetail, isFavorite: false })) : []),
    ...(!['gardens', 'schedule'].includes(context) ? ownedPlants : []).map((plant) => toOwnedFilterPlant(plant, journals, todayTasks, schedules, favorites.includes(plant.catalogId))),
    ...(!context || context === 'home' ? catalog : []).map((plant) => ({ ...plant, isFavorite: favorites.includes(plant.id) })),
  ], [context, gardens, ownedPlants, catalog, favorites, journals, todayTasks, schedules]);
  const groups = context === 'gardens' || context === 'schedule' ? gardenFilterGroups
    : scope === 'owned' ? ownedFilterGroups
      : catalogFilterGroups.map((group) => group.key === 'category' ? { ...group, options: [...new Set([...group.options, ...catalog.map((plant) => plant.category)])] } : group);
  const visible = useMemo(() => rows.filter((plant) => {
    const normalized = query.trim().toLocaleLowerCase();
    const matchesQuery = !normalized || `${plant.name} ${plant.scientificName ?? ''} ${plant.location ?? ''}`.toLocaleLowerCase().includes(normalized);
    const matchesScope = context === 'gardens' || context === 'schedule' ? gardens.some((garden) => garden.id === plant.id)
      : scope === 'owned' ? ownedPlants.some((ownedPlant) => ownedPlant.id === plant.id || ownedPlant.catalogId === plant.id) : !ownedPlants.some((ownedPlant) => ownedPlant.catalogId === plant.id);
    return matchesScope && matchesQuery && matchesPlantFilters(plant, selected);
  }), [rows, query, scope, context, gardens, ownedPlants, selected]);
  const toggle = (key: string, value: string) => setSelected((old) => {
    if (key === 'letter' && value === 'Tất cả') return { ...old, letter: [] };
    const values = old[key] ?? [];
    if (key === 'favorite') return { ...old, [key]: [value] };
    return { ...old, [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] };
  });
  const reset = () => { setSelected({}); setQuery(''); };
  const apply = () => {
    if (context) {
      setFilterState(context, selected);
      safeBack('/home');
      return;
    }
    router.replace({ pathname: '/search', params: { query, scope: scope === 'owned' ? 'Trong vườn của tôi' : 'Thư viện & Khám phá', filters: JSON.stringify(selected) } } as never);
  };

  return <SafeAreaView style={ss.safe} edges={['top']}>
    <View style={ss.filterHeader}><Pressable onPress={() => safeBack('/home')}><Text style={ss.backText}>‹</Text></Pressable><Text style={ss.filterTitle}>Bộ lọc cây trồng</Text><Pressable onPress={reset}><Text style={ss.link}>Đặt lại</Text></Pressable></View>
    <ScrollView contentContainerStyle={ss.filterContent}>
      {!context ? <View style={ss.toggleRow}>{[{ key: 'owned', label: `Cây sở hữu (${ownedPlants.length})` }, { key: 'catalog', label: 'Khám phá & tìm cây' }].map((item) => <Pressable key={item.key} onPress={() => setScope(item.key as 'owned' | 'catalog')} style={[ss.toggleOption, scope === item.key && ss.toggleActive]}><Text style={[ss.toggleText, scope === item.key && ss.toggleActive && ss.toggleTextActive]}>{item.label}</Text></Pressable>)}</View> : null}
      <View style={ss.searchBox}><Text style={ss.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="Tên cây hoặc tên khoa học" placeholderTextColor={C.mutedText} style={ss.searchInput} /></View>
      <View style={ss.sectionRow}><Text style={ss.sectionTitle}>Lọc theo chữ cái đầu</Text><Text style={ss.body}>Tiếng Việt</Text></View><View style={ss.letters}>{vietnameseAlphabet.map((letter) => <Pressable key={letter} onPress={() => toggle('letter', letter)} style={[ss.letter, (letter === 'Tất cả' ? !(selected.letter?.length) : selected.letter?.includes(letter)) && ss.letterActive]}><Text style={[ss.letterText, (letter === 'Tất cả' ? !(selected.letter?.length) : selected.letter?.includes(letter)) && ss.scopeTextActive]}>{letter}</Text></Pressable>)}</View>
      {groups.map((group) => <View key={group.key} style={ss.filterGroup}><Text style={ss.sectionTitle}>{group.title}</Text><View style={ss.optionGrid}>{group.options.map((item) => { const active = selected[group.key]?.includes(item) ?? false; return <Pressable key={item} onPress={() => toggle(group.key, item)} style={[ss.option, active && ss.optionActive]}><Text style={[ss.optionText, active && ss.optionTextActive]}>{item}</Text></Pressable>; })}</View></View>)}
      <View style={ss.filterResult}><Text style={ss.resultName}>{visible.length} kết quả phù hợp</Text><Text style={ss.body}>{visible[0] ? `${visible[0].name} • ${visible[0].scientificName}` : 'Không có cây khớp với tìm kiếm và bộ lọc.'}</Text></View>
    </ScrollView>
    <View style={ss.filterFooter}><Pressable onPress={reset} style={[ss.action, ss.actionLight]}><Text style={ss.actionLightText}>Đặt lại</Text></Pressable><Pressable onPress={apply} style={ss.action}><Text style={ss.actionText}>Áp dụng lọc • {visible.length} cây</Text></Pressable></View>
  </SafeAreaView>;
}

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background }, header: { minHeight: 56, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDE8E0' }, back: { width: 28 }, backText: { color: C.forest, fontSize: 30 },
  searchBox: { flex: 1, minHeight: 40, paddingHorizontal: 9, borderWidth: 1, borderColor: '#CBDACF', borderRadius: 99, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 5 }, searchIcon: { color: C.secondaryText, fontSize: 21 }, searchInput: { flex: 1, color: C.text, fontFamily: F.regular, fontSize: 12 }, clear: { color: C.secondaryText, fontSize: 20 }, filterButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: C.softSurface }, filterGlyph: { color: C.forest, fontSize: 20 },
  content: { padding: 12, gap: 10 }, kicker: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10, lineHeight: 15 }, bold: { color: C.forest, fontFamily: F.bold }, pills: { flexDirection: 'row', gap: 6 }, scope: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 99, backgroundColor: '#E6EEE8' }, scopeActive: { backgroundColor: C.forest }, scopeText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10 }, scopeTextActive: { color: C.surface }, suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, suggestion: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 99, backgroundColor: '#E8F0E9' }, body: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, lineHeight: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 }, resultCard: { padding: 10, borderRadius: 13, backgroundColor: C.surface, gap: 7 }, resultTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, resultImage: { width: 58, height: 58, borderRadius: 10 }, plantEmoji: { fontSize: 26 }, resultCopy: { flex: 1, gap: 2 }, resultName: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 }, latin: { color: C.mutedText, fontFamily: F.regular, fontStyle: 'italic', fontSize: 10 }, favorite: { color: C.terracotta, fontSize: 23 }, dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.peach }, dotGood: { backgroundColor: '#66B98A' }, statusLine: { padding: 7, borderRadius: 8, backgroundColor: C.softSurface, color: C.secondaryText, fontFamily: F.regular, fontSize: 10 }, actions: { flexDirection: 'row', gap: 7 }, action: { flex: 1, minHeight: 37, paddingHorizontal: 9, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, actionText: { color: C.surface, fontFamily: F.semiBold, fontSize: 10 }, actionLight: { backgroundColor: C.softSurface }, actionLightText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 10 },
  emptyCard: { padding: 16, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', gap: 10 }, emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' }, emptyPlant: { color: '#83A993', fontSize: 34 }, emptyTitle: { color: C.forest, fontFamily: F.semiBold, textAlign: 'center', fontSize: 13 }, queryText: { color: C.terracotta, fontFamily: F.bold, fontSize: 16 }, bodyCenter: { color: C.secondaryText, fontFamily: F.regular, textAlign: 'center', fontSize: 11, lineHeight: 17 }, mockNote: { color: C.mutedText, fontFamily: F.regular, fontSize: 9, textAlign: 'center' },
  filterHeader: { minHeight: 54, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, filterTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14 }, profile: { color: C.surface, fontFamily: F.bold, textAlign: 'center', textAlignVertical: 'center', width: 30, height: 30, borderRadius: 15, backgroundColor: C.forest }, filterContent: { padding: 12, gap: 11, paddingBottom: 22 }, toggleRow: { flexDirection: 'row', padding: 4, borderRadius: 10, backgroundColor: '#E4EDE6', gap: 4 }, toggleOption: { flex: 1, minHeight: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }, toggleActive: { backgroundColor: C.surface }, toggleText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 }, toggleTextActive: { color: C.forest, fontFamily: F.semiBold }, letters: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 }, letter: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 99, backgroundColor: C.softSurface }, letterActive: { backgroundColor: C.forest }, letterText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 9 }, filterGroup: { gap: 7 }, link: { color: C.primary, fontFamily: F.semiBold, fontSize: 10 }, optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, option: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: C.surface, borderWidth: 1, borderColor: '#E5ECE6' }, optionActive: { backgroundColor: C.forest, borderColor: C.forest }, optionText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 }, optionTextActive: { color: C.surface, fontFamily: F.semiBold }, filterResult: { padding: 11, borderRadius: 12, backgroundColor: C.softSurface, gap: 4 }, filterFooter: { padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDE8E0', backgroundColor: C.surface, flexDirection: 'row', gap: 8 },
});
