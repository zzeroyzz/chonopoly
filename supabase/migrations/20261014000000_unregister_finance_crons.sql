-- Unregister the finance product's cron jobs.
--
-- NOT YET RUN. This file is written for review and is executed by the owner,
-- deliberately and separately. Running it stops scheduled work and stops emails
-- going out, which is not a side effect any code change should carry.
--
-- Why this exists: the finance product moved to its own project (finance-app).
-- Its UI is gone from this app, but these four jobs never went through the
-- Next.js app at all — pg_cron calls the Supabase Edge Functions directly over
-- pg_net. So they keep running after the UI is gone: still writing to the
-- financial tables, still syncing balances, and still emailing users about
-- budgets they can no longer open here.
--
-- What this does NOT do, on purpose:
--   * does not drop or truncate any table — budgets, budget_periods,
--     savings_goals, savings_goal_history and plaid_items are untouched, and
--     finance-app reads them
--   * does not undeploy or delete the Edge Functions themselves; they simply
--     stop being called on a schedule
--   * touches no Plaid Item, token or connection
--
-- Each statement is guarded, so this is safe to run more than once and safe to
-- run if a job was already removed by hand.

DO $$
DECLARE
  job_name text;
BEGIN
  FOREACH job_name IN ARRAY ARRAY[
    'nightly-snapshot',
    'nightly-snapshot-7am',
    'nightly-budget-reset',
    'sync-goal-balances',
    'weekly-report',
    'morning-report',
    'morning_report'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = job_name) THEN
      PERFORM cron.unschedule(job_name);
      RAISE NOTICE 'unscheduled cron job: %', job_name;
    ELSE
      RAISE NOTICE 'no such cron job, skipping: %', job_name;
    END IF;
  END LOOP;
END $$;

-- Verify afterwards with:
--   SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
