-- Daily step counts (manually entered from the phone's step counter).
-- Feeds the activity-adjusted calorie target: steps are the NEAT signal,
-- with steps taken during logged runs deducted to avoid double counting.
-- Run this in the Supabase SQL editor before using the steps feature.

create table if not exists daily_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  date date not null default current_date,
  steps integer not null,
  created_at timestamptz default now(),
  unique (user_id, date)
);

create index if not exists idx_daily_steps_user_date on daily_steps(user_id, date);

alter table daily_steps disable row level security;
