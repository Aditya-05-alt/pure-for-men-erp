import { NextResponse } from 'next/server';
import { coerceDateRange } from '@/lib/pipeline/dates';
import { runFinalVdpSync } from '@/lib/pipeline/pipelineRpc';
import { requireAdminPipeline } from '@/lib/pipeline/pipelineAuth';

export const maxDuration = 300;

export async function POST(request) {
  const auth = await requireAdminPipeline();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const clientId = String(body.clientId || '').trim();

  if (!clientId) {
    return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
  }

  const { from, to } = coerceDateRange(body.from, body.to);
  if (!from || !to) {
    return NextResponse.json({ error: 'Missing or invalid from / to dates' }, { status: 400 });
  }

  try {
    const result = await runFinalVdpSync(auth.supabase, clientId, { from, to });
    return NextResponse.json({ step: 3, table: 'smart_final_data', ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Final VDP sync failed' },
      { status: 500 }
    );
  }
}
