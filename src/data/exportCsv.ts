import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function shareCsv(csv: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  if (!FileSystem.cacheDirectory) throw new Error('The export cache directory is unavailable.');
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is unavailable on this device.');
  }
  const path = `${FileSystem.cacheDirectory}${Date.now()}-${fileName}`;
  await FileSystem.writeAsStringAsync(path, csv);
  try {
    await Sharing.shareAsync(path, {
      dialogTitle: `Share ${fileName}`,
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    });
  } finally {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
}
