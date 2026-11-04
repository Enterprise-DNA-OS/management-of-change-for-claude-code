-- Management of change for process plants: sites, people, change requests,
-- risk reviews, approvals, actions (pre and post start-up), pre-start-up
-- safety reviews, regulator notifications and an append-only activity log.
-- Plain Postgres; runs the same on PGlite. No extensions.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country text not null check (country in ('NZ','AU')),
  major_hazard boolean not null default false,
  regulator text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table people (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  role text not null,
  site_id uuid references sites(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Which sign-offs each risk level needs. Change the rule by changing rows.
create table approval_rules (
  risk_level text not null check (risk_level in ('low','medium','high')),
  role text not null check (role in ('technical','operations','safety','site_manager')),
  primary key (risk_level, role)
);

create table changes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  site_id uuid not null references sites(id),
  title text not null,
  description text not null,
  change_type text not null check (change_type in ('equipment','process','chemical','procedure','control_system','organisational','facility')),
  classification text not null default 'permanent' check (classification in ('permanent','temporary','emergency')),
  risk_level text check (risk_level in ('low','medium','high')),
  status text not null default 'draft' check (status in ('draft','review','approved','started_up','closed','rejected','cancelled')),
  area text,
  requested_by text not null,
  owner text not null,
  raised_on date not null default current_date,
  target_date date,
  technical_basis text,
  safety_impact text,
  affects_procedures boolean not null default false,
  affects_drawings boolean not null default false,
  affects_safety_case boolean not null default false,
  expires_on date,
  extended_count int not null default 0,
  emergency_reason text,
  regulator_notified_on date,
  regulator_reference text,
  pssr_by text,
  pssr_on date,
  pssr_note text,
  started_up_on date,
  closed_on date,
  closeout_note text,
  temporary_outcome text check (temporary_outcome in ('reverted','made_permanent')),
  source text not null default 'manual',
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (classification <> 'temporary' or expires_on is not null),
  check (classification <> 'emergency' or emergency_reason is not null)
);

create table risk_reviews (
  id uuid primary key default gen_random_uuid(),
  change_id uuid not null references changes(id),
  method text not null check (method in ('checklist','what_if','hazop','jsa','bowtie','other')),
  held_on date not null,
  leader text not null,
  attendees text,
  findings text not null,
  risk_before text check (risk_before in ('low','medium','high')),
  risk_after text check (risk_after in ('low','medium','high')),
  created_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  change_id uuid not null references changes(id),
  role text not null check (role in ('technical','operations','safety','site_manager')),
  person text not null,
  decision text not null check (decision in ('approved','rejected')),
  decided_on date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (change_id, role)
);

create table actions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  change_id uuid not null references changes(id),
  phase text not null check (phase in ('pre_startup','post_startup')),
  kind text not null check (kind in ('procedure','drawing','training','inspection','pssr_item','communication','other')),
  description text not null,
  owner text not null,
  due date not null,
  done_on date,
  evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((done_on is null) = (evidence is null))
);

create table imports (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  file_name text not null,
  file_sha256 text not null,
  rows_read int not null,
  rows_imported int not null,
  actor text not null,
  created_at timestamptz not null default now()
);

create table activity (
  id bigserial primary key,
  actor text not null,
  command text not null,
  record_id text,
  detail text,
  created_at timestamptz not null default now()
);

create or replace function activity_append_only() returns trigger language plpgsql as $$
begin raise exception 'activity is append-only'; end $$;
create trigger activity_no_update before update or delete on activity
  for each row execute function activity_append_only();

create trigger sites_touch before update on sites for each row execute function touch_updated_at();
create trigger people_touch before update on people for each row execute function touch_updated_at();
create trigger changes_touch before update on changes for each row execute function touch_updated_at();
create trigger actions_touch before update on actions for each row execute function touch_updated_at();

create index changes_site_status on changes (site_id, status);
create index actions_change on actions (change_id, phase);
create index approvals_change on approvals (change_id);
create index risk_reviews_change on risk_reviews (change_id);

-- Sign-offs each change needs, has, and is missing.
create view approval_status as
select c.id as change_id, c.code, c.status, c.risk_level,
  count(r.role)::int as required,
  count(a.id) filter (where a.decision = 'approved')::int as approved,
  (select count(*)::int from approvals x where x.change_id = c.id and x.decision = 'rejected') as rejected,
  coalesce(string_agg(r.role, ', ' order by r.role) filter (where a.id is null), '') as missing
from changes c
left join approval_rules r on r.risk_level = c.risk_level
left join approvals a on a.change_id = c.id and a.role = r.role
group by c.id, c.code, c.status, c.risk_level;

