import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuthSession } from '@/features/auth/AuthSession';
import { apiRequest, deleteGardenPhoto, fetchCatalogPlants, fetchOwnedPlants, isApiConfigured, updateGarden as updateGardenApi, uploadGardenPhoto, uploadPlantPhoto, type ApiGarden, type ApiOwnedPlant, type PlantCatalogItem } from '@/services/api';

export type PlantProfile = {
  id: string;
  name: string;
  scientificName: string;
  category: string;
  difficulty?: string;
  light?: string;
  water?: string;
  environment?: string;
  space?: string;
  matureSize?: string;
  temperature?: string;
  humidity?: string;
  medium?: string;
  drainage?: string;
  soilPh?: string;
  sunTolerance?: string;
  origin?: string;
  overview?: string;
  morphology?: string;
  lifespan?: string;
  floweringSeason?: string;
  usageAndCaution?: string;
  growthRate?: string;
  wateringFrequency?: string;
  nutrition?: string;
};

export type OwnedPlant = {
  id: string;
  catalogId: string;
  gardenId?: string | null;
  name: string;
  scientificName: string;
  category: string;
  plantedAt: string;
  location: string;
  note: string;
  photoUpdatedAt?: string | null;
};

export type GardenProfile = {
  id: string;
  name: string;
  locationType: string;
  locationDetail: string;
  description: string;
  provinceCode?: string | null;
  provinceName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationSource?: 'province' | 'gps' | null;
  photoUpdatedAt?: string | null;
};

type PlantDataContextValue = {
  catalog: PlantProfile[];
  ownedPlants: OwnedPlant[];
  gardens: GardenProfile[];
  favorites: string[];
  isLoading: boolean;
  apiError: string;
  filterStates: Record<string, Record<string, string[]>>;
  setFilterState: (context: string, filters: Record<string, string[]>) => void;
  refresh: () => Promise<void>;
  addPlant: (plant: Omit<OwnedPlant, 'id'>) => Promise<string>;
  updatePlant: (id: string, plant: Omit<OwnedPlant, 'id'>) => Promise<void>;
  updatePlantPhoto: (id: string, photo: { uri: string; mimeType?: string | null; fileName?: string | null }) => Promise<void>;
  removePlant: (id: string) => Promise<void>;
  addGarden: (garden: Omit<GardenProfile, 'id'>) => Promise<string>;
  updateGarden: (id: string, garden: Omit<GardenProfile, 'id'>) => Promise<void>;
  updateGardenPhoto: (id: string, photo: { uri: string; mimeType?: string | null; fileName?: string | null }) => Promise<void>;
  removeGardenPhoto: (id: string) => Promise<void>;
  removeGarden: (id: string) => Promise<void>;
  toggleFavorite: (catalogId: string) => Promise<void>;
};

const PlantDataContext = createContext<PlantDataContextValue | null>(null);

function mapCatalog(plant: PlantCatalogItem): PlantProfile {
  const waterText = plant.waterFrequencyDays ? `Mỗi ${plant.waterFrequencyDays} ngày` : undefined;
  return {
    id: plant.id,
    name: plant.commonName,
    scientificName: plant.scientificName,
    category: plant.category,
    difficulty: plant.difficulty ?? undefined,
    light: plant.lightRequirement ?? undefined,
    water: waterText,
    wateringFrequency: waterText,
    temperature: plant.temperatureRange ?? undefined,
    origin: plant.origin ?? undefined,
    overview: plant.overview ?? undefined,
    morphology: plant.morphology ?? undefined,
    usageAndCaution: plant.toxicityWarning ?? undefined,
  };
}

function mapOwnedPlant(plant: ApiOwnedPlant, catalog: PlantProfile[]): OwnedPlant {
  return {
    id: plant.id,
    catalogId: plant.catalogId,
    gardenId: plant.gardenId,
    name: plant.displayName,
    scientificName: plant.scientificName,
    category: catalog.find((item) => item.id === plant.catalogId)?.category ?? 'Cây trồng',
    plantedAt: plant.plantedOn ?? '',
    location: plant.specificLocation ?? '',
    note: plant.note ?? '',
    photoUpdatedAt: plant.photoUpdatedAt,
  };
}

