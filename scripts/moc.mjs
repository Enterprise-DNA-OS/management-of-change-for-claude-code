#!/usr/bin/env node
// The one CLI for Management of Change for Claude Code.
//
//   npm run moc -- help
//   npm run moc -- attention            # what needs a person this week
//   npm run moc -- change MOC-0002      # one change, everything about it
//   npm run moc -- register --json      # machine output for any read
//
// Every write needs --actor=<who is doing it> and lands in the append-only activity log.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick, yesNo } from './lib/csv.mjs';
import { table as textTable, heading, truncate } from './lib/format.mjs';

// ------------------------------------------------------------------ reads

export const reads = {
  register: {
    about: 'Every change: site, type, risk, status, sign-offs and open actions.',
    sql: `select code, site, title, change_type as type, classification as class, risk_level as risk, status, owner,
            age_days, approvals_given || '/' || approvals_required as signoffs, open_actions
          from change_register order by code`,
  },
  open: {
    about: 'Changes not yet closed, rejected or cancelled.',
    sql: `select code, site, title, classification as class, risk_level as risk, status, owner, target_date, approvals_missing, open_actions
          from change_register where status not in ('closed','rejected','cancelled') order by target_date nulls last, code`,
  },
  attention: {
    about: 'What needs a person this week: expired bypasses, start-ups with open actions, missing sign-offs, overdue actions.',
    sql: `select code, site, title, owner, rule, detail, days from change_attention order by severity, days desc nulls last, code`,
  },
  approvals: {
    about: 'Changes waiting on a sign-off, and which roles are missing.',
    sql: `select code, site, title, risk_level as risk, status, approvals_given || '/' || approvals_required as signoffs,
            approvals_missing as missing, age_days
          from change_register where approvals_missing <> '' and status in ('review','approved','started_up') order by age_days desc, code`,
  },
  temporary: {
    about: 'Temporary and emergency changes in place, with their expiry.',
    sql: `select c.code, c.site, c.title, c.classification as class, c.status, c.started_up_on, c.expires_on,
            case when c.expires_on is null then null else c.expires_on - current_date end as days_left, ch.extended_count as extensions
          from change_register c join changes ch on ch.id = c.id
          where c.classification in ('temporary','emergency') and c.status in ('approved','started_up')
          order by c.expires_on nulls last, c.code`,
  },
  actions: {
    about: 'Every open action, with phase, owner and due date.',
    sql: `select code, change, site, phase, kind, description, owner, due, attention from action_queue
          where done_on is null order by due, code`,
  },
  overdue: {
    about: 'Actions past their due date, and pre-start-up actions still open after start-up.',
    sql: `select code, change, site, phase, kind, description, owner, due, attention from action_queue
          where attention in ('overdue','open after start-up') order by due, code`,
  },
  'safety-case': {
    about: 'Changes at major hazard sites that affect the safety case, and whether the regulator was told.',
    sql: `select c.code, c.site, c.title, c.status, c.regulator_notified_on as notified, coalesce(ch.regulator_reference,'') as reference
          from change_register c join changes ch on ch.id = c.id
          where c.major_hazard and c.affects_safety_case order by code`,
  },
  stats: {
    about: 'Changes by site and risk, with average days from request to start-up.',
    sql: `select site, risk_level as risk, count(*)::int as changes,
            count(*) filter (where status in ('started_up','closed'))::int as started,
            round(avg(started_up_on - raised_on) filter (where started_up_on is not null))::int as avg_days_to_startup,
            count(*) filter (where classification = 'temporary')::int as temporary,
            count(*) filter (where classification = 'emergency')::int as emergency
          from change_register group by site, risk_level order by site, risk_level nulls last`,
  },
  workload: {
    about: 'Open actions by person, with how many are overdue.',
    sql: `select owner, count(*)::int as open_actions, count(*) filter (where attention in ('overdue','open after start-up'))::int as overdue,
            min(due) as oldest_due from action_queue where done_on is null group by owner order by overdue desc, open_actions desc, owner`,
  },
  sites: {
    about: 'Sites, country, major hazard status and regulator.',
    sql: `select code, name, country, major_hazard, regulator from sites order by code`,
  },
  people: {
    about: 'People who raise, review and sign off changes.',
    sql: `select p.code, p.name, p.role, s.code as site from people p left join sites s on s.id = p.site_id where p.active order by p.code`,
  },
  rules: {
    about: 'Which sign-offs each risk level needs.',
    sql: `select risk_level as risk, string_agg(role, ', ' order by role) as signoffs from approval_rules group by risk_level
          order by case risk_level when 'low' then 1 when 'medium' then 2 else 3 end`,
  },
  compliance: {
    about: 'Check the records against the rules in docs/compliance.md.',
    sql: null,
  },
  activity: {
    about: 'The append-only log of who changed what.',
    sql: `select created_at, actor, command, record_id, detail from activity order by id`,
  },
};

