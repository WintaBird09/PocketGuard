import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { effectiveNow, localDateString, monthKeyForDate } from '@/src/domain/dates';
import { useDateOverrideRevision } from '@/src/domain/useDateOverrideRevision';
import { Banner, Button } from '@/src/ui/controls';
import { MicButton } from '@/src/ui/MicButton';
import { PageLayout } from '@/src/ui/PageLayout';
import { useDatabase } from '@/src/ui/useDatabase';
import {
  getSpeechRecognitionSnapshot,
  startSpeechRecognition,
  stopSpeechRecognition,
  subscribeSpeechRecognition,
  type SpeechRecognitionSnapshot,
} from '@/src/voice/stt';
import { createVoiceDraft, saveVoiceDraftParse } from '@/src/voice/drafts';
import { listPendingVoiceSavingsCommitments } from '@/src/voice/commitments';
import { localExpenseItem } from '@/src/voice/localParse';
import { parseVoiceTranscript } from '@/src/voice/parser';
import { VoiceConfirmCard } from '@/src/voice/VoiceConfirmCard';
import type { ParseExpenseItem, ParseExpenseResponse } from '@/src/voice/contract';
import { listExpenseLines } from '@/src/data/transaction-entry';

export default function VoiceScreen() {
  const { db, householdId, loading, error: databaseError, refresh } = useDatabase();
  useDateOverrideRevision();
  const month = monthKeyForDate(effectiveNow(), 'Africa/Douala');
  const [speech, setSpeech] = useState<SpeechRecognitionSnapshot>(getSpeechRecognitionSnapshot());
  const params = useLocalSearchParams<{ autostart?: string; transcript?: string }>();
  const [transcript, setTranscript] = useState(
    typeof params.transcript === 'string' ? params.transcript : '',
  );
  const [items, setItems] = useState<ParseExpenseItem[]>([]);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const autoParseOnEnd = useRef(false);

  const reviewData = useMemo(() => {
    if (!db || !householdId) return { lines: [], commitments: [] };
    return {
      lines: listExpenseLines(db, householdId, month),
      commitments: listPendingVoiceSavingsCommitments(db, householdId, month),
    };
  }, [db, householdId, month]);

  const parseTranscript = useCallback(
    async (value: string) => {
      if (!db || !householdId) {
        setError('The local database is not ready yet.');
        return;
      }
      const normalized = value.trim();
      if (!normalized) {
        setError('Record or type a phrase before parsing.');
        return;
      }
      setError(null);
      setMessage(null);
      setParsing(true);
      let response: ParseExpenseResponse;
      try {
        response = await parseVoiceTranscript(db, householdId, normalized);
      } catch (cause) {
        const local = localExpenseItem(normalized, reviewData.lines, localDateString());
        if (local) {
          setItems([local]);
          setMessage(
            'Online understanding is unavailable, so this was read on your phone. Please check it.',
          );
          setParsing(false);
          return;
        }
        try {
          createVoiceDraft(db, householdId, normalized);
          setItems([]);
          setMessage('Parser unavailable. Your voice note is saved as a draft in Inbox.');
          refresh();
        } catch (saveCause) {
          setError(
            saveCause instanceof Error
              ? saveCause.message
              : cause instanceof Error
                ? cause.message
                : 'Unable to parse or save this voice note.',
          );
        } finally {
          setParsing(false);
        }
        return;
      }

      const unknownItems = response.items.filter((item) => item.intent === 'unknown');
      let unknownItemsSaved = unknownItems.length === 0;
      if (unknownItems.length > 0) {
        try {
          const draftId = createVoiceDraft(db, householdId, normalized);
          saveVoiceDraftParse(db, householdId, draftId, unknownItems);
          unknownItemsSaved = true;
          setMessage(
            'Some parts could not be interpreted. They are saved in Inbox for manual classification.',
          );
          refresh();
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : 'Unable to save unknown voice requests.',
          );
        }
      }
      setItems(
        unknownItemsSaved
          ? response.items.filter((item) => item.intent !== 'unknown')
          : response.items,
      );
      setParsing(false);
    },
    [db, householdId, refresh, reviewData.lines],
  );

  useEffect(() => {
    const subscription = subscribeSpeechRecognition((next) => {
      setSpeech(next);
      if (next.transcript) setTranscript(next.transcript);
      if (next.status === 'idle' && autoParseOnEnd.current && next.transcript.trim()) {
        autoParseOnEnd.current = false;
        void parseTranscript(next.transcript);
      }
      if (next.status === 'error') setError(next.error);
    });
    return () => subscription.remove();
  }, [parseTranscript]);

  const toggleRecording = async () => {
    setError(null);
    if (speech.status === 'listening' || speech.status === 'stopping') {
      stopSpeechRecognition();
      return;
    }
    autoParseOnEnd.current = true;
    try {
      await startSpeechRecognition();
    } catch (cause) {
      autoParseOnEnd.current = false;
      setError(cause instanceof Error ? cause.message : 'Unable to start speech recognition.');
    }
  };

  const autostarted = useRef(false);
  useEffect(() => {
    if (params.autostart !== '1' || autostarted.current || !db || !householdId) return;
    autostarted.current = true;
    autoParseOnEnd.current = true;
    startSpeechRecognition().catch((cause: unknown) => {
      autoParseOnEnd.current = false;
      setError(cause instanceof Error ? cause.message : 'Unable to start speech recognition.');
    });
  }, [params.autostart, db, householdId]);

  const listening = speech.status === 'listening';
  const stopping = speech.status === 'stopping';

  return (
    <PageLayout
      title="Voice entry"
      subtitle="Review every interpretation before it changes your budget"
      loading={loading}
      action={
        <Link
          href="/inbox"
          accessibilityLabel="Open voice draft inbox"
          className="rounded-xl border border-slate-200 bg-white px-3 py-3"
        >
          <Text className="font-semibold text-slate-800">Inbox</Text>
        </Link>
      }
    >
      {databaseError ? <Banner tone="error">{databaseError}</Banner> : null}
      {error || speech.error ? <Banner tone="error">{error ?? speech.error}</Banner> : null}
      {message ? <Banner tone="info">{message}</Banner> : null}
      <View className="items-center rounded-3xl bg-slate-900 px-5 pb-6 pt-4">
        <Text className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
          {listening ? 'Listening' : stopping ? 'Finishing' : parsing ? 'Understanding' : 'Ready'}
        </Text>
        <MicButton
          active={listening}
          busy={stopping || parsing}
          label={listening ? 'Stop recording' : 'Start voice capture'}
          onPress={() => void toggleRecording()}
        />
        <Text className="-mt-2 text-center text-base font-semibold text-white">
          {listening
            ? 'Speak now, tap to stop'
            : stopping
              ? 'Finishing transcription…'
              : parsing
                ? 'Working out what you said…'
                : 'Tap the mic and speak'}
        </Text>
        <View className="mt-4 min-h-16 w-full rounded-2xl bg-white/10 p-3">
          <Text className={`text-base ${transcript ? 'text-white' : 'text-slate-400'}`}>
            {transcript || 'What you say appears here'}
          </Text>
        </View>
      </View>

      <View className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <Text className="text-sm font-bold text-slate-900">Try saying</Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {[
            'Spent 20,000 on fuel',
            'Can I spend 30,000 on fuel?',
            'I saved 92,000 for the kids',
          ].map((example) => (
            <Pressable
              key={example}
              accessibilityRole="button"
              onPress={() => setTranscript(example)}
              className="rounded-full bg-slate-100 px-3 py-2"
            >
              <Text className="text-xs font-semibold text-slate-700">“{example}”</Text>
            </Pressable>
          ))}
        </View>

        <Text className="mb-1 mt-4 text-sm font-medium text-slate-700">Edit or type instead</Text>
        <TextInput
          accessibilityLabel="Voice transcript"
          multiline
          value={transcript}
          onChangeText={setTranscript}
          placeholder="Type a phrase if you prefer"
          className="min-h-20 rounded-xl border border-slate-200 px-3 py-3 text-base"
        />
        <View className="mt-3">
          <Button
            label={parsing ? 'Understanding…' : 'Review what I said'}
            onPress={() => void parseTranscript(transcript)}
            disabled={parsing || listening || stopping || !transcript.trim()}
          />
        </View>
        <View className="mt-3 flex-row items-start">
          <Ionicons name="information-circle" size={16} color="#94a3b8" />
          <Text className="ml-1 flex-1 text-xs text-slate-500">
            Speech may work offline if English is installed on your phone. Understanding it needs
            internet and sign-in. If that fails, your note is saved in Inbox.
          </Text>
        </View>
      </View>

      {items.length ? (
        <View className="mt-5">
          <Text className="mb-3 text-lg font-bold text-slate-900">
            Review {items.length === 1 ? 'this result' : `all ${items.length} results`}
          </Text>
          {items.map((item, index) => (
            <VoiceConfirmCard
              key={`${item.intent}-${index}`}
              item={item}
              lines={reviewData.lines}
              commitments={reviewData.commitments}
              db={db!}
              householdId={householdId}
              rawText={transcript}
              onDone={() => {
                setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
                refresh();
              }}
            />
          ))}
        </View>
      ) : null}
      <View className="mt-2">
        <Link href="/add-transaction" className="rounded-xl border border-slate-200 bg-white p-3">
          <Text className="text-center font-semibold text-slate-800">Add manually instead</Text>
        </Link>
      </View>
    </PageLayout>
  );
}
