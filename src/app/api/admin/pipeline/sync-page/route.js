import { NextResponse } from 'next/server';
import { coerceDateRange } from '@/lib/pipeline/dates';
import { syncGa4PageDataForDealer } from '@/lib/pipeline/ga4PageSync';
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

  const { from, to, dates } = coerceDateRange(body.from, body.to);
  if (!dates.length) {
    return NextResponse.json(
      { error: 'Invalid or empty date range — pick valid From and To dates.' },
      { status: 400 }
    );
  }

  try {
    const result = await syncGa4PageDataForDealer(auth.supabase, {
      clientId,
      dateFrom: from,
      dateTo: to,
    });

    return NextResponse.json({
      step: 1,
      table: 'smart_ga4_page_data',
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Page sync failed' },
      { status: 500 }
    );
  }
}