// Each rule matches a row in docs/compliance.md.
export const complianceRules = [
  { rule: 'PSSR-BEFORE-STARTUP', sql: `select code, 'in operation since ' || started_up_on || coalesce(', review on ' || pssr_on, ', no review recorded') as finding
      from changes where status in ('started_up','closed') and (pssr_on is null or pssr_on > started_up_on)` },
  { rule: 'PRESTARTUP-ACTIONS', sql: `select change as code, code || ' ' || kind || ' still open' as finding from action_queue where attention = 'open after start-up'` },
  { rule: 'AUTHORISATION', sql: `select code, 'missing ' || approvals_missing as finding from change_register c
      where approvals_missing <> '' and ((status in ('started_up','closed') and classification <> 'emergency')
        or (classification = 'emergency' and status in ('started_up','closed') and started_up_on < current_date - 7))` },
  { rule: 'TEMPORARY-LIMIT', sql: `select code, case when expires_on < current_date then 'expired ' || expires_on else 'extended ' || extended_count || ' times' end as finding
      from changes where classification = 'temporary' and status = 'started_up' and (expires_on < current_date or extended_count > 1)` },
  { rule: 'TECHNICAL-BASIS', sql: `select code, 'no ' || concat_ws(' or ', case when coalesce(technical_basis,'') = '' then 'technical basis' end,
        case when coalesce(safety_impact,'') = '' then 'safety and health impact' end) as finding
      from changes where status not in ('draft','cancelled') and (coalesce(technical_basis,'') = '' or coalesce(safety_impact,'') = '')` },
  { rule: 'RISK-REVIEW', sql: `select code, risk_level || ' risk, no risk review recorded' as finding from change_register
      where status not in ('draft','cancelled','rejected') and risk_level in ('medium','high') and risk_reviews = 0` },
  { rule: 'RECORDS-UPDATED', sql: `select c.code, concat_ws(' and ', case when c.affects_procedures and not exists (select 1 from actions a where a.change_id = c.id and a.kind = 'procedure' and a.done_on is not null) then 'procedures' end,
        case when c.affects_drawings and not exists (select 1 from actions a where a.change_id = c.id and a.kind = 'drawing' and a.done_on is not null) then 'drawings' end) || ' not yet updated' as finding
      from changes c where c.status in ('started_up','closed')
        and ((c.affects_procedures and not exists (select 1 from actions a where a.change_id = c.id and a.kind = 'procedure' and a.done_on is not null))
          or (c.affects_drawings and not exists (select 1 from actions a where a.change_id = c.id and a.kind = 'drawing' and a.done_on is not null)))` },
  { rule: 'SAFETY-CASE', sql: `select code, 'major hazard site, ' || status || ', regulator not notified' as finding from change_register
      where major_hazard and affects_safety_case and regulator_notified_on is null and status in ('approved','started_up','closed')` },
];

// ------------------------------------------------------------------ usage

export const usage = {
  ...Object.fromEntries(Object.keys(reads).map((k) => [k, ''])),
  change: '<change code or title words>',
  raise: '--site= --title= --description= --type=equipment|process|chemical|procedure|control_system|organisational|facility --requested-by= --owner= [--class=permanent|temporary|emergency] [--expires=YYYY-MM-DD] [--emergency-reason=] [--area=] [--target=YYYY-MM-DD] [--code=] --actor=',
  submit: '<change> --risk=low|medium|high --technical-basis= --safety-impact= [--procedures=yes|no] [--drawings=yes|no] [--safety-case=yes|no] --actor=',
  'add-review': '<change> --method=checklist|what_if|hazop|jsa|bowtie|other --held-on=YYYY-MM-DD --leader= --findings= [--attendees=] [--before=] [--after=] --actor=',
  approve: '<change> --role=technical|operations|safety|site_manager --person= [--decision=approved|rejected] [--on=YYYY-MM-DD] [--note=] --actor=',
  'add-action': '<change> --phase=pre_startup|post_startup --kind=procedure|drawing|training|inspection|pssr_item|communication|other --description= --owner= --due=YYYY-MM-DD [--code=] --actor=',
  'complete-action': '<action code> --evidence= [--on=YYYY-MM-DD] --actor=',
  'notify-regulator': '<change> --on=YYYY-MM-DD --reference= --actor=',
  pssr: '<change> --by= --note= [--on=YYYY-MM-DD] --actor=',
  'start-up': '<change> [--on=YYYY-MM-DD] --actor=',
  extend: '<change> --to=YYYY-MM-DD --reason= --actor=',
  close: '<change> --note= [--outcome=reverted|made_permanent] [--on=YYYY-MM-DD] --actor=',
  reject: '<change> --reason= --actor=',
  cancel: '<change> --reason= --actor=',
  import: 'intelex --changes=changes.csv [--actions=actions.csv] [--site=CODE] [--dry-run] --actor=',
  export: '--out=<new-file.json>',
  'draft-moc-pack': '<change>',
  'weekly-review': '',
  help: '',
};

const mutating = new Set(['raise', 'submit', 'add-review', 'approve', 'add-action', 'complete-action', 'notify-regulator',
  'pssr', 'start-up', 'extend', 'close', 'reject', 'cancel', 'import']);
const TYPES = ['equipment', 'process', 'chemical', 'procedure', 'control_system', 'organisational', 'facility'];
const CLASSES = ['permanent', 'temporary', 'emergency'];
const RISKS = ['low', 'medium', 'high'];
const ROLES = ['technical', 'operations', 'safety', 'site_manager'];
const METHODS = ['checklist', 'what_if', 'hazop', 'jsa', 'bowtie', 'other'];
const PHASES = ['pre_startup', 'post_startup'];
const KINDS = ['procedure', 'drawing', 'training', 'inspection', 'pssr_item', 'communication', 'other'];
const TABLES = ['sites', 'people', 'approval_rules', 'changes', 'risk_reviews', 'approvals', 'actions', 'imports', 'activity'];

