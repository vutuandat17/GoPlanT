import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';

export function AppTopBar({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Image source={require('@/assets/images/figma/welcome/logo.jpeg')} style={styles.logo} contentFit="cover" />
        <View>
          <Text style={styles.brandName}>GoPlant</Text>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
      </View>
      <View style={styles.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Thông báo" onPress={() => Alert.alert('Bản xem trước', 'Thông báo sẽ được triển khai ở đợt tiếp theo.')} style={styles.iconButton}>
          <Text style={styles.headerIcon}>♧</Text>
        </Pressable>
        <View style={styles.avatar}><Text style={styles.avatarText}>G</Text></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { width: '100%', maxWidth: 760, height: 56, paddingHorizontal: 16, alignSelf: 'center', backgroundColor: C.background, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2EBE4' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 30, height: 30, borderRadius: 5 },
  brandName: { color: C.secondaryText, fontFamily: F.regular, fontSize: 12, lineHeight: 16 },
  headerTitle: { color: C.forest, fontFamily: F.semiBold, fontSize: 14, lineHeight: 20 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { color: C.secondaryText, fontSize: 22 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#C7D9CC', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.forest, fontFamily: F.bold, fontSize: 14 },
});
