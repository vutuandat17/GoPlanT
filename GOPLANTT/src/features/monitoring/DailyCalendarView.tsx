import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { toLocalIsoDate } from '@/services/api';

type DailyCalendarViewProps = {
  selectedDate: string | null;
  onSelectDate: (isoDate: string | null) => void;
  journalCountByDate: Map<string, number>;
  careCountByDate?: Map<string, number>;
  initialDate?: string | null;
  onMonthRangeChange?: (fromIso: string, toIso: string) => void;
};

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function getMonthRange(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return {
    fromIso: toLocalIsoDate(start),
    toIso: toLocalIsoDate(end),
    daysInMonth: end.getDate(),
    // Monday = 0 ... Sunday = 6
    leadingBlanks: (start.getDay() + 6) % 7,
  };
}

export function DailyCalendarView({
  selectedDate,
  onSelectDate,
  journalCountByDate,
  careCountByDate,
  initialDate,
  onMonthRangeChange,
}: DailyCalendarViewProps) {
  const seedDate = useMemo(() => {
    const raw = selectedDate || initialDate;
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m] = raw.split('-').map(Number);
      return { year: y, monthIndex: (m || 1) - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  }, [selectedDate, initialDate]);

  const [year, setYear] = useState(seedDate.year);
  const [monthIndex, setMonthIndex] = useState(seedDate.monthIndex);

  const monthMeta = useMemo(() => getMonthRange(year, monthIndex), [year, monthIndex]);

  useEffect(() => {
    onMonthRangeChange?.(monthMeta.fromIso, monthMeta.toIso);
  }, [monthMeta.fromIso, monthMeta.toIso, onMonthRangeChange]);

  const todayIso = toLocalIsoDate();

  const handleSelectToday = () => {
    const [y, m] = todayIso.split('-').map(Number);
    setYear(y);
    setMonthIndex((m || 1) - 1);
    onSelectDate(selectedDate === todayIso ? null : todayIso);
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(year, monthIndex + delta, 1);
    setYear(d.getFullYear());
    setMonthIndex(d.getMonth());
  };

  const cells = useMemo(() => {
    const list: { key: string; day: number | null; iso: string | null }[] = [];
    for (let i = 0; i < monthMeta.leadingBlanks; i += 1) {
      list.push({ key: `blank-${i}`, day: null, iso: null });
    }
    for (let day = 1; day <= monthMeta.daysInMonth; day += 1) {
      const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      list.push({ key: iso, day, iso });
    }
    return list;
  }, [monthMeta.leadingBlanks, monthMeta.daysInMonth, year, monthIndex]);

  return (
    <View style={cal.wrap}>
      <View style={cal.header}>
        <Pressable onPress={() => shiftMonth(-1)} style={cal.navBtn} accessibilityLabel="Tháng trước">
          <Text style={cal.navText}>‹</Text>
        </Pressable>
        <Text style={cal.monthTitle}>
          Tháng {String(monthIndex + 1).padStart(2, '0')}/{year}
        </Text>
        <Pressable onPress={() => shiftMonth(1)} style={cal.navBtn} accessibilityLabel="Tháng sau">
          <Text style={cal.navText}>›</Text>
        </Pressable>
        <Pressable
          onPress={handleSelectToday}
          style={[cal.pillBtn, selectedDate === todayIso && cal.pillBtnActive]}>
          <Text style={[cal.pillText, selectedDate === todayIso && cal.pillTextActive]}>Hôm nay</Text>
        </Pressable>
        {selectedDate ? (
          <Pressable onPress={() => onSelectDate(null)} style={cal.pillBtn}>
            <Text style={cal.pillText}>Tất cả ngày</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={cal.weekRow}>
        {WEEKDAYS.map((wd) => (
          <Text key={wd} style={cal.weekLabel}>
            {wd}
          </Text>
        ))}
      </View>

      <View style={cal.grid}>
        {cells.map((cell) => {
          if (!cell.iso || cell.day == null) {
            return <View key={cell.key} style={cal.cellEmpty} />;
          }
          const jCount = journalCountByDate.get(cell.iso) ?? 0;
          const cCount = careCountByDate?.get(cell.iso) ?? 0;
          const isSelected = selectedDate === cell.iso;
          const isToday = cell.iso === todayIso;
          return (
            <Pressable
              key={cell.key}
              onPress={() => onSelectDate(isSelected ? null : cell.iso)}
              style={[
                cal.cell,
                isToday && !isSelected && cal.cellToday,
                isSelected && cal.cellSelected,
              ]}>
              <Text style={[cal.dayText, isSelected && cal.dayTextSelected]}>{cell.day}</Text>
              <View style={cal.dots}>
                {jCount > 0 ? <View style={[cal.dot, cal.dotJournal, isSelected && cal.dotOnSelected]} /> : null}
                {cCount > 0 ? <View style={[cal.dot, cal.dotCare, isSelected && cal.dotOnSelected]} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={cal.legend}>
        <View style={cal.legendItem}>
          <View style={[cal.dot, cal.dotJournal]} />
          <Text style={cal.legendText}>Có nhật ký</Text>
        </View>
        {careCountByDate ? (
          <View style={cal.legendItem}>
            <View style={[cal.dot, cal.dotCare]} />
            <Text style={cal.legendText}>Có lịch chăm sóc</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const cal = StyleSheet.create({
  wrap: { padding: 10, borderRadius: 12, backgroundColor: C.softSurface, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  navBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  navText: { color: C.forest, fontFamily: F.bold, fontSize: 16 },
  monthTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13, marginRight: 'auto' },
  pillBtn: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: C.surface },
  pillBtnActive: { backgroundColor: C.primary },
  pillText: { color: C.forest, fontFamily: F.semiBold, fontSize: 10 },
  pillTextActive: { color: C.surface },
  weekRow: { flexDirection: 'row' },
  weekLabel: { flex: 1, textAlign: 'center', color: C.mutedText, fontFamily: F.semiBold, fontSize: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellEmpty: { width: '14.2857%', height: 38 },
  cell: { width: '14.2857%', height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8, gap: 2 },
  cellToday: { borderWidth: 1, borderColor: C.primary, backgroundColor: '#EAF7EE' },
  cellSelected: { backgroundColor: C.primary },
  dayText: { color: C.forest, fontFamily: F.semiBold, fontSize: 11 },
  dayTextSelected: { color: C.surface },
  dots: { flexDirection: 'row', gap: 3, height: 6, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotJournal: { backgroundColor: '#1E824C' },
  dotCare: { backgroundColor: '#D97706' },
  dotOnSelected: { backgroundColor: '#FFFFFF' },
  legend: { flexDirection: 'row', gap: 12, paddingTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 10 },
});
