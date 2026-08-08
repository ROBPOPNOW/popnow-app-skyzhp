-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- APP CONFIG TABLE
-- Generic key/value store for app-level config read by the client at launch.
-- First use: "latest_version" drives the dismissible "update available" nudge
-- (soft — client compares its own version against this and, if older, shows
-- a Later/Update prompt. Never a forced/blocking gate.)
--
-- Bump the value manually after each release, e.g.:
--   update public.app_config set value = '1.0.15', updated_at = now()
--   where key = 'latest_version';
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seeded with the current shipped version so nobody is nudged until this is
-- bumped on a future release.
INSERT INTO public.app_config (key, value) VALUES ('latest_version', '1.0.14');

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Readable by anyone (including unauthenticated), no user-sensitive data.
CREATE POLICY "app_config readable by anyone"
  ON public.app_config
  FOR SELECT
  USING (true);

-- No insert/update/delete policy for anon/authenticated — writes happen via
-- the dashboard/SQL editor only (service_role bypasses RLS).

DO $$
BEGIN
  RAISE NOTICE '✅ app_config table created, seeded with latest_version = 1.0.14';
END $$;
