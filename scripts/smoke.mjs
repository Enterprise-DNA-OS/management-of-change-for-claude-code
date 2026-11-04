// npm test: a temporary database, migrate, seed twice, then every command and every gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run, reads, usage } from './moc.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moc-'));
process.env.DATA_DIR = path.join(tmp, 'db');
process.env.OUTPUT_DIR = tmp;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
const db = await getDb();
const exercised = new Set();
let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const call = async (args) => { exercised.add(args[0]); return run(db, args); };
const fail = async (args, re) => { exercised.add(args[0]); await assert.rejects(() => run(db, args), re); checks++; };
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const actor = '--actor=Tester';

try {
  ok((await migrate(db)).ran.length === 1, 'migration applies');
  ok((await migrate(db)).ran.length === 0, 'migration is idempotent');
  await seed(db);
  await seed(db);
  ok((await db.query('select * from changes')).length === 10, 'seed is idempotent');

  // Every read works in both shapes.
  for (const name of Object.keys(reads)) ok(Array.isArray(await call([name, '--json'])), `${name} returns rows`);
  ok((await call(['help'])).length === Object.keys(usage).length, 'help lists every command');

  // The attention list finds what the seed planted.
  const att = await call(['attention']);
  const has = (code, rule) => att.some((r) => r.code === code && r.rule === rule);
  ok(has('MOC-0002', 'temporary change past expiry'));
  ok(has('MOC-0005', 'started up with pre-start-up actions open'));
  ok(has('MOC-0006', 'emergency change without approvals'));
  ok(has('MOC-0004', 'safety case change not notified'));
  ok(has('MOC-0003', 'waiting on approval'));
  ok(has('MOC-0007', 'temporary change expiring'));
  ok(has('MOC-0001', 'close-out overdue'));
  ok(has('MOC-0008', 'draft gone quiet'));
  ok(!att.some((r) => r.code === 'MOC-0009'), 'a closed, clean change needs nothing');
  const comp = await call(['compliance']);
  ok(comp.some((r) => r.rule === 'TEMPORARY-LIMIT' && r.code === 'MOC-0002'));
  ok(comp.some((r) => r.rule === 'PRESTARTUP-ACTIONS' && r.code === 'MOC-0005'));
  ok(comp.some((r) => r.rule === 'AUTHORISATION' && r.code === 'MOC-0006'));
  ok(comp.some((r) => r.rule === 'SAFETY-CASE' && r.code === 'MOC-0004'));
  ok(comp.some((r) => r.rule === 'RECORDS-UPDATED' && r.code === 'MOC-0001'));
  ok((await call(['approvals'])).find((r) => r.code === 'MOC-0003').missing === 'safety');

  // Lookup: code, prefix, title words, ambiguity, misses, bad flags.
  ok((await call(['change', 'moc-0002'])).change.title.includes('LSH-12'));
  ok((await call(['change', 'steam', 'line'])).change.code === 'MOC-0006');
  await fail(['change', 'caustic'], /Ambiguous/);
  await fail(['change', 'nothing like this'], /No matching/);
  await fail(['register', '--wat'], /Unknown flag/);
  await fail(['register', 'extra'], /takes no arguments/);
  await fail(['register', '--json=no'], /boolean/);
  await fail(['raise', '--site=AKL', '--title=x', '--description=x', '--type=equipment', '--requested-by=x', '--owner=x'], /--actor is required/);

  // A full change from request to close, with every gate tried on the way.
  const raised = await call(['raise', '--site=GEE', '--title=Add a second chlorine dioxide dosing point', '--description=Second dosing point on the flume',
    '--type=process', '--requested-by=Priya Shah', '--owner=Sam Okafor', '--code=MOC-T1', `--target=${day(30)}`, actor]);
  ok(raised.status === 'draft');
  await fail(['approve', 'MOC-T1', '--role=technical', '--person=Sam Okafor', actor], /draft/);
  await call(['submit', 'MOC-T1', '--risk=medium', '--technical-basis=Supplier dosing calculation', '--safety-impact=More chlorine dioxide on site; gas detector added',
    '--procedures=yes', actor]);
  await fail(['approve', 'MOC-T1', '--role=technical', '--person=Sam Okafor', actor], /risk review/);
  await fail(['approve', 'MOC-T1', '--role=site_manager', '--person=Tom Burke', actor], /needs technical, operations, safety/);
  await call(['add-review', 'MOC-T1', '--method=what_if', `--held-on=${day(0)}`, '--leader=Sam Okafor', '--findings=Gas release at the new point reviewed', '--before=medium', '--after=low', actor]);
  await fail(['add-review', 'MOC-T1', '--method=hazop', `--held-on=${day(3)}`, '--leader=X', '--findings=Y', actor], /future/);
  for (const [role, person] of [['technical', 'Sam Okafor'], ['operations', 'Tom Burke']]) await call(['approve', 'MOC-T1', `--role=${role}`, `--person=${person}`, actor]);
  await fail(['approve', 'MOC-T1', '--role=technical', '--person=Someone', actor], /already has/);
  ok((await call(['change', 'MOC-T1'])).change.status === 'review', 'still in review until every sign-off is in');
  const last = await call(['approve', 'MOC-T1', '--role=safety', '--person=Priya Shah', actor]);
  ok(last.status === 'approved', 'last sign-off approves the change');
  const act = await call(['add-action', 'MOC-T1', '--phase=pre_startup', '--kind=training', '--description=Train flume operators', '--owner=Tom Burke', `--due=${day(7)}`, actor]);
  await call(['add-action', 'MOC-T1', '--phase=post_startup', '--kind=procedure', '--description=Update dosing procedure', '--owner=Sam Okafor', `--due=${day(14)}`, '--code=A-T2', actor]);
  await fail(['pssr', 'MOC-T1', '--by=Priya Shah', '--note=Walkdown', actor], /pre-start-up actions open/);
  await fail(['start-up', 'MOC-T1', actor], /cannot start up/);
  await call(['complete-action', act.code, '--evidence=Training register', actor]);
  await fail(['complete-action', act.code, '--evidence=again', actor], /completed on/);
  await fail(['start-up', 'MOC-T1', actor], /no pre-start-up safety review/);
  await call(['pssr', 'MOC-T1', '--by=Priya Shah', '--note=Walkdown and gas detector test', actor]);
  ok((await call(['start-up', 'MOC-T1', actor])).status === 'started_up');
  await fail(['add-action', 'MOC-T1', '--phase=pre_startup', '--kind=other', '--description=x', '--owner=x', `--due=${day(1)}`, actor], /post_startup/);
  await fail(['close', 'MOC-T1', '--note=done', actor], /open actions: A-T2/);
  await call(['complete-action', 'A-T2', '--evidence=CIP-07 rev 2', actor]);
  ok((await call(['close', 'MOC-T1', '--note=Dosing stable for two weeks', actor])).status === 'closed');
  ok(!(await call(['compliance'])).some((r) => r.code === 'MOC-T1'), 'a change run by the book has no findings');

  // The safety case gate at a major hazard site.
  await fail(['pssr', 'MOC-0004', '--by=Claire Dunn', '--note=x', actor], /pre-start-up actions open/);
  for (const a of ['A-008', 'A-009']) await call(['complete-action', a, '--evidence=done in test', actor]);
  await call(['pssr', 'MOC-0004', '--by=Claire Dunn', '--note=Trip proven', actor]);
  await fail(['start-up', 'MOC-0004', actor], /safety case/);
  await call(['notify-regulator', 'MOC-0004', `--on=${day(0)}`, '--reference=WSNZ-TEST-1', actor]);
  ok((await call(['start-up', 'MOC-0004', actor])).status === 'started_up');

  // Temporary changes: extend, then close with an outcome.
  await fail(['extend', 'MOC-0002', `--to=${day(-1)}`, '--reason=x', actor], /after the current expiry/);
  ok((await call(['extend', 'MOC-0002', `--to=${day(7)}`, '--reason=Switch delayed by supplier', actor])).extensions === 1);
  await fail(['close', 'MOC-0002', '--note=x', actor], /open actions/);
  await call(['complete-action', 'A-006', '--evidence=LSH-12 replaced and proven', actor]);
  await fail(['close', 'MOC-0002', '--note=x', actor], /--outcome/);
  ok((await call(['close', 'MOC-0002', '--note=Bypass removed', '--outcome=reverted', actor])).temporary_outcome === 'reverted');
  await fail(['extend', 'MOC-0007', `--to=${day(1)}`, '--reason=x', actor], /after the current expiry/);

  // Emergency changes go live first and must collect their sign-offs after.
  const em = await call(['raise', '--site=HB', '--class=emergency', '--emergency-reason=Ammonia valve gland leaking', '--title=Temporary gland repair on V-31',
    '--description=Repacked under pressure', '--type=equipment', '--requested-by=Hemi Walker', '--owner=Hemi Walker', actor]);
  ok(em.status === 'review');
  await fail(['raise', '--site=HB', '--class=temporary', '--title=x', '--description=x', '--type=equipment', '--requested-by=x', '--owner=x', actor], /--expires is required/);
  await fail(['raise', '--site=NOPE', '--title=x', '--description=x', '--type=equipment', '--requested-by=x', '--owner=x', actor], /No matching site/);
  await call(['submit', em.code, '--risk=high', '--technical-basis=Packing maker instruction', '--safety-impact=Small release possible; area restricted', actor]);
  await call(['add-review', em.code, '--method=checklist', `--held-on=${day(0)}`, '--leader=Hemi Walker', '--findings=Release scenario reviewed', actor]);
  await fail(['pssr', em.code, '--by=Hemi Walker', '--note=x', actor], /technical sign-off/);
  await call(['approve', em.code, '--role=technical', '--person=Hemi Walker', actor]);
  await call(['pssr', em.code, '--by=Hemi Walker', '--note=Leak test', actor]);
  ok((await call(['start-up', em.code, actor])).status === 'started_up');
  ok((await call(['approve', em.code, '--role=safety', '--person=Grace Liu', actor])).status === 'started_up', 'retrospective sign-off on an emergency');

  // Reject and cancel.
  await call(['raise', '--site=AKL', '--title=Remove the second operator from tanker unloading', '--description=x', '--type=organisational', '--requested-by=Ben Fowler', '--owner=Ben Fowler', '--code=MOC-T3', actor]);
  ok((await call(['reject', 'MOC-T3', '--reason=Lone working at the unloading bay is not acceptable', actor])).status === 'rejected');
  await fail(['cancel', 'MOC-T3', '--reason=x', actor], /only a change not yet in operation/);
  ok((await call(['cancel', 'MOC-0008', '--reason=Withdrawn by the site manager', actor])).status === 'cancelled');

  // Import from an Intelex export: dry run, reject bad files, import, never twice.
  const changesCsv = path.join(REPO_ROOT, 'fixtures', 'intelex-changes.csv');
  const actionsCsv = path.join(REPO_ROOT, 'fixtures', 'intelex-actions.csv');
  const dry = await call(['import', 'intelex', `--changes=${changesCsv}`, `--actions=${actionsCsv}`, '--dry-run', actor]);
  ok(dry.changes_new === 3 && dry.actions === 3 && dry.problems.length === 0, 'dry run counts');
  ok((await db.query(`select * from changes where source = 'intelex'`)).length === 0, 'dry run writes nothing');
  const bad = path.join(tmp, 'bad.csv');
  fs.writeFileSync(bad, 'Number,Name\n1,x\n');
  await fail(['import', 'intelex', `--changes=${bad}`, actor], /no column for code, title/);
  const badSite = path.join(tmp, 'bad-site.csv');
  fs.writeFileSync(badSite, 'Record Number,Title,Site\nX-1,Thing,Nowhere\n');
  await fail(['import', 'intelex', `--changes=${badSite}`, actor], /Nothing imported[\s\S]*Nowhere/);
  await fail(['import', 'other', `--changes=${changesCsv}`, actor], /Usage: import intelex/);
  const imp = await call(['import', 'intelex', `--changes=${changesCsv}`, `--actions=${actionsCsv}`, actor]);
  ok(imp.changes_new === 3 && imp.actions_imported === 3);
  const t057 = (await call(['change', 'MOC-2025-057'])).change;
  ok(t057.classification === 'temporary' && t057.status === 'started_up' && t057.expires_on === '2025-04-30', 'day-first dates and words mapped');
  ok((await call(['change', 'MOC-2025-063'])).change.change_type === 'chemical');
  ok((await call(['attention'])).some((r) => r.code === 'MOC-2025-057' && r.rule === 'temporary change past expiry'), 'imported history is checked too');
  ok((await call(['import', 'intelex', `--changes=${changesCsv}`, `--actions=${actionsCsv}`, actor])).changes_new === 0, 'import twice adds nothing');

  // Drafts and export.
  const pack = await call(['draft-moc-pack', 'MOC-0006']);
  const packText = fs.readFileSync(pack.file, 'utf8');
  ok(packText.includes('Engineered clamp') && packText.includes('Sign-offs'));
  const wk = await call(['weekly-review']);
  ok(fs.readFileSync(wk.file, 'utf8').includes('Needs attention') && wk.needs_attention > 0);
  const out = path.join(tmp, 'snapshot.json');
  const ex = await call(['export', `--out=${out}`]);
  ok(ex.tables.changes === 16 && JSON.parse(fs.readFileSync(out, 'utf8')).activity.length > 10);
  await fail(['export', `--out=${out}`], /already exists/);

  // The activity log is append-only.
  await assert.rejects(() => db.query(`update activity set actor = 'someone else'`), /append-only/); checks++;
  await assert.rejects(() => db.query('delete from activity'), /append-only/); checks++;

  for (const name of Object.keys(usage)) ok(exercised.has(name), `smoke exercises ${name}`);
} finally {
  await db.close();
}

// The CLI, views and documents run as a person would run them.
const env = { ...process.env, DATA_DIR: path.join(tmp, 'db'), OUTPUT_DIR: tmp };
for (const args of [['scripts/moc.mjs', 'attention'], ['scripts/moc.mjs', 'change', 'MOC-0001', '--json'], ['scripts/view.mjs'], ['scripts/docs.mjs']]) {
  const r = spawnSync(process.execPath, args, { cwd: REPO_ROOT, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `${args.join(' ')} failed: ${r.stderr}`);
  checks++;
}
const miss = spawnSync(process.execPath, ['scripts/moc.mjs', 'change', 'caustic'], { cwd: REPO_ROOT, env, encoding: 'utf8' });
assert.equal(miss.status, 1);
assert.match(miss.stderr, /Ambiguous/);
checks++;

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`PASS  ${checks} checks, ${Object.keys(usage).length} commands`);
