"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { Lot } from "@/app/type";
import styles from "./page.module.css";

type LotType = Lot["lotType"];

const lotTypeLabels: Record<LotType, string> = {
  normal: "通常",
  trial: "試作品",
  advance: "先行加工",
};

const prefixMap: Record<LotType, string> = {
  normal: "",
  trial: "T-",
  advance: "S-",
};

export default function LotsPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotType, setLotType] = useState<LotType>("normal");
  const [productName, setProductName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [status, setStatus] = useState("計画中");
  const [loading, setLoading] = useState(false);

  const nextLotNo = useMemo(() => {
    const prefix = prefixMap[lotType];
    const sameTypeLots = lots.filter((lot) => lot.lotType === lotType);
    const maxNo = sameTypeLots.reduce((max, lot) => {
      const numeric = Number(lot.lotNo.replace(prefix, ""));
      return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
    }, 0);

    return `${prefix}${String(maxNo + 1).padStart(4, "0")}`;
  }, [lotType, lots]);

  const fetchLots = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("lots")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setLots(
        (data || []).map((row) => ({
          id: row.id,
          lotNo: row.lot_no || "",
          lotType: row.lot_type || "normal",
          productName: row.product_name || "",
          customerName: row.customer_name || "",
          quantity: row.quantity || 0,
          status: row.status || "",
          createdAt: row.created_at || "",
          updatedAt: row.updated_at || "",
        })),
      );
    } catch (error) {
      console.error(error);
      alert("ロット情報の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadLots = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from("lots")
          .select("*")
          .order("created_at", {
            ascending: false,
          });

        if (error) throw error;

        const mappedLots: Lot[] = (data || []).map((row) => ({
          id: row.id,
          lotNo: row.lot_no || "",
          lotType: row.lot_type || "normal",
          productName: row.product_name || "",
          customerName: row.customer_name || "",
          quantity: row.quantity || 0,
          status: row.status || "",
          createdAt: row.created_at || "",
          updatedAt: row.updated_at || "",
        }));

        setLots(mappedLots);
      } catch (error) {
        console.error(error);
        alert("ロット情報の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };

    void loadLots();
  }, []);

  const handleAdd = async () => {
    if (!productName || !customerName || quantity === "") {
      alert("製品名、得意先、数量を入力してください");
      return;
    }

    try {
      setLoading(true);
      const now = new Date().toISOString();

      const { error } = await supabase.from("lots").insert({
        lot_no: nextLotNo,
        lot_type: lotType,
        product_name: productName,
        customer_name: customerName,
        quantity: Number(quantity),
        status,
        created_at: now,
        updated_at: now,
      });

      if (error) throw error;

      setProductName("");
      setCustomerName("");
      setQuantity("");
      setStatus("計画中");
      await fetchLots();
    } catch (error) {
      console.error(error);
      alert("ロット登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (lot: Lot) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from("lots")
        .update({
          lot_no: lot.lotNo,
          lot_type: lot.lotType,
          product_name: lot.productName,
          customer_name: lot.customerName,
          quantity: Number(lot.quantity),
          status: lot.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lot.id);

      if (error) throw error;

      await fetchLots();
    } catch (error) {
      console.error(error);
      alert("ロット保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;

    try {
      setLoading(true);
      const { error } = await supabase.from("lots").delete().eq("id", id);
      if (error) throw error;
      await fetchLots();
    } catch (error) {
      console.error(error);
      alert("ロット削除に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleLotChange = (
    id: string,
    field: keyof Lot,
    value: string | number,
  ) => {
    setLots((prev) =>
      prev.map((lot) => (lot.id === id ? { ...lot, [field]: value } : lot)),
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/" className={styles.backButton}>
          ← 設定へ戻る
        </Link>
        <h1 className={styles.title}>ロット管理</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.lotPreview}>
          <span>次回ロットNo</span>
          <strong>{nextLotNo}</strong>
        </div>
        <select
          className={styles.select}
          value={lotType}
          onChange={(e) => setLotType(e.target.value as LotType)}
        >
          <option value="normal">通常</option>
          <option value="trial">試作品</option>
          <option value="advance">先行加工</option>
        </select>
        <input
          className={styles.input}
          placeholder="製品名"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
        />
        <input
          className={styles.input}
          placeholder="得意先"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
        <input
          className={styles.input}
          type="number"
          placeholder="数量"
          value={quantity}
          onChange={(e) =>
            setQuantity(e.target.value === "" ? "" : Number(e.target.value))
          }
        />
        <input
          className={styles.input}
          placeholder="状態"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        />
        <button className={styles.addButton} onClick={handleAdd}>
          登録
        </button>
      </div>

      {loading && <div className={styles.loading}>読み込み中...</div>}

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ロットNo</th>
              <th>区分</th>
              <th>製品名</th>
              <th>得意先</th>
              <th>数量</th>
              <th>状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <tr key={lot.id}>
                <td>
                  <input
                    className={styles.tableInput}
                    value={lot.lotNo}
                    onChange={(e) =>
                      handleLotChange(lot.id, "lotNo", e.target.value)
                    }
                  />
                </td>
                <td>
                  <select
                    className={styles.tableInput}
                    value={lot.lotType}
                    onChange={(e) =>
                      handleLotChange(lot.id, "lotType", e.target.value)
                    }
                  >
                    {Object.entries(lotTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={lot.productName}
                    onChange={(e) =>
                      handleLotChange(lot.id, "productName", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={lot.customerName}
                    onChange={(e) =>
                      handleLotChange(lot.id, "customerName", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    type="number"
                    value={lot.quantity}
                    onChange={(e) =>
                      handleLotChange(
                        lot.id,
                        "quantity",
                        Number(e.target.value),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={lot.status}
                    onChange={(e) =>
                      handleLotChange(lot.id, "status", e.target.value)
                    }
                  />
                </td>
                <td className={styles.actionArea}>
                  <button
                    className={styles.saveButton}
                    onClick={() => handleUpdate(lot)}
                  >
                    保存
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={() => handleDelete(lot.id)}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
