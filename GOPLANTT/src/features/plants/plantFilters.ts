import type { ApiCareSchedule, ApiCareTask, ApiJournalEntry, JournalHealthStatus } from '@/services/api';
import type { OwnedPlant, PlantProfile } from './PlantDataStore';

const HEALTH_LABELS: Record<JournalHealthStatus, string> = {
  healthy: 'Khỏe mạnh',
  warning: 'Cần theo dõi',
  critical: 'Cần can thiệp',
};

export type PlantFilterState = Record<string, string[]>;
export type FilterPlant = PlantProfile & Partial<OwnedPlant> & { isFavorite?: boolean; health?: string; care?: string };

export const vietnameseAlphabet = ['Tất cả', 'A', 'Ă', 'Â', 'B', 'C', 'D', 'Đ', 'E', 'Ê', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'Ô', 'Ơ', 'P', 'Q', 'R', 'S', 'T', 'U', 'Ư', 'V', 'X', 'Y'];

export const ownedFilterGroups = [
  { key: 'category', title: 'Loại cây trồng', options: ['Cây nội thất', 'Cây gia dụng', 'Cây hoa', 'Rau gia vị', 'Rau ăn lá', 'Rau ăn quả', 'Cây ăn quả'] },
  { key: 'location', title: 'Vị trí trồng hiện tại', options: ['Trong nhà', 'Ban công', 'Sân thượng', 'Sân vườn', 'Ngoài sân', 'Nhà kính', 'Khác', 'Chưa xác định'] },
  { key: 'health', title: 'Tình trạng sức khỏe cây', options: ['Khỏe mạnh', 'Cần theo dõi', 'Cần can thiệp', 'Chưa đánh giá'] },
  { key: 'care', title: 'Trạng thái chăm sóc', options: ['Sắp đến hạn', 'Đến hạn', 'Quá hạn', 'Đã hoàn thành', 'Không có lịch chăm sóc'] },
];

// Only include catalog filter groups backed by populated V7 plant_catalog columns.
export const catalogFilterGroups = [
  { key: 'category', title: 'Loại cây trồng', options: ['Cây nội thất', 'Cây gia dụng', 'Cây hoa', 'Rau gia vị', 'Rau ăn lá', 'Rau ăn quả', 'Cây ăn quả'] },
  { key: 'difficulty', title: 'Độ khó chăm sóc', options: ['Dễ', 'Trung bình', 'Khó', 'Chưa có dữ liệu'] },
  { key: 'light', title: 'Nhu cầu ánh sáng', options: ['Nắng trực tiếp', 'Ánh sáng gián tiếp mạnh', 'Ánh sáng gián tiếp vừa', 'Ánh sáng yếu', 'Chưa có dữ liệu'] },
  { key: 'water', title: 'Nhu cầu tưới nước', options: ['Ít nước', 'Nước trung bình', 'Nhiều nước', 'Ưa ẩm', 'Chưa có dữ liệu'] },
  { key: 'favorite', title: 'Cây yêu thích', options: ['Tất cả cây', 'Chỉ cây yêu thích'] },
  { key: 'temperature', title: 'Nhiệt độ phù hợp', options: ['Mát mẻ', 'Nhiệt đới ẩm', 'Chịu lạnh', 'Chưa có dữ liệu'] },
];

export const gardenFilterGroups = [
  { key: 'category', title: 'Loại khu vườn', options: ['Ban công', 'Sân thượng', 'Sân vườn', 'Trong nhà', 'Nhà kính', 'Khác'] },
];

export function getLatestHealthLabel(plantId: string, journals: ApiJournalEntry[]): string {
  let latest: ApiJournalEntry | undefined;
  for (const entry of journals) {
    if (entry.plantId !== plantId) continue;
    if (
      !latest
      || entry.entryDate > latest.entryDate
      || (entry.entryDate === latest.entryDate && entry.createdAt > latest.createdAt)
    ) {
      latest = entry;
    }
  }
  return latest ? (HEALTH_LABELS[latest.healthStatus] ?? 'Chưa đánh giá') : 'Chưa đánh giá';
}

export function getCareStatusLabel(
  plantId: string,
  todayTasks: ApiCareTask[],
  schedules: ApiCareSchedule[],
): string {
  const plantTodayTasks = todayTasks.filter((t) => t.plantId === plantId);
  const pending = plantTodayTasks.filter((t) => t.status === 'pending');
  if (pending.length > 0) {
    const overdueCutoffMs = Date.now() - 60 * 60 * 1000;
    const hasOverdue = pending.some((t) => new Date(t.dueAt).getTime() < overdueCutoffMs);
    return hasOverdue ? 'Quá hạn' : 'Đến hạn';
  }
  if (plantTodayTasks.some((t) => t.status === 'completed')) {
    return 'Đã hoàn thành';
  }
  if (schedules.some((s) => s.plantId === plantId && s.active)) {
    return 'Sắp đến hạn';
  }
  return 'Không có lịch chăm sóc';
}

export function toOwnedFilterPlant(
  plant: OwnedPlant,
  journals: ApiJournalEntry[],
  todayTasks: ApiCareTask[],
  schedules: ApiCareSchedule[],
  isFavorite = false,
): FilterPlant {
  return {
    ...plant,
    id: plant.catalogId,
    isFavorite,
    health: getLatestHealthLabel(plant.id, journals),
    care: getCareStatusLabel(plant.id, todayTasks, schedules),
  };
}

export function normalizeVietnamese(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleUpperCase();
}

export function matchesPlantFilters(plant: FilterPlant, filters: PlantFilterState) {
  return Object.entries(filters).every(([key, selected]) => {
    if (!selected.length || key === 'favorite' && selected.includes('Tất cả cây')) return true;
    if (key === 'letter') {
      const first = normalizeVietnamese(plant.name ?? '').charAt(0);
      return selected.some((letter) => normalizeVietnamese(letter) === first);
    }
    if (key === 'favorite') return selected.includes('Chỉ cây yêu thích') ? Boolean(plant.isFavorite) : true;
    const value = key === 'health'
      ? (plant.health || 'Chưa đánh giá')
      : key === 'care'
        ? (plant.care || 'Không có lịch chăm sóc')
        : plant[key as keyof FilterPlant];
    const label = typeof value === 'string' && value.trim() ? value : 'Chưa có dữ liệu';
    if (key === 'location' && selected.some((option) => normalizeVietnamese(label).includes(normalizeVietnamese(option)))) return true;
    return selected.includes(label);
  });
}
