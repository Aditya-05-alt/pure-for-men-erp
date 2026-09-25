/* eslint-env jest */
import { render, screen, waitFor } from '@testing-library/react';
import ConditionBreakdown from '@/components/dashboard/ConditionBreakdown';

const mockRows = [
  { condition_bucket: 'New', views: 6000, pct: 60.0, rank: 1 },
  { condition_bucket: 'Used', views: 3000, pct: 30.0, rank: 2 },
  { condition_bucket: 'Unknown', views: 1000, pct: 10.0, rank: 3 },
];

jest.mock('@/lib/api/dashboardApi', () => ({
  fetchConditionBreakdown: jest.fn().mockResolvedValue(mockRows),
}));

const mockUseOverview = jest.fn();
jest.mock('@/components/dashboard/overview/OverviewDataContext', () => ({
  useOverview: () => mockUseOverview(),
}));

test('renders condition rows on VDP tab', async () => {
  mockUseOverview.mockReturnValue({
    tab: 'vdp',
    clientKey: '2728830488',
    from: '2026-04-01',
    to: '2026-05-28',
  });

  render(
    <ConditionBreakdown
      clientId="2728830488"
      from="2026-04-01"
      to="2026-05-28"
      limit={null}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Used')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
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
    <ConditionBreakdown
      clientId="2728830488"
      from="2026-04-01"
      to="2026-05-28"
      limit={null}
    />
  );

  expect(container).toBeEmptyDOMElement();
});
