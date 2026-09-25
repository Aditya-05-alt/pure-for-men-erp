'use client';

import { useEffect, useRef } from 'react';
import { logLine } from '@/lib/pipeline/syncLogFormat';

export { logLine };

/**
 * Expandable live sync log for a pipeline step.
 */
export default function PipelineSyncLog({
  step,
  busyStep,
  lines = [],
  forceOpen = false,
}) {
  const preRef = useRef(null);
  const live = busyStep === step;
  const open = forceOpen || live || lines.length > 0;

  useEffect(() => {
    if (live && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [lines, live]);

  return (
    <details className="pipeline-log-details pipeline-sync-log" open={open || undefined}>
      <summary className="pipeline-sync-log-summary">
        {live ? (
          <span className="pipeline-sync-log-live">
            <span className="pipeline-sync-log-dot" aria-hidden />
            Live sync log
          </span>
        ) : (
          'Sync log'
        )}
        {lines.length > 0 ? ` (${lines.length} lines)` : ''}
      </summary>
      <pre ref={preRef} className="pipeline-log-pre">
        {lines.length > 0 ? lines.join('\n') : live ? 'Starting…' : 'No log yet.'}
      </pre>
    </details>
  );
}
