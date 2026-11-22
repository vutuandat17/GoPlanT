import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { Alert } from '@/components/app-primitives';

export type PickedOptimizedImage = {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize?: number;
};

type PickImageOptions = {
  aspect?: [number, number];
  maxWidth?: number;
  quality?: number;
  title?: string;
};

async function optimizeImageAsset(
  asset: ImagePicker.ImagePickerAsset,
  maxWidth: number,
  quality: number,
): Promise<PickedOptimizedImage> {
  const baseName = asset.fileName?.replace(/\.[^/.]+$/, '') || 'photo';
  try {
    const actions: ImageManipulator.Action[] =
      asset.width && asset.width > maxWidth ? [{ resize: { width: maxWidth } }] : [];
    const manipulated = await ImageManipulator.manipulateAsync(asset.uri, actions, {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return {
      uri: manipulated.uri,
      mimeType: 'image/jpeg',
      fileName: `${baseName}.jpg`,
    };
  } catch {
    return {
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      fileName: asset.fileName ?? `${baseName}.jpg`,
      fileSize: asset.fileSize,
    };
  }
}

async function launchSource(
  source: 'camera' | 'library',
  aspect?: [number, number],
): Promise<ImagePicker.ImagePickerAsset | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần quyền camera', 'Hãy cấp quyền sử dụng camera để chụp ảnh mới.');
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: Boolean(aspect),
      aspect,
      quality: 0.9,
    });
    return result.canceled || !result.assets[0] ? null : result.assets[0];
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Cần quyền truy cập ảnh', 'Hãy cấp quyền thư viện ảnh để chọn hình.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: Boolean(aspect),
    aspect,
    quality: 0.9,
  });
  return result.canceled || !result.assets[0] ? null : result.assets[0];
}

/**
 * Prompts the user to take a photo or pick one from the library (on Native; library directly on Web),
 * then resizes & compresses it to a lightweight JPEG before uploading.
 */
export async function pickOrCaptureOptimizedImage(
  options: PickImageOptions = {},
): Promise<PickedOptimizedImage | null> {
  const { aspect, maxWidth = 1600, quality = 0.8, title = 'Chọn nguồn ảnh' } = options;

  if (Platform.OS === 'web') {
    const asset = await launchSource('library', aspect);
    return asset ? optimizeImageAsset(asset, maxWidth, quality) : null;
  }

  const source = await new Promise<'camera' | 'library' | null>((resolve) => {
    let settled = false;
    const finish = (choice: 'camera' | 'library' | null) => {
      if (settled) return;
      settled = true;
      resolve(choice);
    };
    Alert.alert(title, 'Bạn muốn chụp ảnh mới hay chọn từ thư viện?', [
      { text: 'Chụp ảnh mới', onPress: () => finish('camera') },
      { text: 'Chọn từ thư viện', onPress: () => finish('library') },
      { text: 'Hủy', style: 'cancel', onPress: () => finish(null) },
    ]);
  });

  if (!source) return null;
  const asset = await launchSource(source, aspect);
  return asset ? optimizeImageAsset(asset, maxWidth, quality) : null;
}
