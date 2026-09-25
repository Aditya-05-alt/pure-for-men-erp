/**
 * PFM Google Ads sync — ONE PHASE PER INVOCATION (avoids WORKER_RESOURCE_LIMIT).
 *
 * Writes to pfm_google_ads_* tables.
 * Default dates: 2026-08-01 → 2026-08-31 (full August)
 * Tables: pfm_google_ads_campaign → pfm_google_ads_ad_group →
 *         pfm_google_ads_ad → pfm_google_ads_keyword
 * (+ optional totals / search_terms phases)
 *
 * Preferred (cron): POST { "mode": "auto" }
 *   Reads/writes pfm_google_ads_sync_state and runs the next phase only.
 *
 * Manual override:
 *   {
 *     "customer_id": "<from pfm_google_ads_accounts>",
 *     "phase": "campaigns" | "ad_groups" | "ads" | "keywords" | "totals" | "search_terms",
 *     "from": "YYYY-MM-DD",
 *     "to": "YYYY-MM-DD",
 *     "chunk_days": 2,
 *     "chunk_from": "YYYY-MM-DD",
 *     "reset": true   // with mode=auto, restart from campaigns
 *   }
 *
 * Secrets: google_developer_token, google_client_id, google_client_secret,
 *          google_refresh_token, google_login_customer_id
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";

const ACCOUNTS_TABLE = "pfm_google_ads_accounts";
const CAMPAIGN_TABLE = "pfm_google_ads_campaign";
const AD_GROUP_TABLE = "pfm_google_ads_ad_group";
const AD_TABLE = "pfm_google_ads_ad";
const KEYWORD_TABLE = "pfm_google_ads_keyword";
const SEARCH_TERM_TABLE = "pfm_google_ads_search_term";
const SYNC_STATE_TABLE = "pfm_google_ads_sync_state";
const SYNC_STATE_ID = "default";

const TEST_CUSTOMER_ID_ONLY = "";
const DEFAULT_MCC_ID = "5192794792";
const DEFAULT_REPORT_FROM = "2026-08-01";
const DEFAULT_REPORT_TO = "2026-08-31";
const UPSERT_CHUNK = 200;
const DEFAULT_SEARCH_TERM_CHUNK_DAYS = 2;

/** Entity pipeline only (no search_terms) — fills pfm_google_ads_campaign/ad_group/ad/keyword. */
const PHASE_ORDER = [
  "campaigns",
  "ad_groups",
  "ads",
  "keywords",
] as const;

const SYNC_PHASES = [
  "totals",
  "campaigns",
  "ad_groups",
  "ads",
  "keywords",
  "search_terms",
] as const;

type SyncPhase = (typeof SYNC_PHASES)[number];
type PipelinePhase = (typeof PHASE_ORDER)[number];

type SyncStateRow = {
  id: string;
  customer_id: number;
  report_from: string;
  report_to: string;
  phase: string;
  chunk_from: string | null;
  chunk_days: number;
  status: string;
  last_error: string | null;
  last_upserted: number | null;
  last_message: string | null;
  last_run_at: string | null;
};

function isSyncPhase(value: unknown): value is SyncPhase {
  return typeof value === "string" &&
    (SYNC_PHASES as readonly string[]).includes(value);
}

