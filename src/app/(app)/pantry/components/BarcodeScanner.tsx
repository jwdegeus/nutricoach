'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BrowserMultiFormatReader } from '@zxing/browser';

const SCAN_INTERVAL_MS = 150;
const BEEP_DURATION_MS = 150;
const BEEP_FREQ_HZ = 800;
const SUCCESS_COOLDOWN_MS = 2000;

function playBeep(): void {
  try {
    const ctx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = BEEP_FREQ_HZ;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      ctx.currentTime + BEEP_DURATION_MS / 1000,
    );
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + BEEP_DURATION_MS / 1000);
  } catch {
    // ignore if AudioContext not supported
  }
}

type BarcodeScannerProps = {
  onBarcode: (barcode: string) => void;
  onError?: (message: string) => void;
};

export function BarcodeScanner({ onBarcode, onError }: BarcodeScannerProps) {
  const t = useTranslations('pantry');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decodeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const lastSuccessRef = useRef<number>(0);
  const codeReader = useRef(new BrowserMultiFormatReader());

  const tryDecode = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    let canvas = decodeCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      decodeCanvasRef.current = canvas;
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);

    function isNoCodeError(err: unknown): boolean {
      if (err instanceof Error) {
        const msg = err.message ?? '';
        const name = err.name ?? '';
        return (
          name === 'NotFoundException' ||
          msg.includes('No MultiFormat Readers') ||
          msg.includes('detect the code')
        );
      }
      return false;
    }

    try {
      const result = codeReader.current.decodeFromCanvas(canvas);
      const text = result.getText()?.trim();
      if (!text) return;
      const now = Date.now();
      if (now - lastSuccessRef.current < SUCCESS_COOLDOWN_MS) return;
      lastSuccessRef.current = now;
      setSuccess(true);
      playBeep();
      onBarcode(text);
    } catch (err) {
      if (!isNoCodeError(err)) {
        console.error('Barcode decode error:', err);
      }
    }
  }, [onBarcode]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            void videoRef.current?.play().then(() => {
              if (!cancelled) {
                intervalId = setInterval(tryDecode, SCAN_INTERVAL_MS);
              }
            });
          };
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Camera error:', err);
        const msg = t('cameraError');
        setError(msg);
        onError?.(msg);
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [tryDecode, onError, t]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-black shadow-lg outline outline-1 -outline-offset-1 outline-white/10">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="block h-auto w-full object-cover"
        />

        {/* Scan frame (kader) */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 box-border h-[50%] w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-xl outline outline-2 outline-white/90"
          aria-hidden
        >
          {/* Animated scan line: red when scanning, green on success */}
          <div
            className={`absolute right-0 left-0 h-0.5 rounded-full shadow-lg ${
              success ? 'bg-green-500' : 'bg-red-500'
            } ${success ? '' : 'animate-scan-line'}`}
            style={
              success
                ? { top: '50%', transform: 'translateY(-50%)' }
                : undefined
            }
          />
        </div>
      </div>

      {error && (
        <p className="text-center text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p className="text-center text-sm font-medium text-green-600 dark:text-green-400">
          {t('barcodeFound')}
        </p>
      )}
      <p className="text-center text-xs text-muted-foreground">
        {t('scanAreaHint')}
      </p>
    </div>
  );
}
