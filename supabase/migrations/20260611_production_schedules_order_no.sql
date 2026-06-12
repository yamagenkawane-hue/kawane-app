alter table production_schedules
  add column if not exists order_no text;
