-- Explicit row predicate is required by production safe-update protection.
begin;
create or replace function public.save_history_retention_settings(p_detail integer,p_ai integer,p_prediction integer,p_updated_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform app_private.assert_access(true);
 if p_detail is null or p_ai is null or p_prediction is null or p_detail not between 1 and 30 or p_ai not between p_detail and 30 or p_prediction not between 30 and 3650 then raise exception '保存期間が不正です'; end if;
 if exists(select 1 from public.ai_prediction_settings where max_reference_days>p_ai*365) then raise exception 'AI用実績の保存期間が最大参照期間より短くなっています'; end if;
 update public.history_retention_settings set detail_years=p_detail,ai_years=p_ai,prediction_days=p_prediction,updated_at=clock_timestamp() where id and updated_at=p_updated_at;
 if not found then raise exception '設定が変更されています。再読み込みしてください'; end if;
 update public.history_ai_samples set retained_until=(finished_at+make_interval(years=>p_ai))::date where retained_until is distinct from (finished_at+make_interval(years=>p_ai))::date;
 insert into public.history_retention_events(actor_id,action,detail) values(auth.uid(),'settings',jsonb_build_object('detail_years',p_detail,'ai_years',p_ai,'prediction_days',p_prediction));
end $$;
commit;
