alter table product_master
  add column if not exists customer_name varchar(100);
