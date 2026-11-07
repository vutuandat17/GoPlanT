import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/AuthSession';

export function AccountButton({ size = 32 }: { size?: number }) {
  const { user, signOut } = useAuthSession();
  const initial = user?.name.trim().charAt(0).toLocaleUpperCase() || 'G';

  const confirmSignOut = () => Alert.alert('Đăng xuất', 'Bạn muốn kết thúc phiên demo hiện tại?', [
    { text: 'Hủy', style: 'cancel' },
    {
      text: 'Đăng xuất',
      style: 'destructive',
      onPress: () => {
        signOut();
        router.replace('/auth/login');
      },
    },
  ]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tài khoản ${user?.name ?? 'GoPlant'}. Đăng xuất`}
      onPress={confirmSignOut}
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
