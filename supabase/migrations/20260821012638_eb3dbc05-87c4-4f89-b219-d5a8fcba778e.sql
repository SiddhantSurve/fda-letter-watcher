CREATE TABLE IF NOT EXISTS public.internal_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
REVOKE ALL ON public.internal_settings FROM anon, authenticated;
GRANT ALL ON public.internal_settings TO service_role;
ALTER TABLE public.internal_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.internal_settings(key, value)
VALUES ('cron_token', '2c1896f3d6e0b6d3e2f719457842474123473009cb3d5128')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.unschedule('fda-warning-letters-weekly');
SELECT cron.unschedule('fda-process-pending');

SELECT cron.schedule('fda-warning-letters-weekly', '0 9 * * 1', $$
  SELECT net.http_post(
    url := 'https://project--fa9f6bbf-ea8a-4b25-89c7-ab90c04210e2.lovable.app/api/public/hooks/scrape-fda',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from public.internal_settings where key='cron_token')),
    body := '{}'::jsonb
  );
$$);

SELECT cron.schedule('fda-process-pending', '*/10 * * * *', $$
  SELECT net.http_post(
    url := 'https://project--fa9f6bbf-ea8a-4b25-89c7-ab90c04210e2.lovable.app/api/public/hooks/process-pending?limit=30',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from public.internal_settings where key='cron_token')),
    body := '{}'::jsonb
  );
$$);