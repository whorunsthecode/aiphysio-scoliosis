-- Balance — Supabase schema (single user for v1; designed for multi-user later).
--
-- To apply:
--   1. Open the Supabase SQL editor for your project.
--   2. Paste this whole file, run.
--   3. Confirm in Database → Tables that all five tables are present.
--
-- The app degrades gracefully when Supabase is not configured (saves to
-- localStorage instead). Adding the env vars in .env.local enables Supabase
-- writes from then on.

-- ─────────────────────────────────────────────────────────────────────────
-- Profiles
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  curve_type text check (curve_type in ('S', 'C', 'thoracolumbar', 'unknown')),
  severity text check (severity in ('mild', 'moderate', 'severe', 'unknown')),
  primary_curve_apex text,
  primary_curve_convex_side text check (primary_curve_convex_side in ('left', 'right', 'unknown')),
  secondary_curve_apex text,
  secondary_curve_convex_side text check (secondary_curve_convex_side in ('left', 'right', 'unknown')),
  segment_i_shift text check (segment_i_shift in ('left', 'right', 'centered')),
  segment_ii_shift text check (segment_ii_shift in ('left', 'right', 'centered')),
  segment_iii_shift text check (segment_iii_shift in ('left', 'right', 'centered')),
  segment_iv_shift text check (segment_iv_shift in ('left', 'right', 'centered')),
  stiff_hip_flexor_side text,
  one_sided_sport text,
  one_sided_sport_frequency text,
  daily_sitting_hours text,
  bag_carrying_side text,
  sleep_position text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- Physio programs (one per profile, latest wins)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists physio_programs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  raw_source text not null,
  parsed_exercises jsonb not null default '[]'::jsonb,
  lifestyle_notes jsonb,
  clarifications jsonb,
  created_at timestamptz default now()
);
create index if not exists physio_programs_profile_created
  on physio_programs(profile_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- X-ray uploads
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists xrays (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  storage_path text not null,
  parsed_metadata jsonb,
  user_confirmed jsonb,           -- the values the user actually approved
  created_at timestamptz default now()
);
create index if not exists xrays_profile_created
  on xrays(profile_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- Daily sessions
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  started_at timestamptz default now(),
  completed_at timestamptz,
  pain_check jsonb,
  initial_scan jsonb,             -- PostureSnapshot { measurements, stats, scanConfidence, ... }
  exercises_completed jsonb,
  final_scan jsonb,               -- PostureSnapshot
  scan_confidence text check (scan_confidence in ('high', 'moderate', 'low')),
  notes text
);
create index if not exists sessions_profile_started
  on sessions(profile_id, started_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- Monthly assessments (Adam's forward-bend test, posture photos)
-- Reserved for v2 — table created so schema is forward-compatible.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists monthly_assessments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  storage_path text not null,
  measurements jsonb,
  flags text[],
  created_at timestamptz default now()
);
create index if not exists monthly_profile_created
  on monthly_assessments(profile_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- Lifestyle weekly snapshots
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists lifestyle_weekly (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  week_start date not null,
  sports_played jsonb,
  sitting_hours_avg numeric,
  bag_carrying_side text,
  notes text,
  created_at timestamptz default now()
);
create index if not exists lifestyle_weekly_profile_week
  on lifestyle_weekly(profile_id, week_start desc);

-- ═════════════════════════════════════════════════════════════════════════
-- AGENT TIER — Tier 1 analysis layers + Tier 3 multi-agent care team.
-- Layered on top of the v2 tables above; v2 still works without these.
-- ═════════════════════════════════════════════════════════════════════════

-- ─── Tier 1: Personalized baselines (rolling 30-day per-measurement stats) ───
create table if not exists personal_baselines (
  profile_id uuid primary key references profiles(id) on delete cascade,
  shoulder_diff_mean numeric,
  shoulder_diff_std numeric,
  hip_diff_mean numeric,
  hip_diff_std numeric,
  head_offset_mean numeric,
  head_offset_std numeric,
  pelvic_rotation_mean numeric,
  pelvic_rotation_std numeric,
  segment_i_shift_mean numeric,
  segment_ii_shift_mean numeric,
  segment_iii_shift_mean numeric,
  segment_iv_shift_mean numeric,
  overall_score_mean numeric,
  overall_score_std numeric,
  pain_baseline jsonb, -- typical regions/intensities
  sample_count int default 0,
  computed_at timestamptz default now()
);

-- ─── Tier 1: Pain-pattern correlations (subject ↔ object across time lag) ───
create table if not exists pain_correlations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  subject text not null,                     -- e.g. "right_hip_flexor_stretch_skipped"
  predicate text not null default 'correlates_with',
  object text not null,                      -- e.g. "lumbar_pain_increase"
  lag_days int not null default 0,
  correlation_strength numeric,              -- Pearson r in [-1, 1]
  confidence_low numeric,                    -- bootstrap 5th percentile
  confidence_high numeric,                   -- bootstrap 95th percentile
  evidence_count int,                        -- pairs supporting this row
  last_computed timestamptz default now()
);
create index if not exists pain_correlations_profile_strength
  on pain_correlations(profile_id, correlation_strength desc);

-- ─── Tier 1: Cascade-stage activation predictions (per curve pattern) ───
create table if not exists cascade_predictions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  curve_pattern text not null,
  active_stages jsonb,                       -- array of stage objects currently activated
  predicted_next jsonb,                      -- stages to watch next
  reasoning text,
  computed_at timestamptz default now()
);
create index if not exists cascade_profile_computed
  on cascade_predictions(profile_id, computed_at desc);

-- ─── Tier 3: Coach output — weekly programs ───
create table if not exists weekly_programs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  week_start date not null,
  program_data jsonb not null,               -- {monday: [...], tuesday: [...], ...}
  reasoning text not null,                   -- why this changed from previous week
  is_active boolean default true,
  generated_at timestamptz default now()
);
create unique index if not exists weekly_programs_profile_week
  on weekly_programs(profile_id, week_start);

