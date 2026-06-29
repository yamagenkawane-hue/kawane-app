# Legacy reference audit

Checked on: 2026-06-29

## Purpose

Confirm whether old workflow columns are still referenced after moving workflow results to `order_processes` and `production_results`, and after changing inventory registration to happen on packaging/wrapping completion.

## Result

### Old JSON log columns

The app code no longer references the old JSON log columns directly:

- `manufacturing_logs`
- `cleaning_logs`
- `inspection_logs`
- `measurement_logs`
- `packaging_logs`

Remaining references are limited to migration history:

- `supabase/migrations/20260622_migrate_legacy_post_logs_to_production_results.sql`
- `supabase/migrations/20260623_remove_legacy_post_logs.sql`
- `supabase/migrations/20260608_inventory_allocations.sql`

These should be kept as historical migration or migration-support SQL unless the migration chain is intentionally squashed.

### Process date columns

Active app code no longer reads the legacy process date columns. Schedule-start fallback now uses `completion_scheduled_date` and then `delivery_date`.

These process date columns are no longer read by active app code:

- `manufacturing_date`
- `cleaning_date`
- `inspection_date`
- `measurement_date`
- `packaging_date`

Remaining references for the process date columns exist only in migration history:

- older `v_posts_with_master` migration definitions

Decision: `supabase/migrations/20260629_trim_posts_view_process_dates.sql` removed `cleaning_date`, `inspection_date`, `measurement_date`, and `packaging_date` from the current `v_posts_with_master` definition. `supabase/migrations/20260629_drop_unused_post_process_dates.sql` then dropped the four unused table columns. `supabase/migrations/20260629_drop_manufacturing_date.sql` removed the remaining `manufacturing_date` view/table column after the app-side fallback was switched to `completion_scheduled_date` / `delivery_date`. The final Supabase check returned no rows, confirming that no legacy process date columns remain in `posts` or `v_posts_with_master`.

### Press completion columns

These columns are still used by active production schedule/result screens:

- `press_completed_amount`
- `press_completed_date`

Active references exist in:

- `app/productionSchedules/page.tsx`
- `app/productionResults/page.tsx`
- `supabase/migrations/20260619_relationship_views_phase2.sql`
- `supabase/migrations/20260622_sync_manufacturing_to_order_processes.sql`
- `supabase/migrations/20260625_workflow_check_constraints.sql`

Decision: do not remove these columns yet. They are still part of the press production schedule workflow.

### Broad selects

No `select("*")` calls remain under active `app` or `pages` code.

Decision: broad app/API reads no longer block future column cleanup. Remaining compatibility-column cleanup should now be judged by explicit active references, view definitions, and DB integrity checks rather than by wildcard reads.

## Follow-up

Recommended next steps:

1. Keep old JSON log references only in migration history.
2. Treat process date columns as removed from active app and current DB objects.
3. Treat `press_completed_*` as active production schedule fields.
4. Before dropping more `posts` columns, prepare a dedicated migration after confirming the target columns are absent from current views, RPC functions, and UI mappings.