const today = () => new Date().toISOString().slice(0, 10);
function need(v, label) {
  if (typeof v !== 'string' || !v.trim()) throw Error(`--${label} is required`);
  return v.trim();
}
function date(v, label, { past = false } = {}) {
  v = need(v, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw Error(`--${label} needs a real YYYY-MM-DD date`);
  if (past && v > today()) throw Error(`--${label} cannot be in the future`);
  return v;
}
function one(v, values, label) {
  if (!values.includes(v)) throw Error(`--${label} must be one of ${values.join(', ')}`);
  return v;
}

function parse(args) {
  const pos = [];
  const f = {};
  for (const arg of args) {
    if (!arg.startsWith('--')) { pos.push(arg); continue; }
    const [key, ...rest] = arg.slice(2).split('=');
    if (Object.hasOwn(f, key)) throw Error(`Duplicate flag --${key}`);
    f[key] = rest.length ? rest.join('=') : true;
  }
  const cmd = pos.shift() || 'help';
  if (!Object.hasOwn(usage, cmd)) throw Error(`Unknown command "${cmd}". Run: npm run moc -- help`);
  const allowed = new Set(['json', ...[...usage[cmd].matchAll(/--([a-z-]+)/g)].map((m) => m[1])]);
  for (const k of Object.keys(f)) if (!allowed.has(k)) throw Error(`Unknown flag --${k} for ${cmd}. Usage: ${cmd} ${usage[cmd]}`);
  if (f.json !== undefined && f.json !== true) throw Error('--json is a boolean flag');
  if (Object.hasOwn(reads, cmd) && pos.length) throw Error(`Usage: ${cmd} takes no arguments`);
  return { cmd, pos, f };
}

async function log(db, actor, command, recordId, detail) {
  await db.query('insert into activity (actor, command, record_id, detail) values ($1,$2,$3,$4)', [actor, command, recordId, detail]);
}

// Match by code (case-insensitive, prefix) or by words in the title. Ambiguous -> list and fail.
async function findChange(db, q) {
  q = need(q, 'change');
  const exact = await db.query('select * from changes where lower(code) = lower($1)', [q]);
  if (exact.length) return exact[0];
  const rows = await db.query(
    `select * from changes where lower(code) like lower($1) || '%' or lower(title) like '%' || lower($1) || '%' order by code`, [q]);
  if (!rows.length) throw Error(`No matching change for "${q}"`);
  if (rows.length > 1) throw Error(`Ambiguous: "${q}" matches ${rows.map((r) => `${r.code} (${truncate(r.title, 40)})`).join('; ')}`);
  return rows[0];
}
async function findSite(db, q) {
  const rows = await db.query('select * from sites where lower(code) = lower($1) or lower(name) like $2', [need(q, 'site'), `%${String(q).toLowerCase()}%`]);
  if (!rows.length) throw Error(`No matching site for "${q}"`);
  if (rows.length > 1) throw Error(`Ambiguous: "${q}" matches ${rows.map((r) => r.code).join(', ')}`);
  return rows[0];
}
async function nextCode(db, table, prefix, width) {
  const rows = await db.query(`select code from ${table} where code like $1`, [`${prefix}%`]);
  const n = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(prefix.length)) || 0), 0) + 1;
  return prefix + String(n).padStart(width, '0');
}
async function approvalState(db, id) {
  return (await db.query('select * from approval_status where change_id = $1', [id]))[0];
}
async function openActions(db, id, phase) {
  return db.query('select code, kind, description from actions where change_id = $1 and phase = $2 and done_on is null order by code', [id, phase]);
}

// ------------------------------------------------------------------ commands

async function detail(db, q) {
  const c = await findChange(db, q);
  const site = (await db.query('select code, name, major_hazard, regulator from sites where id = $1', [c.site_id]))[0];
  return {
    change: { ...c, site: site.code, site_name: site.name, major_hazard: site.major_hazard, regulator: site.regulator },
    signoffs: await approvalState(db, c.id),
    approvals: await db.query('select role, person, decision, decided_on, note from approvals where change_id = $1 order by role', [c.id]),
    risk_reviews: await db.query('select method, held_on, leader, attendees, risk_before, risk_after, findings from risk_reviews where change_id = $1 order by held_on', [c.id]),
    actions: await db.query('select code, phase, kind, description, owner, due, done_on, evidence, attention from action_queue where id in (select id from actions where change_id = $1) order by phase, due', [c.id]),
    activity: await db.query('select created_at, actor, command, detail from activity where record_id = $1 order by id', [c.code]),
  };
}

async function raise(db, f, actor) {
  const site = await findSite(db, f.site);
  const cls = one(f.class || 'permanent', CLASSES, 'class');
  const expires = cls === 'temporary' ? date(f.expires, 'expires') : (f.expires ? date(f.expires, 'expires') : null);
  if (expires && expires < today()) throw Error('--expires cannot be in the past');
  const reason = cls === 'emergency' ? need(f['emergency-reason'], 'emergency-reason') : null;
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'changes', 'MOC-', 4);
  const row = (await db.query(
    `insert into changes (code, site_id, title, description, change_type, classification, area, requested_by, owner, target_date, expires_on, emergency_reason, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning code, title, classification, status`,
    [code, site.id, need(f.title, 'title'), need(f.description, 'description'), one(f.type, TYPES, 'type'), cls, f.area || null,
      need(f['requested-by'], 'requested-by'), need(f.owner, 'owner'), f.target ? date(f.target, 'target') : null, expires, reason,
      cls === 'emergency' ? 'review' : 'draft']))[0];
  await log(db, actor, 'raise', code, `${cls} change raised at ${site.code}`);
  return row;
}

async function submit(db, q, f, actor) {
  const c = await findChange(db, q);
  if (!['draft', 'review'].includes(c.status)) throw Error(`${c.code} is ${c.status}; only a draft or a change in review can be resubmitted`);
  const row = (await db.query(
    `update changes set risk_level = $2, technical_basis = $3, safety_impact = $4, affects_procedures = $5, affects_drawings = $6,
       affects_safety_case = $7, status = 'review' where id = $1 returning code, risk_level, status`,
    [c.id, one(f.risk, RISKS, 'risk'), need(f['technical-basis'], 'technical-basis'), need(f['safety-impact'], 'safety-impact'),
      yesNo(f.procedures, c.affects_procedures), yesNo(f.drawings, c.affects_drawings), yesNo(f['safety-case'], c.affects_safety_case)]))[0];
  await log(db, actor, 'submit', c.code, `sent for review, ${f.risk} risk`);
  return { ...row, signoffs_needed: (await approvalState(db, c.id)).missing };
}

