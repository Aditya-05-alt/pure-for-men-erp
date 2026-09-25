'use client';

import { useEffect, useState } from 'react';

/**
 * Soft percent while a single request is in flight (climbs toward 90%, then 100% on done).
 * Used by dealer Traffic / Inventory pages.
 */
export function useSoftLoadPercent(isBusy) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!isBusy) {
      setPercent(0);
      return undefined;
    }
    setPercent(5);
    const id = window.setInterval(() => {
      setPercent((p) => {
        if (p >= 90) return p;
        return Math.min(90, p + 3 + Math.random() * 5);
      });
    }, 280);
    return () => window.clearInterval(id);
  }, [isBusy]);

  if (!isBusy) return null;
  return Math.round(percent);
}