function isPipelinePhase(value: unknown): value is PipelinePhase {
  return typeof value === "string" &&
    (PHASE_ORDER as readonly string[]).includes(value);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AdsAccount = {
  customer_id: number | string;
  client_id: string | null;
  descriptive_name: string | null;
};

type AccountTotals = {
  impressions: number;
  clicks: number;
  interactions: number;
  cost: number;
  cost_micros: number;
  conversions: number;
  ctr: number | null;
  average_cpc: number | null;
};

type DailyTotal = {
  date: string;
  impressions: number;
  clicks: number;
  interactions: number;
  cost: number;
  cost_micros: number;
};

function isYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function envFirst(...keys: string[]): string {
  for (const key of keys) {
    const value = Deno.env.get(key);
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function microsToCurrency(micros: unknown): number {
  const n = Math.round(Number(micros) || 0);
  if (!Number.isFinite(n)) return 0;
  return n / 1_000_000;
}

function roundMoney2(amount: number): number {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

function asText(value: unknown): string {
  return value != null ? String(value) : "";
}

function asJsonArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((v) => String(v));
}

function rsaAssetTexts(assets: unknown): string[] | null {
  if (!Array.isArray(assets)) return null;
  const texts = assets
    .map((a) => {
      const row = a as Record<string, unknown>;
      return row.text != null ? String(row.text) : "";
    })
    .filter(Boolean);
  return texts.length ? texts : null;
}

function buildCustomerMetricsGaql(from: string, to: string): string {
  return `
SELECT
  segments.date,
  metrics.impressions,
  metrics.clicks,
  metrics.interactions,
  metrics.cost_micros,
  metrics.conversions,
  metrics.ctr,
  metrics.average_cpc
FROM customer
WHERE segments.date BETWEEN '${from}' AND '${to}'
`.trim();
}

function buildCampaignGaql(from: string, to: string): string {
  return `
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.bidding_strategy_type,
  campaign.optimization_score,
  campaign.geo_target_type_setting.positive_geo_target_type,
  campaign.geo_target_type_setting.negative_geo_target_type,
  campaign_budget.amount_micros,
  campaign_budget.period,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.ctr,
  metrics.average_cpc
FROM campaign
WHERE segments.date BETWEEN '${from}' AND '${to}'
`.trim();
}

function buildAdGroupGaql(from: string, to: string): string {
  return `
SELECT
  campaign.id,
  ad_group.id,
  ad_group.name,
  ad_group.status,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM ad_group
WHERE segments.date BETWEEN '${from}' AND '${to}'
`.trim();
}

function buildAdGaql(from: string, to: string): string {
  return `
SELECT
  campaign.id,
  ad_group.id,
  ad_group_ad.ad.id,
  ad_group_ad.ad.type,
  ad_group_ad.status,
  ad_group_ad.ad_strength,
  ad_group_ad.policy_summary.approval_status,
  ad_group_ad.ad.final_urls,
  ad_group_ad.ad.responsive_search_ad.headlines,
  ad_group_ad.ad.responsive_search_ad.descriptions,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM ad_group_ad
WHERE segments.date BETWEEN '${from}' AND '${to}'
`.trim();
}

function buildKeywordGaql(from: string, to: string): string {
  return `
SELECT
  campaign.id,
  ad_group.id,
  ad_group_criterion.criterion_id,
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  ad_group_criterion.status,
  ad_group_criterion.negative,
  ad_group_criterion.quality_info.quality_score,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.average_cpc
FROM keyword_view
WHERE segments.date BETWEEN '${from}' AND '${to}'
`.trim();
}

function buildSearchTermGaql(from: string, to: string): string {
  // Standard Search / Shopping search terms (excludes Performance Max).
  return `
SELECT
  segments.date,
  campaign.id,
  ad_group.id,
  search_term_view.search_term,
  search_term_view.status,
  search_term_view.resource_name,
  segments.keyword.info.match_type,
  segments.keyword.info.text,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM search_term_view
WHERE segments.date BETWEEN '${from}' AND '${to}'
`.trim();
}

function buildSearchTermGaqlSimple(from: string, to: string): string {
  // Fallback without keyword segments (max compatibility).
  return `
SELECT
  segments.date,
  campaign.id,
  ad_group.id,
  search_term_view.search_term,
  search_term_view.status,
  search_term_view.resource_name,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM search_term_view
WHERE segments.date BETWEEN '${from}' AND '${to}'
`.trim();
}

function buildCampaignSearchTermGaql(from: string, to: string): string {
  // Performance Max / campaign-level search terms.
  return `
SELECT
  segments.date,
  campaign.id,
  campaign_search_term_view.search_term,
  campaign_search_term_view.resource_name,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM campaign_search_term_view
WHERE segments.date BETWEEN '${from}' AND '${to}'
`.trim();
}

/** Parse campaign_id~ad_group_id from searchTermViews resource name. */
function parseSearchTermResourceIds(resourceName: unknown): {
  campaignId: string;
  adGroupId: string;
} {
  const raw = asText(resourceName);
  // customers/123/searchTermViews/111~222~base64term
  const adGroupView = raw.match(/searchTermViews\/([^~]+)~([^~]+)~/);
  if (adGroupView) {
    return { campaignId: adGroupView[1], adGroupId: adGroupView[2] };
  }
  // customers/123/campaignSearchTermViews/111~base64term (PMax)
  const campaignView = raw.match(/campaignSearchTermViews\/([^~]+)~/);
  if (campaignView) {
    return { campaignId: campaignView[1], adGroupId: "0" };
  }
  return { campaignId: "", adGroupId: "" };
}

async function readJsonResponse(
  res: Response,
  label: string,
): Promise<Record<string, unknown>> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`${label}: empty response (HTTP ${res.status})`);
  }
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    throw new Error(
      `${label}: got HTML instead of JSON (HTTP ${res.status}). ` +
        `Body: ${trimmed.slice(0, 160).replace(/\s+/g, " ")}`,
    );
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new Error(
      `${label}: invalid JSON (HTTP ${res.status}): ${trimmed.slice(0, 240)}`,
    );
  }
}

async function getGoogleAccessToken(): Promise<string> {
  const clientId = envFirst(
    "google_client_id",
    "GOOGLE_CLIENT_ID",
    "GCP_CLIENT_ID",
  );
  const clientSecret = envFirst(
    "google_client_secret",
    "GOOGLE_CLIENT_SECRET",
    "GCP_CLIENT_SECRET",
  );
  const refreshToken = envFirst(
    "google_refresh_token",
    "GOOGLE_REFRESH_TOKEN",
    "GCP_REFRESH_TOKEN",
  );
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing google_client_id / google_client_secret / google_refresh_token",
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await readJsonResponse(res, "Google OAuth token");
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Google OAuth token failed: ${data.error || res.status} ${data.error_description || ""}`,
    );
  }
  return String(data.access_token);
}

function resolveLoginCustomerId(customerId: string): string {
  const mccId = envFirst(
    "google_login_customer_id",
    "GOOGLE_LOGIN_CUSTOMER_ID",
    "GCP_DEFAULT_MANAGER_ID",
  ) || DEFAULT_MCC_ID;
  const cleaned = mccId.replace(/-/g, "");
  if (!cleaned || cleaned === customerId) return "";
  return cleaned;
}

async function searchGoogleAdsOnce(
  accessToken: string,
  customerId: string,
  query: string,
  apiVersion: string,
): Promise<Record<string, unknown>[]> {
  const developerToken = envFirst(
    "google_developer_token",
    "GOOGLE_DEVELOPER_TOKEN",
    "GCP_DEVELOPER_TOKEN",
  );
  if (!developerToken) {
    throw new Error("Missing google_developer_token");
  }

  const cid = String(customerId).replace(/-/g, "");
  const url =
    `https://googleads.googleapis.com/${apiVersion}/customers/${cid}/googleAds:search`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const mccId = resolveLoginCustomerId(cid);
  if (mccId) headers["login-customer-id"] = mccId;

  const rows: Record<string, unknown>[] = [];
  let pageToken: string | undefined;

  do {
    const payload: Record<string, unknown> = { query };
    if (pageToken) payload.pageToken = pageToken;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await readJsonResponse(
      res,
      `Google Ads search (${apiVersion}, ${cid})`,
    );
    if (!res.ok) {
      throw new Error(
        `Google Ads search failed (${cid}, ${apiVersion}, login-customer-id=${mccId || "none"}): ${JSON.stringify(data).slice(0, 500)}`,
      );
    }

    for (const r of (data.results as Record<string, unknown>[]) || []) {
      rows.push(r);
    }
    pageToken = data.nextPageToken
      ? String(data.nextPageToken)
      : undefined;
  } while (pageToken);

  return rows;
}

