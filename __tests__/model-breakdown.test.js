/* eslint-env jest */
import { render, screen, waitFor } from '@testing-library/react';
import ModelBreakdown from '@/components/dashboard/ModelBreakdown';

const mockRows = [
  { model_bucket: 'Sportsmen', make_bucket: 'KZ RV', views: 5000, pct: 50.0, rank: 1 },
  { model_bucket: 'Cherokee', make_bucket: 'Forest River', views: 3000, pct: 30.0, rank: 2 },
  { model_bucket: 'Cougar', make_bucket: 'Keystone', views: 2000, pct: 20.0, rank: 3 },
];

jest.mock('@/lib/api/dashboardApi', () => ({
  fetchModelBreakdown: jest.fn().mockResolvedValue(mockRows),
}));

const mockUseOverview = jest.fn();
jest.mock('@/components/dashboard/overview/OverviewDataContext', () => ({
  useOverview: () => mockUseOverview(),
}));

test('renders models with make subtext on VDP tab', async () => {
  mockUseOverview.mockReturnValue({
    tab: 'vdp',
    clientKey: '2728830488',
    from: '2026-04-01',
    to: '2026-05-28',
  });

  render(
    <ModelBreakdown
      clientId="2728830488"
      from="2026-04-01"
      to="2026-05-28"
      limit={null}
    />
  );

  await waitFor(() => {
    expect(screen.getByText('Sportsmen')).toBeInTheDocument();
    expect(screen.getByText('KZ RV')).toBeInTheDocument();
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
    <ModelBreakdown
      clientId="2728830488"
      from="2026-04-01"
      to="2026-05-28"
      limit={null}
    />
  );

  expect(container).toBeEmptyDOMElement();
});
