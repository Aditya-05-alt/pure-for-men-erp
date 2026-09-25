import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

function trimStr(v) {
  return String(v ?? '').trim();
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolve Google Ads account for a dealer GA4 client_id.
 * Primary: google_ads_accounts.customer_id == smart_ga4_config.client_id
 * Fallback: match ga4_property_id via smart_ga4_config
 */
async function resolveAdsAccount(supabase, clientId) {
  const byCustomer = await supabase
    .from('google_ads_accounts')
    .select(
      'customer_id, client_id, descriptive_name, currency_code, ga4_property_id, last_synced, sync_status'
    )
    .eq('customer_id', Number(clientId))
    .maybeSingle();

  if (byCustomer.error) throw new Error(byCustomer.error.message);
  if (byCustomer.data) return byCustomer.data;

  const byClientField = await supabase
    .from('google_ads_accounts')
    .select(
      'customer_id, client_id, descriptive_name, currency_code, ga4_property_id, last_synced, sync_status'
    )
    .eq('client_id', clientId)
    .maybeSingle();

  if (byClientField.error) throw new Error(byClientField.error.message);
  if (byClientField.data) return byClientField.data;

  const { data: ga4, error: ga4Error } = await supabase
    .from('smart_ga4_config')
    .select('client_id, account_name, ga4_property_id')
    .eq('client_id', clientId)
    .maybeSingle();

  if (ga4Error) throw new Error(ga4Error.message);
  const propertyId = trimStr(ga4?.ga4_property_id);
  if (!propertyId) return null;

  const byProp = await supabase
    .from('google_ads_accounts')
    .select(
      'customer_id, client_id, descriptive_name, currency_code, ga4_property_id, last_synced, sync_status'
    )
    .eq('ga4_property_id', propertyId)
    .maybeSingle();

  if (byProp.error) throw new Error(byProp.error.message);
  return byProp.data || null;
}

function mapCampaign(row) {
  return {
    campaign_id: row.campaign_id,
    name: row.name || '—',
    status: row.status || 'UNKNOWN',
    channel_type: row.channel_type || null,
    budget_amount: row.budget_amount != null ? Number(row.budget_amount) : null,
    budget_period: row.budget_period || null,
    bidding_strategy: row.bidding_strategy || null,
    report_from: row.report_from || null,
    report_to: row.report_to || null,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    cost: Number(row.cost) || 0,
    conversions: Number(row.conversions) || 0,
    ctr: row.ctr != null ? Number(row.ctr) : null,
    average_cpc: row.average_cpc != null ? Number(row.average_cpc) : null,
    last_synced_at: row.last_synced_at || null,
  };
}

/**
 * Dealer Google Ads campaigns from smart_campaign.
 * GET ?clientId=<smart_ga4_config.client_id / ga4CustomerId>
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = trimStr(searchParams.get('clientId'));
  const status = trimStr(searchParams.get('status'));
  const search = trimStr(searchParams.get('search'));

  if (!clientId) {
    return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server' },
      { status: 503 }
    );
  }

  try {
    const { data: ga4 } = await supabase
      .from('smart_ga4_config')
      .select('client_id, account_name, ga4_property_id')
      .eq('client_id', clientId)
      .maybeSingle();

    const account = await resolveAdsAccount(supabase, clientId);
    if (!account) {
      return NextResponse.json({
        ok: true,
        code: 'no_ads_account',
        clientId,
        ga4: ga4 || null,
        account: null,
        campaigns: [],
        totals: {
          campaigns: 0,
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
        },
      });
    }

    let query = supabase
      .from('smart_campaign')
      .select(
        'campaign_id, name, status, channel_type, budget_amount, budget_period, bidding_strategy, report_from, report_to, impressions, clicks, cost, conversions, ctr, average_cpc, last_synced_at'
      )
      .eq('customer_id', Number(account.customer_id))
      .order('cost', { ascending: false })
      .limit(2000);

    if (status && status !== 'all') {
      query = query.ilike('status', status);
    }
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,campaign_id.ilike.%${search}%,channel_type.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const campaigns = (data || []).map(mapCampaign);
    const totals = campaigns.reduce(
      (acc, c) => {
        acc.campaigns += 1;
        acc.impressions += c.impressions;
        acc.clicks += c.clicks;
        acc.cost += c.cost;
        acc.conversions += c.conversions;
        return acc;
      },
      { campaigns: 0, impressions: 0, clicks: 0, cost: 0, conversions: 0 }
    );
    totals.cost = Math.round(totals.cost * 100) / 100;
    totals.conversions = Math.round(totals.conversions * 100) / 100;

    return NextResponse.json({
      ok: true,
      code: campaigns.length ? 'ok' : 'no_campaigns',
      clientId,
      ga4: ga4 || null,
      account: {
        customer_id: String(account.customer_id),
        client_id: account.client_id,
        descriptive_name: account.descriptive_name,
        currency_code: account.currency_code,
        ga4_property_id: account.ga4_property_id,
        last_synced: account.last_synced,
        sync_status: account.sync_status,
      },
      campaigns,
      totals,
    });
  } catch (err) {
    console.error('[ads]', err);
    return NextResponse.json(
      { error: err?.message || 'Ads query failed' },
      { status: 500 }
    );
  }
}
