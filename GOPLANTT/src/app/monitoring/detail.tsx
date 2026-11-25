import { useLocalSearchParams } from 'expo-router';
import MonitoringDetailScreen from '@/features/monitoring/MonitoringDetailScreen';

export default function MonitoringDetailPage() {
  const { type, plantId, gardenId, tab } = useLocalSearchParams<{
    type?: string;
    plantId?: string;
    gardenId?: string;
    tab?: string;
  }>();
  const routeKey = `${type ?? ''}:${plantId ?? ''}:${gardenId ?? ''}:${tab ?? ''}`;
  return <MonitoringDetailScreen key={routeKey} />;
}
