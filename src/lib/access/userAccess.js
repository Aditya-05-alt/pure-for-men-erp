import { DEFAULT_ACCESS, normalizeAccess } from '@/lib/access/permissions';

export const USER_ROLES_TABLE = 'smart_user_roles';
export const USER_REPORTS_TABLE = 'smart_user_reports';
export const USER_DEALERS_TABLE = 'smart_user_dealers';
export const ROLES_TABLE = 'smart_roles';
export const REPORTS_TABLE = 'smart_reports';

export function accessSchemaError(error) {
  if (
    /smart_user_roles|smart_user_reports|smart_user_dealers|smart_roles|smart_reports|schema cache|does not exist/i.test(
      error?.message || ''
    )
  ) {
    return new Error(
      'Role tables are missing — run supabase/migrations/smart_user_access.sql'
    );
  }
  return error;
}

/** Load one user's access from normalized tables → shape for normalizeAccess(). */
export async function loadUserAccessRecord(supabase, authUserId) {
  if (!authUserId) return null;

  const { data: roleRow, error: roleError } = await supabase
    .from(USER_ROLES_TABLE)
    .select('role_key, all_reports, all_dealers')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (roleError) throw accessSchemaError(roleError);
  if (!roleRow) return null;

  if (roleRow.role_key === 'admin') {
    return {
      role: 'admin',
      all_reports: true,
      all_dealers: true,
      report_keys: [],
      dealer_ids: [],
    };
  }

  const [{ data: reportRows, error: reportError }, { data: dealerRows, error: dealerError }] =
    await Promise.all([
      supabase
        .from(USER_REPORTS_TABLE)
        .select('report_key')
        .eq('auth_user_id', authUserId),
      supabase
        .from(USER_DEALERS_TABLE)
        .select('dealer_id')
        .eq('auth_user_id', authUserId),
    ]);

  if (reportError) throw accessSchemaError(reportError);
  if (dealerError) throw accessSchemaError(dealerError);

  return {
    role: 'user',
    all_reports: roleRow.all_reports === true,
    all_dealers: roleRow.all_dealers === true,
    report_keys: (reportRows || []).map((row) => row.report_key),
    dealer_ids: (dealerRows || []).map((row) => Number(row.dealer_id)),
  };
}

export async function loadNormalizedUserAccess(supabase, authUserId) {
  const record = await loadUserAccessRecord(supabase, authUserId);
  return normalizeAccess(record);
}

/** Persist user role + junction rows (service role). */
export async function saveUserAccess(supabase, {
  userId,
  email,
  role,
  allReports,
  reportKeys,
  allDealers,
  dealerIds,
  updatedBy,
}) {
  const roleKey = role === 'user' ? 'user' : 'admin';
  const isAdmin = roleKey === 'admin';
  const record = {
    auth_user_id: userId,
    email: String(email || '').trim().toLowerCase(),
    role_key: roleKey,
    all_reports: isAdmin || allReports === true,
    all_dealers: isAdmin || allDealers === true,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy || null,
  };

  const { error: upsertError } = await supabase
    .from(USER_ROLES_TABLE)
    .upsert(record, { onConflict: 'auth_user_id' });

  if (upsertError) throw accessSchemaError(upsertError);

  await supabase.from(USER_REPORTS_TABLE).delete().eq('auth_user_id', userId);
  await supabase.from(USER_DEALERS_TABLE).delete().eq('auth_user_id', userId);

  if (!isAdmin && !record.all_reports && reportKeys?.length) {
    const { error } = await supabase.from(USER_REPORTS_TABLE).insert(
      reportKeys.map((reportKey) => ({
        auth_user_id: userId,
        report_key: reportKey,
      }))
    );
    if (error) throw accessSchemaError(error);
  }

  if (!isAdmin && !record.all_dealers && dealerIds?.length) {
    const { error } = await supabase.from(USER_DEALERS_TABLE).insert(
      dealerIds.map((dealerId) => ({
        auth_user_id: userId,
        dealer_id: dealerId,
      }))
    );
    if (error) throw accessSchemaError(error);
  }

  return loadNormalizedUserAccess(supabase, userId);
}

export function formatReportsSummary(access, reportCatalog = []) {
  if (!access || access.role === 'admin' || access.allReports) return 'All';
  if (!access.reportKeys?.length) return '—';
  const labels = new Map((reportCatalog || []).map((r) => [r.key || r.report_key, r.label]));
  return access.reportKeys.map((key) => labels.get(key) || key).join(', ');
}

export function formatDealersSummary(access, dealerCatalog = []) {
  if (!access || access.role === 'admin' || access.allDealers) return 'All';
  if (!access.dealerIds?.length) return '—';
  const names = new Map((dealerCatalog || []).map((d) => [Number(d.id), d.name]));
  const labels = access.dealerIds.map((id) => names.get(Number(id)) || `ID ${id}`);
  if (labels.length <= 3) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
}

export { DEFAULT_ACCESS };
