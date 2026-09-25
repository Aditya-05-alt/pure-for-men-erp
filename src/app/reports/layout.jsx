import DashboardChrome from '@/app/dashboard/DashboardChrome';

export const metadata = {
  title: 'Reports · SmartAnalytics',
};

export default function ReportsLayout({ children }) {
  return <DashboardChrome>{children}</DashboardChrome>;
}