async function addReview(db, q, f, actor) {
  const c = await findChange(db, q);
  if (['closed', 'rejected', 'cancelled'].includes(c.status)) throw Error(`${c.code} is ${c.status}`);
  const row = (await db.query(
    `insert into risk_reviews (change_id, method, held_on, leader, attendees, findings, risk_before, risk_after)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning method, held_on, leader`,
    [c.id, one(f.method, METHODS, 'method'), date(f['held-on'], 'held-on', { past: true }), need(f.leader, 'leader'), f.attendees || null,
      need(f.findings, 'findings'), f.before ? one(f.before, RISKS, 'before') : null, f.after ? one(f.after, RISKS, 'after') : null]))[0];
  await log(db, actor, 'add-review', c.code, `${f.method} review led by ${f.leader}`);
  return { change: c.code, ...row };
}

async function approve(db, q, f, actor) {
  const c = await findChange(db, q);
  const role = one(f.role, ROLES, 'role');
  const decision = one(f.decision || 'approved', ['approved', 'rejected'], 'decision');
  const ok = ['review', 'approved'].includes(c.status) || (c.classification === 'emergency' && c.status === 'started_up');
  if (!ok) throw Error(`${c.code} is ${c.status}; sign-offs are recorded while a change is in review (or after an emergency start-up)`);
  if (!c.risk_level) throw Error(`${c.code} has no risk level yet. Run submit first.`);
  const required = (await db.query('select role from approval_rules where risk_level = $1', [c.risk_level])).map((r) => r.role);
  if (!required.includes(role)) throw Error(`A ${c.risk_level} risk change needs ${required.join(', ')}; ${role} is not one of them`);
  if (decision === 'approved' && ['medium', 'high'].includes(c.risk_level)) {
    const n = (await db.query('select count(*)::int as n from risk_reviews where change_id = $1', [c.id]))[0].n;
    if (!n) throw Error(`${c.code} is ${c.risk_level} risk: record a risk review (add-review) before anyone signs it off`);
  }
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  const existing = await db.query('select decision from approvals where change_id = $1 and role = $2', [c.id, role]);
  if (existing.length) throw Error(`${c.code} already has a ${role} decision (${existing[0].decision}). Corrections go through a reviewed change, not an overwrite.`);
  await db.query('insert into approvals (change_id, role, person, decision, decided_on, note) values ($1,$2,$3,$4,$5,$6)',
    [c.id, role, need(f.person, 'person'), decision, on, f.note || null]);
  let status = c.status;
  if (decision === 'rejected') {
    status = c.status === 'started_up' ? c.status : 'rejected';
    if (status === 'rejected') await db.query(`update changes set status = 'rejected' where id = $1`, [c.id]);
  } else {
    const s = await approvalState(db, c.id);
    if (c.status === 'review' && s.missing === '' && !s.rejected) {
      status = 'approved';
      await db.query(`update changes set status = 'approved' where id = $1`, [c.id]);
    }
  }
  await log(db, actor, 'approve', c.code, `${role} ${decision} by ${f.person}`);
  return { change: c.code, role, decision, status, still_needed: (await approvalState(db, c.id)).missing };
}

async function addAction(db, q, f, actor) {
  const c = await findChange(db, q);
  if (['closed', 'rejected', 'cancelled'].includes(c.status)) throw Error(`${c.code} is ${c.status}`);
  const phase = one(f.phase, PHASES, 'phase');
  if (phase === 'pre_startup' && ['started_up'].includes(c.status)) throw Error(`${c.code} is already in operation; add a post_startup action`);
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'actions', 'A-', 3);
  const row = (await db.query(
    `insert into actions (code, change_id, phase, kind, description, owner, due) values ($1,$2,$3,$4,$5,$6,$7)
     returning code, phase, kind, owner, due`,
    [code, c.id, phase, one(f.kind, KINDS, 'kind'), need(f.description, 'description'), need(f.owner, 'owner'), date(f.due, 'due')]))[0];
  await log(db, actor, 'add-action', c.code, `${code} ${phase} ${f.kind}`);
  return { change: c.code, ...row };
}

