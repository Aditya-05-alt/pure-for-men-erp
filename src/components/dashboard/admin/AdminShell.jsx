import AdminSessionBar from '@/components/dashboard/AdminSessionBar';
import AdminTopNav from '@/components/dashboard/admin/AdminTopNav';
import { getSuperadminSession } from '@/lib/auth/adminActions';
import { superadminLabel } from '@/lib/auth/superadmin';

export default async function AdminShell({ children }) {
  const session = await getSuperadminSession();

  return (
    <div className="admin-shell-wrap">
      <AdminSessionBar
        username={session?.username}
        label={superadminLabel(session?.username)}
      />
      <AdminTopNav />
      <div className="admin-shell-main">{children}</div>
    </div>
  );
}
