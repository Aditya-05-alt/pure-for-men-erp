import { redirect } from 'next/navigation';

/** Source Mapping lives on the main dashboard for all users. */
export default function AdminSourceMappingRedirect() {
  redirect('/dashboard/source-mapping');
}
