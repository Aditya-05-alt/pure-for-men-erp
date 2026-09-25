import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import {
  fetchPipelineFullStats,
  fetchPipelineViewsStats,
  fetchPipelineWorkflowStats,
} from '@/lib/pipeline/pipelineStats';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';

export async function GET(request) {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim();
  const fromRaw = searchParams.get('from');
  const toRaw = searchParams.get('to');
  const scope = (searchParams.get('scope') || 'workflow').trim().toLowerCase();

  if (!clientId || !fromRaw || !toRaw) {
    return NextResponse.json({ error: 'Missing clientId, from, or to' }, { status: 400 });
  }

  const admin = createAdminDataClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase not configured.' }, { status: 503 });
  }

  const { supabase } = admin;

  let result;
  if (scope === 'views') {
    result = await fetchPipelineViewsStats(supabase, clientId, fromRaw, toRaw);
  } else if (scope === 'full') {
    result = await fetchPipelineFullStats(supabase, clientId, fromRaw, toRaw);
  } else {
    result = await fetchPipelineWorkflowStats(supabase, clientId, fromRaw, toRaw);
  }

  if (result.status !== 200) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.body);
}