async function completeAction(db, q, f, actor) {
  const rows = await db.query('select a.*, c.code as change from actions a join changes c on c.id = a.change_id where lower(a.code) = lower($1)', [need(q, 'action')]);
  if (!rows.length) throw Error(`No matching action "${q}"`);
  const a = rows[0];
  if (a.done_on) throw Error(`${a.code} was completed on ${a.done_on}`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query('update actions set done_on = $2, evidence = $3 where id = $1', [a.id, on, need(f.evidence, 'evidence')]);
  await log(db, actor, 'complete-action', a.change, `${a.code} done: ${f.evidence}`);
  return { action: a.code, change: a.change, done_on: on };
}

async function notifyRegulator(db, q, f, actor) {
  const c = await findChange(db, q);
  const on = date(f.on, 'on', { past: true });
  await db.query('update changes set regulator_notified_on = $2, regulator_reference = $3 where id = $1', [c.id, on, need(f.reference, 'reference')]);
  await log(db, actor, 'notify-regulator', c.code, `regulator notified ${on}, ref ${f.reference}`);
  return { change: c.code, regulator_notified_on: on, reference: f.reference };
}

async function startupBlockers(db, c, { forPssr = false } = {}) {
  const blockers = [];
  const s = await approvalState(db, c.id);
  if (c.classification === 'emergency') {
    if (!['review', 'approved'].includes(c.status)) blockers.push(`status is ${c.status}`);
    const tech = await db.query(`select 1 from approvals where change_id = $1 and role = 'technical' and decision = 'approved'`, [c.id]);
    if (!tech.length) blockers.push('an emergency change still needs a technical sign-off before start-up');
  } else {
    if (c.status !== 'approved') blockers.push(`status is ${c.status}, not approved`);
    if (s.missing) blockers.push(`missing sign-offs: ${s.missing}`);
  }
  if (s.rejected) blockers.push('a sign-off was rejected');
  const open = await openActions(db, c.id, 'pre_startup');
  if (open.length) blockers.push(`pre-start-up actions open: ${open.map((a) => `${a.code} (${a.kind})`).join(', ')}`);
  if (!forPssr) {
    if (!c.pssr_on) blockers.push('no pre-start-up safety review recorded (run pssr)');
    const site = (await db.query('select major_hazard from sites where id = $1', [c.site_id]))[0];
    if (site.major_hazard && c.affects_safety_case && !c.regulator_notified_on) blockers.push('affects the safety case at a major hazard site: record the regulator notification first');
    if (c.classification === 'temporary' && c.expires_on < today()) blockers.push(`temporary change expiry ${c.expires_on} has passed`);
  }
  return blockers;
}

async function pssr(db, q, f, actor) {
  const c = await findChange(db, q);
  const blockers = await startupBlockers(db, c, { forPssr: true });
  if (blockers.length) throw Error(`${c.code} is not ready for its pre-start-up review: ${blockers.join('; ')}`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query('update changes set pssr_by = $2, pssr_on = $3, pssr_note = $4 where id = $1', [c.id, need(f.by, 'by'), on, need(f.note, 'note')]);
  await log(db, actor, 'pssr', c.code, `pre-start-up review by ${f.by}`);
  return { change: c.code, pssr_by: f.by, pssr_on: on };
}

async function startUp(db, q, f, actor) {
  const c = await findChange(db, q);
  const blockers = await startupBlockers(db, c);
  if (blockers.length) throw Error(`${c.code} cannot start up: ${blockers.join('; ')}`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  if (c.pssr_on > on) throw Error(`start-up date ${on} is before the pre-start-up review on ${c.pssr_on}`);
  await db.query(`update changes set status = 'started_up', started_up_on = $2 where id = $1`, [c.id, on]);
  await log(db, actor, 'start-up', c.code, `in operation from ${on}`);
  return { change: c.code, status: 'started_up', started_up_on: on };
}

async function extend(db, q, f, actor) {
  const c = await findChange(db, q);
  if (c.classification !== 'temporary' || c.status !== 'started_up') throw Error(`${c.code} is not a temporary change in operation`);
  const to = date(f.to, 'to');
  if (to <= (c.expires_on || today()) || to < today()) throw Error(`--to must be after the current expiry ${c.expires_on} and not in the past`);
  await db.query('update changes set expires_on = $2, extended_count = extended_count + 1 where id = $1', [c.id, to]);
  await log(db, actor, 'extend', c.code, `expiry ${c.expires_on} -> ${to}: ${need(f.reason, 'reason')}`);
  return { change: c.code, expires_on: to, extensions: c.extended_count + 1 };
}

async function close(db, q, f, actor) {
  const c = await findChange(db, q);
  if (c.status !== 'started_up') throw Error(`${c.code} is ${c.status}; only a change in operation can be closed`);
  const open = [...await openActions(db, c.id, 'pre_startup'), ...await openActions(db, c.id, 'post_startup')];
  if (open.length) throw Error(`${c.code} has open actions: ${open.map((a) => a.code).join(', ')}`);
  const s = await approvalState(db, c.id);
  if (s.missing) throw Error(`${c.code} is missing sign-offs: ${s.missing}`);
  let outcome = null;
  if (c.classification === 'temporary') outcome = one(f.outcome, ['reverted', 'made_permanent'], 'outcome');
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query(`update changes set status = 'closed', closed_on = $2, closeout_note = $3, temporary_outcome = $4 where id = $1`,
    [c.id, on, need(f.note, 'note'), outcome]);
  await log(db, actor, 'close', c.code, outcome ? `closed, ${outcome}` : 'closed');
  return { change: c.code, status: 'closed', closed_on: on, temporary_outcome: outcome };
}

async function endChange(db, q, f, actor, status) {
  const c = await findChange(db, q);
  if (!['draft', 'review', 'approved'].includes(c.status)) throw Error(`${c.code} is ${c.status}; only a change not yet in operation can be ${status}`);
  await db.query('update changes set status = $2, closeout_note = $3 where id = $1', [c.id, status, need(f.reason, 'reason')]);
  await log(db, actor, status === 'rejected' ? 'reject' : 'cancel', c.code, f.reason);
  return { change: c.code, status };
}

// ------------------------------------------------------------------ import / export

// Intelex builds Management of Change forms per customer, so column names vary.
// These are the names we accept; anything else is reported, never guessed.
const COLS = {
  code: ['Record Number', 'Record No', 'MOC Number', 'MOC No', 'Change Number', 'ID'],
  title: ['Title', 'Change Title', 'Subject', 'Short Description'],
  description: ['Description', 'Change Description', 'Details'],
  site: ['Site', 'Location', 'Facility'],
  type: ['Change Type', 'Type', 'Category'],
  class: ['Change Class', 'Classification', 'Duration', 'Permanent/Temporary'],
  risk: ['Risk Level', 'Risk Rating', 'Risk'],
  status: ['Status', 'Workflow Stage', 'Stage'],
  requested_by: ['Requested By', 'Requestor', 'Initiator', 'Originator'],
  owner: ['Change Owner', 'Owner', 'Responsible Person', 'Assigned To'],
  raised_on: ['Date Raised', 'Date Requested', 'Created Date', 'Request Date'],
  target: ['Target Date', 'Target Completion Date', 'Due Date'],
  expires: ['Expiry Date', 'Temporary Expiry Date', 'End Date'],
  technical_basis: ['Technical Basis', 'Justification', 'Reason for Change'],
  safety_impact: ['Safety Impact', 'Impact on Safety and Health', 'Risk Assessment Summary'],
  started: ['Start-up Date', 'Startup Date', 'Implemented Date', 'Implementation Date'],
  closed: ['Closed Date', 'Date Closed', 'Completion Date'],
};
const ACOLS = {
  change: ['Record Number', 'MOC Number', 'Change Number', 'Parent Record'],
  code: ['Action Number', 'Action ID', 'Task Number'],
  description: ['Action', 'Description', 'Task', 'Action Description'],
  owner: ['Assigned To', 'Responsible Person', 'Owner'],
  due: ['Due Date', 'Target Date'],
  done: ['Completed Date', 'Date Completed', 'Closed Date'],
  evidence: ['Completion Notes', 'Comments', 'Evidence'],
  phase: ['Phase', 'Timing', 'Pre/Post Startup'],
  kind: ['Action Type', 'Type', 'Category'],
};
function normDate(v, label) {
  v = String(v || '').trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return date(`${m[1]}-${m[2]}-${m[3]}`, label);
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // NZ and AU exports: day first
  if (m) return date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, label);
  throw Error(`${label}: "${v}" is not a date this importer reads (use YYYY-MM-DD or DD/MM/YYYY)`);
}
function mapWord(v, map, dflt) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return dflt;
  for (const [out, words] of Object.entries(map)) if (words.some((w) => s.includes(w))) return out;
  return undefined;
}
const STATUS_MAP = { cancelled: ['cancel', 'withdrawn', 'void'], rejected: ['reject', 'declin'], closed: ['closed', 'complete'],
  started_up: ['implement', 'start', 'operat', 'in service', 'post'], approved: ['approved', 'authoris', 'authoriz'],
  review: ['review', 'assess', 'pending', 'submitted', 'evaluat'], draft: ['draft', 'new', 'open', 'initiat'] };
const TYPE_MAP = { control_system: ['control', 'software', 'plc', 'instrument', 'alarm'], chemical: ['chemical', 'material', 'substance', 'feedstock'],
  procedure: ['procedure', 'document'], organisational: ['organi', 'people', 'staff', 'crew'], facility: ['facility', 'building', 'civil', 'structur'],
  process: ['process', 'operating', 'condition'], equipment: ['equipment', 'plant', 'mechanical', 'piping', 'electrical'] };

async function importIntelex(db, f, actor) {
  const file = need(f.changes, 'changes');
  const text = fs.readFileSync(file, 'utf8');
  const rows = parseCsv(text);
  if (!rows.length) throw Error(`${file} has no rows`);
  const missing = ['code', 'title'].filter((k) => !COLS[k].some((n) => pick(rows[0], n) !== '' || Object.keys(rows[0]).some((h) => h.toLowerCase() === n.toLowerCase())));
  if (missing.length) throw Error(`${file}: no column for ${missing.join(', ')}. Accepted names: ${missing.map((k) => COLS[k].join(' / ')).join('; ')}`);
  const defaultSite = f.site ? await findSite(db, f.site) : null;
  const sites = await db.query('select id, code, name from sites');
  const plan = [];
  const problems = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    try {
      const g = (k) => pick(r, ...COLS[k]).trim();
      const siteName = g('site');
      const site = siteName ? sites.find((s) => s.code.toLowerCase() === siteName.toLowerCase() || s.name.toLowerCase() === siteName.toLowerCase()) : defaultSite;
      if (!site) throw Error(`site "${siteName || '(blank)'}" is not set up here; add it or pass --site`);
      const cls = mapWord(g('class'), { temporary: ['temp'], emergency: ['emerg', 'urgent'], permanent: ['perm'] }, 'permanent');
      const status = mapWord(g('status'), STATUS_MAP, 'draft');
      const type = mapWord(g('type'), TYPE_MAP, 'equipment');
      const risk = mapWord(g('risk'), { high: ['high', 'extreme', 'major'], medium: ['med', 'moderate'], low: ['low', 'minor'] }, null);
      if (status === undefined) throw Error(`status "${g('status')}" has no mapping`);
      if (type === undefined) throw Error(`change type "${g('type')}" has no mapping`);
      if (cls === undefined) throw Error(`classification "${g('class')}" has no mapping`);
      if (risk === undefined) throw Error(`risk "${g('risk')}" has no mapping`);
      const expires = normDate(g('expires'), `row ${line} expiry`);
      if (cls === 'temporary' && !expires) throw Error('temporary change without an expiry date');
      plan.push({
        code: need(g('code'), `row ${line} record number`), site, title: need(g('title'), `row ${line} title`),
        description: g('description') || g('title'), type, cls, risk, status,
        requested_by: g('requested_by') || 'unknown (imported)', owner: g('owner') || g('requested_by') || 'unknown (imported)',
        raised_on: normDate(g('raised_on'), `row ${line} date raised`) || today(), target: normDate(g('target'), `row ${line} target`),
        expires, technical_basis: g('technical_basis') || null, safety_impact: g('safety_impact') || null,
        started: normDate(g('started'), `row ${line} start-up`), closed: normDate(g('closed'), `row ${line} closed`),
        emergency_reason: cls === 'emergency' ? (g('technical_basis') || 'imported from Intelex; reason not in export') : null,
      });
    } catch (e) { problems.push(`row ${line}: ${e.message}`); }
  });
  let actionPlan = [];
  if (f.actions) {
    const arows = parseCsv(fs.readFileSync(need(f.actions, 'actions'), 'utf8'));
    arows.forEach((r, i) => {
      const line = i + 2;
      try {
        const g = (k) => pick(r, ...ACOLS[k]).trim();
        const done = normDate(g('done'), `actions row ${line} completed`);
        actionPlan.push({
          change: need(g('change'), `actions row ${line} record number`), code: g('code') || null,
          description: need(g('description'), `actions row ${line} description`), owner: g('owner') || 'unknown (imported)',
          due: normDate(g('due'), `actions row ${line} due`) || today(), done, evidence: done ? (g('evidence') || 'completed in Intelex') : null,
          phase: mapWord(g('phase'), { pre_startup: ['pre'], post_startup: ['post'] }, 'post_startup') || 'post_startup',
          kind: mapWord(g('kind'), { procedure: ['procedure', 'document'], drawing: ['drawing', 'p&id'], training: ['train'], inspection: ['inspect', 'test'], pssr_item: ['pssr', 'pre-start'], communication: ['communicat', 'brief'] }, 'other') || 'other',
        });
      } catch (e) { problems.push(`actions row ${line}: ${e.message}`); }
    });
    const known = new Set(plan.map((p) => p.code.toUpperCase()));
    for (const a of actionPlan) if (!known.has(a.change.toUpperCase())) problems.push(`action "${a.description}" points at ${a.change}, which is not in the changes file`);
  }
  const existing = new Set((await db.query('select upper(code) as code from changes')).map((r) => r.code));
  const fresh = plan.filter((p) => !existing.has(p.code.toUpperCase()));
  const summary = { rows_read: rows.length, changes_new: fresh.length, changes_already_here: plan.length - fresh.length,
    actions: actionPlan.length, problems, dry_run: Boolean(f['dry-run']) };
  if (problems.length || f['dry-run']) {
    if (problems.length && !f['dry-run']) throw Error(`Nothing imported. Fix these first:\n  ${problems.join('\n  ')}`);
    return summary;
  }
  await db.exec('BEGIN');
  try {
    const ids = {};
    for (const p of fresh) {
      const row = (await db.query(
        `insert into changes (code, site_id, title, description, change_type, classification, risk_level, status, requested_by, owner, raised_on,
           target_date, expires_on, technical_basis, safety_impact, started_up_on, closed_on, emergency_reason, source, source_ref)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'intelex',$1) returning id`,
        [p.code.toUpperCase(), p.site.id, p.title, p.description, p.type, p.cls, p.risk, p.status, p.requested_by, p.owner, p.raised_on,
          p.target, p.expires, p.technical_basis, p.safety_impact, p.started, p.closed, p.emergency_reason]))[0];
      ids[p.code.toUpperCase()] = row.id;
    }
    let n = 0;
    for (const a of actionPlan) {
      const id = ids[a.change.toUpperCase()];
      if (!id) continue; // the change was already here: its actions came with it
      const code = a.code ? a.code.toUpperCase() : await nextCode(db, 'actions', 'A-', 3);
      await db.query(`insert into actions (code, change_id, phase, kind, description, owner, due, done_on, evidence) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                      on conflict (code) do nothing`, [code, id, a.phase, a.kind, a.description, a.owner, a.due, a.done, a.evidence]);
      n++;
    }
    await db.query('insert into imports (source, file_name, file_sha256, rows_read, rows_imported, actor) values ($1,$2,$3,$4,$5,$6)',
      ['intelex', path.basename(file), createHash('sha256').update(text).digest('hex'), rows.length, fresh.length, actor]);
    await log(db, actor, 'import', null, `intelex: ${fresh.length} changes, ${n} actions from ${path.basename(file)}`);
    await db.exec('COMMIT');
    return { ...summary, actions_imported: n };
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

async function exportAll(db, f) {
  const out = path.resolve(need(f.out, 'out'));
  if (fs.existsSync(out)) throw Error(`${out} already exists; choose a new file name`);
  const data = { exported_at: new Date().toISOString() };
  for (const t of TABLES) data[t] = await db.query(`select * from ${t}`);
  fs.writeFileSync(out, JSON.stringify(data, null, 2), { mode: 0o600 });
  return { file: out, tables: Object.fromEntries(TABLES.map((t) => [t, data[t].length])) };
}

// ------------------------------------------------------------------ drafts

function draftsDir() {
  const dir = path.join(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const md = (rows) => {
  if (!rows.length) return '_None._\n';
  const cols = Object.keys(rows[0]);
  const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');
  return `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n${rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`).join('\n')}\n`;
};

async function draftPack(db, q) {
  const d = await detail(db, q);
  const c = d.change;
  const body = `# Management of change record: ${c.code}

**${c.title}**

| Field | Value |
|---|---|
| Site | ${c.site_name} (${c.site})${c.major_hazard ? ', major hazard facility' : ''} |
| Type and class | ${c.change_type}, ${c.classification} |
| Risk | ${c.risk_level || 'not yet assessed'} |
| Status | ${c.status} |
| Requested by / owner | ${c.requested_by} / ${c.owner} |
| Raised | ${c.raised_on} |
| Expiry (temporary) | ${c.expires_on || 'n/a'} |
| Pre-start-up review | ${c.pssr_on ? `${c.pssr_on} by ${c.pssr_by}: ${c.pssr_note}` : 'not yet recorded'} |
| In operation from | ${c.started_up_on || 'not yet'} |
| Regulator notified | ${c.affects_safety_case ? (c.regulator_notified_on ? `${c.regulator_notified_on} (${c.regulator_reference})` : 'required, not yet recorded') : 'not required by this change'} |

## Description
${c.description}

## Technical basis
${c.technical_basis || '_Not yet recorded._'}

## Impact on safety and health
${c.safety_impact || '_Not yet recorded._'}

## Risk reviews
${md(d.risk_reviews)}
## Sign-offs (${d.signoffs.approved} of ${d.signoffs.required}${d.signoffs.missing ? `; missing ${d.signoffs.missing}` : ''})
${md(d.approvals)}
## Actions
${md(d.actions.map(({ code, phase, kind, description, owner, due, done_on, attention }) => ({ code, phase, kind, description, owner, due, done_on, attention })))}
_Draft prepared ${today()} from the change register. Review before it is filed or shared._
`;
  const file = path.join(draftsDir(), `moc-pack-${c.code.toLowerCase()}-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, change: c.code };
}

