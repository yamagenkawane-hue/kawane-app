-- Drop unused legacy process date columns from posts.
-- manufacturing_date is kept temporarily as the schedule-start fallback.

alter table posts
  drop column if exists cleaning_date,
  drop column if exists inspection_date,
  drop column if exists measurement_date,
  drop column if exists packaging_date;
