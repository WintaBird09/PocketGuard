import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

export type SpeechRecognitionStatus = 'idle' | 'listening' | 'stopping' | 'error';
export type SpeechRecognitionSnapshot = {
  status: SpeechRecognitionStatus;
  transcript: string;
  error: string | null;
};

export type SpeechRecognitionListener = (snapshot: SpeechRecognitionSnapshot) => void;
export type SpeechRecognitionSubscription = { remove: () => void };

const initialSnapshot: SpeechRecognitionSnapshot = {
  status: 'idle',
  transcript: '',
  error: null,
};

const listeners = new Set<SpeechRecognitionListener>();
let snapshot = initialSnapshot;
let active = false;
let starting = false;

function publish(next: SpeechRecognitionSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener(snapshot);
}

function onStart(): void {
  active = true;
  starting = false;
  publish({ status: 'listening', transcript: snapshot.transcript, error: null });
}

function onEnd(): void {
  active = false;
  starting = false;
  publish({ status: 'idle', transcript: snapshot.transcript, error: null });
}

function onResult(event: ExpoSpeechRecognitionResultEvent): void {
  const transcript = event.results[0]?.transcript?.trim() ?? '';
  publish({
    status:
      active || starting ? (snapshot.status === 'stopping' ? 'stopping' : 'listening') : 'idle',
    transcript,
    error: null,
  });
}

function onError(event: ExpoSpeechRecognitionErrorEvent): void {
  active = false;
  starting = false;
  publish({
    status: 'error',
    transcript: snapshot.transcript,
    error: event.message || `Speech recognition failed (${event.error}).`,
  });
}

ExpoSpeechRecognitionModule.addListener('start', onStart);
ExpoSpeechRecognitionModule.addListener('end', onEnd);
ExpoSpeechRecognitionModule.addListener('result', onResult);
ExpoSpeechRecognitionModule.addListener('error', onError);

export function getSpeechRecognitionSnapshot(): SpeechRecognitionSnapshot {
  return snapshot;
}

export function subscribeSpeechRecognition(
  listener: SpeechRecognitionListener,
): SpeechRecognitionSubscription {
  listeners.add(listener);
  listener(snapshot);
  return { remove: () => listeners.delete(listener) };
}

export async function startSpeechRecognition(): Promise<void> {
  if (active || starting) return;
  if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
    const error = 'Speech recognition is not available on this device.';
    publish({ status: 'error', transcript: '', error });
    throw new Error(error);
  }

  starting = true;
  publish({ status: 'listening', transcript: '', error: null });
  try {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        'Microphone and speech recognition permissions are required for voice entry.',
      );
    }
    const locales = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
      ? await ExpoSpeechRecognitionModule.getSupportedLocales({})
      : { installedLocales: [] };
    const hasInstalledEnglish =
      locales.installedLocales.some((locale) => locale.toLowerCase() === 'en-us') ||
      locales.installedLocales.some((locale) => locale.toLowerCase() === 'en');

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: hasInstalledEnglish,
    });
  } catch (cause) {
    starting = false;
    const error = cause instanceof Error ? cause.message : 'Unable to start speech recognition.';
    publish({ status: 'error', transcript: '', error });
    throw cause instanceof Error ? cause : new Error(error);
  }
}

export function stopSpeechRecognition(): void {
  if (!active && !starting) return;
  publish({ ...snapshot, status: 'stopping' });
  ExpoSpeechRecognitionModule.stop();
}

export function abortSpeechRecognition(): void {
  if (!active && !starting) return;
  starting = false;
  active = false;
  ExpoSpeechRecognitionModule.abort();
  publish({ ...snapshot, status: 'idle' });
}

export function supportsOnDeviceSpeechRecognition(): boolean {
  return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
}