async function searchGoogleAds(
  accessToken: string,
  customerId: string,
  query: string,
): Promise<Record<string, unknown>[]> {
  const preferred = Deno.env.get("GOOGLE_ADS_API_VERSION") || "v25";
  const versions = [...new Set([preferred, "v25", "v20", "v19"])];

  let lastError: unknown = null;
  for (const version of versions) {
    try {
      return await searchGoogleAdsOnce(
        accessToken,
        customerId,
        query,
        version,
      );
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/got HTML instead of JSON|invalid JSON|HTTP 404/i.test(msg)) {
        throw err;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError));
}

/** Page through Ads API and process each page immediately (lower peak memory). */
async function searchGoogleAdsForEachPage(
  accessToken: string,
  customerId: string,
  query: string,
  onPage: (pageRows: Record<string, unknown>[]) => Promise<void>,
): Promise<number> {
  const preferred = Deno.env.get("GOOGLE_ADS_API_VERSION") || "v25";
  const versions = [...new Set([preferred, "v25", "v20", "v19"])];

  let lastError: unknown = null;
  for (const version of versions) {
    try {
      const developerToken = envFirst(
        "google_developer_token",
        "GOOGLE_DEVELOPER_TOKEN",
        "GCP_DEVELOPER_TOKEN",
      );
      if (!developerToken) throw new Error("Missing google_developer_token");

      const cid = String(customerId).replace(/-/g, "");
      const url =
        `https://googleads.googleapis.com/${version}/customers/${cid}/googleAds:search`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      const mccId = resolveLoginCustomerId(cid);
      if (mccId) headers["login-customer-id"] = mccId;

      let pageToken: string | undefined;
      let total = 0;
      do {
        // Google Ads API v25 uses a fixed 10,000-row page size.
        // Sending pageSize causes PAGE_SIZE_NOT_SUPPORTED.
        const payload: Record<string, unknown> = { query };
        if (pageToken) payload.pageToken = pageToken;

        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        const data = await readJsonResponse(
          res,
          `Google Ads search (${version}, ${cid})`,
        );
        if (!res.ok) {
          throw new Error(
            `Google Ads search failed (${cid}, ${version}, login-customer-id=${mccId || "none"}): ${JSON.stringify(data).slice(0, 500)}`,
          );
        }

        const pageRows = (data.results as Record<string, unknown>[]) || [];
        if (pageRows.length) {
          await onPage(pageRows);
          total += pageRows.length;
        }
        pageToken = data.nextPageToken
          ? String(data.nextPageToken)
          : undefined;
      } while (pageToken);

      return total;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/got HTML instead of JSON|invalid JSON|HTTP 404/i.test(msg)) {
        throw err;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError));
}

async function upsertChunks(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<number> {
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) {
      throw new Error(`${table} upsert: ${error.message}`);
    }
  }
  return rows.length;
}

