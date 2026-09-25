/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', '@supabase/ssr'],
  },
  async redirects() {
    return [
      {
        source: '/reports/date-wise-views',
        destination: '/dashboard/admin/date-wise-views',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
