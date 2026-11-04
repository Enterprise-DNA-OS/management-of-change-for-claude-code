-- Synthetic demo data: three plants, ten changes. Dates are relative to today so
-- the attention list always has something to say: an expired temporary bypass,
-- a start-up with training still open, an emergency repair without its sign-offs,
-- a safety case change not yet notified, overdue actions and a quiet draft.
-- Idempotent: safe to run twice. Never run against a real database.

insert into sites (code, name, country, major_hazard, regulator) values
  ('AKL', 'Penrose Blending Plant', 'NZ', true, 'WorkSafe New Zealand'),
  ('HB', 'Hastings Cool Store', 'NZ', false, 'WorkSafe New Zealand'),
  ('GEE', 'Geelong Food Plant', 'AU', false, 'WorkSafe Victoria')
on conflict (code) do nothing;

insert into approval_rules (risk_level, role) values
  ('low','technical'), ('low','operations'),
  ('medium','technical'), ('medium','operations'), ('medium','safety'),
  ('high','technical'), ('high','operations'), ('high','safety'), ('high','site_manager')
on conflict do nothing;

insert into people (code, name, role, site_id)
select v.code, v.name, v.role, s.id from (values
  ('P-01','Aroha Ngata','Process engineer','AKL'),
  ('P-02','Ben Fowler','Operations manager','AKL'),
  ('P-03','Claire Dunn','Health and safety manager','AKL'),
  ('P-04','Dev Patel','Site manager','AKL'),
  ('P-05','Hemi Walker','Refrigeration engineer','HB'),
  ('P-06','Grace Liu','Operations manager','HB'),
  ('P-07','Sam Okafor','Maintenance engineer','GEE'),
  ('P-08','Priya Shah','Food safety and HSE lead','GEE'),
  ('P-09','Tom Burke','Site manager','GEE')
) v(code, name, role, site) join sites s on s.code = v.site
on conflict (code) do nothing;

insert into changes (code, site_id, title, description, change_type, classification, risk_level, status, area,
  requested_by, owner, raised_on, target_date, technical_basis, safety_impact, affects_procedures, affects_drawings,
  affects_safety_case, expires_on, emergency_reason, regulator_notified_on, pssr_by, pssr_on, pssr_note, started_up_on,
  closed_on, closeout_note, temporary_outcome, source)
select v.code, s.id, v.title, v.description, v.change_type, v.classification, v.risk_level, v.status, v.area,
  v.requested_by, v.owner, current_date - v.raised, current_date + v.target, v.technical_basis, v.safety_impact,
  v.procs, v.drawings, v.safety_case,
  case when v.expires is null then null else current_date + v.expires end,
  v.emergency_reason,
  case when v.notified is null then null else current_date - v.notified end,
  v.pssr_by, case when v.pssr is null then null else current_date - v.pssr end, v.pssr_note,
  case when v.started is null then null else current_date - v.started end,
  case when v.closed is null then null else current_date - v.closed end,
  v.closeout_note, v.temporary_outcome, 'demo'
