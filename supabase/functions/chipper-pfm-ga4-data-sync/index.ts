import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { JWT } from "npm:google-auth-library@9.0.0";

/**
 * Cron Step 1 - chipper-pfm-ga4-data-sync
 * Aligned with Admin Panel `syncGa4PageDataForDealer`:
 * - Always uses pageLocation (same GA4 grain as Admin)
 * - Full delete + re-pull for each pending day
 * - Newest days first so settling window never loses to budget timeouts
 * - days_back coerced safely (string/number)
 *
 * Tables:
 * - chipper_pfm_ga4_data
 * - chipper_pfm_ga4_config
 * - chipper_pfm_ga4_day_complete
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAGE_TABLE = "chipper_pfm_ga4_data";
const CONFIG_TABLE = "chipper_pfm_ga4_config";
const COMPLETE_TABLE = "chipper_pfm_ga4_day_complete";
const CHUNK_SIZE = 500;
const GLOBAL_BUDGET_MS = 145_000;
const DEALER_BUDGET_MS = 135_000;
const PAGE_SIZE = 1500;
const SETTLING_DAYS = 5;

/** Dealers that store pathname+query in page_path_q_s (page_path stays pathname-only). */
/** Destination Cycle + XGRID + Jay's Power Center (Dealer Spike query VDPs). */
const PAGE_PATH_QS_CLIENT_IDS = new Set([
  "1421445735",
  "7231326744",
  "7543766464",
]);

const todayUTC = () => new Date().toISOString().split("T")[0];

function normalizeDate(v: unknown): string {
  if (!v) return todayUTC();
  const s = String(v).trim().toLowerCase();
  if (s === "today" || s === "") return todayUTC();
  return String(v).trim();
}

function daysAgoUTC(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split("T")[0];
}

function channelNorm(raw: unknown): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/ /g, "_")
    .replace(/\//g, "_");
}

function pathsFromLocation(loc: string, clientId: string) {
  try {
    const u = new URL(loc);
    const pathname = u.pathname;
    const page_path_q_s = PAGE_PATH_QS_CLIENT_IDS.has(clientId)
      ? pathname + u.search
      : null;
    return { page_path: pathname, page_path_q_s };
  } catch {
    return { page_path: loc, page_path_q_s: null };
  }
}

type VdpMatcher = {
  regex: RegExp;
  hasNewIndicator: boolean;
  hasUsedIndicator: boolean;
};