function mapAccountTotals(
  results: Record<string, unknown>[],
): { totals: AccountTotals; daily: DailyTotal[] } {
  let impressions = 0;
  let clicks = 0;
  let interactions = 0;
  let costMicros = 0;
  let conversions = 0;
  const byDate = new Map<string, DailyTotal>();

  for (const result of results) {
    const metrics = (result.metrics || {}) as Record<string, unknown>;
    const segments = (result.segments || {}) as Record<string, unknown>;
    const date = segments.date != null ? String(segments.date).slice(0, 10) : "";

    const dayImpr = Number(metrics.impressions) || 0;
    const dayClicks = Number(metrics.clicks) || 0;
    const dayInteractions = Number(metrics.interactions) || 0;
    const dayCostMicros = Math.round(Number(metrics.costMicros) || 0);

    impressions += dayImpr;
    clicks += dayClicks;
    interactions += dayInteractions;
    costMicros += dayCostMicros;
    conversions += Number(metrics.conversions) || 0;

    if (date) {
      const prev = byDate.get(date) || {
        date,
        impressions: 0,
        clicks: 0,
        interactions: 0,
        cost: 0,
        cost_micros: 0,
      };
      prev.impressions += dayImpr;
      prev.clicks += dayClicks;
      prev.interactions += dayInteractions;
      prev.cost_micros += dayCostMicros;
      prev.cost = roundMoney2(microsToCurrency(prev.cost_micros));
      byDate.set(date, prev);
    }
  }

  const cost = roundMoney2(microsToCurrency(costMicros));
  return {
    totals: {
      impressions,
      clicks,
      interactions,
      cost_micros: costMicros,
      cost,
      conversions,
      ctr: impressions > 0 ? clicks / impressions : null,
      average_cpc: clicks > 0 ? roundMoney2(cost / clicks) : null,
    },
    daily: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function mapCampaignRows(
  account: AdsAccount,
  results: Record<string, unknown>[],
  syncedAt: string,
  reportFrom: string,
  reportTo: string,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const result of results) {
    const campaign = (result.campaign || {}) as Record<string, unknown>;
    const budget = (result.campaignBudget || {}) as Record<string, unknown>;
    const metrics = (result.metrics || {}) as Record<string, unknown>;
    const geo = (campaign.geoTargetTypeSetting || {}) as Record<string, unknown>;
    const campaignId = asText(campaign.id);
    if (!campaignId) continue;

    const micros = budget.amountMicros != null
      ? Number(budget.amountMicros)
      : null;
    const positive = geo.positiveGeoTargetType
      ? String(geo.positiveGeoTargetType)
      : "";
    const negative = geo.negativeGeoTargetType
      ? String(geo.negativeGeoTargetType)
      : "";

    rows.push({
      client_id: account.client_id ? String(account.client_id) : null,
      customer_id: Number(account.customer_id),
      platform: "google",
      campaign_id: campaignId,
      name: asText(campaign.name),
      status: asText(campaign.status) || "UNKNOWN",
      channel_type: campaign.advertisingChannelType
        ? String(campaign.advertisingChannelType)
        : null,
      budget_amount: micros != null && Number.isFinite(micros)
        ? micros / 1_000_000
        : null,
      budget_period: budget.period ? String(budget.period) : null,
      bidding_strategy: campaign.biddingStrategyType
        ? String(campaign.biddingStrategyType)
        : null,
      optimization_score: campaign.optimizationScore != null
        ? Number(campaign.optimizationScore)
        : null,
      geo_target_type_setting: [positive, negative].filter(Boolean).join("|") ||
        null,
      report_from: reportFrom,
      report_to: reportTo,
      impressions: Number(metrics.impressions) || 0,
      clicks: Number(metrics.clicks) || 0,
      cost: roundMoney2(microsToCurrency(metrics.costMicros)),
      conversions: Number(metrics.conversions) || 0,
      ctr: metrics.ctr != null ? Number(metrics.ctr) : null,
      average_cpc: metrics.averageCpc != null
        ? roundMoney2(Number(metrics.averageCpc) / 1_000_000)
        : null,
      last_synced_at: syncedAt,
    });
  }
  return rows;
}

function mapAdGroupRows(
  account: AdsAccount,
  results: Record<string, unknown>[],
  syncedAt: string,
  reportFrom: string,
  reportTo: string,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const result of results) {
    const campaign = (result.campaign || {}) as Record<string, unknown>;
    const adGroup = (result.adGroup || {}) as Record<string, unknown>;
    const metrics = (result.metrics || {}) as Record<string, unknown>;
    const campaignId = asText(campaign.id);
    const adGroupId = asText(adGroup.id);
    if (!campaignId || !adGroupId) continue;

    rows.push({
      client_id: account.client_id ? String(account.client_id) : null,
      customer_id: Number(account.customer_id),
      platform: "google",
      campaign_id: campaignId,
      ad_group_id: adGroupId,
      name: asText(adGroup.name),
      status: asText(adGroup.status) || "UNKNOWN",
      report_from: reportFrom,
      report_to: reportTo,
      impressions: Number(metrics.impressions) || 0,
      clicks: Number(metrics.clicks) || 0,
      cost: roundMoney2(microsToCurrency(metrics.costMicros)),
      conversions: Number(metrics.conversions) || 0,
      last_synced_at: syncedAt,
    });
  }
  return rows;
}

function mapAdRows(
  account: AdsAccount,
  results: Record<string, unknown>[],
  syncedAt: string,
  reportFrom: string,
  reportTo: string,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const result of results) {
    const campaign = (result.campaign || {}) as Record<string, unknown>;
    const adGroup = (result.adGroup || {}) as Record<string, unknown>;
    const adGroupAd = (result.adGroupAd || {}) as Record<string, unknown>;
    const ad = (adGroupAd.ad || {}) as Record<string, unknown>;
    const rsa = (ad.responsiveSearchAd || {}) as Record<string, unknown>;
    const policy = (adGroupAd.policySummary || {}) as Record<string, unknown>;
    const metrics = (result.metrics || {}) as Record<string, unknown>;

    const campaignId = asText(campaign.id);
    const adGroupId = asText(adGroup.id);
    const adId = asText(ad.id);
    if (!campaignId || !adGroupId || !adId) continue;

    rows.push({
      client_id: account.client_id ? String(account.client_id) : null,
      customer_id: Number(account.customer_id),
      platform: "google",
      campaign_id: campaignId,
      ad_group_id: adGroupId,
      ad_id: adId,
      ad_type: ad.type ? String(ad.type) : null,
      status: asText(adGroupAd.status) || "UNKNOWN",
      approval_status: policy.approvalStatus
        ? String(policy.approvalStatus)
        : null,
      ad_strength: adGroupAd.adStrength
        ? String(adGroupAd.adStrength)
        : null,
      final_urls: asJsonArray(ad.finalUrls),
      headlines: rsaAssetTexts(rsa.headlines),
      descriptions: rsaAssetTexts(rsa.descriptions),
      report_from: reportFrom,
      report_to: reportTo,
      impressions: Number(metrics.impressions) || 0,
      clicks: Number(metrics.clicks) || 0,
      cost: roundMoney2(microsToCurrency(metrics.costMicros)),
      conversions: Number(metrics.conversions) || 0,
      last_synced_at: syncedAt,
    });
  }
  return rows;
}

