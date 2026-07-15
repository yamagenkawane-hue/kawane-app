alter table posts
  add column if not exists measurement_registration_hidden boolean not null default false;

update posts
set measurement_registration_hidden = false
where measurement_registration_hidden is null;
