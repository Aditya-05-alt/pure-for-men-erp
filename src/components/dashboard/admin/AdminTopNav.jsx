'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard/admin/pipeline', label: 'Pipeline' },
  { href: '/dashboard/admin/dealers', label: 'Dealers' },
  { href: '/dashboard/admin/roles', label: 'Roles' },
  { href: '/dashboard/admin/daily-sync', label: 'Daily Sync' },
  { href: '/dashboard/admin/date-wise-views', label: 'Date-wise Views' },
  { href: '/dashboard/admin/vdp-logics', label: 'Vdp - Logics' },
];

function isActive(pathname, href) {
  if (href === '/dashboard/admin/pipeline') {
    return (
      pathname === href ||
      (pathname.startsWith('/dashboard/admin') &&
        !pathname.startsWith('/dashboard/admin/dealers') &&
        !pathname.startsWith('/dashboard/admin/roles') &&
        !pathname.startsWith('/dashboard/admin/daily-sync') &&
        !pathname.startsWith('/dashboard/admin/date-wise-views') &&
        !pathname.startsWith('/dashboard/admin/vdp-logics') &&
        pathname !== '/dashboard/admin')
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminTopNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-topnav" aria-label="Admin sections">
      {LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`admin-topnav-link ${active ? 'active' : ''}`}
            prefetch={false}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
