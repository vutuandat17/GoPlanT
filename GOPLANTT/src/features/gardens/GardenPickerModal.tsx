import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from '@/components/app-primitives';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import type { GardenProfile } from '@/features/plants/PlantDataStore';

const LOCATION_LABELS: Record<string, string> = {
  balcony: 'Ban công',
  rooftop: 'Sân thượng',
  garden: 'Sân vườn',
  indoor: 'Trong nhà',
  greenhouse: 'Nhà kính',
  other: 'Khác',
};

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  gardens: GardenProfile[];
  currentGardenId?: string | null;
  allowUnassign?: boolean;
  busy?: boolean;
  onSelect: (gardenId: string | null) => void;
  onClose: () => void;
};

export function GardenPickerModal({
  visible,
  title,
  subtitle,
  gardens,
  currentGardenId,
  allowUnassign = false,
  busy = false,
  onSelect,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
          <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
            {gardens.map((garden) => {
              const isCurrent = garden.id === currentGardenId;
              return (
                <Pressable
                  key={garden.id}
                  disabled={busy || isCurrent}
                  onPress={() => onSelect(garden.id)}
                  style={[s.row, isCurrent && s.rowCurrent]}>
                  <View style={s.copy}>
                    <Text style={s.rowTitle}>{garden.name}</Text>
                    <Text style={s.rowMeta}>
                      {LOCATION_LABELS[garden.locationType] ?? garden.locationType}
                      {garden.locationDetail ? ` • ${garden.locationDetail}` : ''}
                    </Text>
                  </View>
                  <Text style={s.rowAction}>{isCurrent ? 'Hiện tại' : busy ? '...' : 'Chọn'}</Text>
                </Pressable>
              );
            })}
            {allowUnassign && currentGardenId ? (
              <Pressable disabled={busy} onPress={() => onSelect(null)} style={s.row}>
                <View style={s.copy}>
                  <Text style={s.rowTitle}>Chưa phân vườn</Text>
                  <Text style={s.rowMeta}>Gỡ cây khỏi khu vườn hiện tại</Text>
                </View>
                <Text style={s.rowAction}>{busy ? '...' : 'Gỡ'}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          <Pressable disabled={busy} onPress={onClose} style={s.closeBtn}>
            <Text style={s.closeText}>Đóng</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, padding: 18, backgroundColor: 'rgba(35, 42, 38, 0.45)', alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 420, maxHeight: '78%', padding: 16, borderRadius: 16, backgroundColor: C.surface, gap: 10 },
  title: { color: C.forest, fontFamily: F.bold, fontSize: 16 },
  subtitle: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 17 },
  list: { maxHeight: 320 },
  listContent: { gap: 8 },
  row: { padding: 11, borderRadius: 12, backgroundColor: C.softSurface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowCurrent: { opacity: 0.6 },
  copy: { flex: 1, gap: 2 },
  rowTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 13 },
  rowMeta: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11 },
  rowAction: { color: C.primary, fontFamily: F.bold, fontSize: 12 },
  closeBtn: { minHeight: 40, borderRadius: 10, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: C.forest, fontFamily: F.semiBold, fontSize: 12 },
});