-- ─── Tier 3: Companion observations (passed to Liaison via timestamps) ───
create table if not exists agent_observations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  observed_by_agent text not null,           -- 'companion' | 'coach' | 'liaison'
  observation_text text not null,
  category text,                             -- 'pain_pattern' | 'adherence' | 'lifestyle' | 'concern'
  severity text default 'info',              -- 'info' | 'note' | 'concern'
  used_in_handoff_id uuid,                   -- nullable; set when Liaison consumes
  created_at timestamptz default now()
);
create index if not exists observations_recent
  on agent_observations(profile_id, created_at desc);
create index if not exists observations_unconsumed
  on agent_observations(profile_id) where used_in_handoff_id is null;

-- ─── Tier 3: Inter-agent message bus ───
create table if not exists agent_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  from_agent text not null,
  to_agent text not null,
  message_type text not null,                -- 'replan_request' | 'new_program_active' | ...
  payload jsonb not null,
  status text default 'pending',             -- 'pending' | 'processed'
  created_at timestamptz default now(),
  processed_at timestamptz
);
create index if not exists agent_messages_pending
  on agent_messages(to_agent, status) where status = 'pending';

-- ─── Tier 3: Logged physio appointments (triggers Liaison 24h before) ───
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  appointment_at timestamptz not null,
  notes text,
  liaison_doc_id uuid,                       -- set after Liaison generates
  created_at timestamptz default now()
);
-- Postgres requires partial-index predicates to be IMMUTABLE, which rules out
-- now(). A plain index over (profile_id, appointment_at) covers the same
-- query patterns — server-side filters still apply WHERE appointment_at >
-- now() at query time, the planner just walks fewer rows than a full scan.
create index if not exists appointments_profile_at
  on appointments(profile_id, appointment_at);

-- ─── Tier 3: Liaison-generated physio handoff documents ───
create table if not exists liaison_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  appointment_id uuid references appointments(id),
  pdf_storage_path text not null,
  content_summary jsonb,
  generated_at timestamptz default now()
);
create index if not exists liaison_docs_profile_generated
  on liaison_documents(profile_id, generated_at desc);

-- ─── Tier 3: Notifications log (everything Coach/Companion sent) ───
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  sent_by_agent text not null,
  channel text not null default 'telegram',
  message_text text not null,
  sent_at timestamptz default now()
);
create index if not exists notifications_recent
  on notifications(profile_id, sent_at desc);

-- ─── Source-tagging on sessions for synthetic seed data ───
-- Adds a column the seed script populates to distinguish demo from real sessions.
alter table sessions add column if not exists source text default 'real';
create index if not exists sessions_source on sessions(source);

