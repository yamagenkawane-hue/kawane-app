import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
let passed = 0;
const check = (value, expected) => { assert.deepEqual(value, expected); passed++; };
function load(file, mocks = {}) {
  const context = { exports: {}, console, require(name) {
    if (name in mocks) return mocks[name];
    if(name==="@/lib/auth/client") return {authFetch:async()=>{throw Error("Unexpected API call during server rendering");}};
    if(name==="@/app/components/AuthProvider/AuthProvider") return {useAppAuth:()=>({profile:{manager:true}})};
    if (name.endsWith(".css")) return { __esModule:true, default:new Proxy({}, {get:(_,key)=>String(key)}) };
    if (name === "next/link") return { __esModule:true, default:({children,...props})=>React.createElement("a",props,children) };
    if (name.startsWith("@mui/")) return { __esModule:true, default:()=>null };
    if (name.startsWith(".") || name.startsWith("@/")) {
      const base=name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file),name);
      const target=[base,`${base}.ts`,`${base}.tsx`].find(f=>fs.existsSync(f) && fs.statSync(f).isFile());
      return load(target,mocks);
    }
    return require(name);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
  }).outputText, context);
  return context.exports;
}
const base={orderNo:"A-1",productName:"試験製品",productCode:"TEST",customerName:"あ社",orderAmount:100,
  inventoryAmount:195,shippedAmount:0,deliveryDate:"2026-12-01",remark:"",delete:false};
const balance={id:"balance",postId:"one",lotId:"lot",lotNo:"LIVE",materialLotNo:"",orderProcessId:"measure",
  processName:"計量",processOrder:4,quantity:20};
