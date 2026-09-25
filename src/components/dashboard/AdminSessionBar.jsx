'use client';

import { superadminSignOutAction } from '@/lib/auth/adminActions';

export default function AdminSessionBar({ username, label }) {
  return (
    <div className="admin-session-bar">
      <div className="admin-session-meta">
        <span className="admin-session-badge">Superadmin</span>
        <span className="admin-session-user">{label || username}</span>
      </div>
      <form action={superadminSignOutAction}>
        <button type="submit" className="admin-session-signout">
          Sign out admin
        </button>
      </form>
    </div>
  );
}
