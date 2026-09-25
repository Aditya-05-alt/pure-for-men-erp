import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';
import { REPORT_OPTIONS, normalizeAccess } from '@/lib/access/permissions';
import {
  REPORTS_TABLE,
  ROLES_TABLE,
  USER_DEALERS_TABLE,
  USER_REPORTS_TABLE,
  USER_ROLES_TABLE,
  accessSchemaError,
  formatDealersSummary,
  formatReportsSummary,
  loadNormalizedUserAccess,
  saveUserAccess,
} from '@/lib/access/userAccess';

function userName(user) {
  return (
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'Unnamed user'
  );
}

export async function GET() {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminDataClient();
  if (!admin || admin.mode !== 'service') {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is required to list Auth users.' },
      { status: 503 }
    );
  }

  try {
    const users = [];
    let page = 1;
    while (page <= 20) {
      const { data, error } = await admin.supabase.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw error;
      const batch = data?.users || [];
      users.push(...batch);
      if (batch.length < 200) break;
      page += 1;
    }

    const [
      { data: roleCatalog, error: rolesError },
      { data: reportCatalog, error: reportsError },
      { data: userRoleRows, error: userRolesError },
      { data: userReportRows, error: userReportsError },
      { data: userDealerRows, error: userDealersError },
      { data: dealerRows, error: dealerError },
    ] = await Promise.all([
      admin.supabase.from(ROLES_TABLE).select('role_key, label, description').order('role_key'),
      admin.supabase.from(REPORTS_TABLE).select('report_key, label, href, sort_order').order('sort_order'),
      admin.supabase.from(USER_ROLES_TABLE).select('*'),
      admin.supabase.from(USER_REPORTS_TABLE).select('auth_user_id, report_key'),
      admin.supabase.from(USER_DEALERS_TABLE).select('auth_user_id, dealer_id'),
      admin.supabase
        .from('smart_hoot_config')
        .select('id, customer_name, ga4_customer_id, is_active')
        .eq('is_active', true)
        .order('customer_name', { ascending: true }),
    ]);

    if (rolesError) throw accessSchemaError(rolesError);
    if (reportsError) throw accessSchemaError(reportsError);
    if (userRolesError) throw accessSchemaError(userRolesError);
    if (userReportsError) throw accessSchemaError(userReportsError);
    if (userDealersError) throw accessSchemaError(userDealersError);
    if (dealerError) throw dealerError;

    const reportsByUser = new Map();
    for (const row of userReportRows || []) {
      const list = reportsByUser.get(row.auth_user_id) || [];
      list.push(row.report_key);
      reportsByUser.set(row.auth_user_id, list);
    }

    const dealersByUser = new Map();
    for (const row of userDealerRows || []) {
      const list = dealersByUser.get(row.auth_user_id) || [];
      list.push(Number(row.dealer_id));
      dealersByUser.set(row.auth_user_id, list);
    }

    const accessByUser = new Map();
    for (const row of userRoleRows || []) {
      const record = {
        role: row.role_key,
        all_reports: row.all_reports,
        all_dealers: row.all_dealers,
        report_keys: reportsByUser.get(row.auth_user_id) || [],
        dealer_ids: dealersByUser.get(row.auth_user_id) || [],
      };
      accessByUser.set(row.auth_user_id, normalizeAccess(record));
    }

    const dealers = (dealerRows || []).map((row) => ({
      id: row.id,
      name: row.customer_name || 'Unnamed dealer',
      clientId: row.ga4_customer_id || null,
    }));

    const reports =
      (reportCatalog || []).length > 0
        ? reportCatalog.map((row) => ({
            key: row.report_key,
            label: row.label,
            href: row.href,
          }))
        : REPORT_OPTIONS;

    const mappedUsers = users
      .map((user) => {
        const access = accessByUser.get(user.id) || {
          role: 'admin',
          allReports: true,
          allDealers: true,
          reportKeys: reports.map((r) => r.key),
          dealerIds: [],
        };
        return {
          id: user.id,
          email: user.email || '',
          name: userName(user),
          createdAt: user.created_at || null,
          lastSignInAt: user.last_sign_in_at || null,
          access,
          reportsSummary: formatReportsSummary(access, reports),
          dealersSummary: formatDealersSummary(access, dealers),
        };
      })
      .sort((a, b) => a.email.localeCompare(b.email));

    return NextResponse.json({
      users: mappedUsers,
      roles: roleCatalog || [
        { role_key: 'admin', label: 'Admin' },
        { role_key: 'user', label: 'User' },
      ],
      reports,
      dealers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load users and roles.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  const updatedBy = await getSuperadminFromCookies();
  if (!updatedBy) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminDataClient();
  if (!admin || admin.mode !== 'service') {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is required to update roles.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const userId = String(body?.userId || '').trim();
    const email = String(body?.email || '').trim();
    const role = body?.role === 'user' ? 'user' : 'admin';
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      return NextResponse.json({ error: 'Invalid user ID.' }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const validReports = new Set(
      (body?.reportKeys || []).filter(Boolean).length
        ? body.reportKeys
        : REPORT_OPTIONS.map((r) => r.key)
    );
    const reportKeys = Array.from(
      new Set((body?.reportKeys || []).filter((key) => validReports.has(key)))
    );
    const dealerIds = Array.from(
      new Set(
        (body?.dealerIds || [])
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );
    const allReports = role === 'admin' || body?.allReports === true;
    const allDealers = role === 'admin' || body?.allDealers === true;

    if (role === 'user' && !allReports && reportKeys.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one report or choose All reports.' },
        { status: 400 }
      );
    }
    if (role === 'user' && !allDealers && dealerIds.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one dealer or choose All active dealers.' },
        { status: 400 }
      );
    }

    const access = await saveUserAccess(admin.supabase, {
      userId,
      email,
      role,
      allReports,
      reportKeys,
      allDealers,
      dealerIds,
      updatedBy,
    });

    return NextResponse.json({ access });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update user access.' },
      { status: 500 }
    );
  }
}
