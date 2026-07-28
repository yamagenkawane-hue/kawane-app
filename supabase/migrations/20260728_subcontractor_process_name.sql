alter table subcontractors
  add column if not exists process_name text not null default '';

create index if not exists subcontractors_process_name_idx
  on subcontractors (process_name);
