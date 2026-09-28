import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isValidSuperadminSession, SUPERADMIN_COOKIE } from '@/lib/auth/superadmin';
import {
  canAccessReport,
  firstAllowedReportHref,
  normalizeAccess,
  reportKeyFromPathname,
} from '@/lib/access/permissions';
import { loadUserAccessRecord } from '@/lib/access/userAccess';
import { HARDCODED_LOGIN_ENABLED } from '@/lib/auth/pfmHardcoded';

async function enforceDashboardReportAccess(supabase, user, response, request, pathname) {
  const reportKey = reportKeyFromPathname(pathname);
  if (!reportKey) return response;

  try {
    const record = await loadUserAccessRecord(supabase, user.id);
    const access = normalizeAccess(record);
    if (canAccessReport(access, reportKey)) return response;
    return NextResponse.redirect(new URL(firstAllowedReportHref(access), request.url));
  } catch {
    return response;
  }
}

function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Demo cookie only counts in hardcoded or no-Supabase demo mode. */
function hasDemoSession(request) {
  if (!HARDCODED_LOGIN_ENABLED && supabaseConfigured()) return false;
  return Boolean(request.cookies.get('sa_demo_session')?.value);
}

async function hasSupabaseUser(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { user: null, response: NextResponse.next() };

  let response = NextResponse.next();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, response, supabase };
}

/**
 * Auth gate:
 *   /              — Pure for Men app (hardcoded session or Supabase)
 *   /dashboard/*   — clone dashboard routes
 *   /reports/*     — reports
 *   /login, /signup — public; bounce home if already signed in
 */
export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Already signed in → skip login / signup pages
  if (pathname === '/login' || pathname === '/signup') {
    if (hasDemoSession(request)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    if (!HARDCODED_LOGIN_ENABLED) {
      const { user } = await hasSupabaseUser(request);
      if (user) return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  const protectHome = pathname === '/';
  const protectReports = pathname.startsWith('/reports');
  const protectDashboard = pathname.startsWith('/dashboard');

  if (!protectHome && !protectReports && !protectDashboard) {
    return NextResponse.next();
  }

  if (protectReports) {
    const adminSession = request.cookies.get(SUPERADMIN_COOKIE)?.value;
    if (isValidSuperadminSession(adminSession)) {
      return NextResponse.next();
    }
  }

  if (pathname.startsWith('/dashboard/admin')) {
    const adminSession = request.cookies.get(SUPERADMIN_COOKIE)?.value;
    if (isValidSuperadminSession(adminSession)) {
      return NextResponse.next();
    }
    const adminLogin = new URL('/admin/login', request.url);
    adminLogin.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(adminLogin);
  }

  if (hasDemoSession(request)) {
    return NextResponse.next();
  }

  // Hardcoded PFM mode: demo cookie is the only login path for /
  if (HARDCODED_LOGIN_ENABLED && protectHome) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { user, response, supabase } = await hasSupabaseUser(request);
  if (user) {
    if (protectDashboard && supabase) {
      return enforceDashboardReportAccess(
        supabase,
        user,
        response,
        request,
        pathname
      );
    }
    return response;
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirectTo', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/', '/login', '/signup', '/dashboard/:path*', '/reports/:path*'],
};
