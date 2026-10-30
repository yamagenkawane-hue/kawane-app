"use client";

import { useRef, useState } from "react";
import supabase from "@/lib/supabase";
import { availableRemainderAmount, type OutsourceRemainder, validateRemainderDates } from "@/lib/outsourceRemainders";
import styles from "./page.module.css";

type Props = {
  orderProcessId: string;
  identity: string;
  remainingAmount: number;
  schedules?: OutsourceRemainder[];
  onSaved: () => Promise<void>;
};
const EMPTY_SCHEDULES:OutsourceRemainder[]=[];

export default function OutsourceRemainderEditor({orderProcessId,identity,remainingAmount,schedules=EMPTY_SCHEDULES,onSaved}: Props) {
  const [drafts,setDrafts]=useState<OutsourceRemainder[]>(()=>schedules);
  const [previousSchedules,setPreviousSchedules]=useState(()=>schedules);
  const [saving,setSaving]=useState("");
  const [error,setError]=useState("");
  const busyRef=useRef(false);
  if(previousSchedules!==schedules) {
    setPreviousSchedules(schedules);
    setDrafts(previous=>[
    ...schedules.map(row=>{
      const draft=previous.find(item=>item.id===row.id);
      return draft?.updatedAt===row.updatedAt?draft:row;
    }),
    ...previous.filter(item=>!item.updatedAt&&!schedules.some(row=>row.id===item.id)),
    ]);
  }
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const available=availableRemainderAmount(remainingAmount,drafts);
  const update=(id:string,values:Partial<OutsourceRemainder>)=>setDrafts(previous=>previous.map(row=>row.id===id?{...row,...values}:row));
  const add=()=>{
    setDrafts(previous=>[...previous,{id:crypto.randomUUID(),orderProcessId,quantity:available,movedAmount:0,
      sequence:Math.max(0,...previous.map(row=>row.sequence))+1,
      sentDate:"",expectedDate:"",returnedDate:"",note:"",updatedAt:""}]);
    setError("");
  };
  const save=async(item:OutsourceRemainder,cancelled=false)=>{
    if(busyRef.current) return;
    if(cancelled && !confirm("この残数分の外注日程を取り消しますか？")) return;
    if(!cancelled) {
      const message=validateRemainderDates(item,today);
      if(message) {setError(message);return;}
      const other=drafts.filter(row=>row.id!==item.id);
      if(!Number.isInteger(item.quantity)||item.quantity<=0||item.quantity<item.movedAmount||item.quantity-item.movedAmount>availableRemainderAmount(remainingAmount,other)) {
        setError("対象数量が残数量を超えているか、移動済み数量より少なくなっています。");return;
      }
    }
    if(cancelled&&!item.updatedAt) {setDrafts(previous=>previous.filter(row=>row.id!==item.id));return;}
    busyRef.current=true;setSaving(item.id);setError("");
    try {
      const {error:saveError}=await supabase.rpc("save_outsource_remainder_schedule",{
        p_id:item.id,p_order_process_id:orderProcessId,p_quantity:item.quantity,
        p_sent_date:item.sentDate||null,p_expected_date:item.expectedDate||null,p_returned_date:item.returnedDate||null,
        p_note:item.note,p_updated_at:item.updatedAt||null,p_cancelled:cancelled,
      });
      if(saveError) throw new Error(saveError.code==="PGRST202"?"残数分の外注日程を保存するシステム更新が未反映です。":saveError.message);
      await onSaved();
    } catch(cause) {setError(cause instanceof Error?cause.message:"追加日程の保存に失敗しました。");}
    finally {busyRef.current=false;setSaving("");}
  };
  return <section className={styles.section} aria-label={`${identity} 残数分の外注日程`}>
    {drafts.map(item=><fieldset key={item.id} className={styles.card} disabled={Boolean(saving)}>
      <legend>追加{item.sequence}回目（残数分）</legend>
      <label><span>対象数量</span><input type="number" min={Math.max(1,item.movedAmount)} step={1} value={item.quantity}
        aria-label={`${identity} 追加${item.sequence}回目 対象数量`}
        onChange={event=>update(item.id,{quantity:Number(event.target.value)})}/></label>
      {([['sentDate','出し日'],['expectedDate','予定日'],['returnedDate','実績日']] as const).map(([key,label])=><label key={key}>
        <span>{label}</span><input type="date" value={item[key]} readOnly={item.movedAmount>0}
          aria-label={`${identity} 追加${item.sequence}回目 ${label}`} max={key==='expectedDate'?undefined:today}
          onChange={event=>update(item.id,{[key]:event.target.value})}/>
      </label>)}
      <label><span>メモ</span><input value={item.note} aria-label={`${identity} 追加${item.sequence}回目 メモ`} onChange={event=>update(item.id,{note:event.target.value})}/></label>
      <p>{item.returnedDate?"戻り済み":item.sentDate?"外注中":"未出し"} ／ 次工程へ移動済み：{item.movedAmount}個</p>
      <div className={styles.actions}><button type="button" onClick={()=>void save(item)}>{saving===item.id?"保存中…":"この日程を保存"}</button>
        {item.movedAmount===0&&<button type="button" onClick={()=>void save(item,true)}>取消</button>}</div>
    </fieldset>)}
    {remainingAmount>0&&<><p className={styles.available}>日程未登録の残数：{available}個</p>
      <button type="button" disabled={available<=0||Boolean(saving)} onClick={add}>残数の日程を追加</button></>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
