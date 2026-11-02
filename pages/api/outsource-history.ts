import type { NextApiRequest, NextApiResponse } from "next";
import { requireApiUser } from "@/lib/auth/server";
import { fetchAllRows } from "@/lib/fetchAllRows";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireApiUser(req, res);
  if (!auth) return;
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end(); }
  try {
    const query = String(req.query.q || "").trim();
    const page = Number(req.query.page || 0);
    if (query.length > 100 || !Number.isInteger(page) || page < 0 || page > 100000) return res.status(400).json({ error: "検索条件が不正です" });
    const [processes, masters] = await Promise.all([
      fetchAllRows((from, to) => auth.client.from("v_order_processes_with_master").select("id,post_id,product_id,product_process_id,order_no,customer_name,product_code,product_name,process_name,process_order,subcontractor_name,subcontractor_id,outsource_sent_date,outsource_expected_return_date,outsource_returned_date,outsource_note,updated_at").order("id").range(from, to)),
      fetchAllRows((from, to) => auth.client.from("v_product_processes_with_master").select("id,product_id,product_code,process_name,process_order,outsourcing").order("id").range(from, to)),
    ]);
    if (processes.error) throw processes.error;
    if (masters.error) throw masters.error;
    const external = (masters.data || []).filter(row => row.outsourcing);
    const needle = query.normalize("NFKC").toLocaleLowerCase("ja");
    const rows = (processes.data || []).filter(row => Boolean(row.subcontractor_id || row.outsource_sent_date) || external.some(master => row.product_process_id === master.id || ((row.product_id ? row.product_id === master.product_id : row.product_code === master.product_code) && row.process_name === master.process_name && row.process_order === master.process_order)))
      .filter(row => !needle || [row.order_no, row.customer_name, row.product_code, row.product_name, row.process_name, row.subcontractor_name].some(value => String(value || "").normalize("NFKC").toLocaleLowerCase("ja").includes(needle)))
      .sort((a, b) => String(b.outsource_returned_date || b.outsource_sent_date || b.updated_at || "").localeCompare(String(a.outsource_returned_date || a.outsource_sent_date || a.updated_at || ""))) ;
    const selected = rows.slice(page * 30, (page + 1) * 30);
    const ids = selected.map(row => row.id);
    const remainder = ids.length ? await fetchAllRows((from, to) => auth.client.from("outsource_remainder_schedules").select("id,order_process_id,dispatch_no,quantity,sent_date,expected_date,returned_date,cancelled,note").in("order_process_id", ids).order("dispatch_no").order("id").range(from, to)) : { data: [], error: null };
    if (remainder.error) throw remainder.error;
    const archived = ids.length ? await auth.client.rpc("history_archived_order_ids", {p_ids:[...new Set(selected.map(row=>row.post_id))]}) : { data: [], error: null };
    if(archived.error) throw archived.error;
    return res.status(200).json({ rows: selected.map(row => ({ ...row, remainders: (remainder.data || []).filter(item => item.order_process_id === row.id), archived: (archived.data || []).includes(row.post_id) })), total: rows.length });
  } catch {
    return res.status(500).json({ error: "外注履歴の取得に失敗しました" });
  }
}