function buildVdpMatchers(patternStr: string | null | undefined): VdpMatcher[] {
  if (!patternStr) return [];
  const parts = String(patternStr)
    .split(/\s+OR\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const matchers: VdpMatcher[] = [];
  for (const raw of parts) {
    try {
      const regex = new RegExp(raw, "i");
      const rawLower = raw.toLowerCase();
      matchers.push({
        regex,
        hasNewIndicator:
          rawLower.includes("/new-") ||
          rawLower.includes("/new/") ||
          rawLower.includes("/new-inventory") ||
          rawLower.includes("/new+") ||
          rawLower.includes("-new-") ||
          rawLower === "/product/new-" ||
          rawLower.includes("/inventory/new"),
        hasUsedIndicator:
          rawLower.includes("/used-") ||
          rawLower.includes("/used/") ||
          rawLower.includes("/used-inventory") ||
          rawLower.includes("/used+") ||
          rawLower.includes("-used-") ||
          rawLower === "/product/used-" ||
          rawLower.includes("/inventory/used") ||
          rawLower.includes("pre-owned"),
      });
    } catch {
      /* skip invalid regex */
    }
  }
  return matchers;
}

function classifyPage(
  pageLocation: string,
  pagePath: string,
  vdpMatchers: VdpMatcher[] = [],
): string {
  const pathLower = (pagePath || "").toLowerCase();
  const locLower = (pageLocation || "").toLowerCase();

  if (vdpMatchers.length > 0) {
    for (const matcher of vdpMatchers) {
      if (
        matcher.regex.test(pagePath || "") ||
        matcher.regex.test(pageLocation || "")
      ) {
        if (matcher.hasNewIndicator && !matcher.hasUsedIndicator) {
          return "VDP_New";
        }
        if (matcher.hasUsedIndicator && !matcher.hasNewIndicator) {
          return "VDP_Used";
        }
        if (
          pathLower.includes("/new-") ||
          pathLower.includes("/new/") ||
          pathLower.includes("/new+") ||
          pathLower.includes("-new-") ||
          pathLower.includes("/product/new-") ||
          pathLower.includes("/inventory/new") ||
          pathLower.includes("/new-inventory") ||
          locLower.includes("/new-") ||
          locLower.includes("/new/") ||
          locLower.includes("/inventory/new")
        ) {
          return "VDP_New";
        }
        if (
          pathLower.includes("/used-") ||
          pathLower.includes("/used/") ||
          pathLower.includes("/used+") ||
          pathLower.includes("-used-") ||
          pathLower.includes("/product/used-") ||
          pathLower.includes("/inventory/used") ||
          pathLower.includes("/used-inventory") ||
          pathLower.includes("pre-owned") ||
          locLower.includes("/used-") ||
          locLower.includes("/used/") ||
          locLower.includes("/inventory/used")
        ) {
          return "VDP_Used";
        }
        return "VDP";
      }
    }
  }
  return "Non-VDP";
}

serve(async (req) => {
  const startTime = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const L: string[] = [];
  const log = (m: string) => {
    L.push(m);
    console.log(m);
  };
  const jsonRes = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const SB_URL = Deno.env.get("SUPABASE_URL")!;
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GCP_JSON = Deno.env.get("GCP_SERVICE_ACCOUNT_JSON")!;
    if (!GCP_JSON) {
      return jsonRes({
        success: false,
        error: "Missing secret GCP_SERVICE_ACCOUNT_JSON",
        log: L,
      }, 500);
    }
    const supabase = createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false },
    });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* empty */
    }

    const targetClientId = (body.target_client_id ?? body.client_id ?? null) as
      | string
      | null;
    const groupId = (body.group_id ?? null) as string | number | null;
    const forceRefresh = body.force_refresh === true;

    // Coerce days_back safely (jsonb may arrive as number OR string).
    const daysBackRaw = body.days_back ?? null;
    const daysBackNum =
      daysBackRaw == null || daysBackRaw === ""
        ? null
        : Number(daysBackRaw);
    const daysBack =
      daysBackNum != null && Number.isFinite(daysBackNum) && daysBackNum > 0
        ? Math.floor(daysBackNum)
        : null;

    let dateFrom: string;
    let dateTo: string;
    let windowMode = "";

    if (daysBack != null) {
      dateFrom = daysAgoUTC(daysBack);
      dateTo = todayUTC();
      windowMode = `(rolling: last ${daysBack} days)`;
    } else {
      dateFrom = normalizeDate(body.date_from ?? body.start_date ?? "2026-05-20");
      dateTo = normalizeDate(body.date_to ?? body.end_date ?? todayUTC());
    }

    const modeLabel = targetClientId
      ? `SINGLE DEALER ${targetClientId}`
      : groupId !== null
      ? `GROUP ${groupId}`
      : "ALL DEALERS";

    const settlingCutoff = daysAgoUTC(SETTLING_DAYS);

    log(
      `=== CHIPPER PFM GA4 PAGE SYNC (page_path_q_s: Dest Cycle + XGRID + Jay's) - ${modeLabel} ===`,
    );
    log(`Window: ${dateFrom} -> ${dateTo} ${windowMode}`);
    log(
      `Settling cutoff: ${settlingCutoff} (days on/after this always re-fetch)`,
    );
    if (forceRefresh) log(`WARN FORCE REFRESH MODE - all markers ignored`);

    let q = supabase
      .from(CONFIG_TABLE)
      .select("client_id, ga4_property_id, account_name, vdp_url_pattern")
      .eq("is_active", true)
      .order("account_name", { ascending: true });

    if (targetClientId) q = q.eq("client_id", targetClientId);
    else if (groupId !== null) q = q.eq("sync_group", groupId);

    let { data: dealers, error: dErr } = await q;
    if (dErr && /vdp_url_pattern/i.test(dErr.message || "")) {
      let q2 = supabase
        .from(CONFIG_TABLE)
        .select("client_id, ga4_property_id, account_name")
        .eq("is_active", true)
        .order("account_name", { ascending: true });
      if (targetClientId) q2 = q2.eq("client_id", targetClientId);
      else if (groupId !== null) q2 = q2.eq("sync_group", groupId);
      ({ data: dealers, error: dErr } = await q2);
      dealers = (dealers || []).map((d) => ({
        ...d,
        vdp_url_pattern: null,
      }));
    }

    if (dErr) throw new Error(`Config query failed: ${dErr.message}`);
    if (!dealers || dealers.length === 0) {
      return jsonRes({
        success: true,
        message: "No active dealers matched",
        log: L,
      });
    }

    log(`Dealers to process: ${dealers.length}`);

    const allDatesAsc: string[] = [];
    {
      const start = new Date(dateFrom + "T00:00:00Z");
      const end = new Date(dateTo + "T00:00:00Z");
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
        return jsonRes({ success: false, error: "Invalid date range" }, 400);
      }
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        allDatesAsc.push(d.toISOString().split("T")[0]);
      }
    }
    // Newest first - budget timeouts must not skip recent settling days.
    const allDates = [...allDatesAsc].reverse();
    log(
      `Days in window: ${allDates.length} (newest-first: ${allDates[0]} -> ${
        allDates[allDates.length - 1]
      })`,
    );

    const sa = JSON.parse(GCP_JSON);
    const authClient = new JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    });
    const tokenResp = await authClient.getAccessToken();
    const accessToken =
      typeof tokenResp === "string" ? tokenResp : tokenResp?.token;
    if (!accessToken) throw new Error("Failed to obtain GA4 access token");

    async function insertResilient(
      rows: Record<string, unknown>[],
    ): Promise<{ inserted: number; error?: string }> {
      if (!rows.length) return { inserted: 0 };
      let attempt = [...rows];
      const droppedCols: string[] = [];
      for (let tries = 0; tries < 6; tries++) {
        const { error } = await supabase.from(PAGE_TABLE).insert(attempt);
        if (!error) return { inserted: attempt.length };
        const m = error.message || "";

        if (/null value in column/i.test(m) || /violates not-null/i.test(m)) {
          return { inserted: 0, error: `NOT NULL violation: ${m}` };
        }

        const colMatch = m.match(
          /Could not find the '([^']+)' column of '[^']+' in the schema cache/i,
        ) ||
          m.match(
            /column\s+"?([a-zA-Z0-9_]+)"?\s+(?:of relation\s+\S+\s+)?does not exist/i,
          );
        if (colMatch) {
          const badCol = colMatch[1];
          droppedCols.push(badCol);
          attempt = attempt.map((r) => {
            const c = { ...r };
            delete c[badCol];
            return c;
          });
          continue;
        }

        return { inserted: 0, error: m };
      }
      return {
        inserted: 0,
        error: `Too many column-drop retries. Dropped: ${droppedCols.join(", ")}`,
      };
    }

    async function safeStatusUpdate(clientId: string, status: string) {
      try {
        await supabase
          .from(CONFIG_TABLE)
          .update({
            sync_status: status,
            last_fetched_at: new Date().toISOString(),
          })
          .eq("client_id", clientId);
      } catch {
        /* columns may not exist */
      }
    }

    const dealerSummary: Record<string, unknown>[] = [];
    let totalGlobalRows = 0;
    let cutoffReached = false;

    for (const dealer of dealers) {
      if (Date.now() - startTime > GLOBAL_BUDGET_MS - 10_000) {
        log(`TIME Global budget reached, stopping before ${dealer.account_name}`);
        cutoffReached = true;
        break;
      }

      const CLIENT_ID = dealer.client_id as string;
      const propertyId = String(dealer.ga4_property_id || "")
        .replace("properties/", "")
        .trim();
      const accountName = (dealer.account_name as string) || CLIENT_ID;
      const usePathQs = PAGE_PATH_QS_CLIENT_IDS.has(CLIENT_ID);
      const vdpMatchers = buildVdpMatchers(
        (dealer as { vdp_url_pattern?: string | null }).vdp_url_pattern,
      );
      const dealerStart = Date.now();
      let dealerRows = 0;
      let dealerDays = 0;
      const dealerErrors: string[] = [];

      log(
        `\n-> [${accountName}] (${CLIENT_ID}) property=${propertyId}${
          usePathQs ? " · page_path_q_s" : ""
        }`,
      );

      try {
        // Soft-fail if marker table missing - still re-fetch settling window.
        let completed: { report_date: string }[] | null = null;
        {
          const { data, error } = await supabase
            .from(COMPLETE_TABLE)
            .select("report_date")
            .eq("client_id", CLIENT_ID)
            .gte("report_date", dateFrom)
            .lte("report_date", dateTo);
          if (error) {
            log(
              `   WARN day_complete unavailable (${error.message}) - re-fetching all days in window`,
            );
          } else {
            completed = data;
          }
        }

        const doneDays = new Set<string>();
        if (completed && !forceRefresh) {
          completed.forEach((r) => {
            const d = String(r.report_date).split("T")[0];
            // Only lock days older than settling window.
            if (d < settlingCutoff) doneDays.add(d);
          });
        }

        const pendingDays = allDates.filter((d) => !doneDays.has(d));
        log(`   Locked: ${doneDays.size}, To re-fetch: ${pendingDays.length}`);

        if (pendingDays.length === 0) {
          dealerSummary.push({
            client_id: CLIENT_ID,
            account_name: accountName,
            status: "complete",
            days_pending: 0,
            rows_inserted: 0,
          });
          await safeStatusUpdate(CLIENT_ID, "ok");
          continue;
        }

        for (const dateStr of pendingDays) {
          if (Date.now() - startTime > GLOBAL_BUDGET_MS - 8_000) {
            log(
              `   TIME Global budget - stopping ${accountName} at ${dateStr}`,
            );
            cutoffReached = true;
            break;
          }
          if (Date.now() - dealerStart > DEALER_BUDGET_MS - 5_000) {
            log(
              `   TIME Dealer budget - stopping ${accountName} at ${dateStr}`,
            );
            break;
          }

          // Probe GA4 first - do not wipe local day until API responds OK.
          let offset = 0;
          let hasMore = true;
          let dayRows = 0;
          let dayHaltedEarly = false;
          let expectedTotal: number | null = null;
          let dayErrorMsg = "";
          let deletedOld = false;
          const pendingInserts: Record<string, unknown>[] = [];

          try {
            while (hasMore) {
              if (Date.now() - startTime > GLOBAL_BUDGET_MS - 8_000) {
                dayHaltedEarly = true;
                cutoffReached = true;
                break;
              }
              if (Date.now() - dealerStart > DEALER_BUDGET_MS - 5_000) {
                dayHaltedEarly = true;
                break;
              }

              // Admin-aligned dimensions/metrics for ALL dealers.
              const reqBody = {
                dateRanges: [{ startDate: dateStr, endDate: dateStr }],
                dimensions: [
                  { name: "pageLocation" },
                  { name: "pageTitle" },
                  { name: "sessionDefaultChannelGroup" },
                  { name: "sessionSource" },
                  { name: "sessionMedium" },
                  { name: "sessionCampaignName" },
                ],
                metrics: [
                  { name: "screenPageViews" },
                  { name: "totalUsers" },
                  { name: "newUsers" },
                  { name: "sessions" },
                ],
                limit: PAGE_SIZE,
                offset,
              };

              const res = await fetch(
                `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(reqBody),
                },
              );

              if (!res.ok) {
                const txt = await res.text();
                dayErrorMsg = `GA4 ${res.status}: ${txt.slice(0, 200)}`;
                dayHaltedEarly = true;
                break;
              }

              // First successful page -> safe to replace local day.
              if (!deletedOld) {
                await supabase
                  .from(PAGE_TABLE)
                  .delete()
                  .eq("client_id", CLIENT_ID)
                  .eq("report_date", dateStr);
                deletedOld = true;
              }

              const r2 = await res.json();
              if (
                expectedTotal === null &&
                typeof r2.rowCount !== "undefined"
              ) {
                expectedTotal = Number(r2.rowCount) || 0;
              }

              const pageRows = r2.rows || [];
              if (pageRows.length === 0) {
                hasMore = false;
                break;
              }

              const mapped = pageRows.map(
                (row: {
                  dimensionValues?: { value?: string }[];
                  metricValues?: { value?: string }[];
                }) => {
                  const dv = row.dimensionValues || [];
                  const mv = row.metricValues || [];
                  const loc = dv[0]?.value ?? "";
                  const { page_path, page_path_q_s } = pathsFromLocation(
                    loc,
                    CLIENT_ID,
                  );
                  const src = dv[3]?.value || "(direct)";
                  const med = dv[4]?.value || "(none)";
                  // Only classify when config has vdp_url_pattern.
                  // Otherwise leave NULL so a later VDP step owns tagging.
                  const hasMatchers = vdpMatchers.length > 0;
                  const pageType = hasMatchers
                    ? classifyPage(loc, page_path, vdpMatchers)
                    : null;
                  return {
                    client_id: CLIENT_ID,
                    ga4_property_id: propertyId,
                    account_name: accountName,
                    report_date: dateStr,
                    page_location: loc,
                    page_path,
                    page_path_q_s,
                    page_title: dv[1]?.value || "",
                    channel: channelNorm(dv[2]?.value),
                    source: src,
                    medium: med,
                    source_medium: `${src} / ${med}`,
                    session_campaign: dv[5]?.value || "(not set)",
                    views: parseInt(mv[0]?.value || "0", 10) || 0,
                    total_users: parseInt(mv[1]?.value || "0", 10) || 0,
                    new_users: parseInt(mv[2]?.value || "0", 10) || 0,
                    sessions: parseInt(mv[3]?.value || "0", 10) || 0,
                    ga4_page_type: pageType,
                    vdp_conditions: hasMatchers
                      ? String(pageType || "").startsWith("VDP")
                      : null,
                  };
                },
              );

              for (let j = 0; j < mapped.length; j += CHUNK_SIZE) {
                const chunk = mapped.slice(j, j + CHUNK_SIZE);
                const { inserted, error } = await insertResilient(chunk);
                if (error) {
                  dayErrorMsg = `Insert failed: ${error}`;
                  dayHaltedEarly = true;
                  break;
                }
                dayRows += inserted;
                pendingInserts.push(...chunk);
              }
              if (dayHaltedEarly) break;

              if (pageRows.length < PAGE_SIZE) {
                hasMore = false;
              } else {
                offset += PAGE_SIZE;
              }
            }

            const naturallyFinished = !hasMore && !dayHaltedEarly;
            const rowCountMatches =
              expectedTotal === null || dayRows === expectedTotal;

            if (naturallyFinished && rowCountMatches && dayRows > 0) {
              const { error: markErr } = await supabase
                .from(COMPLETE_TABLE)
                .upsert(
                  {
                    client_id: CLIENT_ID,
                    report_date: dateStr,
                    row_count: dayRows,
                    completed_at: new Date().toISOString(),
                  },
                  { onConflict: "client_id,report_date" },
                );
              if (markErr) {
                log(
                  `   WARN [${accountName}] ${dateStr}: rows OK but marker failed: ${markErr.message}`,
                );
              } else {
                log(`   OK [${accountName}] ${dateStr}: ${dayRows} rows OK`);
              }
              dealerRows += dayRows;
              dealerDays += 1;
            } else if (naturallyFinished && dayRows === 0) {
              // Keep empty day (GA4 may still be settling) - do not mark complete.
              if (deletedOld) {
                log(
                  `   WAIT [${accountName}] ${dateStr}: GA4 returned 0 rows (not settled?) - left empty for retry`,
                );
              } else {
                log(
                  `   WAIT [${accountName}] ${dateStr}: GA4 returned 0 rows - prior local data kept`,
                );
              }
              dealerErrors.push(`${dateStr}: 0 rows from GA4 (settling)`);
            } else {
              // Partial / budget halt after delete -> wipe partial inserts.
              if (deletedOld) {
                await supabase
                  .from(PAGE_TABLE)
                  .delete()
                  .eq("client_id", CLIENT_ID)
                  .eq("report_date", dateStr);
              }
              const reason = dayErrorMsg
                ? dayErrorMsg
                : !naturallyFinished
                ? "halted early (budget)"
                : `row mismatch (${dayRows}/${expectedTotal})`;
              log(
                `   SKIP [${accountName}] ${dateStr}: rolled back partial - ${reason}`,
              );
              dealerErrors.push(`${dateStr}: ${reason}`);
            }
          } catch (dayEx: unknown) {
            if (deletedOld) {
              await supabase
                .from(PAGE_TABLE)
                .delete()
                .eq("client_id", CLIENT_ID)
                .eq("report_date", dateStr);
            }
            const msg = dayEx instanceof Error ? dayEx.message : String(dayEx);
            log(`   ERR [${accountName}] ${dateStr}: exception - ${msg}`);
            dealerErrors.push(`${dateStr}: ${msg}`);
          }

          if (cutoffReached) break;
        }

        totalGlobalRows += dealerRows;
        dealerSummary.push({
          client_id: CLIENT_ID,
          account_name: accountName,
          status: dealerErrors.length === 0 ? "ok" : "partial",
          days_completed: dealerDays,
          rows_inserted: dealerRows,
          page_path_q_s_mode: usePathQs,
          admin_aligned: true,
          errors: dealerErrors.slice(0, 5),
        });

        await safeStatusUpdate(
          CLIENT_ID,
          dealerErrors.length === 0 ? "ok" : "partial",
        );
      } catch (dealerEx: unknown) {
        const msg =
          dealerEx instanceof Error ? dealerEx.message : String(dealerEx);
        log(`ERR [${accountName}] dealer error: ${msg}`);
        dealerSummary.push({
          client_id: CLIENT_ID,
          account_name: accountName,
          status: "error",
          error: msg,
        });
        await safeStatusUpdate(CLIENT_ID, "error");
      }

      if (cutoffReached) break;
    }

    const elapsedMs = Date.now() - startTime;
    log(
      `\n=== DONE - ${totalGlobalRows} rows across ${dealerSummary.length} dealers in ${elapsedMs}ms ===`,
    );

    return jsonRes({
      success: true,
      cutoff_reached: cutoffReached,
      mode: modeLabel,
      window: { from: dateFrom, to: dateTo, days_back: daysBack },
      settling_cutoff: settlingCutoff,
      force_refresh: forceRefresh,
      admin_aligned: true,
      newest_first: true,
      total_dealers: dealers.length,
      processed_dealers: dealerSummary.length,
      rows_inserted: totalGlobalRows,
      elapsed_ms: elapsedMs,
      dealers: dealerSummary,
      log: L,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    return jsonRes({ success: false, error: msg, log: L }, 500);
  }
});
