import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '@/src/auth/AuthProvider';
import { PageLayout } from '@/src/ui/PageLayout';

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_description?: string | string[];
  }>();
  const router = useRouter();
  const { exchangeCode } = useAuth();
  const [status, setStatus] = useState('Completing sign-in…');
  const [error, setError] = useState<string | null>(null);
  const processedCode = useRef<string | null>(null);
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const callbackError = Array.isArray(params.error_description)
    ? params.error_description[0]
    : params.error_description;
  const errorCode = Array.isArray(params.error) ? params.error[0] : params.error;
  const callbackMessage = callbackError || errorCode || null;

  useEffect(() => {
    let active = true;
    if (callbackMessage || !code) {
      return () => {
        active = false;
      };
    }

    if (processedCode.current === code) return;
    processedCode.current = code;

    void exchangeCode(code)
      .then(() => {
        if (!active) return;
        setStatus('Signed in. Your local app is ready.');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Unable to complete sign-in.');
      });

    return () => {
      active = false;
    };
  }, [callbackMessage, code, exchangeCode]);

  const visibleError =
    error ??
    callbackMessage ??
    (!code ? 'The sign-in link is missing its authorization code. Request a new link.' : null);

  return (
    <PageLayout title="Sign-in link" subtitle="Completing your Supabase sign-in">
      <View className="rounded-2xl border border-slate-200 bg-white p-5">
        <Text className={visibleError ? 'text-sm text-red-700' : 'text-sm text-slate-700'}>
          {visibleError ?? status}
        </Text>
        {visibleError ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/auth')}
            className="mt-4 rounded-xl bg-emerald-600 px-4 py-3"
          >
            <Text className="text-center font-bold text-white">Return to account</Text>
          </Pressable>
        ) : null}
      </View>
    </PageLayout>
  );
}
