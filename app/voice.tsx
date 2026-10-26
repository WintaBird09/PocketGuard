import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import { useDateOverrideRevision } from '@/src/domain/useDateOverrideRevision';
import { Banner, Button } from '@/src/ui/controls';
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
import { parseVoiceTranscript } from '@/src/voice/parser';
import { VoiceConfirmCard } from '@/src/voice/VoiceConfirmCard';
import type { ParseExpenseItem, ParseExpenseResponse } from '@/src/voice/contract';
import { listExpenseLines } from '@/src/data/transaction-entry';

export default function VoiceScreen() {
  const { db, householdId, loading, error: databaseError, refresh } = useDatabase();
  useDateOverrideRevision();
  const month = monthKeyForDate(effectiveNow(), 'Africa/Douala');
  const [speech, setSpeech] = useState<SpeechRecognitionSnapshot>(getSpeechRecognitionSnapshot());
  const [transcript, setTranscript] = useState('');
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
    [db, householdId, refresh],
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
      {speech.status === 'listening' ? (
        <Banner tone="info">Listening… Speak clearly, then tap Stop.</Banner>
      ) : null}
      {speech.status === 'stopping' ? <Banner tone="info">Finishing transcription…</Banner> : null}

      <View className="rounded-2xl border border-slate-200 bg-white p-5">
        <Text className="text-base font-bold text-slate-900">Say a transaction or question</Text>
        <Text className="mt-1 text-sm text-slate-600">
          Examples: “Spent 20,000 on fuel”, “Can I spend 30,000 on fuel?”, or “I saved 92,000 for
          the kids”.
        </Text>
        <View className="mt-4">
          <Button
            label={
              speech.status === 'listening' || speech.status === 'stopping'
                ? 'Stop recording'
                : 'Start voice capture'
            }
            onPress={() => void toggleRecording()}
            disabled={parsing}
          />
        </View>
        <Text className="mb-1 mt-4 text-sm font-medium text-slate-700">Transcript</Text>
        <TextInput
          accessibilityLabel="Voice transcript"
          multiline
          value={transcript}
          onChangeText={setTranscript}
          placeholder="Your speech or typed phrase appears here"
          className="min-h-24 rounded-xl border border-slate-200 px-3 py-3 text-base"
        />
        <View className="mt-3">
          <Button
            label={parsing ? 'Parsing…' : 'Parse transcript'}
            onPress={() => void parseTranscript(transcript)}
            disabled={parsing || !transcript.trim()}
          />
        </View>
        <Text className="mt-3 text-xs text-slate-500">
          Speech transcription may work offline when English is installed on your device. Parsing
          requires an internet connection and sign-in. Failed parses are saved in Inbox.
        </Text>
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
