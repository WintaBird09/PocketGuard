import { File, Paths } from 'expo-file-system';

// The picture is kept on this device, one file per account, so it never inflates the sign-in token.
function avatarFile(userId: string): File {
  return new File(Paths.document, `avatar-${userId}.jpg`);
}

export function getAvatarUri(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const file = avatarFile(userId);
  return file.exists ? file.uri : null;
}

export function saveAvatar(userId: string, pickedUri: string): string {
  const target = avatarFile(userId);
  if (target.exists) target.delete();
  new File(pickedUri).copy(target);
  return target.uri;
}

export function removeAvatar(userId: string): void {
  const file = avatarFile(userId);
  if (file.exists) file.delete();
}
