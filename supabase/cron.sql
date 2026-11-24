-- =====================================================================
-- 예약 작업(설계서 8장·12.2) — 마이그레이션을 적용하고 purge 함수를 배포한 뒤 실행한다.
--   1) Dashboard → Database → Extensions 에서 pg_cron, pg_net 을 켠다.
--   2) 아래 <...> 값을 채워 Vault 에 넣는다(한 번만).
--   3) 나머지를 실행해 작업을 등록한다.
-- =====================================================================

-- 2) 비밀값 저장 (값은 Dashboard → Project Settings → API / Edge Function secrets 에서 확인)
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<PURGE_SECRET 과 같은 값>', 'purge_secret');

-- 3-1) 만료된 강의실을 10분마다 종료 상태로
select cron.schedule('ppr-close-expired', '*/10 * * * *', $$ select public.close_expired_rooms(); $$);

-- 3-2) 매시간 7분에 파기 Edge Function 호출
select cron.schedule(
  'ppr-purge',
  '7 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/purge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-purge-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'purge_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- 확인
-- select jobname, schedule, active from cron.job;
-- select * from cron.job_run_details order by start_time desc limit 10;
-- 해제: select cron.unschedule('ppr-purge');
