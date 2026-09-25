/** Sentinel id for the portfolio-wide "All Dealer" picker option (no GA4 client). */
export const ALL_DEALER_ID = '__all_dealer__';

export const ALL_DEALER_CLIENT = {
  id: ALL_DEALER_ID,
  name: 'All Dealers',
  hootId: null,
  hootUrl: null,
  ga4CustomerId: null,
  websitePlatform: null,
  isActive: true,
  category: 'rv',
  isAllDealer: true,
};

export function isAllDealerClient(client) {
  return client?.isAllDealer === true || String(client?.id) === ALL_DEALER_ID;
}
