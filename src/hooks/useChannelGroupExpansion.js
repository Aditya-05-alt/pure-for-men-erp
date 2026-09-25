import { useCallback, useState } from 'react';
import { CHANNEL_GROUP_KEYS } from '@/lib/ga4/channelGroups';

/** Track which channel group rollups are expanded (members visible). */
export function useChannelGroupExpansion(defaultExpanded = true) {
  const [expanded, setExpanded] = useState(() => {
    if (!defaultExpanded) return new Set();
    return new Set(CHANNEL_GROUP_KEYS);
  });

  const isExpanded = useCallback(
    (groupKey) => expanded.has(groupKey),
    [expanded]
  );

  const toggle = useCallback((groupKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  return { expanded, isExpanded, toggle };
}
