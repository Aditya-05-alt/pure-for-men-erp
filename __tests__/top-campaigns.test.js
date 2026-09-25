/* eslint-env jest */
import { render, screen, waitFor } from '@testing-library/react';
import TopCampaigns from '@/components/dashboard/TopCampaigns';

const mockRows = [
  {
    campaign: 'spring_sale_2026',
    source: 'google',
    medium: 'cpc',
    channel: 'paid_search',
    views: 5000,
    sessions: 3000,
    total_users: 2500,
    new_users: 1500,
    pct: 50.0,
    rank: 1,
  },
  {
    campaign: '(not set)',
    source: 'google',
    medium: 'organic',
    channel: 'organic_search',
    views: 3000,
    sessions: 2000,
    total_users: 1800,
    new_users: 900,
    pct: 30.0,
    rank: 2,
  },
  {
    campaign: 'fb_promo',
    source: 'facebook',
    medium: 'cpc',
    channel: 'paid_social',
    views: 2000,
    sessions: 1500,
    total_users: 1200,
    new_users: 800,
    pct: 20.0,
    rank: 3,
  },
];

jest.mock('@/lib/api/dashboardApi', () => ({
  fetchTopCampaigns: jest.fn().mockResolvedValue(mockRows),
}));

const mockUseOverview = jest.fn();
jest.mock('@/components/dashboard/overview/OverviewDataContext', () => ({
  useOverview: () => mockUseOverview(),
}));

test('renders top campaigns on All tab', async () => {
  mockUseOverview.mockReturnValue({
    tab: 'all',
    clientKey: '2728830488',
    from: '2026-04-01',
    to: '2026-05-28',
  });

  render(
    <TopCampaigns
      clientId="2728830488"
      from="2026-04-01"
      to="2026-05-28"
      limit={10}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('spring_sale_2026')).toBeInTheDocument();
    expect(screen.getByText('fb_promo')).toBeInTheDocument();
    expect(screen.getByText('10,000')).toBeInTheDocument();
  });
});

test('does NOT render on VDP tab', () => {
  mockUseOverview.mockReturnValue({
    tab: 'vdp',
    clientKey: '2728830488',
    from: '2026-04-01',
    to: '2026-05-28',
  });

  const { container } = render(
    <TopCampaigns
      clientId="2728830488"
      from="2026-04-01"
      to="2026-05-28"
      limit={10}
    />
  );

  expect(container).toBeEmptyDOMElement();
});
