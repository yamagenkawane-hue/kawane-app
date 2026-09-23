-- Keep the latest successful prediction when its 90-day execution record expires.

alter table ai_prediction_latest
  drop constraint if exists ai_prediction_latest_run_id_fkey;

alter table ai_prediction_latest
  alter column run_id drop not null;

alter table ai_prediction_latest
  add constraint ai_prediction_latest_run_id_fkey
  foreign key (run_id) references ai_prediction_runs(id) on delete set null;

comment on column ai_prediction_latest.run_id is
  'Source run when retained; becomes null after the 90-day run history is deleted.';
