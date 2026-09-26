-- Expand product channel breakdown with views, conversions, total_users, new_users.
-- Uses raw GA4 sessionDefaultChannelGroup values stored in chipper_pfm_ga4_data.channel.

DROP FUNCTION IF EXISTS public.get_pfm_product_channel_breakdown(date, date, text);

CREATE OR REPLACE FUNCTION public.get_pfm_product_channel_breakdown(
  p_from date,
  p_to date,
  p_client_id text DEFAULT '001'
)
RETURNS TABLE (
  channel_bucket text,
  views bigint,
  conversions numeric,
  total_users bigint,
  new_users bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(d.channel), ''), '(not set)') AS channel_bucket,
    COALESCE(SUM(d.views), 0)::bigint AS views,
    COALESCE(SUM(d.conversions), 0)::numeric AS conversions,
    COALESCE(SUM(d.total_users), 0)::bigint AS total_users,
    COALESCE(SUM(d.new_users), 0)::bigint AS new_users
  FROM public.chipper_pfm_ga4_data d
  WHERE d.client_id = p_client_id
    AND d.report_date >= p_from
    AND d.report_date <= p_to
    AND public.is_pfm_product_page_path(d.page_path)
  GROUP BY 1
  ORDER BY views DESC, channel_bucket ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_pfm_product_channel_breakdown(date, date, text)
  TO anon, authenticated, service_role;