from (values
  ('MOC-0001','AKL','Replace solvent transfer pump P-201 with a sealless magnetic drive pump',
   'Mechanical seal on P-201 has leaked three times this year. Replace with a magnetic drive pump of a different make and rating.',
   'equipment','permanent','medium','started_up','Solvent tank farm','Ben Fowler','Aroha Ngata',90,-50,
   'Vendor datasheet and hydraulic check: duty point inside the new pump curve; motor rating unchanged.',
   'Removes a recurring leak source. New pump cannot run dry: low-flow trip added.',true,true,false,null::int,null,null::int,
   'Aroha Ngata',46,'Walkdown complete, trip tested, operators briefed.',45,null::int,null,null),
  ('MOC-0002','HB','Temporary bypass of high-level switch LSH-12 on the ammonia receiver',
   'Level switch failed. Bypass in the control panel while a replacement is sourced; level checked by hand every two hours.',
   'control_system','temporary','high','started_up','Engine room','Grace Liu','Hemi Walker',24,-20,
   'Replacement switch on order from the supplier; second independent level transmitter LT-12 remains in service.',
   'Loss of one layer of overfill protection. Manual checks and the LT-12 alarm compensate for a limited time.',true,false,false,-5,null,null,
   'Hemi Walker',21,'Bypass tag fitted, log sheet issued.',20,null,null,null),
  ('MOC-0003','AKL','Change caustic soda supply from 50 percent to 46 percent concentration',
   'New supplier delivers 46 percent. Dosing rates and storage temperature limits change.',
   'chemical','permanent','medium','review','Caustic storage','Ben Fowler','Aroha Ngata',25,20,
   'Supplier safety data sheet and freezing point curve; dosing pump capacity checked.',
   'Lower freezing point; more volume per batch. No change to hazard class.',true,false,true,null,null,null,
   null,null,null,null,null,null,null),
  ('MOC-0004','AKL','Raise working inventory of tank T-104 from 40 to 55 cubic metres',
   'Increase flammable solvent held in T-104 to cover longer supplier lead times.',
   'process','permanent','high','approved','Solvent tank farm','Dev Patel','Aroha Ngata',35,10,
   'Tank design capacity 70 cubic metres; bund sized for 110 percent of the largest tank.',
   'Increases the quantity of a specified hazardous substance on site; safety case inventory figures change.',true,true,true,null,null,null,
   null,null,null,null,null,null,null),
  ('MOC-0005','GEE','Change CIP caustic dosing logic in PLC-3',
   'Dose by conductivity instead of timer for the cleaning-in-place system on line 2.',
   'control_system','permanent','medium','started_up','Line 2 CIP','Tom Burke','Sam Okafor',30,-12,
   'Conductivity probe already fitted; logic tested on the bench and in a water run.',
   'Less operator handling of caustic. Fault in the probe could under-dose: low-conductivity alarm added.',true,false,false,null,null,null,
   'Priya Shah',11,'Water run and alarm test witnessed.',10,null,null,null),
  ('MOC-0006','GEE','Engineered clamp on leaking steam line SL-7',
   'Pinhole leak on the 10 bar steam header above the retort. Clamp fitted to keep production running until the shutdown.',
   'equipment','emergency','high','started_up','Retort hall','Sam Okafor','Sam Okafor',13,-12,
   'Clamp rated for 16 bar at 200 degrees by its maker; fitted by a licensed contractor.',
   'Leak stopped. Clamp must be replaced with a pipe section at the next shutdown.',false,true,false,null,'Live steam leak over a walkway; area isolated, line could not be shut without stopping retorts.',null,
   'Sam Okafor',12,'Area reopened after leak check.',12,null,null,null),
  ('MOC-0007','HB','Hire compressor during overhaul of screw compressor C-2',
   'Temporary skid compressor tied into the low stage while C-2 is overhauled.',
   'equipment','temporary','low','started_up','Engine room','Grace Liu','Hemi Walker',8,-5,
   'Hire unit capacity 80 percent of C-2; load schedule adjusted.',
   'Temporary hoses and connections in the engine room; added to the daily round.',false,false,false,9,null,null,
   'Hemi Walker',5,'Leak test and round sheet updated.',5,null,null,null),
  ('MOC-0008','GEE','Reduce night shift on line 2 from three operators to two',
   'Proposal to run night shift with two operators once the new CIP logic is stable.',
   'organisational','permanent','medium','draft','Line 2','Tom Burke','Tom Burke',40,30,
   null,null,true,false,false,null,null,null,
   null,null,null,null,null,null,null),
  ('MOC-0009','AKL','Replace bund liner in drum store',
   'Like-for-like replacement was ruled out: the new liner is a different material.',
   'facility','permanent','low','closed','Drum store','Ben Fowler','Ben Fowler',120,-90,
   'Liner chemical compatibility chart from the maker covers every product stored.',
   'Restores secondary containment.',false,false,false,null,null,null,
   'Ben Fowler',95,'Water test passed.',95,60,'Liner in service, inspection added to the monthly round.',null),
  ('MOC-0010','HB','New hot gas defrost procedure for freezer evaporators',
   'Rewrite the defrost procedure after a near miss with hydraulic shock.',
   'procedure','permanent','low','review','Freezer 3','Grace Liu','Hemi Walker',3,14,
   'Industry guidance on hot gas defrost sequencing and the valve maker''s instructions.',
   'Reduces the chance of hydraulic shock during defrost.',true,false,false,null,null,null,
   null,null,null,null,null,null,null)
) v(code, site, title, description, change_type, classification, risk_level, status, area, requested_by, owner, raised, target,
    technical_basis, safety_impact, procs, drawings, safety_case, expires, emergency_reason, notified, pssr_by, pssr, pssr_note,
    started, closed, closeout_note, temporary_outcome)
