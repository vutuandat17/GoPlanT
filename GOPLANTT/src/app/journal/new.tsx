import { useLocalSearchParams } from 'expo-router';
import { NewJournalScreen } from '@/features/journal/JournalScreens';

export default function NewJournalPage() {
  const { plantId } = useLocalSearchParams<{ plantId?: string }>();
  return <NewJournalScreen initialPlantId={plantId} />;
}
