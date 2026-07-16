-- Add material master fields used by the material screen.
-- material_code is kept as the DB column and displayed as "材番" in the UI.

alter table material_master
  add column if not exists size text,
  add column if not exists remaining_amount numeric not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'material_master_remaining_amount_non_negative_chk'
  ) then
    alter table material_master
      add constraint material_master_remaining_amount_non_negative_chk
      check (remaining_amount >= 0) not valid;
  end if;
end $$;
