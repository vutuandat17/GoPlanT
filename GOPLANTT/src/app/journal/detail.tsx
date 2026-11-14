import { useLocalSearchParams } from 'expo-router';
import { JournalDetailScreen } from '@/features/journal/JournalScreens';

export default function JournalDetailPage() {
  const { plantId } = useLocalSearchParams<{ plantId?: string }>();
  return <JournalDetailScreen plantId={plantId} />;
}
