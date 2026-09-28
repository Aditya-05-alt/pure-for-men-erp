-- Product page x channel breakdown for the "Product vs Channel" table.
-- Ordered by (page_path, channel) so callers can page through with .range().

CREATE OR REPLACE FUNCTION public.get_pfm_product_channel_pages(
  p_from date,
  p_to date,
  p_client_id text DEFAULT '001'
)
RETURNS TABLE (
  page_path text,
  page_title text,
  channel_bucket text,
  views bigint,
  total_users bigint,
  new_users bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(d.page_path), ''), '(not set)') AS page_path,
    MAX(NULLIF(TRIM(d.page_title), '')) AS page_title,
    COALESCE(NULLIF(TRIM(d.channel), ''), '(not set)') AS channel_bucket,
    COALESCE(SUM(d.views), 0)::bigint,
    COALESCE(SUM(d.total_users), 0)::bigint,
    COALESCE(SUM(d.new_users), 0)::bigint
  FROM public.chipper_pfm_ga4_data d
  WHERE d.client_id = p_client_id
    AND d.report_date >= p_from
    AND d.report_date <= p_to
    AND public.is_pfm_product_page_path(d.page_path)
  GROUP BY 1, 3
  ORDER BY 1, 3;
$$;

REVOKE ALL ON FUNCTION public.get_pfm_product_channel_pages(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pfm_product_channel_pages(date, date, text)
  TO anon, authenticated, service_role;
