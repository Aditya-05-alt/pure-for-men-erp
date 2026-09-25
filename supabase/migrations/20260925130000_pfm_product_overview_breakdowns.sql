-- Product overview breakdowns (channel + direct/collection shape)

CREATE OR REPLACE FUNCTION public.get_pfm_product_channel_breakdown(
  p_from date,
  p_to date,
  p_client_id text DEFAULT '001'
)
RETURNS TABLE (
  channel_bucket text,
  views bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(d.channel), ''), '(not set)') AS channel_bucket,
    COALESCE(SUM(d.views), 0)::bigint AS views
  FROM public.chipper_pfm_ga4_data d
  WHERE d.client_id = p_client_id
    AND d.report_date >= p_from
    AND d.report_date <= p_to
    AND public.is_pfm_product_page_path(d.page_path)
  GROUP BY 1
  ORDER BY views DESC, channel_bucket ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_pfm_product_shape_breakdown(
  p_from date,
  p_to date,
  p_client_id text DEFAULT '001'
)
RETURNS TABLE (
  shape_bucket text,
  views bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN d.page_path ~* '^(/[a-z]{2}-[a-z]{2})?/products/[^/]+/?$' THEN 'direct'
      WHEN d.page_path ~* '/collections/.+/products/[^/]+' THEN 'collection'
      ELSE 'other'
    END AS shape_bucket,
    COALESCE(SUM(d.views), 0)::bigint AS views
  FROM public.chipper_pfm_ga4_data d
  WHERE d.client_id = p_client_id
    AND d.report_date >= p_from
    AND d.report_date <= p_to
    AND public.is_pfm_product_page_path(d.page_path)
  GROUP BY 1
  ORDER BY views DESC;
$$;

REVOKE ALL ON FUNCTION public.get_pfm_product_channel_breakdown(date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pfm_product_shape_breakdown(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pfm_product_channel_breakdown(date, date, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pfm_product_shape_breakdown(date, date, text) TO anon, authenticated, service_role;
