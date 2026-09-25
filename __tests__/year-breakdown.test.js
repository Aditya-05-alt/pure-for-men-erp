/* eslint-env jest */
import { render, screen, waitFor } from '@testing-library/react';
import YearBreakdown from '@/components/dashboard/YearBreakdown';

const mockRows = [
  { year_bucket: '2025', views: 5000, pct: 50.0, rank: 1 },
  { year_bucket: '2024', views: 3000, pct: 30.0, rank: 2 },
  { year_bucket: '2026', views: 2000, pct: 20.0, rank: 3 },
];

jest.mock('@/lib/api/dashboardApi', () => ({
  fetchYearBreakdown: jest.fn().mockResolvedValue(mockRows),
}));

const mockUseOverview = jest.fn();
jest.mock('@/components/dashboard/overview/OverviewDataContext', () => ({
  useOverview: () => mockUseOverview(),
}));

test('renders years on VDP tab', async () => {
  mockUseOverview.mockReturnValue({
    tab: 'vdp',
    clientKey: '2728830488',
    from: '2026-04-01',
    to: '2026-05-28',
  });

  render(
    <YearBreakdown
      clientId="2728830488"
      from="2026-04-01"
      to="2026-05-28"
      limit={null}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(screen.getByText('10,000')).toBeInTheDocument();
  });
});

test('does not render on non-VDP tabs', () => {
  mockUseOverview.mockReturnValue({
    tab: 'srp',
    clientKey: '2728830488',
    from: '2026-04-01',
    to: '2026-05-28',
  });

  const { container } = render(
    <YearBreakdown
      clientId="2728830488"
      from="2026-04-01"
      to="2026-05-28"
      limit={null}
    />
  );

  expect(container).toBeEmptyDOMElement();
});
