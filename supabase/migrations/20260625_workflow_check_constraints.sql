-- Add workflow integrity checks without validating historical rows immediately.
-- NOT VALID keeps this deployable even if old data still needs cleanup, while
-- enforcing the rules for new or updated rows.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_order_amount_non_negative_chk') then
    alter table posts
      add constraint posts_order_amount_non_negative_chk
      check (coalesce(order_amount, 0) >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_delivery_after_completion_chk') then
    alter table posts
      add constraint posts_delivery_after_completion_chk
      check (
        delivery_date is null
        or completion_scheduled_date is null
        or completion_scheduled_date <= delivery_date
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_shipping_window_order_chk') then
    alter table posts
      add constraint posts_shipping_window_order_chk
      check (
        shipping_scheduled_start is null
        or shipping_scheduled_end is null
        or shipping_scheduled_start <= shipping_scheduled_end
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_processes_amounts_non_negative_chk') then
    alter table order_processes
      add constraint order_processes_amounts_non_negative_chk
      check (planned_amount >= 0 and completed_amount >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_processes_completed_not_over_planned_chk') then
    alter table order_processes
      add constraint order_processes_completed_not_over_planned_chk
      check (completed_amount <= planned_amount) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_processes_order_positive_chk') then
    alter table order_processes
      add constraint order_processes_order_positive_chk
      check (process_order > 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_processes_outsource_status_chk') then
    alter table order_processes
      add constraint order_processes_outsource_status_chk
      check (outsource_status in ('not_sent', 'sent', 'returned', 'hold')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_processes_outsource_dates_chk') then
    alter table order_processes
      add constraint order_processes_outsource_dates_chk
      check (
        (outsource_sent_date is null or outsource_expected_return_date is null or outsource_sent_date <= outsource_expected_return_date)
        and (outsource_sent_date is null or outsource_returned_date is null or outsource_sent_date <= outsource_returned_date)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'production_results_amount_positive_chk') then
    alter table production_results
      add constraint production_results_amount_positive_chk
      check (amount > 0) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'production_schedules_amounts_non_negative_chk') then
    alter table production_schedules
      add constraint production_schedules_amounts_non_negative_chk
      check (plan_amount >= 0 and press_completed_amount >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'production_schedules_completed_not_over_plan_chk') then
    alter table production_schedules
      add constraint production_schedules_completed_not_over_plan_chk
      check (press_completed_amount <= plan_amount) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'production_schedules_shipping_window_order_chk') then
    alter table production_schedules
      add constraint production_schedules_shipping_window_order_chk
      check (
        shipping_scheduled_start is null
        or shipping_scheduled_end is null
        or shipping_scheduled_start <= shipping_scheduled_end
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_amounts_non_negative_chk') then
    alter table inventory_items
      add constraint inventory_items_amounts_non_negative_chk
      check (current_stock >= 0 and allocated_stock >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inventory_items_allocated_not_over_stock_chk') then
    alter table inventory_items
      add constraint inventory_items_allocated_not_over_stock_chk
      check (allocated_stock <= current_stock) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_allocations_shipped_not_over_allocated_chk') then
    alter table inventory_allocations
      add constraint inventory_allocations_shipped_not_over_allocated_chk
      check (shipped_amount <= allocated_amount) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shipments_quantity_positive_chk') then
    alter table shipments
      add constraint shipments_quantity_positive_chk
      check (quantity > 0) not valid;
  end if;
end $$;