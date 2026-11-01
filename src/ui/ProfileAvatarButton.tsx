import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/src/auth/AuthProvider';
import { getAvatarUri } from '@/src/auth/avatar';
import { getDisplayLabel, getInitials } from '@/src/auth/profile';

// Round profile picture (or initials) that opens the Profile screen.
export function ProfileAvatarButton({ size = 56 }: { size?: number }) {
  const router = useRouter();
  const { session } = useAuth();
  const user = session?.user;
  const [photo, setPhoto] = useState<{ uri: string | null; version: number }>({
    uri: null,
    version: 0,
  });

  // The photo can change on the Profile screen, so re-read it whenever this screen is focused.
  useFocusEffect(
    useCallback(() => {
      setPhoto((current) => ({ uri: getAvatarUri(user?.id), version: current.version + 1 }));
    }, [user?.id]),
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      onPress={() => router.push('/profile')}
      className="items-center justify-center overflow-hidden rounded-full border-2 border-white bg-emerald-600 shadow-sm"
      style={{ width: size, height: size }}
    >
      {photo.uri ? (
        <Image
          source={{ uri: `${photo.uri}?v=${photo.version}` }}
          style={{ width: size, height: size }}
        />
      ) : (
        <View className="items-center justify-center">
          <Text className="font-bold text-white" style={{ fontSize: size * 0.36 }}>
            {getInitials(getDisplayLabel(user))}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