async function weeklyReview(db) {
  const att = await db.query(reads.attention.sql);
  const appr = await db.query(reads.approvals.sql);
  const temp = await db.query(reads.temporary.sql);
  const breaches = att.filter((r) => ['temporary change past expiry', 'started up with pre-start-up actions open', 'in operation without a pre-start-up review', 'safety case change not notified', 'emergency change without approvals'].includes(r.rule));
  const body = `# Management of change: weekly review, ${today()}

${breaches.length ? `**${breaches.length} item(s) need action before anything else:** ${breaches.map((b) => `${b.code} (${b.rule})`).join(', ')}.` : '**No changes are in operation outside their controls.**'}

## Needs attention
${md(att)}
## Waiting on sign-off
${md(appr)}
## Temporary and emergency changes in place
${md(temp)}
_Draft from three commands: attention, approvals, temporary. Read before it goes to the site meeting._
`;
  const file = path.join(draftsDir(), `weekly-review-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, needs_attention: att.length, breaches: breaches.length, waiting_on_signoff: appr.length };
}

// ------------------------------------------------------------------ run

export async function run(db, args) {
  const { cmd, pos, f } = parse(args);
  let actor = null;
  if (mutating.has(cmd)) actor = need(f.actor, 'actor');
  if (Object.hasOwn(reads, cmd)) {
    if (cmd === 'compliance') {
      const out = [];
      for (const r of complianceRules) for (const row of await db.query(r.sql)) out.push({ rule: r.rule, code: row.code, finding: row.finding });
      return out.sort((a, b) => a.code.localeCompare(b.code) || a.rule.localeCompare(b.rule));
    }
    return db.query(reads[cmd].sql);
  }
  const target = pos[0];
  switch (cmd) {
    case 'help': return Object.entries(usage).map(([command, args]) => ({ command, args, about: reads[command]?.about || '' }));
    case 'change': return detail(db, pos.join(' '));
    case 'raise': return raise(db, f, actor);
    case 'submit': return submit(db, target, f, actor);
    case 'add-review': return addReview(db, target, f, actor);
    case 'approve': return approve(db, target, f, actor);
    case 'add-action': return addAction(db, target, f, actor);
    case 'complete-action': return completeAction(db, target, f, actor);
    case 'notify-regulator': return notifyRegulator(db, target, f, actor);
    case 'pssr': return pssr(db, target, f, actor);
    case 'start-up': return startUp(db, target, f, actor);
    case 'extend': return extend(db, target, f, actor);
    case 'close': return close(db, target, f, actor);
    case 'reject': return endChange(db, target, f, actor, 'rejected');
    case 'cancel': return endChange(db, target, f, actor, 'cancelled');
    case 'import':
      if (target !== 'intelex') throw Error('Usage: import intelex --changes=changes.csv [--actions=actions.csv] [--site=CODE] [--dry-run] --actor=');
      return importIntelex(db, f, actor);
    case 'export': return exportAll(db, f);
    case 'draft-moc-pack': return draftPack(db, pos.join(' '));
    case 'weekly-review': return weeklyReview(db);
    default: throw Error(`Unknown command ${cmd}`);
  }
}

function print(cmd, result) {
  if (Array.isArray(result)) {
    if (!result.length) { console.log('  (none)'); return; }
    const cols = Object.keys(result[0]).map((key) => ({ key, label: key, width: ['title', 'detail', 'description', 'finding', 'about', 'args', 'change_title'].includes(key) ? 48 : undefined,
      align: typeof result[0][key] === 'number' ? 'right' : 'left' }));
    console.log(textTable(result, cols));
    return;
  }
  if (cmd === 'change') {
    const c = result.change;
    console.log(heading(`${c.code}  ${c.title}`));
    for (const k of ['site_name', 'change_type', 'classification', 'risk_level', 'status', 'owner', 'raised_on', 'expires_on', 'pssr_on', 'started_up_on', 'regulator_notified_on'])
      if (c[k] !== null && c[k] !== undefined) console.log(`  ${k.padEnd(22)}${c[k]}`);
    console.log(`  signoffs              ${result.signoffs.approved}/${result.signoffs.required}${result.signoffs.missing ? ` (missing ${result.signoffs.missing})` : ''}`);
    for (const [label, rows] of [['Risk reviews', result.risk_reviews.map(({ findings, ...r }) => r)], ['Sign-offs', result.approvals], ['Actions', result.actions.map(({ evidence, ...r }) => r)]]) {
      console.log(heading(label));
      print('', rows);
    }
    return;
  }
  for (const [k, v] of Object.entries(result)) console.log(`  ${k.padEnd(22)}${Array.isArray(v) ? (v.length ? '\n    ' + v.join('\n    ') : 'none') : typeof v === 'object' && v ? JSON.stringify(v) : v}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let db;
  try {
    db = await getDb();
    const result = await run(db, args);
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else print(args.find((a) => !a.startsWith('--')) || 'help', result);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}
