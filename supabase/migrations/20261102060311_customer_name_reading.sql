begin;
alter table public.customer_master add column if not exists customer_name_kana text not null default '';
alter table public.customer_master add constraint customer_name_kana_valid
  check(char_length(customer_name_kana)<=256 and customer_name_kana !~ '[一-龠々[:cntrl:]]');
comment on column public.customer_master.customer_name_kana is '日本語取引先名の五十音順表示に使用するふりがな。英字名は元の表記でA-Z順。';
notify pgrst,'reload schema';
commit;
