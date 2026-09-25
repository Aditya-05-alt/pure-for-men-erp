import { NextResponse } from 'next/server';
import { runVdpFiltration } from '@/lib/pipeline/pipelineRpc';
import { requireAdminPipeline } from '@/lib/pipeline/pipelineAuth';

export const maxDuration = 120;

export async function POST(request) {
  const auth = await requireAdminPipeline();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const clientId = String(body.clientId || '').trim();
  const from = String(body.from || '').slice(0, 10);
  const to = String(body.to || '').slice(0, 10);

  if (!clientId) {
    return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
  }
  if (!from || !to) {
    return NextResponse.json({ error: 'Missing from or to date' }, { status: 400 });
  }

  try {
    const result = await runVdpFiltration(auth.supabase, clientId, { from, to });
    return NextResponse.json({ step: 2, table: 'smart_ga4_page_data', ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Filtration failed' },
      { status: 500 }
    );
  }
}
