'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { CLIENTS, TODAY } from '@/lib/vdp/mockData';
import { defaultChannels, defaultMapping } from '@/lib/vdp/mockData';

const VdpContext = createContext(null);

export function VdpProvider({ children }) {
  const [clientId, setClientId] = useState(CLIENTS[0].id);
  const [channels] = useState(() => defaultChannels());
  const [mapping] = useState(() => defaultMapping());

  const client = useMemo(
    () => CLIENTS.find((c) => c.id === clientId) || CLIENTS[0],
    [clientId]
  );

  const pickClient = useCallback((id) => {
    if (CLIENTS.some((c) => c.id === id)) setClientId(id);
  }, []);

  const asOfLabel = useMemo(
    () =>
      'Data as of ' +
      TODAY.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  const value = useMemo(
    () => ({
      clients: CLIENTS,
      clientId,
      client,
      pickClient,
      channels,
      mapping,
      asOfLabel,
    }),
    [clientId, client, pickClient, channels, mapping, asOfLabel]
  );

  return <VdpContext.Provider value={value}>{children}</VdpContext.Provider>;
}

export function useVdp() {
  const ctx = useContext(VdpContext);
  if (!ctx) throw new Error('useVdp must be used within VdpProvider');
  return ctx;
}
