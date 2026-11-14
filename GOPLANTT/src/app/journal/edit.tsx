import { useLocalSearchParams } from 'expo-router';
import { EditJournalScreen } from '@/features/journal/JournalScreens';

export default function EditJournalPage() {
  const { journalId } = useLocalSearchParams<{ journalId?: string }>();
  return <EditJournalScreen journalId={journalId} />;
}
