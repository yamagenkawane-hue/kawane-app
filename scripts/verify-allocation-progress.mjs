// Reuse the synthetic shipping schema/base migration, then test the NEW allocation guard.
// No network access or live data changes.
import fs from "node:fs";
const existing = fs.readFileSync("scripts/verify-safe-shipping.mjs", "utf8");
const guardTests = `
  await db.exec("alter table order_processes add column planned_amount integer, add column outsource_status text, add column outsource_expected_return_date date");
  const migration=fs.readFileSync("supabase/migrations/20261029_block_allocation_after_process_progress.sql","utf8");
  await db.exec(migration); await db.exec(migration);
  const target=async(name,amount=100)=>{
    const id=await post(name,amount);
    await db.query("update posts set product_code='GUARD' where id=$1",[id]);
    return id;
  };
  const pool=await target('POOL');const poolLot=await lot(pool,1000,'GUARD');
  const allocate=id=>db.query("select confirm_inventory_allocation($1)",[id]);
  const hasProgress=async id=>(await one("select has_process_progress from v_order_allocation_eligibility where post_id=$1",[id])).has_process_progress;
  const step=async(id,options={})=>(await one("insert into order_processes(post_id,process_name,process_order,planned_amount,completed_amount,outsource_status,outsource_sent_date,outsource_expected_return_date) values($1,'TEST',5,100,$2,$3,$4,$5) returning id",
    [id,options.completed||0,options.status||'not_sent',options.sent||null,options.expected||null])).id;
  const blocked=async(id)=>{
    const beforeStock=await stock(poolLot.inventory);
    check(await hasProgress(id),true);
    await reject(allocate(id),/工程進捗/);
    check(await stock(poolLot.inventory),beforeStock);
    check((await one("select count(*)::int n from inventory_allocations where post_id=$1",[id])).n,0);
  };
  const planned=await target('PLAN-ONLY',10);await step(planned,{expected:'2026-12-01'});
  check(await hasProgress(planned),false);await allocate(planned);
  check((await one("select sum(allocated_amount)::int n from inventory_allocations where post_id=$1",[planned])).n,10);
  const onePercent=await target('ONE-PERCENT',100);await step(onePercent,{completed:1});await blocked(onePercent);
  const subPercent=await target('LESS-THAN-DISPLAY-PERCENT',10000);await step(subPercent,{completed:1});await blocked(subPercent);
  const completed=await target('FULLY-PRODUCED',25);await step(completed,{completed:25});await blocked(completed);
  const resultOnly=await target('RESULT-ONLY');const op=await step(resultOnly);
  await db.query("insert into production_results(order_process_id,amount) values($1,1)",[op]);await blocked(resultOnly);
  const legacy=await target('LEGACY-SCHEDULE');
  const schedule=(await one("insert into production_schedules(order_no) values('LEGACY-SCHEDULE') returning id")).id;
  await db.query("insert into production_results(schedule_id,amount) values($1,1)",[schedule]);await blocked(legacy);
  const sent=await target('OUTSOURCE-SENT');await step(sent,{sent:'2026-10-01'});await blocked(sent);
  const status=await target('OUTSOURCE-STATUS');await step(status,{status:'sent'});await blocked(status);
  const moved=await target('TRANSFERRED');const first=await step(moved);
  const second=(await one("insert into order_processes(post_id,process_name,process_order) values($1,'NEXT',9) returning id",[moved])).id;
  const movedLot=await lot(moved,0,'GUARD');
  await db.query("insert into lot_process_balance(post_id,lot_id,order_process_id,quantity) values($1,$2,$3,1)",[moved,movedLot.id,second]);await blocked(moved);
  const history=await target('HISTORY-ONLY');
  await db.query("insert into process_transfer_history(post_id,quantity,movement_type) values($1,1,'stock_in')",[history]);await blocked(history);
  const fresh=await target('OTHER-ORDERS-PROGRESS-DOES-NOT-BLOCK',10);
  check(await hasProgress(fresh),false);await allocate(fresh);
  check((await one("select sum(allocated_amount)::int n from inventory_allocations where post_id=$1",[fresh])).n,10);
  const stale=await target('STALE-SCREEN');check(await hasProgress(stale),false);
  await db.query("insert into production_results(post_id,amount) values($1,1)",[stale]);await blocked(stale);
  // Existing allocation is preserved even if production starts later.
  await step(planned,{completed:1});await reject(allocate(planned),/工程進捗/);
  check((await one("select sum(allocated_amount)::int n from inventory_allocations where post_id=$1",[planned])).n,10);
  check((await one("select has_function_privilege('anon','confirm_inventory_allocation_unstarted_base(uuid)','execute') allowed")).allowed,false);
  check((await one("select has_function_privilege('service_role','confirm_inventory_allocation_unstarted_base(uuid)','execute') allowed")).allowed,false);
  console.log(JSON.stringify({mode:'synthetic shipping regression and allocation progress guard',passed},null,2));
`;
const replacement=existing.replace('  console.log(JSON.stringify({mode:"synthetic in-memory PostgreSQL",passed},null,2));',`{${guardTests}}`);
if(replacement===existing) throw Error("Test integration marker not found");
try {
  await import(`data:text/javascript;base64,${Buffer.from(replacement).toString("base64")}`);
} catch (error) {
  console.error(error.message);
  process.exitCode=1;
}
