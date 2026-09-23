-- Allow AI history reference dates to be scoped to a press machine or subcontractor.

alter table ai_prediction_reference_starts
  add column if not exists press_number text,
  add column if not exists subcontractor_id uuid references subcontractors(id) on delete cascade;

alter table ai_prediction_reference_starts
  drop constraint if exists ai_prediction_reference_starts_scope_unique;

alter table ai_prediction_reference_starts
  drop constraint if exists ai_prediction_reference_starts_single_detail_scope_chk;

alter table ai_prediction_reference_starts
  add constraint ai_prediction_reference_starts_single_detail_scope_chk check (
    press_number is null or subcontractor_id is null
  );

drop index if exists ai_prediction_reference_starts_scope_unique_idx;

create unique index ai_prediction_reference_starts_scope_unique_idx
  on ai_prediction_reference_starts
  (product_id, process_id, press_number, subcontractor_id) nulls not distinct;

create index if not exists ai_prediction_reference_starts_subcontractor_idx
  on ai_prediction_reference_starts (subcontractor_id);

