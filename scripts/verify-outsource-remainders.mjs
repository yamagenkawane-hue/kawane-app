// Exercise the new dispatch schedule with the existing synthetic outsourcing database.
import fs from "node:fs";
const base=fs.readFileSync("scripts/verify-outsource-transfer.mjs","utf8");
const extra=`
  {
    await db.exec("create role service_role; alter table order_processes add column planned_amount integer default 100");
    await db.exec(fs.readFileSync("supabase/migrations/20261029_outsource_remainder_schedules.sql","utf8"));
    const setup=async()=>{
      const f=await fixture();
      await db.query("update order_processes set completed_amount=80,outsource_sent_date='2026-10-13',outsource_expected_return_date='2026-10-15',outsource_returned_date='2026-10-16' where id=$1",[f.source]);
      await db.query("update lot_process_balance set quantity=20 where lot_id=$1",[f.lot]);
      return f;
    };
    const save=async(f,item,values={})=>{
      const v={quantity:item.quantity,sent:'2026-10-17',expected:'2026-10-19',returned:'2026-10-20',note:'test',cancelled:false,...values};
      return one("select id,quantity,moved_amount,updated_at::text as updated_at from save_outsource_remainder_schedule($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [item.id,f.source,v.quantity,v.sent,v.expected,v.returned,v.note,item.updated_at||null,v.cancelled]);
    };
    const fresh=async quantity=>({id:(await one('select gen_random_uuid() id')).id,quantity});
    const move=(f,id,amount,key,dates=['2026-10-17','2026-10-19','2026-10-20'])=>db.query("select transfer_outsource_remainder_lot($1,$2,$3,$4,$5,$6,$7,$8)",[id,f.lot,f.source,amount,...dates,key]);
    const f=await setup();
    const first=await save(f,await fresh(12));
    const second=await save(f,await fresh(8),{sent:'2026-10-21',expected:'2026-10-23',returned:'2026-10-24'});
    await reject(save(f,await fresh(1)),/残数量/);
    check((await one("select outsource_returned_date::text as value from order_processes where id=$1",[f.source])).value,'2026-10-16');
    await move(f,first.id,5,'batch-part');
    check((await one("select quantity from lot_process_balance where lot_id=$1 and order_process_id=$2",[f.lot,f.source])).quantity,15);
    check((await one("select quantity from lot_process_balance where lot_id=$1 and order_process_id=$2",[f.lot,f.next])).quantity,5);
    check((await one("select moved_amount from outsource_remainder_schedules where id=$1",[first.id])).moved_amount,5);
    check((await one("select correction_quantity from process_transfer_history where idempotency_key='batch-part'")).correction_quantity,0);
    await move(f,first.id,5,'batch-part');
    check((await one("select quantity from lot_process_balance where lot_id=$1 and order_process_id=$2",[f.lot,f.next])).quantity,5);
    await reject(move(f,first.id,8,'batch-over'),/未移動数量/);
    await reject(save(f,first),/更新されています/);
    const current=await one("select id,quantity,updated_at::text as updated_at from outsource_remainder_schedules where id=$1",[first.id]);
    await reject(save(f,current,{returned:'2026-10-21'}),/移動済み/);
    await move(f,first.id,7,'batch-first-finish');
    await move(f,second.id,8,'batch-second-finish',['2026-10-21','2026-10-23','2026-10-24']);
    check((await one("select completed_amount from order_processes where id=$1",[f.source])).completed_amount,100);
    check((await one("select completed_date::text as value from order_processes where id=$1",[f.source])).value,'2026-10-24');
    check((await one("select quantity from lot_process_balance where lot_id=$1 and order_process_id=$2",[f.lot,f.next])).quantity,20);
    check((await one("select sum(moved_amount)::int n from outsource_remainder_schedules where order_process_id=$1",[f.source])).n,20);
    check((await one("select outsource_sent_date::text as value from order_processes where id=$1",[f.source])).value,'2026-10-13');
    const cancelCase=await setup();
    const pending=await save(cancelCase,await fresh(20),{sent:'2026-10-21',expected:'2026-10-25',returned:null});
    check((await one("select outsource_status from order_processes where id=$1",[cancelCase.source])).outsource_status,'sent');
    await save(cancelCase,pending,{sent:'2026-10-21',expected:'2026-10-25',returned:null,cancelled:true});
    check((await one("select cancelled from outsource_remainder_schedules where id=$1",[pending.id])).cancelled,true);
    await save(cancelCase,await fresh(20));
    check((await one("select max(dispatch_no)::int n from outsource_remainder_schedules where order_process_id=$1",[cancelCase.source])).n,2);
    const auto=await setup();
    await move(auto,null,20,'auto-new');await move(auto,null,20,'auto-new');
    check((await one("select count(*)::int n from outsource_remainder_schedules where order_process_id=$1",[auto.source])).n,1);
    const rollback=await setup();
    await db.query("update order_processes set locked=true where id=$1",[rollback.source]);
    await reject(move(rollback,null,20,'locked-new'),/ロック/);
    check((await one("select count(*)::int n from outsource_remainder_schedules where order_process_id=$1",[rollback.source])).n,0);
    const dateCase=await setup();
    await reject(save(dateCase,await fresh(20),{returned:'2099-01-01'}),/本日以前/);
    await reject(save(dateCase,await fresh(20),{sent:null}),/前後関係/);
    await reject(save(dateCase,await fresh(20),{expected:'2026-10-10'}),/前後関係/);
    check((await one("select has_table_privilege('anon','outsource_remainder_schedules','INSERT') allowed")).allowed,false);
  }
`;
const marker='  console.log(JSON.stringify({mode:"in-memory PostgreSQL",passed},null,2));';
const source=base.replace(marker,extra+marker);
if(source===base) throw Error("Test integration marker missing");
try {await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
catch(error){console.error(error.message);process.exitCode=1;}