function mapKeywordRows(
  account: AdsAccount,
  results: Record<string, unknown>[],
  syncedAt: string,
  reportFrom: string,
  reportTo: string,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const result of results) {
    const campaign = (result.campaign || {}) as Record<string, unknown>;
    const adGroup = (result.adGroup || {}) as Record<string, unknown>;
    const criterion = (result.adGroupCriterion || {}) as Record<string, unknown>;
    const keyword = (criterion.keyword || {}) as Record<string, unknown>;
    const quality = (criterion.qualityInfo || {}) as Record<string, unknown>;
    const metrics = (result.metrics || {}) as Record<string, unknown>;

    const campaignId = asText(campaign.id);
    const adGroupId = asText(adGroup.id);
    const criterionId = asText(criterion.criterionId);
    if (!campaignId || !adGroupId || !criterionId) continue;

    rows.push({
      client_id: account.client_id ? String(account.client_id) : null,
      customer_id: Number(account.customer_id),
      platform: "google",
      campaign_id: campaignId,
      ad_group_id: adGroupId,
      criterion_id: criterionId,
      text: asText(keyword.text),
      match_type: asText(keyword.matchType) || "UNKNOWN",
      status: asText(criterion.status) || "UNKNOWN",
      quality_score: quality.qualityScore != null
        ? Number(quality.qualityScore)
        : null,
      negative: Boolean(criterion.negative),
      report_from: reportFrom,
      report_to: reportTo,
      impressions: Number(metrics.impressions) || 0,
      clicks: Number(metrics.clicks) || 0,
      cost: roundMoney2(microsToCurrency(metrics.costMicros)),
      conversions: Number(metrics.conversions) || 0,
      average_cpc: metrics.averageCpc != null
        ? roundMoney2(Number(metrics.averageCpc) / 1_000_000)
        : null,
      last_synced_at: syncedAt,
    });
  }
  return rows;
}

function mapSearchTermRows(
  account: AdsAccount,
  results: Record<string, unknown>[],
  syncedAt: string,
  reportFrom: string,
  reportTo: string,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const result of results) {
    const campaign = (result.campaign || {}) as Record<string, unknown>;
    const adGroup = (result.adGroup || {}) as Record<string, unknown>;
    const stv = (result.searchTermView ||
      result.campaignSearchTermView ||
      {}) as Record<string, unknown>;
    const segments = (result.segments || {}) as Record<string, unknown>;
    const keywordInfo = ((segments.keyword || {}) as Record<string, unknown>)
      .info as Record<string, unknown> | undefined;
    const metrics = (result.metrics || {}) as Record<string, unknown>;

    const parsed = parseSearchTermResourceIds(stv.resourceName);
    const campaignId = asText(campaign.id) || parsed.campaignId;
    // PMax campaign_search_term_view has no ad group — use "0".
    const adGroupId = asText(adGroup.id) || parsed.adGroupId || "0";
    const term = asText(stv.searchTerm).trim();
    const reportDate = segments.date != null
      ? String(segments.date).slice(0, 10)
      : "";
    if (!campaignId || !adGroupId || !term || !reportDate) continue;

    rows.push({
      client_id: account.client_id ? String(account.client_id) : null,
      customer_id: Number(account.customer_id),
      platform: "google",
      report_from: reportFrom,
      report_to: reportTo,
      report_date: reportDate,
      campaign_id: campaignId,
      ad_group_id: adGroupId,
      term,
      term_status: stv.status ? String(stv.status) : null,
      matched_keyword: keywordInfo?.text ? String(keywordInfo.text) : null,
      match_type: keywordInfo?.matchType
        ? String(keywordInfo.matchType)
        : null,
      impressions: Number(metrics.impressions) || 0,
      clicks: Number(metrics.clicks) || 0,
      cost: roundMoney2(microsToCurrency(metrics.costMicros)),
      conversions: Number(metrics.conversions) || 0,
      last_synced_at: syncedAt,
    });
  }
  return rows;
}

async function getFirstActiveCustomerId(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase
    .from(ACCOUNTS_TABLE)
    .select("customer_id")
    .eq("is_active", true)
    .order("customer_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Load ${ACCOUNTS_TABLE}: ${error.message}`);
  }
  if (data?.customer_id == null) {
    throw new Error(
      `No active account in ${ACCOUNTS_TABLE}. Insert a row into ${ACCOUNTS_TABLE} (is_active=true) before running sync.`,
    );
  }
  return Number(data.customer_id);
}

/** Prefer TEST_CUSTOMER_ID_ONLY only when set AND that account row exists. */
async function resolveSeedCustomerId(
  supabase: SupabaseClient,
): Promise<number> {
  const testId = String(TEST_CUSTOMER_ID_ONLY || "").replace(/-/g, "").trim();
  if (testId) {
    const { data, error } = await supabase
      .from(ACCOUNTS_TABLE)
      .select("customer_id")
      .eq("customer_id", Number(testId))
      .maybeSingle();
    if (error) {
      throw new Error(`Load ${ACCOUNTS_TABLE}: ${error.message}`);
    }
    if (data?.customer_id != null) return Number(data.customer_id);
  }
  return await getFirstActiveCustomerId(supabase);
}

