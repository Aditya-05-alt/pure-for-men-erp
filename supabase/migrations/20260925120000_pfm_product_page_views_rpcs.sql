-- Product Page Views RPCs for Pure for Men
-- Product = Shopify /products/{handle} paths, excluding web-pixel + CDN image noise

CREATE OR REPLACE FUNCTION public.is_pfm_product_page_path(p_path text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(p_path, '') ~* '/products/[^/?]+'
    AND COALESCE(p_path, '') NOT ILIKE '%/web-pixels%'
    AND COALESCE(p_path, '') NOT ILIKE '%/cdn/shop/products/%';
$$;

CREATE OR REPLACE FUNCTION public.get_pfm_product_page_views_daily(
  p_from date,
  p_to date,
  p_client_id text DEFAULT '001'
)
RETURNS TABLE (
  report_date date,
  views bigint,
  sessions bigint,
  total_users bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.report_date,
    COALESCE(SUM(d.views), 0)::bigint AS views,
    COALESCE(SUM(d.sessions), 0)::bigint AS sessions,
    COALESCE(SUM(d.total_users), 0)::bigint AS total_users
  FROM public.chipper_pfm_ga4_data d
  WHERE d.client_id = p_client_id
    AND d.report_date >= p_from
    AND d.report_date <= p_to
    AND public.is_pfm_product_page_path(d.page_path)
  GROUP BY d.report_date
  ORDER BY d.report_date;
$$;

CREATE OR REPLACE FUNCTION public.get_pfm_top_product_pages(
  p_from date,
  p_to date,
  p_client_id text DEFAULT '001',
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  page_path text,
  page_title text,
  views bigint,
  sessions bigint,
  total_users bigint,
  new_users bigint,
  conversions numeric,
  revenue numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(d.page_path), ''), '(not set)') AS page_path,
    MAX(NULLIF(TRIM(d.page_title), '')) AS page_title,
    COALESCE(SUM(d.views), 0)::bigint AS views,
    COALESCE(SUM(d.sessions), 0)::bigint AS sessions,
    COALESCE(SUM(d.total_users), 0)::bigint AS total_users,
    COALESCE(SUM(d.new_users), 0)::bigint AS new_users,
    COALESCE(SUM(d.conversions), 0)::numeric AS conversions,
    COALESCE(SUM(d.revenue), 0)::numeric AS revenue
  FROM public.chipper_pfm_ga4_data d
  WHERE d.client_id = p_client_id
    AND d.report_date >= p_from
    AND d.report_date <= p_to
    AND public.is_pfm_product_page_path(d.page_path)
  GROUP BY 1
  ORDER BY views DESC, page_path ASC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

REVOKE ALL ON FUNCTION public.is_pfm_product_page_path(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pfm_product_page_views_daily(date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pfm_top_product_pages(date, date, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_pfm_product_page_path(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pfm_product_page_views_daily(date, date, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pfm_top_product_pages(date, date, text, integer) TO anon, authenticated, service_role;
