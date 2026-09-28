-- Prior-period metrics for a specific set of URLs (so URL-keyed compare tables
-- don't show 0 for pages outside the prior period's top N), plus a channel
-- breakdown across all pages for the All Page Views tab.

CREATE OR REPLACE FUNCTION public.get_pfm_pages_by_paths(
  p_from date,
  p_to date,
  p_client_id text DEFAULT '001',
  p_paths text[] DEFAULT '{}'
)
RETURNS TABLE (
  page_path text,
  page_title text,
  views bigint,
  sessions bigint,
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
    COALESCE(SUM(d.views), 0)::bigint,
    COALESCE(SUM(d.sessions), 0)::bigint,
    COALESCE(SUM(d.total_users), 0)::bigint,
    COALESCE(SUM(d.new_users), 0)::bigint
  FROM public.chipper_pfm_ga4_data d
  WHERE d.client_id = p_client_id
    AND d.report_date >= p_from
    AND d.report_date <= p_to
    AND COALESCE(NULLIF(TRIM(d.page_path), ''), '(not set)') = ANY (p_paths)
  GROUP BY 1;
$$;

CREATE OR REPLACE FUNCTION public.get_pfm_channel_breakdown(
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
    COALESCE(SUM(d.views), 0)::bigint,
    COALESCE(SUM(d.conversions), 0)::numeric,
    COALESCE(SUM(d.total_users), 0)::bigint,
    COALESCE(SUM(d.new_users), 0)::bigint
  FROM public.chipper_pfm_ga4_data d
  WHERE d.client_id = p_client_id
    AND d.report_date >= p_from
    AND d.report_date <= p_to
  GROUP BY 1
  ORDER BY 2 DESC, 1;
$$;

-- Top pages now also returns new_users (return type change requires drop).
DROP FUNCTION IF EXISTS public.get_pfm_top_pages(date, date, text, integer);
CREATE FUNCTION public.get_pfm_top_pages(
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
    COALESCE(SUM(d.views), 0)::bigint AS views,
    COALESCE(SUM(d.sessions), 0)::bigint AS sessions,
    COALESCE(SUM(d.total_users), 0)::bigint AS total_users,
    COALESCE(SUM(d.new_users), 0)::bigint AS new_users
  FROM public.chipper_pfm_ga4_data d
  WHERE d.client_id = p_client_id
    AND d.report_date >= p_from
    AND d.report_date <= p_to
  GROUP BY 1
  ORDER BY views DESC, page_path ASC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

REVOKE ALL ON FUNCTION public.get_pfm_top_pages(date, date, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pfm_top_pages(date, date, text, integer)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_pfm_pages_by_paths(date, date, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pfm_channel_breakdown(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pfm_pages_by_paths(date, date, text, text[])
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pfm_channel_breakdown(date, date, text)
  TO anon, authenticated, service_role;
