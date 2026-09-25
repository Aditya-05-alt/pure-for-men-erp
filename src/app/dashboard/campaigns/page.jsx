'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Old path → advance route */
export default function CampaignsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/campaigns_advance');
  }, [router]);
  return null;
}
