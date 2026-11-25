import { useLocalSearchParams } from 'expo-router';
import { JournalDetailScreen } from '@/features/journal/JournalScreens';

export default function JournalDetailPage() {
  const { plantId, journalId, date } = useLocalSearchParams<{ plantId?: string; journalId?: string; date?: string }>();
  return <JournalDetailScreen plantId={plantId} journalId={journalId} initialDate={date} />;
}