create view action_queue as
select a.id, a.code, c.code as change, s.code as site, c.title as change_title, a.phase, a.kind,
  a.description, a.owner, a.due, a.done_on, a.evidence, c.status as change_status,
  case
    when a.done_on is not null then 'done'
    when a.phase = 'pre_startup' and c.status in ('started_up','closed') then 'open after start-up'
    when a.due < current_date then 'overdue'
    when a.due <= current_date + 7 then 'due this week'
    else 'open'
  end as attention
from actions a join changes c on c.id = a.change_id join sites s on s.id = c.site_id;

create view change_register as
select c.id, c.code, s.code as site, s.name as site_name, c.title, c.change_type, c.classification,
  c.risk_level, c.status, c.owner, c.raised_on, c.target_date, c.expires_on, c.started_up_on, c.closed_on,
  (current_date - c.raised_on) as age_days,
  ap.required as approvals_required, ap.approved as approvals_given, ap.missing as approvals_missing,
  (select count(*)::int from actions a where a.change_id = c.id and a.done_on is null) as open_actions,
  (select count(*)::int from risk_reviews r where r.change_id = c.id) as risk_reviews,
  s.major_hazard, c.affects_safety_case, c.regulator_notified_on
from changes c join sites s on s.id = c.site_id join approval_status ap on ap.change_id = c.id;

-- Everything that needs a person this week, one row per finding.
create view change_attention as
select code, site, title, owner, rule, severity, detail, days from (
  select c.code, c.site, c.title, c.owner, 'temporary change past expiry' as rule, 1 as severity,
    'expired ' || c.expires_on || ', still in place' as detail, (current_date - c.expires_on) as days
  from change_register c where c.classification = 'temporary' and c.status = 'started_up' and c.expires_on < current_date
  union all
  select c.code, c.site, c.title, c.owner, 'started up with pre-start-up actions open', 1,
    count(*)::text || ' open: ' || string_agg(a.code, ', ' order by a.code), max(current_date - c.started_up_on)
  from change_register c join actions a on a.change_id = c.id
  where c.status in ('started_up','closed') and a.phase = 'pre_startup' and a.done_on is null
  group by c.code, c.site, c.title, c.owner
  union all
  select c.code, c.site, c.title, c.owner, 'in operation without a pre-start-up review', 1,
    'started up ' || c.started_up_on || ', no review recorded', (current_date - c.started_up_on)
  from changes ch join change_register c on c.id = ch.id
  where c.status in ('started_up','closed') and ch.pssr_on is null
  union all
  select c.code, c.site, c.title, c.owner, 'safety case change not notified', 1,
    'major hazard site, status ' || c.status, c.age_days
  from change_register c where c.major_hazard and c.affects_safety_case and c.regulator_notified_on is null
    and c.status in ('approved','started_up','closed')
  union all
  select c.code, c.site, c.title, c.owner, 'emergency change without approvals', 1,
    'missing ' || c.approvals_missing, (current_date - c.started_up_on)
  from change_register c where c.classification = 'emergency' and c.status = 'started_up'
    and c.approvals_missing <> '' and c.started_up_on < current_date - 7
  union all
  select c.code, c.site, c.title, c.owner, 'temporary change expiring', 2,
    'expires ' || c.expires_on, (c.expires_on - current_date)
  from change_register c where c.classification = 'temporary' and c.status = 'started_up'
    and c.expires_on between current_date and current_date + 14
  union all
  select a.change, a.site, a.change_title, a.owner, 'action overdue', 2,
    a.code || ' ' || a.kind || ': ' || a.description, (current_date - a.due)
  from action_queue a where a.attention = 'overdue'
  union all
  select c.code, c.site, c.title, c.owner, 'waiting on approval', 2,
    'missing ' || c.approvals_missing, c.age_days
  from change_register c where c.status = 'review' and c.approvals_missing <> '' and c.raised_on < current_date - 14
  union all
  select c.code, c.site, c.title, c.owner, 'close-out overdue', 3,
    'in operation since ' || c.started_up_on, (current_date - c.started_up_on)
  from change_register c where c.status = 'started_up' and c.classification <> 'temporary'
    and c.started_up_on < current_date - 30
  union all
  select c.code, c.site, c.title, c.owner, 'draft gone quiet', 3,
    'raised ' || c.raised_on || ', not sent for review', c.age_days
  from change_register c where c.status = 'draft' and c.raised_on < current_date - 30
) f;

alter table sites enable row level security;
alter table people enable row level security;
alter table approval_rules enable row level security;
alter table changes enable row level security;
alter table risk_reviews enable row level security;
alter table approvals enable row level security;
alter table actions enable row level security;
alter table imports enable row level security;
alter table activity enable row level security;
