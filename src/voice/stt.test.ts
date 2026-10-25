import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import {
  abortSpeechRecognition,
  getSpeechRecognitionSnapshot,
  startSpeechRecognition,
  stopSpeechRecognition,
  subscribeSpeechRecognition,
  supportsOnDeviceSpeechRecognition,
} from './stt';

const { listeners } = vi.hoisted(() => ({
  listeners: new Map<string, (event: never) => void>(),
}));
const moduleMock = vi.mocked(ExpoSpeechRecognitionModule);

vi.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    addListener: vi.fn((event: string, listener: (value: never) => void) => {
      listeners.set(event, listener);
      return { remove: vi.fn() };
    }),
    isRecognitionAvailable: vi.fn(() => true),
    supportsOnDeviceRecognition: vi.fn(() => true),
    getSupportedLocales: vi.fn(async () => ({ locales: ['en-US'], installedLocales: ['en-US'] })),
    requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
  },
}));

function emit(event: string, payload?: unknown): void {
  listeners.get(event)?.(payload as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  moduleMock.isRecognitionAvailable.mockReturnValue(true);
  moduleMock.supportsOnDeviceRecognition.mockReturnValue(true);
  moduleMock.getSupportedLocales.mockResolvedValue({
    locales: ['en-US'],
    installedLocales: ['en-US'],
  });
  moduleMock.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
  emit('end');
});

describe('speech-to-text wrapper', () => {
  it('requests permission and starts English interim recognition preferring on-device mode', async () => {
    await startSpeechRecognition();

    expect(moduleMock.requestPermissionsAsync).toHaveBeenCalledOnce();
    expect(moduleMock.start).toHaveBeenCalledWith({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: true,
    });
    expect(getSpeechRecognitionSnapshot()).toMatchObject({ status: 'listening', transcript: '' });
  });

  it('streams partial transcripts and stops cleanly', async () => {
    const updates: string[] = [];
    const subscription = subscribeSpeechRecognition((next) => updates.push(next.transcript));
    await startSpeechRecognition();
    emit('start');
    emit('result', { results: [{ transcript: 'twenty thousand on fuel' }], isFinal: false });

    expect(getSpeechRecognitionSnapshot()).toMatchObject({
      status: 'listening',
      transcript: 'twenty thousand on fuel',
    });
    expect(updates).toContain('twenty thousand on fuel');

    stopSpeechRecognition();
    expect(moduleMock.stop).toHaveBeenCalledOnce();
    expect(getSpeechRecognitionSnapshot().status).toBe('stopping');
    emit('end');
    expect(getSpeechRecognitionSnapshot().status).toBe('idle');
    subscription.remove();
  });

  it('does not start without permission and publishes the explicit denial', async () => {
    moduleMock.requestPermissionsAsync.mockResolvedValue({ granted: false } as never);

    await expect(startSpeechRecognition()).rejects.toThrow('permissions are required');
    expect(moduleMock.start).not.toHaveBeenCalled();
    expect(getSpeechRecognitionSnapshot()).toMatchObject({
      status: 'error',
      error: 'Microphone and speech recognition permissions are required for voice entry.',
    });
  });

  it('reports unavailable recognition and forwards native errors', async () => {
    moduleMock.isRecognitionAvailable.mockReturnValue(false);
    await expect(startSpeechRecognition()).rejects.toThrow('not available');
    expect(moduleMock.requestPermissionsAsync).not.toHaveBeenCalled();

    moduleMock.isRecognitionAvailable.mockReturnValue(true);
    await startSpeechRecognition();
    emit('error', { error: 'network', message: 'Recognizer network failed.' });
    expect(getSpeechRecognitionSnapshot()).toMatchObject({
      status: 'error',
      error: 'Recognizer network failed.',
    });
  });

  it('exposes whether this device supports on-device recognition and allows abort', async () => {
    expect(supportsOnDeviceSpeechRecognition()).toBe(true);
    await startSpeechRecognition();
    abortSpeechRecognition();
    expect(moduleMock.abort).toHaveBeenCalledOnce();
    expect(getSpeechRecognitionSnapshot().status).toBe('idle');
  });

  it('allows network recognition when the English offline model is not installed', async () => {
    moduleMock.getSupportedLocales.mockResolvedValue({
      locales: ['en-US'],
      installedLocales: [],
    });

    await startSpeechRecognition();

    expect(moduleMock.start).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: false }),
    );
  });
});
