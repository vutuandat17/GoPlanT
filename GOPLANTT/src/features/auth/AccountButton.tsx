import { Pressable } from '@/components/app-primitives';
import { router } from 'expo-router';

import { UserAvatar } from '@/components/UserAvatar';
import { GoPlantColors as C } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/AuthSession';
import { getMyAvatarUri } from '@/services/api';

export function AccountButton({ size = 32 }: { size?: number }) {
  const { user, accessToken } = useAuthSession();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mở tài khoản ${user?.name ?? 'GoPlant'}`}
      onPress={() => router.push('/account' as never)}
    >
      <UserAvatar
        name={user?.name}
        avatarUri={getMyAvatarUri(user?.avatarUpdatedAt)}
        accessToken={accessToken}
        size={size}
        backgroundColor="#C7D9CC"
        textColor={C.forest}
      />
    </Pressable>
  );
}
