import { useEffect, useRef, useState } from 'react';

const NATIVE_PERMISSION_RESULT_EVENT = 'opict-microphone-permission';

type NativeMicrophoneBridge = {
  requestMicrophonePermission: () => void;
  setTheme?: (dark: boolean) => void;
};

declare global {
  interface Window {
    opictAndroid?: NativeMicrophoneBridge;
  }
}

export function requestNativeMicrophonePermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.opictAndroid?.requestMicrophonePermission) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const onResult = (event: Event) => {
      window.removeEventListener(NATIVE_PERMISSION_RESULT_EVENT, onResult);
      const granted = (event as CustomEvent<{ granted?: boolean }>).detail?.granted === true;
      resolve(granted);
    };
    window.addEventListener(NATIVE_PERMISSION_RESULT_EVENT, onResult);
    try {
      window.opictAndroid?.requestMicrophonePermission();
    } catch {
      window.removeEventListener(NATIVE_PERMISSION_RESULT_EVENT, onResult);
      resolve(false);
    }
  });
}

// Preference order: opus in webm is the best-supported combo across desktop
// Chrome/Firefox/Edge; ogg/opus and plain webm are fallbacks for browsers
// that support MediaRecorder but not that exact mime string.
const CANDIDATE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  return CANDIDATE_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const mimeType = useRef<string>('audio/webm');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timer.current != null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  // Safety net: if the component unmounts mid-recording, release the mic
  // rather than leaving the stream open in the background.
  useEffect(() => {
    return () => {
      stopTimer();
      rec.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = async () => {
    setError(null);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('이 브라우저에서는 녹음을 지원하지 않습니다.');
      throw new Error('MediaRecorder not supported');
    }

    let stream: MediaStream;
    if (!(await requestNativeMicrophonePermission())) {
      setError('마이크 사용 권한이 필요합니다.');
      throw new Error('microphone permission denied');
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('마이크 사용 권한이 필요합니다.');
      throw new Error('microphone permission denied');
    }

    const supported = pickMimeType();
    mimeType.current = supported ?? 'audio/webm';
    chunks.current = [];
    try {
      rec.current = supported ? new MediaRecorder(stream, { mimeType: supported }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError('녹음을 시작할 수 없습니다.');
      throw new Error('MediaRecorder construction failed');
    }
    rec.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    rec.current.start();
    setRecording(true);
    setElapsedSec(0);
    timer.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
  };

  const stop = (): Promise<Blob> => {
    stopTimer();
    const active = rec.current;
    // Calling stop() when nothing is recording (double-click, stray call)
    // must be safe rather than throwing on a null ref.
    if (!active || active.state === 'inactive') {
      setRecording(false);
      return Promise.resolve(new Blob(chunks.current, { type: mimeType.current }));
    }
    return new Promise<Blob>((resolve) => {
      active.onstop = () => {
        active.stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        resolve(new Blob(chunks.current, { type: mimeType.current }));
      };
      active.stop();
    });
  };

  return { recording, start, stop, elapsedSec, error };
}
