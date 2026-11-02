type CustomerName = { customerName: string; customerNameKana?: string };
const japaneseCollator=new Intl.Collator("ja",{numeric:true,sensitivity:"base"});
const englishCollator=new Intl.Collator("en",{numeric:true,sensitivity:"base"});

export const normalizeCustomerReading=(value:string)=>value.normalize("NFKC").trim().replace(/\s+/g,"")
  .replace(/[ァ-ヶ]/g,char=>String.fromCharCode(char.charCodeAt(0)-0x60));

export function validateCustomerReading(name:string,reading:string) {
  if(!name.trim()) return "得意先名を入力してください。";
  const normalized=reading.normalize("NFKC").trim();
  if(normalized.length>256||normalized&&!/^[\p{Script=Hiragana}\p{Script=Katakana}ー\s・]+$/u.test(normalized)) return "ふりがなはひらがな・カタカナで入力してください。";
  if(/\p{Script=Han}/u.test(name)&&!normalized) return "漢字を含む得意先にはふりがなを入力してください。";
  return "";
}

function sortKey(customer:CustomerName) {
  const name=customer.customerName.normalize("NFKC").trim();
  if(/^[A-Za-z0-9]/.test(name)) return {group:1,key:name};
  const reading=normalizeCustomerReading(customer.customerNameKana||"");
  if(reading) return {group:0,key:reading};
  if(name&&!/\p{Script=Han}/u.test(name)) return {group:0,key:normalizeCustomerReading(name)};
  // A missing reading must not masquerade as a correct phonetic sort.
  return {group:name?2:3,key:name};
}

/** Japanese names by stored reading, then English A-Z; unknown readings last. */
export function compareCustomerNames(a:CustomerName,b:CustomerName) {
  const left=sortKey(a),right=sortKey(b);
  if(left.group!==right.group) return left.group-right.group;
  const collator=left.group===1?englishCollator:japaneseCollator;
  return collator.compare(left.key,right.key)||japaneseCollator.compare(a.customerName,b.customerName);
}
