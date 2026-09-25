/* eslint-env jest */
import { render, screen, waitFor } from '@testing-library/react';
import MakeBreakdown from '@/components/dashboard/MakeBreakdown';

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: jest.fn().mockResolvedValue({
      data: [
        { make_bucket: 'Forest River', views: 5000, pct: 50.0, rank: 1 },
        { make_bucket: 'Jayco', views: 3000, pct: 30.0, rank: 2 },
        { make_bucket: 'Keystone', views: 2000, pct: 20.0, rank: 3 },
      ],
      error: null,
    }),
  }),
}));

const mockUseOverview = jest.fn();
jest.mock('@/components/dashboard/overview/OverviewDataContext', () => ({
  useOverview: () => mockUseOverview(),
}));

test('renders all makes and TOTAL on VDP tab', async () => {
  mockUseOverview.mockReturnValue({
    tab: 'vdp',
    clientKey: '2728830488',
    from: '2026-04-01',
    to: '2026-05-28',
  });

  render(
    <MakeBreakdown
      clientId="2728830488"
      from="2026-04-01"
      to="2026-05-28"
      limit={null}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('Forest River')).toBeInTheDocument();
    expect(screen.getByText('Jayco')).toBeInTheDocument();
    expect(screen.getByText('Keystone')).toBeInTheDocument();
    expect(screen.getByText('10,000')).toBeInTheDocument();
  });
});

test('does not render on non-VDP tabs', async () => {
  mockUseOverview.mockReturnValue({
    tab: 'srp',
    clientKey: '2728830488',
    from: '2026-04-01',
    to: '2026-05-28',
  });

  const { container } = render(
    <MakeBreakdown
      clientId="2728830488"
      from="2026-04-01"
      to="2026-05-28"
      limit={null}
    />
  );

  expect(container).toBeEmptyDOMElement();
});
