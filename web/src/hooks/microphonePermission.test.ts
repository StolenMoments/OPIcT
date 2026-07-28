import { afterEach, describe, expect, it, vi } from 'vitest';
import * as recorder from './useRecorder';

const BRIDGE_NAME = 'opictAndroid';
const RESULT_EVENT = 'opict-microphone-permission';

describe('native microphone permission bridge', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, BRIDGE_NAME);
  });

  it('exposes a permission handshake for the Android shell', () => {
    expect(typeof recorder.requestNativeMicrophonePermission).toBe('function');
  });

  it('continues immediately when the app is running in a regular browser', async () => {
    expect(await recorder.requestNativeMicrophonePermission()).toBe(true);
  });

  it('waits for the native result before resolving', async () => {
    const requestMicrophonePermission = vi.fn(() => {
      window.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: { granted: true } }));
    });
    Object.defineProperty(window, BRIDGE_NAME, {
      configurable: true,
      value: { requestMicrophonePermission },
    });

    const granted = await recorder.requestNativeMicrophonePermission();

    expect(requestMicrophonePermission).toHaveBeenCalledOnce();
    expect(granted).toBe(true);
  });

  it('returns false when Android reports that permission was denied', async () => {
    Object.defineProperty(window, BRIDGE_NAME, {
      configurable: true,
      value: {
        requestMicrophonePermission: () => {
          window.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: { granted: false } }));
        },
      },
    });

    expect(await recorder.requestNativeMicrophonePermission()).toBe(false);
  });
});
