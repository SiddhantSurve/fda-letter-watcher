select cron.unschedule('process-email-queue');

select cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--fa9f6bbf-ea8a-4b25-89c7-ab90c04210e2.lovable.app/api/public/hooks/process-emails',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret',(select value from public.internal_settings where key='cron_token')
    ),
    body := '{}'::jsonb
  );
  $$
);