'use client';

import { useEffect } from 'react';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

const SAMPLE_RATE = 0.1; // 10% to limit log noise

function sendVitals(payload: {
  name: string;
  value: number;
  rating?: string;
  delta?: number;
  id?: string;
  navigationType?: string;
  pathname: string;
}) {
  const body = JSON.stringify(payload);
  const sent = navigator.sendBeacon?.('/api/vitals', body);
  if (!sent) {
    fetch('/api/vitals', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {});
  }
}

export function VitalsReporter() {
  useEffect(() => {
    const isProd = process.env.NODE_ENV === 'production';
    const vitalsEnabled = process.env.NEXT_PUBLIC_VITALS === '1';
    if (!isProd || !vitalsEnabled) return;

    if (Math.random() > SAMPLE_RATE) return;

    const handler = (metric: {
      name: string;
      value: number;
      rating?: string;
      delta: number;
      id: string;
      navigationType?: string;
    }) => {
      const pathname =
        typeof window !== 'undefined' ? window.location.pathname : '/';
      sendVitals({
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        id: metric.id,
        navigationType: metric.navigationType,
        pathname,
      });
    };

    onLCP(handler);
    onINP(handler);
    onCLS(handler);
    onFCP(handler);
    onTTFB(handler);
  }, []);

  return null;
}
