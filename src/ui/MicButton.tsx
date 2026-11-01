import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

// Large round mic. While `active` two rings pulse outward so it is obvious the app is listening.
export function MicButton({
  active,
  busy = false,
  size = 88,
  onPress,
  label,
}: {
  active: boolean;
  busy?: boolean;
  size?: number;
  onPress: () => void;
  label: string;
}) {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const ring = (delay: number) => ({
    opacity: pulse.interpolate({
      inputRange: [0, delay, 1],
      outputRange: [0, 0.45, 0],
    }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
  });

  return (
    <View className="items-center justify-center" style={{ width: size * 2, height: size * 1.8 }}>
      {active ? (
        <>
          <Animated.View
            className="absolute rounded-full bg-red-400"
            style={[{ width: size, height: size }, ring(0.01)]}
          />
          <Animated.View
            className="absolute rounded-full bg-red-300"
            style={[{ width: size, height: size }, ring(0.5)]}
          />
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy}
        onPress={onPress}
        className={`items-center justify-center rounded-full shadow-lg ${
          active ? 'bg-red-600' : 'bg-emerald-600'
        } ${busy ? 'opacity-50' : ''}`}
        style={{ width: size, height: size, elevation: 8 }}
      >
        <Ionicons name={active ? 'stop' : 'mic'} size={size * 0.42} color="#ffffff" />
      </Pressable>
    </View>
  );
}