join sites s on s.code = v.site
on conflict (code) do nothing;

insert into risk_reviews (change_id, method, held_on, leader, attendees, findings, risk_before, risk_after)
select c.id, v.method, current_date - v.ago, v.leader, v.attendees, v.findings, v.before, v.after from (values
  ('MOC-0001','what_if',80,'Aroha Ngata','Ben Fowler, Claire Dunn','Dry running and reverse rotation reviewed. Add low-flow trip; update start-up procedure.','medium','low'),
  ('MOC-0002','what_if',24,'Hemi Walker','Grace Liu','Overfill risk with one layer removed. Two-hourly manual checks; bypass limited to 14 days.','high','medium'),
  ('MOC-0003','checklist',20,'Aroha Ngata','Claire Dunn','Freezing point, dosing rate and storage temperature checked. Update dosing table.','medium','low'),
  ('MOC-0004','hazop',28,'Aroha Ngata','Ben Fowler, Claire Dunn, Dev Patel','Overfill and fire scenarios re-run. Independent high-high level trip confirmed; safety case inventory to be revised.','high','medium'),
  ('MOC-0005','hazop',25,'Sam Okafor','Priya Shah, Tom Burke','Probe failure and logic error reviewed. Low-conductivity alarm and manual override added.','medium','low'),
  ('MOC-0006','what_if',13,'Sam Okafor','Priya Shah','Clamp failure scenario reviewed; walkway barrier and weekly clamp inspection.','high','medium'),
  ('MOC-0007','checklist',8,'Hemi Walker','Grace Liu','Hose routing, isolation points and capacity checked.','low','low'),
  ('MOC-0009','checklist',115,'Ben Fowler','Claire Dunn','Compatibility of liner with stored products confirmed.','low','low'),
  ('MOC-0010','checklist',2,'Hemi Walker','Grace Liu','Sequence and valve timings reviewed against the maker''s instructions.','medium','low')
) v(code, method, ago, leader, attendees, findings, before, after)
join changes c on c.code = v.code
where not exists (select 1 from risk_reviews r where r.change_id = c.id and r.held_on = current_date - v.ago and r.method = v.method);

