import { redirect } from 'next/navigation';

/** Keep old URL; admin layout lives under /dashboard/admin. */
export default function DateWiseViewsRedirect() {
  redirect('/dashboard/admin/date-wise-views');
}