async function loadOrCreateSyncState(
  supabase: SupabaseClient,
): Promise<SyncStateRow> {
  const { data, error } = await supabase
    .from(SYNC_STATE_TABLE)
    .select("*")
    .eq("id", SYNC_STATE_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Load ${SYNC_STATE_TABLE}: ${error.message}`);
  }
  if (data) return data as SyncStateRow;

  const seedCustomerId = await resolveSeedCustomerId(supabase);
  const seed = {
    id: SYNC_STATE_ID,
    customer_id: seedCustomerId,
    report_from: DEFAULT_REPORT_FROM,
    report_to: DEFAULT_REPORT_TO,
    phase: "campaigns",
    chunk_from: DEFAULT_REPORT_FROM,
    chunk_days: DEFAULT_SEARCH_TERM_CHUNK_DAYS,
    status: "idle",
    updated_at: new Date().toISOString(),
  };
  const { data: inserted, error: insertError } = await supabase
    .from(SYNC_STATE_TABLE)
    .upsert(seed, { onConflict: "id" })
    .select("*")
    .single();
  if (insertError) {
    throw new Error(`Create ${SYNC_STATE_TABLE}: ${insertError.message}`);
  }
  return inserted as SyncStateRow;
}

async function saveSyncState(
  supabase: SupabaseClient,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from(SYNC_STATE_TABLE)
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", SYNC_STATE_ID);
  if (error) {
    throw new Error(`Update ${SYNC_STATE_TABLE}: ${error.message}`);
  }
}

function nextPipelineAfter(
  phase: SyncPhase,
  reportFrom: string,
  _reportTo: string,
  _chunkDays: number,
  nextChunkFrom: string | null,
): { phase: PipelinePhase; chunk_from: string | null; done: boolean } {
  if (phase === "search_terms") {
    if (nextChunkFrom) {
      return {
        phase: "search_terms",
        chunk_from: nextChunkFrom,
        done: false,
      };
    }
    return { phase: "campaigns", chunk_from: reportFrom, done: true };
  }
  if (phase === "totals") {
    return { phase: "campaigns", chunk_from: reportFrom, done: false };
  }
  const idx = PHASE_ORDER.indexOf(phase as PipelinePhase);
  if (idx < 0) {
    return { phase: "campaigns", chunk_from: reportFrom, done: false };
  }
  if (idx < PHASE_ORDER.length - 1) {
    const next = PHASE_ORDER[idx + 1];
    return {
      phase: next,
      chunk_from: null,
      done: false,
    };
  }
  // After keywords → done (entity tables only).
  return { phase: "campaigns", chunk_from: reportFrom, done: true };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* empty ok */
    }

    const autoMode = body.mode === "auto" || body.phase == null;
    const reset = body.reset === true;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let phase: SyncPhase;
    let reportFrom: string;
    let reportTo: string;
    let chunkDays: number;
    let chunkFromBody: string | null = null;
    let stateCustomerId: number | null = null;

    if (autoMode) {
      const state = await loadOrCreateSyncState(supabase);

      if (reset) {
        await saveSyncState(supabase, {
          phase: "campaigns",
          chunk_from: state.report_from || DEFAULT_REPORT_FROM,
          status: "idle",
          last_error: null,
          last_message: "reset",
          last_upserted: 0,
        });
      }

      const fresh = reset
        ? await loadOrCreateSyncState(supabase)
        : state;
      stateCustomerId = Number(fresh.customer_id);

      if (fresh.status === "done" && !reset) {
        return jsonResponse({
          ok: true,
          mode: "auto",
          done: true,
          phase: fresh.phase,
          message:
            "Sync already complete. POST {\"mode\":\"auto\",\"reset\":true} to restart.",
          state: fresh,
        });
      }

      // Skip if a previous tick is still running (overlap guard).
      if (fresh.status === "running" && fresh.last_run_at) {
        const started = Date.parse(fresh.last_run_at);
        if (Number.isFinite(started) && Date.now() - started < 110_000) {
          return jsonResponse({
            ok: true,
            mode: "auto",
            skipped: true,
            message: "Previous phase still running — skipped this tick",
            state: fresh,
          });
        }
      }

      phase = isPipelinePhase(fresh.phase) ? fresh.phase : "campaigns";
      reportFrom = isYmd(String(fresh.report_from).slice(0, 10))
        ? String(fresh.report_from).slice(0, 10)
        : DEFAULT_REPORT_FROM;
      reportTo = isYmd(String(fresh.report_to).slice(0, 10))
        ? String(fresh.report_to).slice(0, 10)
        : DEFAULT_REPORT_TO;
      chunkDays = Number(fresh.chunk_days) > 0
        ? Math.min(7, Number(fresh.chunk_days))
        : DEFAULT_SEARCH_TERM_CHUNK_DAYS;
      chunkFromBody = fresh.chunk_from
        ? String(fresh.chunk_from).slice(0, 10)
        : reportFrom;

      // Allow body to override date range once (updates state).
      if (isYmd(body.from) || isYmd(body.to)) {
        reportFrom = isYmd(body.from) ? body.from : reportFrom;
        reportTo = isYmd(body.to) ? body.to : reportTo;
        await saveSyncState(supabase, {
          report_from: reportFrom,
          report_to: reportTo,
        });
      }

      await saveSyncState(supabase, {
        status: "running",
        phase,
        chunk_from: chunkFromBody,
        last_run_at: new Date().toISOString(),
        last_error: null,
      });
    } else {
      phase = isSyncPhase(body.phase) ? body.phase : "campaigns";
      reportFrom = isYmd(body.from) ? body.from : DEFAULT_REPORT_FROM;
      reportTo = isYmd(body.to) ? body.to : DEFAULT_REPORT_TO;
      const chunkDaysRaw = Number(body.chunk_days);
      chunkDays = Number.isFinite(chunkDaysRaw) && chunkDaysRaw > 0
        ? Math.min(7, Math.floor(chunkDaysRaw))
        : DEFAULT_SEARCH_TERM_CHUNK_DAYS;
      chunkFromBody = isYmd(body.chunk_from) ? body.chunk_from : null;
    }

    if (reportFrom > reportTo) {
      if (autoMode) {
        await saveSyncState(supabase, {
          status: "error",
          last_error: `Invalid range: ${reportFrom} > ${reportTo}`,
        });
      }
      return jsonResponse({
        ok: false,
        error: `Invalid range: from (${reportFrom}) > to (${reportTo})`,
      }, 400);
    }

    let windowFrom = reportFrom;
    let windowTo = reportTo;
    let nextChunkFrom: string | null = null;

    if (phase === "search_terms") {
      windowFrom = chunkFromBody && isYmd(chunkFromBody)
        ? chunkFromBody
        : reportFrom;
      if (windowFrom < reportFrom) windowFrom = reportFrom;
      if (windowFrom > reportTo) {
        if (autoMode) {
          await saveSyncState(supabase, {
            status: "done",
            phase: "campaigns",
            chunk_from: reportFrom,
            last_message: "search_terms complete",
            last_upserted: 0,
          });
        }
        return jsonResponse({
          ok: true,
          mode: autoMode ? "auto" : "manual",
          phase,
          done: true,
          message: "search_terms already complete for this range",
          report_from: reportFrom,
          report_to: reportTo,
          upserted: 0,
        });
      }
      windowTo = minYmd(addDaysYmd(windowFrom, chunkDays - 1), reportTo);
      const following = addDaysYmd(windowTo, 1);
      nextChunkFrom = following <= reportTo ? following : null;
    }

    // Resolve customer: body → sync state → first active account
    // (TEST_CUSTOMER_ID_ONLY only if non-empty AND that account row exists).
    let onlyCustomerId = "";
    if (body.customer_id != null && String(body.customer_id).trim() !== "") {
      onlyCustomerId = String(body.customer_id).replace(/-/g, "");
    } else if (stateCustomerId != null && Number.isFinite(stateCustomerId)) {
      onlyCustomerId = String(stateCustomerId);
    } else {
      const { data: existingState } = await supabase
        .from(SYNC_STATE_TABLE)
        .select("customer_id")
        .eq("id", SYNC_STATE_ID)
        .maybeSingle();
      if (existingState?.customer_id != null) {
        onlyCustomerId = String(existingState.customer_id);
      } else {
        const testId = String(TEST_CUSTOMER_ID_ONLY || "").replace(/-/g, "")
          .trim();
        if (testId) {
          const { data: testAccount } = await supabase
            .from(ACCOUNTS_TABLE)
            .select("customer_id")
            .eq("customer_id", Number(testId))
            .maybeSingle();
          if (testAccount?.customer_id != null) {
            onlyCustomerId = String(testAccount.customer_id);
          }
        }
        if (!onlyCustomerId) {
          onlyCustomerId = String(await getFirstActiveCustomerId(supabase));
        }
      }
    }

    const todayYmd = new Date().toISOString().slice(0, 10);
    const includesToday = reportTo >= todayYmd;

    const { data: accounts, error: accountsError } = await supabase
      .from(ACCOUNTS_TABLE)
      .select("customer_id, client_id, descriptive_name")
      .eq("customer_id", Number(onlyCustomerId));

    if (accountsError) {
      throw new Error(`Load ${ACCOUNTS_TABLE}: ${accountsError.message}`);
    }
    if (!accounts?.length) {
      if (autoMode) {
        await saveSyncState(supabase, {
          status: "error",
          last_error: `No account for customer_id=${onlyCustomerId}`,
        });
      }
      return jsonResponse({
        ok: false,
        error:
          `No ${ACCOUNTS_TABLE} row for customer_id=${onlyCustomerId}. Insert into ${ACCOUNTS_TABLE} first.`,
        phase,
        report_from: reportFrom,
        report_to: reportTo,
      }, 404);
    }

    const accessToken = await getGoogleAccessToken();
    const syncedAt = new Date().toISOString();
    const raw = accounts[0] as AdsAccount;
    const customerId = String(raw.customer_id).replace(/-/g, "");
    const label = raw.descriptive_name || customerId;

    let upserted = 0;
    let totals: AccountTotals | null = null;
    let daily: DailyTotal[] = [];

    try {
      if (phase === "totals") {
        const customerResults = await searchGoogleAds(
          accessToken,
          customerId,
          buildCustomerMetricsGaql(reportFrom, reportTo),
        );
        const mapped = mapAccountTotals(customerResults);
        totals = mapped.totals;
        daily = mapped.daily;
      } else if (phase === "campaigns") {
        const results = await searchGoogleAds(
          accessToken,
          customerId,
          buildCampaignGaql(reportFrom, reportTo),
        );
        const rows = mapCampaignRows(
          raw,
          results,
          syncedAt,
          reportFrom,
          reportTo,
        );
        upserted = await upsertChunks(
          supabase,
          CAMPAIGN_TABLE,
          rows,
          "customer_id,platform,campaign_id",
        );
      } else if (phase === "ad_groups") {
        const results = await searchGoogleAds(
          accessToken,
          customerId,
          buildAdGroupGaql(reportFrom, reportTo),
        );
        const rows = mapAdGroupRows(
          raw,
          results,
          syncedAt,
          reportFrom,
          reportTo,
        );
        upserted = await upsertChunks(
          supabase,
          AD_GROUP_TABLE,
          rows,
          "customer_id,platform,ad_group_id",
        );
      } else if (phase === "ads") {
        upserted = 0;
        await searchGoogleAdsForEachPage(
          accessToken,
          customerId,
          buildAdGaql(reportFrom, reportTo),
          async (pageRows) => {
            const rows = mapAdRows(
              raw,
              pageRows,
              syncedAt,
              reportFrom,
              reportTo,
            );
            upserted += await upsertChunks(
              supabase,
              AD_TABLE,
              rows,
              "customer_id,platform,ad_id",
            );
          },
        );
      } else if (phase === "keywords") {
        upserted = 0;
        await searchGoogleAdsForEachPage(
          accessToken,
          customerId,
          buildKeywordGaql(reportFrom, reportTo),
          async (pageRows) => {
            const rows = mapKeywordRows(
              raw,
              pageRows,
              syncedAt,
              reportFrom,
              reportTo,
            );
            upserted += await upsertChunks(
              supabase,
              KEYWORD_TABLE,
              rows,
              "customer_id,platform,ad_group_id,criterion_id",
            );
          },
        );
      } else if (phase === "search_terms") {
        upserted = 0;
        let apiRows = 0;
        let mappedRows = 0;

        // 1) Classic Search ad-group search terms
        try {
          await searchGoogleAdsForEachPage(
            accessToken,
            customerId,
            buildSearchTermGaql(windowFrom, windowTo),
            async (pageRows) => {
              apiRows += pageRows.length;
              const rows = mapSearchTermRows(
                raw,
                pageRows,
                syncedAt,
                reportFrom,
                reportTo,
              );
              mappedRows += rows.length;
              upserted += await upsertChunks(
                supabase,
                SEARCH_TERM_TABLE,
                rows,
                "customer_id,platform,report_date,ad_group_id,term",
              );
            },
          );
        } catch (stErr) {
          const msg = stErr instanceof Error ? stErr.message : String(stErr);
          console.warn(
            `[search_terms] full GAQL failed, retrying simple: ${msg.slice(0, 240)}`,
          );
          await searchGoogleAdsForEachPage(
            accessToken,
            customerId,
            buildSearchTermGaqlSimple(windowFrom, windowTo),
            async (pageRows) => {
              apiRows += pageRows.length;
              const rows = mapSearchTermRows(
                raw,
                pageRows,
                syncedAt,
                reportFrom,
                reportTo,
              );
              mappedRows += rows.length;
              upserted += await upsertChunks(
                supabase,
                SEARCH_TERM_TABLE,
                rows,
                "customer_id,platform,report_date,ad_group_id,term",
              );
            },
          );
        }

        // 2) Performance Max / campaign-level search terms
        try {
          await searchGoogleAdsForEachPage(
            accessToken,
            customerId,
            buildCampaignSearchTermGaql(windowFrom, windowTo),
            async (pageRows) => {
              apiRows += pageRows.length;
              const rows = mapSearchTermRows(
                raw,
                pageRows,
                syncedAt,
                reportFrom,
                reportTo,
              );
              mappedRows += rows.length;
              upserted += await upsertChunks(
                supabase,
                SEARCH_TERM_TABLE,
                rows,
                "customer_id,platform,report_date,ad_group_id,term",
              );
            },
          );
        } catch (pmaxErr) {
          // PMax view may be unavailable on some accounts — don't fail the phase.
          const msg = pmaxErr instanceof Error
            ? pmaxErr.message
            : String(pmaxErr);
          console.warn(
            `[search_terms] campaign_search_term_view skipped: ${msg.slice(0, 240)}`,
          );
        }

        if (apiRows === 0) {
          console.warn(
            `[search_terms] API returned 0 rows for ${windowFrom}→${windowTo}`,
          );
        } else if (mappedRows === 0) {
          throw new Error(
            `search_terms: API returned ${apiRows} rows but mapping produced 0 ` +
              `(check campaign/ad_group id parsing) for ${windowFrom}→${windowTo}`,
          );
        }
      }

      await supabase
        .from(ACCOUNTS_TABLE)
        .update({
          last_synced: syncedAt,
          sync_status: `ok:${phase}${
            phase === "search_terms" ? `:${windowFrom}_${windowTo}` : ""
          }`,
        })
        .eq("customer_id", Number(customerId));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from(ACCOUNTS_TABLE)
        .update({
          last_synced: syncedAt,
          sync_status: `error:${phase}: ${message.slice(0, 160)}`,
        })
        .eq("customer_id", Number(customerId));

      if (autoMode) {
        await saveSyncState(supabase, {
          status: "error",
          last_error: message.slice(0, 500),
          last_message: `failed at ${phase}`,
          last_upserted: upserted,
        });
      }

      return jsonResponse({
        ok: false,
        mode: autoMode ? "auto" : "manual",
        phase,
        customer_id: customerId,
        name: label,
        report_from: reportFrom,
        report_to: reportTo,
        window_from: windowFrom,
        window_to: windowTo,
        error: message,
      }, 500);
    }

    const advance = nextPipelineAfter(
      phase,
      reportFrom,
      reportTo,
      chunkDays,
      nextChunkFrom,
    );

    if (autoMode) {
      await saveSyncState(supabase, {
        phase: advance.done ? "campaigns" : advance.phase,
        chunk_from: advance.chunk_from,
        status: advance.done ? "done" : "idle",
        last_error: null,
        last_upserted: upserted,
        last_message: phase === "search_terms"
          ? `ok search_terms ${windowFrom}→${windowTo}`
          : `ok ${phase}`,
        last_run_at: syncedAt,
      });
    }

    return jsonResponse({
      ok: true,
      mode: autoMode ? "auto" : "manual",
      phase,
      message: phase === "search_terms"
        ? `Synced search_terms for ${windowFrom} → ${windowTo} (${upserted} rows)`
        : `Synced phase=${phase} for ${reportFrom} → ${reportTo} (${upserted} rows)`,
      report_from: reportFrom,
      report_to: reportTo,
      window_from: windowFrom,
      window_to: windowTo,
      includes_today: includesToday,
      customer_id: customerId,
      name: label,
      upserted,
      totals,
      daily: phase === "totals" ? daily : undefined,
      next: advance.done ? null : {
        phase: advance.phase,
        from: reportFrom,
        to: reportTo,
        chunk_days: chunkDays,
        chunk_from: advance.chunk_from,
      },
      done: advance.done,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