-- ─── User-stated goal (fed into Coach's prompt) ───
-- Free-text field. The user describes what they want out of this in their
-- own words ("travel without my back being the limit"); Coach references
-- it when planning so the messaging stays connected to lived motivation.
alter table profiles add column if not exists goal_text text;

-- ─── Red-flag screen (lib/safety) ───
-- Answers keyed by question id. Stored so the screen can be re-run against a
-- changed ruleset and so Liaison can carry it into a handoff document.
-- age_years feeds the derived rule about left thoracic curves before skeletal
-- maturity.
alter table profiles add column if not exists safety_screen jsonb default '{}'::jsonb;
alter table profiles add column if not exists safety_screened_at timestamptz;
alter table profiles add column if not exists age_years int;

-- ═════════════════════════════════════════════════════════════════════════
-- AUTH + ROW LEVEL SECURITY
--
-- Before this section existed, every table was readable and writable by
-- anyone holding the anon key — which ships to the browser. Sessions were
-- written client-side (lib/session/persist.ts), so the anon key alone gave
-- read/write access to every user's pain logs and posture history. RLS below
-- closes that.
--
-- Ownership model: profiles.user_id points at auth.users. Every other table
-- reaches its owner through profile_id. The service_role key bypasses RLS
-- entirely, which is what keeps the cron and agent routes working.
--
-- Re-running this file is safe; every statement is idempotent.
-- ═════════════════════════════════════════════════════════════════════════

alter table profiles add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- One profile per account. Partial so pre-auth rows (user_id null) don't
-- collide with each other while they wait to be claimed.
create unique index if not exists profiles_user_id_unique
  on profiles(user_id) where user_id is not null;

alter table profiles              enable row level security;
alter table physio_programs       enable row level security;
alter table xrays                 enable row level security;
alter table sessions              enable row level security;
alter table monthly_assessments   enable row level security;
alter table lifestyle_weekly      enable row level security;
alter table personal_baselines    enable row level security;
alter table pain_correlations     enable row level security;
alter table cascade_predictions   enable row level security;
alter table weekly_programs       enable row level security;
alter table agent_observations    enable row level security;
alter table agent_messages        enable row level security;
alter table appointments          enable row level security;
alter table liaison_documents     enable row level security;
alter table notifications         enable row level security;

-- Owns the profile row itself.
drop policy if exists profiles_own on profiles;
create policy profiles_own on profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Every child table reaches auth.uid() through its profile. Written as a
-- DO block so adding a table later is a one-line change to the array rather
-- than fifteen near-identical policy statements.
do $$
declare
  t text;
  child_tables text[] := array[
    'physio_programs', 'xrays', 'sessions', 'monthly_assessments',
    'lifestyle_weekly', 'personal_baselines', 'pain_correlations',
    'cascade_predictions', 'weekly_programs', 'agent_observations',
    'agent_messages', 'appointments', 'liaison_documents', 'notifications'
  ];
begin
  foreach t in array child_tables loop
    execute format('drop policy if exists %I_own on %I', t, t);
    execute format($f$
      create policy %I_own on %I
        for all to authenticated
        using (exists (
          select 1 from profiles p
          where p.id = %I.profile_id and p.user_id = auth.uid()
        ))
        with check (exists (
          select 1 from profiles p
          where p.id = %I.profile_id and p.user_id = auth.uid()
        ))
    $f$, t, t, t, t);
  end loop;
end $$;

-- The anon role gets nothing. Sign-in is the only route to data.
revoke all on all tables in schema public from anon;

-- ─────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────
-- Supabase no longer auto-grants permissions on user-created tables. The
-- /api routes use the service_role key, which needs full table + sequence
-- access. Without these grants, every server query returns 42501.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Future tables (e.g. when we add multi-user) inherit the same grants
-- automatically. Re-run the schema after each table addition.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Storage buckets
-- ─────────────────────────────────────────────────────────────────────────
-- Manually create these in the Supabase dashboard (Storage → New bucket):
--   xrays               — private, max 10 MB per file
--   monthly_assessments — private, max 5 MB per file
--   documents           — private, max 5 MB per file (Liaison PDFs)
--
-- Add an RLS policy allowing the service-role key to read/write all buckets.
-- v1 is single-user so no per-row auth needed; tighten when adding multi-user.
