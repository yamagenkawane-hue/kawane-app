import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const c={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/inventoryVisibility.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);
let base=fs.readFileSync('scripts/verify-safe-shipping.mjs','utf8');
const extra='\n'+c.exports.availableInventoryQuantity.toString()+'\n'+c.exports.isInventoryVisible.toString()+String.raw`
  const visible=async id=>{const row=await one('select current_stock,allocated_stock from inventory_items where id=$1',[id]);return isInventoryVisible({currentStock:row.current_stock,allocatedStock:row.allocated_stock})};
  const fp=await post('VISIBILITY-FREE',10);await db.query("update posts set product_code='VISIBILITY-FREE' where id=$1",[fp]);const fsLot=await lot(fp,10,'VISIBILITY-FREE');
  check(await visible(fsLot.inventory),true);const fsShipment=await ship(fp,fsLot.id,10,'visibility-free');check(await visible(fsLot.inventory),false);
  await cancel(fsShipment.id);check(await visible(fsLot.inventory),true);check(await stock(fsLot.inventory),10);
  const ap=await post('VISIBILITY-ALLOC',10);await db.query("update posts set product_code='VISIBILITY-ALLOC' where id=$1",[ap]);const asLot=await lot(ap,10,'VISIBILITY-ALLOC');
  await db.query('select confirm_inventory_allocation($1)',[ap]);check(await visible(asLot.inventory),false);
  const asShipment=await ship(ap,asLot.id,10,'visibility-alloc');check(await visible(asLot.inventory),false);
  await cancel(asShipment.id);check(await stock(asLot.inventory),10);check(await visible(asLot.inventory),false);
  check((await one('select allocated_stock from inventory_items where id=$1',[asLot.inventory])).allocated_stock,10);
`;
base=base.replace('  console.log(JSON.stringify',extra+'  console.log(JSON.stringify');
try{await import('data:text/javascript;base64,'+Buffer.from(base).toString('base64'))}catch(e){console.error(e.message);process.exitCode=1}