insert into approvals (change_id, role, person, decision, decided_on, note)
select c.id, v.role, v.person, v.decision, current_date - v.ago, v.note from (values
  ('MOC-0001','technical','Aroha Ngata','approved',78,null),
  ('MOC-0001','operations','Ben Fowler','approved',77,null),
  ('MOC-0001','safety','Claire Dunn','approved',76,'Low-flow trip to be proven before start-up.'),
  ('MOC-0002','technical','Hemi Walker','approved',24,null),
  ('MOC-0002','operations','Grace Liu','approved',24,null),
  ('MOC-0002','safety','Grace Liu','approved',24,'Fourteen days only.'),
  ('MOC-0002','site_manager','Grace Liu','approved',24,null),
  ('MOC-0003','technical','Aroha Ngata','approved',19,null),
  ('MOC-0003','operations','Ben Fowler','approved',18,null),
  ('MOC-0004','technical','Aroha Ngata','approved',26,null),
  ('MOC-0004','operations','Ben Fowler','approved',26,null),
  ('MOC-0004','safety','Claire Dunn','approved',25,'Safety case inventory to be revised first.'),
  ('MOC-0004','site_manager','Dev Patel','approved',24,null),
  ('MOC-0005','technical','Sam Okafor','approved',22,null),
  ('MOC-0005','operations','Tom Burke','approved',21,null),
  ('MOC-0005','safety','Priya Shah','approved',20,null),
  ('MOC-0006','technical','Sam Okafor','approved',13,'Emergency: technical sign-off at the time.'),
  ('MOC-0006','operations','Tom Burke','approved',13,null),
  ('MOC-0007','technical','Hemi Walker','approved',7,null),
  ('MOC-0007','operations','Grace Liu','approved',7,null),
  ('MOC-0009','technical','Ben Fowler','approved',110,null),
  ('MOC-0009','operations','Ben Fowler','approved',110,null),
  ('MOC-0010','technical','Hemi Walker','approved',1,null)
) v(code, role, person, decision, ago, note)
join changes c on c.code = v.code
on conflict (change_id, role) do nothing;

insert into actions (code, change_id, phase, kind, description, owner, due, done_on, evidence)
select v.code, c.id, v.phase, v.kind, v.description, v.owner, current_date + v.due,
  case when v.done is null then null else current_date - v.done end, v.evidence from (values
  ('A-001','MOC-0001','pre_startup','procedure','Update solvent transfer start-up procedure SOP-14 for the low-flow trip','Aroha Ngata',-50,49,'SOP-14 revision 6 issued'),
  ('A-002','MOC-0001','pre_startup','training','Brief tank farm operators on the new pump and trip','Ben Fowler',-48,47,'Toolbox talk sign-on sheet'),
  ('A-003','MOC-0001','pre_startup','pssr_item','Prove the low-flow trip','Aroha Ngata',-47,46,'Trip test record TT-201'),
  ('A-004','MOC-0001','post_startup','drawing','Update P&ID 201 to show the new pump and trip','Aroha Ngata',-20,null::int,null),
  ('A-005','MOC-0002','pre_startup','procedure','Issue the two-hourly receiver level log sheet','Hemi Walker',-21,21,'Log sheet LS-12 issued'),
  ('A-006','MOC-0002','post_startup','inspection','Fit the replacement LSH-12 and remove the bypass','Hemi Walker',-5,null,null),
  ('A-007','MOC-0003','pre_startup','procedure','Revise the caustic dosing table','Aroha Ngata',15,null,null),
  ('A-008','MOC-0004','pre_startup','other','Revise the safety case inventory figures for T-104','Claire Dunn',5,null,null),
  ('A-009','MOC-0004','pre_startup','pssr_item','Prove the independent high-high level trip on T-104','Aroha Ngata',8,null,null),
  ('A-010','MOC-0005','pre_startup','training','Train line 2 operators on the conductivity dosing screens','Tom Burke',-11,null,null),
  ('A-011','MOC-0005','post_startup','procedure','Update CIP procedure CIP-02','Sam Okafor',4,null,null),
  ('A-012','MOC-0006','post_startup','other','Replace clamp with a new pipe section at the shutdown','Sam Okafor',40,null,null),
  ('A-013','MOC-0006','post_startup','inspection','Weekly clamp inspection added to the maintenance plan','Sam Okafor',-6,7,'Work order WO-5581'),
  ('A-014','MOC-0007','post_startup','other','Remove hire compressor and reinstate C-2','Hemi Walker',9,null,null),
  ('A-015','MOC-0009','post_startup','inspection','Add bund liner to the monthly inspection round','Ben Fowler',-70,72,'Round sheet revision 3'),
  ('A-016','MOC-0010','pre_startup','training','Train refrigeration techs on the new defrost sequence','Hemi Walker',10,null,null)
) v(code, change_code, phase, kind, description, owner, due, done, evidence)
join changes c on c.code = v.change_code
on conflict (code) do nothing;