const posts=Array.from({length:9},(_,i)=>({...base,id:`post${i}`,orderNo:`A-${i+1}`,lotProcessBalances:i===0?[balance]:[]}));
const mocks={
  "@/lib/supabase":{__esModule:true,default:{}},
  "../utills/useFetchPosts":{useFetchPosts:()=>({posts,setShouldFetch:()=>{}})},
  "../utills/useReservationDelete":{useReservationDelete:()=>()=>{}},
};
const Page=load("app/reservation/page.tsx",mocks).default;
const page=renderToStaticMarkup(React.createElement(Page));
check((page.match(/href="\/progress\/post/g)||[]).length,9);
check(page.includes("引当数"),false); check(page.includes(">日付<"),false);
check(page.includes("梱包在庫"),true); check(page.includes(">215<"),true);
check(page.includes(">-685<"),true); // 20 WIP + 195 stock - 900 outstanding; stock counted once.
check(page.includes("次へ"),false);
check(page.indexOf("トップページに戻る") < page.indexOf("placeholder="),true);
check(page.indexOf("placeholder=") < page.indexOf("<h1>"),true);
const customerSortPosts=[
  {...base,id:"sort-z",customerName:"山田工業",productName:"あ製品",deliveryDate:"2026-10-01"},
  {...base,id:"sort-b",customerName:"あおい工業",productName:"い製品",deliveryDate:"2026-10-01"},
  {...base,id:"sort-a",customerName:"あおい工業",productName:"あ製品",deliveryDate:"2026-12-01"},
];
const CustomerSortPage=load("app/reservation/page.tsx",{...mocks,
  "../utills/useFetchPosts":{useFetchPosts:()=>({posts:customerSortPosts,setShouldFetch:()=>{}})},
}).default;
const customerSortHtml=renderToStaticMarkup(React.createElement(CustomerSortPage));
check(customerSortHtml.indexOf('href="/progress/sort-a"')<customerSortHtml.indexOf('href="/progress/sort-b"'),true);
check(customerSortHtml.indexOf('href="/progress/sort-b"')<customerSortHtml.indexOf('href="/progress/sort-z"'),true);
const Row=load("app/components/ReservationList/ReservationList.tsx").default;
const row=renderToStaticMarkup(React.createElement(Row,{post:{...base,id:"one",lotProcessBalances:[
  balance,{...balance,id:"history",lotNo:"MOVED-AWAY",isHistoryOnly:true},
  {...balance,id:"empty",lotNo:"ZERO-BALANCE",quantity:0},
]},handleDelete:()=>{},handleTransferLot:async()=>{}}));
check(row.includes("MOVED-AWAY"),false); check(row.includes("ZERO-BALANCE"),false);
check(row.includes(">完了<"),true); check((row.match(/<td\b/g)||[]).length,19);

const {fetchAllRows}=load("lib/fetchAllRows.ts");
const source=Array.from({length:2501},(_,i)=>i);
check((await fetchAllRows(async(from,to)=>({data:source.slice(from,to+1),error:null}))).data.length,2501);
check((await fetchAllRows(async()=>({data:null,error:{message:"failure"}}))).error.message,"failure");

const calls=[];
const api=load("pages/api/shipments.ts",{
  "@/lib/auth/server":{requireApiUser:async()=>({profile:{manager:true},client:{rpc:async(name,args)=>{calls.push({name,args});return {data:{id:"shipment"},error:null};}}})},
  "@/lib/supabase":{__esModule:true,default:{from:()=>{throw Error("Unexpected separate database write");}}},
  "@/lib/supabaseAdmin":{__esModule:true,hasSupabaseAdminConfig:true,default:{rpc:async(name,args)=>{
    calls.push({name,args});return {data:{id:"shipment"},error:null};
  }}},
}).default;
async function request(body) {
  const response={code:0,payload:null,status(code){this.code=code;return this;},json(value){this.payload=value;return this;}};
  await api({method:"POST",body},response);return response;
}
const payload={post_id:"post",lot_id:"lot",scheduled_date:"2026-10-20",quantity:10,idempotency_key:"key"};
check((await request({...payload,quantity:1.5})).code,400); check(calls.length,0);
check((await request({...payload,idempotency_key:""})).code,400); check(calls.length,0);
check((await request(payload)).code,201); check(calls.length,1);
check(calls[0].name,"register_shipment");check(calls[0].args.p_lot_id,"lot");
const {isOutsourceTransfer,validateOutsourceTransferDates}=load("lib/outsourceTransfer.ts");
check(isOutsourceTransfer({process_name:"洗浄"}),false);
check(isOutsourceTransfer({process_name:"加工",subcontractor_id:"vendor"}),true);
check(isOutsourceTransfer({process_name:"表面処理",product_processes:{process_master:{outsourcing:true}}}),true);
check(isOutsourceTransfer({process_name:"表面処理",product_processes:[{process_master:[{outsourcing:true}]}]}),true);
const dates={sentDate:"2026-10-12",expectedDate:"2026-10-15",returnedDate:"2026-10-16"};
check(validateOutsourceTransferDates(dates,"2026-10-26"),"");
check(Boolean(validateOutsourceTransferDates({...dates,sentDate:""},"2026-10-26")),true);
check(Boolean(validateOutsourceTransferDates({...dates,returnedDate:"2026-11-01"},"2026-10-26")),true);
check(Boolean(validateOutsourceTransferDates({...dates,returnedDate:"2026-10-11"},"2026-10-26")),true);
check(Boolean(validateOutsourceTransferDates({...dates,sentDate:"2026-02-30"},"2026-10-26")),true);
const Dialog=load("app/components/OutsourceTransferDialog/OutsourceTransferDialog.tsx").default;
const dialog=renderToStaticMarkup(React.createElement(Dialog,{today:"2026-10-26",request:{lotNo:"TEST",processName:"メッキ",quantity:100,
  dates:{sentDate:"2026-10-12",expectedDate:"",returnedDate:""}},onCancel:()=>{},onSubmit:async()=>{}}));
check(dialog.includes("登録して次工程へ移動"),true);
check((dialog.match(/readOnly=""/g)||[]).length,1);
check((dialog.match(/type="date"/g)||[]).length,3);
const processHelpers=load("lib/progressProcess.ts");
const definitions=[
  {id:"m",post_id:"chain",process_name:"製造",process_order:1},
  {id:"o1",post_id:"chain",process_name:"メッキ",process_order:2},
  {id:"o2",post_id:"chain",process_name:"外注仕上げ",process_order:3},
  {id:"o3",post_id:"chain",process_name:"追加加工",process_order:4,product_process_id:"surface"},
  {id:"i",post_id:"chain",process_name:"検査",process_order:5},
  {id:"w",post_id:"chain",process_name:"計量",process_order:6},
  {id:"p",post_id:"chain",process_name:"梱包",process_order:7},
];
const metadata=processHelpers.buildProcessDisplayMap([...definitions].reverse(),[
  {id:"surface",process_master:{process_id:"surface_treatment",name:"表面処理",outsourcing:true}},
]);
const stages=definitions.map(d=>({...balance,...metadata.get(d.id),id:d.id,orderProcessId:d.id,
  processName:d.process_name,processOrder:d.process_order,lotNo:`STAGE-${d.id}`}));
check(stages.map(b=>processHelpers.getProgressDisplayGroup(b)),[
  "manufacturing","cleaning","cleaning","cleaning","inspection","measurement","measurement",
]);
check(stages.map(b=>processHelpers.isCompletionProcess(b)),[false,false,false,false,false,true,true]);
check(metadata.get("i").processPosition,5);check(metadata.get("i").processCount,7);
check(processHelpers.getWeightedProcessProgress([{...stages[4],quantity:100}],100),57);
check(processHelpers.getWeightedProcessProgress([{...stages[5],quantity:100}],100),71);
check(processHelpers.getWeightedProcessProgress([{...stages[6],quantity:100}],100),86);
check(processHelpers.getWeightedProcessProgress([{quantity:100,isCompleted:true}],100),100);
const chainRow=renderToStaticMarkup(React.createElement(Row,{post:{...base,id:"chain",lotProcessBalances:stages},
  handleDelete:()=>{},handleTransferLot:async()=>{}}));
const cells=[...chainRow.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match=>match[1]);
check(cells.length,19);
for(const stage of stages) check((chainRow.match(new RegExp(`>${stage.lotNo}<`,"g"))||[]).length,1);
check(cells[7].includes("STAGE-o1")&&cells[7].includes("STAGE-o2")&&cells[7].includes("STAGE-o3"),true);
check(cells[9].includes("STAGE-i"),true);check(cells[9].includes("STAGE-o2"),false);
check(cells[11].includes("STAGE-w")&&cells[11].includes("STAGE-p"),true);
check((chainRow.match(/>完了<\/button>/g)||[]).length,2);
const lateOutsource={...stages[3],processOrder:8};
check(processHelpers.getProgressDisplayGroup(lateOutsource),"cleaning");
check(processHelpers.isCompletionProcess(lateOutsource),false);
// A progress-scoped order with two suppliers must identify every schedule row.
const outsourceRows=[
  {id:"external-a",orderNo:"OUT-2",customerName:"試験先",productCode:"P",productName:"試験製品",processOrder:2,processName:"メッキ",
    subcontractorName:"外注先A",plannedAmount:100,completedAmount:0,remainingAmount:100,deliveryDate:"2026-11-01",
    outsourceSentDate:"2026-10-12",outsourceExpectedReturnDate:"2026-10-15",outsourceReturnedDate:""},
  {id:"external-b",orderNo:"OUT-2",customerName:"試験先",productCode:"P",productName:"試験製品",processOrder:3,processName:"塗装",
    subcontractorName:"外注先B",plannedAmount:100,completedAmount:0,remainingAmount:100,deliveryDate:"2026-11-01",
    outsourceSentDate:"2026-10-17",outsourceExpectedReturnDate:"2026-10-20",outsourceReturnedDate:""},
];
function renderOutsourcing(scoped) {
  const component=load("app/outsourcing/page.tsx",{
    "react":{...React,useState:(initial)=>Array.isArray(initial)?[outsourceRows,()=>{}]:React.useState(initial)},
    "@/lib/supabase":{__esModule:true,default:{}},
    "next/navigation":{useRouter:()=>({push:()=>{}}),useSearchParams:()=>new URLSearchParams(scoped?"orderNo=OUT-2&returnTo=reservation":"")},
  }).default;
  return renderToStaticMarkup(React.createElement(component));
}
for(const scoped of [true,false]) {
  const html=renderOutsourcing(scoped);
  check(html.includes(">工程</th>"),true);check(html.includes(">外注先</th>"),true);
  const scheduleRows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(match=>match[1]).filter(row=>row.includes('type="date"'));
  check(scheduleRows.length,2);
  for(let i=0;i<2;i++) {
    const row=outsourceRows[i],rendered=scheduleRows[i];
    check(rendered.includes(row.processName)&&rendered.includes(row.subcontractorName),true);
    check(rendered.includes(`value="${row.outsourceSentDate}"`),true);
    check(rendered.includes(`value="${outsourceRows[1-i].outsourceSentDate}"`),false);
    check(rendered.includes(`aria-label="OUT-2 第${row.processOrder}工程 ${row.processName} ${row.subcontractorName} 実績日"`),true);
  }
}
const allocationPosts=[
  {...base,id:"unstarted",orderNo:"ALLOC-UNSTARTED",lotNo:"PLANNED-ONLY",manufacturingLots:[],remainingAmount:100,allocationConfirmed:false,availableInventoryAmount:100,hasProcessProgress:false},
  {...base,id:"started",orderNo:"ALLOC-STARTED",remainingAmount:100,allocationConfirmed:false,availableInventoryAmount:100,hasProcessProgress:true},
  {...base,id:"confirmed",orderNo:"ALLOC-CONFIRMED",manufacturingLots:[{id:"lot-a",lotNo:"ACTUAL-A",materialLotNo:"MAT-A"},{id:"lot-b",lotNo:"ACTUAL-B",materialLotNo:"MAT-B"}],remainingAmount:100,allocationConfirmed:true,availableInventoryAmount:100,hasProcessProgress:true},
];
const OrdersPage=load("app/orders/page.tsx",{
  "react":{...React,useState:(initial)=>Array.isArray(initial)?[allocationPosts,()=>{}]:React.useState(initial)},
  "../../lib/supabase":{__esModule:true,default:{}},
}).default;
const ordersHtml=renderToStaticMarkup(React.createElement(OrdersPage));
const allocationRows=[...ordersHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(match=>match[1]);
const startedRow=allocationRows.find(row=>row.includes("ALLOC-STARTED"));
const unstartedRow=allocationRows.find(row=>row.includes("ALLOC-UNSTARTED"));
const confirmedRow=allocationRows.find(row=>row.includes("ALLOC-CONFIRMED"));
check(startedRow.includes("引当不可"),true);check(startedRow.includes("工程進捗あり"),true);
check(/<button[^>]*disabled=""[^>]*>引当不可<\/button>/.test(startedRow),true);
check(unstartedRow.includes(">確定</button>"),true);check(unstartedRow.includes("引当不可"),false);
check(confirmedRow.includes("確定済み"),true);
check(confirmedRow.includes("ACTUAL-A")&&confirmedRow.includes("ACTUAL-B"),true);
check(confirmedRow.includes('href="/lots/lot-a"')&&confirmedRow.includes('href="/lots/lot-b"'),true);
check(confirmedRow.includes("MAT-A")&&confirmedRow.includes("MAT-B"),true);
check(unstartedRow.includes("PLANNED-ONLY"),false);
const {buildOrderManufacturingLots}=load("lib/orderManufacturingLots.ts");
const lotRows=[
  {id:"lot-10",post_id:"one",lot_no:"LOT-10",material_lot_no:"M10"},
  {id:"lot-2",post_id:"one",lot_no:"LOT-2",material_lot_no:"M2"},
  {id:"planned",post_id:"one",lot_no:"PLANNED"},
  {id:"zero",post_id:"one",lot_no:"ZERO"},
  {id:"later",post_id:"one",lot_no:"LATER"},
  {id:"foreign",post_id:"two",lot_no:"FOREIGN"},
];
const processRows=[{id:"first",post_id:"one",process_order:2},{id:"next",post_id:"one",process_order:4}];
const resultRows=[
  ...["lot-10","lot-2","lot-2","foreign"].map(lot_id=>({lot_id,post_id:"one",order_process_id:"first",amount:10})),
  {lot_id:"zero",post_id:"one",order_process_id:"first",amount:0},
  {lot_id:"later",post_id:"one",order_process_id:"next",amount:10},
];
const groupedLots=buildOrderManufacturingLots(lotRows,resultRows,processRows);
check(groupedLots.get("one").map(row=>row.lotNo).join(","),"LOT-2,LOT-10");
check(groupedLots.has("two"),false);
check(groupedLots.get("one")[0].materialLotNo,"M2");
check(buildOrderManufacturingLots(lotRows,[],processRows).size,0);
const remainders=load("lib/outsourceRemainders.ts");
const entries=[
  {id:"dispatch-a",orderProcessId:"external-a",sequence:2,quantity:12,movedAmount:5,sentDate:"2026-10-20",expectedDate:"2026-10-22",returnedDate:"2026-10-23",note:"一便目",updatedAt:"v1"},
  {id:"dispatch-b",orderProcessId:"external-a",sequence:4,quantity:8,movedAmount:0,sentDate:"2026-10-24",expectedDate:"2026-10-27",returnedDate:"",note:"二便目",updatedAt:"v2"},
];
check(remainders.availableRemainderAmount(15,entries),0);
check(remainders.availableRemainderAmount(20,entries),5);
check(remainders.validateRemainderDates({sentDate:"",expectedDate:"",returnedDate:""},"2026-10-29"),"");
check(Boolean(remainders.validateRemainderDates({sentDate:"",expectedDate:"",returnedDate:"2026-10-25"},"2026-10-29")),true);
const Editor=load("app/components/OutsourceRemainderEditor/OutsourceRemainderEditor.tsx",{"@/lib/supabase":{__esModule:true,default:{}}}).default;
const editorHtml=renderToStaticMarkup(React.createElement(Editor,{orderProcessId:"external-a",identity:"OUT-2 メッキ",remainingAmount:15,schedules:entries,onSaved:async()=>{}}));
check((editorHtml.match(/type="date"/g)||[]).length,6);
check(editorHtml.includes("追加2回目（残数分）")&&editorHtml.includes("追加4回目（残数分）"),true);
check(editorHtml.includes('value="2026-10-20"')&&editorHtml.includes('value="2026-10-24"'),true);
check((editorHtml.match(/readOnly=""/g)||[]).length,3);
check(/<button[^>]*disabled=""[^>]*>残数の日程を追加<\/button>/.test(editorHtml),true);
const remainderDialog=renderToStaticMarkup(React.createElement(Dialog,{today:"2026-10-29",request:{lotNo:"TEST",processName:"メッキ",quantity:15,isRemainder:true,schedules:entries,availableNewQuantity:0,dates:entries[0]},onCancel:()=>{},onSubmit:async()=>{}}));
check(remainderDialog.includes('max="7"')&&remainderDialog.includes('value="7"'),true);
check(remainderDialog.includes("追加2回目：未移動7個")&&remainderDialog.includes("追加4回目：未移動8個"),true);
check(remainderDialog.includes('value="2026-10-23"'),true);
console.log(JSON.stringify({mode:"offline React rendering and API",passed},null,2));
