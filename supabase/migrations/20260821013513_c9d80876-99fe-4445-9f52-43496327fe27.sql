select cron.alter_job(11, schedule := '5 * * * *');

select cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--fa9f6bbf-ea8a-4b25-89c7-ab90c04210e2.lovable.app/lovable/email/queue/process',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);