function mapGarden(garden: ApiGarden): GardenProfile {
  return {
    id: garden.id,
    name: garden.name,
    locationType: garden.locationType,
    locationDetail: garden.locationDetail ?? '',
    description: garden.description ?? '',
    provinceCode: garden.provinceCode ?? null,
    provinceName: garden.provinceName ?? null,
    latitude: garden.latitude ?? null,
    longitude: garden.longitude ?? null,
    locationSource: garden.locationSource ?? null,
    photoUpdatedAt: garden.photoUpdatedAt ?? null,
  };
}

function parseDate(value: string): string | null {
  const normalized = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const match = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

export function PlantDataProvider({ children }: { children: ReactNode }) {
  const { accessToken, isReady } = useAuthSession();
  const [catalog, setCatalog] = useState<PlantProfile[]>([]);
  const [ownedPlants, setOwnedPlants] = useState<OwnedPlant[]>([]);
  const [gardens, setGardens] = useState<GardenProfile[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [filterStates, setFilterStates] = useState<Record<string, Record<string, string[]>>>({});
  const setFilterState = useCallback((context: string, filters: Record<string, string[]>) => {
    setFilterStates((current) => ({ ...current, [context]: filters }));
  }, []);

  const refresh = useCallback(async () => {
    if (!isApiConfigured) return;
    setIsLoading(true);
    setApiError('');
    try {
      const [catalogPage, gardenRows, plantPage, favoriteRows] = await Promise.all([
        fetchCatalogPlants({ page: 0, size: 100 }),
        accessToken ? apiRequest<ApiGarden[]>('/api/v1/gardens', { token: accessToken }) : Promise.resolve([] as ApiGarden[]),
        accessToken ? fetchOwnedPlants(accessToken, { page: 0, size: 100 }) : Promise.resolve({ items: [] as ApiOwnedPlant[], page: 0, size: 100, totalElements: 0, totalPages: 0 }),
        accessToken ? apiRequest<PlantCatalogItem[]>('/api/v1/favorites', { token: accessToken }) : Promise.resolve([] as PlantCatalogItem[]),
      ]);
      const mappedCatalog = catalogPage.items.map(mapCatalog);
      setCatalog(mappedCatalog);
      setGardens(gardenRows.map(mapGarden));
      setOwnedPlants(plantPage.items.map((plant) => mapOwnedPlant(plant, mappedCatalog)));
      setFavorites(favoriteRows.map((plant) => plant.id));
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Không tải được dữ liệu từ backend.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isReady) void refresh();
  }, [isReady, refresh]);

  const value = useMemo<PlantDataContextValue>(() => ({
    catalog, ownedPlants, gardens, favorites, isLoading, apiError, refresh, filterStates, setFilterState,
    addPlant: async (plant) => {
      if (isApiConfigured && accessToken) {
        const created = await apiRequest<ApiOwnedPlant>('/api/v1/plants', {
          method: 'POST', token: accessToken,
          body: { catalogId: plant.catalogId, displayName: plant.name, specificLocation: plant.location || null,
            plantedOn: parseDate(plant.plantedAt), note: plant.note || null, gardenId: plant.gardenId ?? null },
        });
        setOwnedPlants((items) => [mapOwnedPlant(created, catalog), ...items]);
        return created.id;
      }
      throw new Error('Cần đăng nhập và kết nối máy chủ để thêm cây.');
    },
    updatePlant: async (id, plant) => {
      if (isApiConfigured && accessToken) {
        const updated = await apiRequest<ApiOwnedPlant>(`/api/v1/plants/${id}`, {
          method: 'PUT', token: accessToken,
          body: { displayName: plant.name, specificLocation: plant.location || null,
            plantedOn: parseDate(plant.plantedAt), note: plant.note || null, gardenId: plant.gardenId ?? null },
        });
        setOwnedPlants((items) => items.map((item) => item.id === id ? mapOwnedPlant(updated, catalog) : item));
        return;
      }
      throw new Error('Cần đăng nhập và kết nối máy chủ để cập nhật cây.');
    },
    updatePlantPhoto: async (id, photo) => {
      if (!isApiConfigured || !accessToken) throw new Error('Cần đăng nhập và kết nối máy chủ để tải ảnh lên.');
      await uploadPlantPhoto(id, accessToken, photo);
      await refresh();
    },
    removePlant: async (id) => {
      if (isApiConfigured && accessToken) await apiRequest<void>(`/api/v1/plants/${id}`, { method: 'DELETE', token: accessToken });
      if (!isApiConfigured || !accessToken) throw new Error('Cần đăng nhập và kết nối máy chủ để xóa cây.');
      setOwnedPlants((items) => items.filter((item) => item.id !== id));
    },
    addGarden: async (garden) => {
      if (isApiConfigured && accessToken) {
        const created = await apiRequest<ApiGarden>('/api/v1/gardens', {
          method: 'POST', token: accessToken,
          body: {
            name: garden.name,
            locationType: garden.locationType,
            locationDetail: garden.locationDetail || null,
            description: garden.description || null,
            locationSource: garden.locationSource ?? null,
            provinceCode: garden.provinceCode ?? null,
            latitude: garden.latitude ?? null,
            longitude: garden.longitude ?? null,
          },
        });
        setGardens((items) => [mapGarden(created), ...items]);
        return created.id;
      }
      throw new Error('Cần đăng nhập và kết nối máy chủ để tạo khu vườn.');
    },
    updateGarden: async (id, garden) => {
      if (!isApiConfigured || !accessToken) throw new Error('Cần đăng nhập và kết nối máy chủ để cập nhật khu vườn.');
      const updated = await updateGardenApi(id, accessToken, {
        name: garden.name,
        locationType: garden.locationType,
        locationDetail: garden.locationDetail || null,
        description: garden.description || null,
        locationSource: garden.locationSource ?? null,
        provinceCode: garden.provinceCode ?? null,
        latitude: garden.latitude ?? null,
        longitude: garden.longitude ?? null,
      });
      setGardens((items) => items.map((item) => (item.id === id ? mapGarden(updated) : item)));
    },
    updateGardenPhoto: async (id, photo) => {
      if (!isApiConfigured || !accessToken) throw new Error('Cần đăng nhập và kết nối máy chủ để tải ảnh lên.');
      await uploadGardenPhoto(id, accessToken, photo);
      await refresh();
    },
    removeGardenPhoto: async (id) => {
      if (!isApiConfigured || !accessToken) throw new Error('Cần đăng nhập và kết nối máy chủ để xóa ảnh.');
      await deleteGardenPhoto(id, accessToken);
      await refresh();
    },
    removeGarden: async (id) => {
      if (!isApiConfigured || !accessToken) throw new Error('Cần đăng nhập và kết nối máy chủ để xóa khu vườn.');
      await apiRequest<void>(`/api/v1/gardens/${id}`, { method: 'DELETE', token: accessToken });
      setGardens((items) => items.filter((item) => item.id !== id));
      setOwnedPlants((items) => items.map((item) => item.gardenId === id ? { ...item, gardenId: null } : item));
    },
    toggleFavorite: async (catalogId) => {
      const isFavorite = favorites.includes(catalogId);
      try {
        if (!isApiConfigured || !accessToken) throw new Error('Cần đăng nhập và kết nối máy chủ để lưu cây yêu thích.');
        await apiRequest<void>(`/api/v1/catalog/plants/${catalogId}/favorite`, { method: isFavorite ? 'DELETE' : 'POST', token: accessToken });
        setFavorites((items) => isFavorite ? items.filter((id) => id !== catalogId) : [...items, catalogId]);
        setApiError('');
      } catch (error) {
        setApiError(error instanceof Error ? error.message : 'Không thể cập nhật danh sách yêu thích.');
      }
    },
  }), [catalog, ownedPlants, gardens, favorites, isLoading, apiError, accessToken, refresh, filterStates, setFilterState]);

  return <PlantDataContext.Provider value={value}>{children}</PlantDataContext.Provider>;
}

export function usePlantData() {
  const context = useContext(PlantDataContext);
  if (!context) throw new Error('usePlantData must be used inside PlantDataProvider');
  return context;
}
