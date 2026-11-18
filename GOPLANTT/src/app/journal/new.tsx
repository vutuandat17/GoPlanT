import { useLocalSearchParams } from 'expo-router';
import { NewJournalScreen } from '@/features/journal/JournalScreens';
import type { JournalLogType } from '@/services/api';

export default function NewJournalPage() {
  const { plantId, careTaskId, logType } = useLocalSearchParams<{
    plantId?: string;
    careTaskId?: string;
    logType?: JournalLogType;
  }>();
  return <NewJournalScreen initialPlantId={plantId} careTaskId={careTaskId} initialLogType={logType} />;
}
