import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import {
  JOURNAL_HEALTH_META,
  JOURNAL_LOG_TYPES,
  JOURNAL_LOG_TYPE_META,
} from '@/features/journal/JournalStore';
import type { ApiJournalEntry, JournalHealthStatus, JournalLogType } from '@/services/api';

export type JournalLogFilter = 'all' | JournalLogType;
export type JournalHealthFilter = 'all' | JournalHealthStatus;

export function filterJournalEntries(
  entries: ApiJournalEntry[],
  filters: { query: string; logType: JournalLogFilter; healthStatus: JournalHealthFilter },
): ApiJournalEntry[] {
  const q = filters.query.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    if (filters.logType !== 'all' && entry.logType !== filters.logType) return false;
    if (filters.healthStatus !== 'all' && entry.healthStatus !== filters.healthStatus) return false;
    if (q) {
      const hay = `${entry.title ?? ''} ${entry.note} ${entry.plantName}`.toLocaleLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

type Props = {
  query: string;
  onQueryChange: (text: string) => void;
  logType: JournalLogFilter;
  onLogTypeChange: (value: JournalLogFilter) => void;
  healthStatus: JournalHealthFilter;
  onHealthStatusChange: (value: JournalHealthFilter) => void;
};

const HEALTH_FILTER_ORDER: JournalHealthStatus[] = ['warning', 'critical', 'healthy'];

export function JournalFilterBar({
  query,
  onQueryChange,
  logType,
  onLogTypeChange,
  healthStatus,
  onHealthStatusChange,
}: Props) {
  return (
    <View style={s.wrap}>
      <View style={s.searchBox}>
        <Text style={s.searchGlyph}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Tìm theo tiêu đề hoặc nội dung ghi chú..."
          placeholderTextColor={C.mutedText}
          style={s.searchInput}
        />
        {query ? (
          <Pressable onPress={() => onQueryChange('')} accessibilityLabel="Xóa từ khóa">
            <Text style={s.clear}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        <Pressable onPress={() => onLogTypeChange('all')} style={[s.chip, logType === 'all' && s.chipActive]}>
          <Text style={[s.chipText, logType === 'all' && s.chipTextActive]}>Tất cả loại</Text>
        </Pressable>
        {JOURNAL_LOG_TYPES.map((typeKey) => {
          const meta = JOURNAL_LOG_TYPE_META[typeKey];
          const active = logType === typeKey;
          return (
            <Pressable key={typeKey} onPress={() => onLogTypeChange(active ? 'all' : typeKey)} style={[s.chip, active && s.chipActive]}>
              <Text style={[s.chipText, active && s.chipTextActive]}>{meta.emoji} {meta.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        <Pressable onPress={() => onHealthStatusChange('all')} style={[s.chip, healthStatus === 'all' && s.chipActive]}>
          <Text style={[s.chipText, healthStatus === 'all' && s.chipTextActive]}>Mọi tình trạng</Text>
        </Pressable>
        {HEALTH_FILTER_ORDER.map((statusKey) => {
          const meta = JOURNAL_HEALTH_META[statusKey];
          const active = healthStatus === statusKey;
          return (
            <Pressable
              key={statusKey}
              onPress={() => onHealthStatusChange(active ? 'all' : statusKey)}
              style={[s.chip, active && s.chipActive]}>
              <Text style={[s.chipText, active && s.chipTextActive]}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 7 },
  searchBox: {
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE8E0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchGlyph: { color: C.secondaryText, fontSize: 18 },
  searchInput: { flex: 1, paddingVertical: 6, color: C.text, fontFamily: F.regular, fontSize: 12 },
  clear: { color: C.secondaryText, fontSize: 18, paddingHorizontal: 4 },
  chips: { flexDirection: 'row', gap: 6, paddingVertical: 1 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D6E3D9',
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.secondaryText, fontFamily: F.semiBold, fontSize: 11 },
  chipTextActive: { color: C.surface },
});
