'use client';

import { useEffect, useState } from 'react';
import { collectClientTelemetry } from '@/lib/telemetry/clientContext';

const FIELDS = [
  'session_id',
  'screen_resolution',
  'viewport',
  'timezone',
  'locale',
  'referrer',
  'page_url',
];

/** Hidden inputs carrying browser-only context into auth server actions. */
export default function ClientContextFields() {
  const [ctx, setCtx] = useState({});

  useEffect(() => {
    setCtx(collectClientTelemetry());
  }, []);

  return FIELDS.map((key) => (
    <input key={key} type="hidden" name={key} value={ctx[key] ?? ''} readOnly />
  ));
}
