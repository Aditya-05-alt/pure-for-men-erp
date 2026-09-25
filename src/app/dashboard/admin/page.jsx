import { redirect } from 'next/navigation';

export const metadata = { title: 'Admin · SmartAnalytics' };

/** Admin home → Data Pipeline only */
export default function AdminPage() {
  redirect('/dashboard/admin/pipeline');
}
