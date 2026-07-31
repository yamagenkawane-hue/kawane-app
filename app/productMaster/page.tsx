"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Numpad from "@/app/components/Numpad/Numpad";
import supabase from "@/lib/supabase";
import { CustomerMaster, MaterialMaster, ProductMaster } from "@/app/type";
import styles from "../masterCommon.module.css";

const PRODUCT_SELECT_COLUMNS =
  "id,product_code,product_name,customer_name,standard,unit,unit_weight";

const CUSTOMER_SELECT_COLUMNS =
  "id,customer_name,shipping_offset_days,note";

const MATERIAL_SELECT_COLUMNS =
  "id,material_code,material_number,material_name,size,remaining_amount";

type ProductRow = {
  id: string;
  product_code: string | null;
  product_name: string | null;
  customer_name: string | null;
  standard: string | null;
  unit: string | null;
  unit_weight: number | string | null;
};

type CustomerRow = {
  id: string;
  customer_name: string | null;
  shipping_offset_days: number | null;
  note: string | null;
};

type MaterialRow = {
  id: string;
  material_code: string | null;
  material_number: string | null;
  material_name: string | null;
  size: string | null;
  remaining_amount: number | string | null;
};

type NumpadTarget =
  | { kind: "form"; field: "unitWeight" }
  | { kind: "item"; id: string; field: "unitWeight" }
  | null;

const emptyForm = {
  productCode: "",
  productName: "",
  customerName: "",
  standard: "",
  unit: "個",
  unitWeight: "",
};

const mapProduct = (row: ProductRow): ProductMaster => ({
  id: row.id,
  productCode: row.product_code || "",
  productName: row.product_name || "",
  customerName: row.customer_name || "",
  standard: row.standard || "",
  unit: row.unit || "",
  unitWeight: Number(row.unit_weight || 0),
});

const mapCustomer = (row: CustomerRow): CustomerMaster => ({
  id: row.id,
  customerName: row.customer_name || "",
  shippingOffsetDays: row.shipping_offset_days || 0,
  note: row.note || "",
});

const mapMaterial = (row: MaterialRow): MaterialMaster => ({
  id: row.id,
  materialCode: row.material_code || "",
  materialNumber: row.material_number || "",
  materialName: row.material_name || "",
  size: row.size || "",
  remainingAmount: Number(row.remaining_amount || 0),
});

const materialLabel = (material: MaterialMaster) => {
  const details = [
    material.materialName,
    material.materialNumber ? `材番:${material.materialNumber}` : "",
    material.size ? `サイズ:${material.size}` : "",
  ].filter(Boolean);

  return details.length
    ? `${material.materialCode} / ${details.join(" / ")}`
    : material.materialCode;
};

