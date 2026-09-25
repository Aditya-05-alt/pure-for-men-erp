/* eslint-env jest */
import { render, screen, waitFor } from '@testing-library/react';
import TypeBreakdown from '@/components/dashboard/TypeBreakdown';

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: jest.fn().mockResolvedValue({
      data: [
        { type_bucket: 'Travel Trailer', views: 5000, pct: 50.0, rank: 1 },
        { type_bucket: 'Fifth Wheel', views: 3000, pct: 30.0, rank: 2 },
        { type_bucket: 'Motorhome', views: 2000, pct: 20.0, rank: 3 },
      ],
      error: null,
    }),
  }),
}));

const mockUseOverview = jest.fn();
jest.mock('@/components/dashboard/overview/OverviewDataContext', () => ({
  useOverview: () => mockUseOverview(),
}));

test('renders all types and total on VDP tab', async () => {
  mockUseOverview.mockReturnValue({
    tab: 'vdp',
    clientKey: '2728830488',
    from: '2026-04-01',
    to: '2026-05-28',
    vdpFilters: { type: 'Travel Trailer', make: 'All', model: 'All', year: 'All', condition: 'All', location: 'All' },
  });

  render(
    <TypeBreakdown
      clientId="2728830488"
      from="2026-04-01"
      to="2026-05-28"
      limit={null}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('Travel Trailer')).toBeInTheDocument();
    expect(screen.getByText('Fifth Wheel')).toBeInTheDocument();
    expect(screen.getByText('Motorhome')).toBeInTheDocument();
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
    <TypeBreakdown
      clientId="2728830488"
      from="2026-04-01"
      to="2026-05-28"
      limit={null}
    />
  );

  expect(container).toBeEmptyDOMElement();
});
