import { Platform, Share } from 'react-native';

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
  await Share.share({ title: fileName, message: csv });
}
