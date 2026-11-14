import { useLocalSearchParams } from 'expo-router';
import { ScheduleDetailScreen } from '@/features/schedule/ScheduleScreens';

export default function ScheduleDetailPage() {
  const { scheduleId } = useLocalSearchParams<{ scheduleId?: string }>();
  return <ScheduleDetailScreen scheduleId={scheduleId} />;
}