export default function ProductMasterPage() {
  const [items, setItems] = useState<ProductMaster[]>([]);
  const [customers, setCustomers] = useState<CustomerMaster[]>([]);
  const [materials, setMaterials] = useState<MaterialMaster[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [numpadTarget, setNumpadTarget] = useState<NumpadTarget>(null);

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("v_product_master_with_customer")
      .select(PRODUCT_SELECT_COLUMNS)
      .order("product_code", { ascending: true });

    if (error) {
      setMessage("製品マスタの取得に失敗しました");
      return;
    }

    setItems(((data || []) as ProductRow[]).map(mapProduct));
  };

  useEffect(() => {
    const loadItems = async () => {
      const [productResult, customerResult, materialResult] = await Promise.all([
        supabase
          .from("v_product_master_with_customer")
          .select(PRODUCT_SELECT_COLUMNS)
          .order("product_code", { ascending: true }),
        supabase
          .from("customer_master")
          .select(CUSTOMER_SELECT_COLUMNS)
          .order("customer_name", { ascending: true }),
        supabase
          .from("material_master")
          .select(MATERIAL_SELECT_COLUMNS)
          .order("material_code", { ascending: true }),
      ]);

      if (productResult.error) {
        setMessage("製品マスタの取得に失敗しました");
        return;
      }

      if (customerResult.error) {
        setMessage("得意先マスタの取得に失敗しました");
        return;
      }

      if (materialResult.error) {
        setMessage("材料マスタの取得に失敗しました");
        return;
      }

      setItems(((productResult.data || []) as ProductRow[]).map(mapProduct));
      setCustomers(
        ((customerResult.data || []) as CustomerRow[]).map(mapCustomer),
      );
      setMaterials(
        ((materialResult.data || []) as MaterialRow[]).map(mapMaterial),
      );
    };

    void loadItems();
  }, []);

  const handleAdd = async () => {
    if (!form.productCode || !form.productName || !form.customerName) {
      setMessage("製品コード、製品名、得意先名を入力してください");
      return;
    }

    const { error } = await supabase.from("product_master").insert({
      product_code: form.productCode,
      product_name: form.productName,
      customer_name: form.customerName,
      standard: form.standard,
      unit: form.unit,
      unit_weight: form.unitWeight === "" ? 0 : Number(form.unitWeight),
    });

    if (error) {
      setMessage(`追加に失敗しました: ${error.message}`);
      return;
    }

    setForm(emptyForm);
    await fetchItems();
    setMessage("製品を追加しました");
  };

  const handleBulkSave = async () => {
    const invalid = items.find(
      (item) => !item.productCode || !item.productName || !item.customerName,
    );

    if (invalid) {
      setMessage("未入力の製品コード、製品名、得意先名があります");
      return;
    }

    for (const item of items) {
      const { error } = await supabase
        .from("product_master")
        .update({
          product_code: item.productCode,
          product_name: item.productName,
          customer_name: item.customerName,
          standard: item.standard,
          unit: item.unit,
          unit_weight: Number(item.unitWeight || 0),
        })
        .eq("id", item.id);

      if (error) {
        setMessage(`${item.productCode} の保存に失敗しました: ${error.message}`);
        return;
      }
    }

    await fetchItems();
    setMessage("製品マスタを一括保存しました");
  };

  const updateItem = (
    id: string,
    field: keyof ProductMaster,
    value: string,
  ) => {
    setMessage("未保存の変更があります。一括保存を押してください");
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const renderMaterialOptions = (currentValue?: string) => (
    <>
      <option value="">材料コードを選択</option>
      {currentValue &&
        !materials.some((material) => material.materialCode === currentValue) && (
          <option value={currentValue}>{currentValue}</option>
        )}
      {materials.map((material) => (
        <option key={material.id} value={material.materialCode}>
          {materialLabel(material)}
        </option>
      ))}
    </>
  );

  const getMaterialCapacityText = (item: ProductMaster) => {
    const unitWeight = Number(item.unitWeight || 0);
    if (!Number.isFinite(unitWeight) || unitWeight <= 0) return "-";

    const material = materials.find(
      (materialItem) => materialItem.materialCode === item.standard,
    );
    if (!material) return "-";

    return `${Math.floor(material.remainingAmount / unitWeight).toLocaleString()} 個`;
  };

  const getNumpadValue = () => {
    if (!numpadTarget) return "";
    if (numpadTarget.kind === "form") return String(form.unitWeight || "");

    const item = items.find((currentItem) => currentItem.id === numpadTarget.id);
    return String(item?.unitWeight || "");
  };

  const handleNumpadChange = (value: string) => {
    if (!numpadTarget) return;

    if (numpadTarget.kind === "form") {
      setForm((prev) => ({ ...prev, unitWeight: value }));
      return;
    }

    updateItem(numpadTarget.id, "unitWeight", value);
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerArea}>
        <Link href="/masterSettings" className={styles.backButton}>
          ← マスタ設定に戻る
        </Link>
        <h1 className={styles.title}>製品マスタ</h1>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formGrid}>
          <input
            className={styles.input}
            placeholder="製品コード"
            value={form.productCode}
            onChange={(e) => setForm({ ...form, productCode: e.target.value })}
          />
          <input
            className={styles.input}
            placeholder="製品名"
            value={form.productName}
            onChange={(e) => setForm({ ...form, productName: e.target.value })}
          />
          <select
            className={styles.select}
            value={form.customerName}
            onChange={(e) =>
              setForm({ ...form, customerName: e.target.value })
            }
          >
            <option value="">得意先を選択</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.customerName}>
                {customer.customerName}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={form.standard}
            onChange={(e) => setForm({ ...form, standard: e.target.value })}
          >
            {renderMaterialOptions(form.standard)}
          </select>
          <input
            className={`${styles.input} ${styles.numpadInput}`}
            inputMode="decimal"
            placeholder="単重"
            value={form.unitWeight}
            readOnly
            onFocus={() =>
              setNumpadTarget({ kind: "form", field: "unitWeight" })
            }
            onClick={() =>
              setNumpadTarget({ kind: "form", field: "unitWeight" })
            }
          />
        </div>
        <div className={styles.buttonRow}>
          <button className={styles.addButton} onClick={handleAdd}>
            追加
          </button>
          <button className={styles.saveButton} onClick={handleBulkSave}>
            一括保存
          </button>
        </div>
      </div>

      {message && <div className={styles.message}>{message}</div>}

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>製品コード</th>
              <th>製品名</th>
              <th>得意先名</th>
              <th>材料コード</th>
              <th>単重</th>
              <th>材料残量目安</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    className={styles.tableInput}
                    value={item.productCode}
                    onChange={(e) =>
                      updateItem(item.id, "productCode", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    value={item.productName}
                    onChange={(e) =>
                      updateItem(item.id, "productName", e.target.value)
                    }
                  />
                </td>
                <td>
                  <select
                    className={styles.select}
                    value={item.customerName}
                    onChange={(e) =>
                      updateItem(item.id, "customerName", e.target.value)
                    }
                  >
                    <option value="">得意先を選択</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.customerName}>
                        {customer.customerName}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className={styles.select}
                    value={item.standard}
                    onChange={(e) =>
                      updateItem(item.id, "standard", e.target.value)
                    }
                  >
                    {renderMaterialOptions(item.standard)}
                  </select>
                </td>
                <td>
                  <input
                    className={`${styles.tableInput} ${styles.numpadInput}`}
                    inputMode="decimal"
                    value={item.unitWeight}
                    readOnly
                    onFocus={() =>
                      setNumpadTarget({
                        kind: "item",
                        id: item.id,
                        field: "unitWeight",
                      })
                    }
                    onClick={() =>
                      setNumpadTarget({
                        kind: "item",
                        id: item.id,
                        field: "unitWeight",
                      })
                    }
                  />
                </td>
                <td>{getMaterialCapacityText(item)}</td>
                <td className={styles.actionArea}>
                  <button
                    className={styles.deleteButton}
                    onClick={async () => {
                      if (!confirm("削除しますか？")) return;
                      const { error } = await supabase
                        .from("product_master")
                        .delete()
                        .eq("id", item.id);
                      if (error) {
                        setMessage(`削除に失敗しました: ${error.message}`);
                        return;
                      }
                      await fetchItems();
                      setMessage("製品を削除しました");
                    }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Numpad
        open={Boolean(numpadTarget)}
        value={getNumpadValue()}
        onChange={handleNumpadChange}
        onClose={() => setNumpadTarget(null)}
      />
    </div>
  );
}
