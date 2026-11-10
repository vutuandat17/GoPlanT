import { Pressable, StyleSheet, Text } from '@/components/app-primitives';
import { router } from 'expo-router';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/AuthSession';

export function AccountButton({ size = 32 }: { size?: number }) {
  const { user } = useAuthSession();
  const initial = user?.name.trim().charAt(0).toLocaleUpperCase() || 'G';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mở tài khoản ${user?.name ?? 'GoPlant'}`}
      onPress={() => router.push('/account' as never)}
      style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={s.avatarText}>{initial}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  avatar: { backgroundColor: '#C7D9CC', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.forest, fontFamily: F.bold, fontSize: 14 },
});
