# ワークフロー確認結果

確認日: 2026-06-29

## 対象

梱包完了後に在庫へ登録または加算する仕様への変更確認。

## 確認済み

### DB整合性チェック

`supabase/checks/20260629_workflow_integrity_checks.sql` を実行し、count 系チェックはすべて `0`。

確認済み項目:

- `order_processes_without_post`
- `production_results_without_post`
- `production_results_without_order_process`
- `production_result_amount_mismatch`
- `order_processes_completed_over_planned`
- `packaging_completed_without_lot_no`
- `packaging_completed_without_inventory`
- `inventory_allocated_over_stock`

### RLS状態

RLS状態:

- `production_results`: RLS有効
- `posts`: RLS無効
- `order_processes`: RLS無効
- `inventory_items`: RLS無効
- `inventory_allocations`: RLS無効
- `shipments`: RLS無効

`register_order_process_result` は `security definer` のため、`production_results` のRLS有効状態でも実績登録、工程更新、梱包後在庫登録を行える想定。

### 梱包後在庫登録スモークテスト

`supabase/checks/20260629_packaging_inventory_smoke_test.sql` の結果は `PASSED`。

確認内容:

- 対象ロット: `LOT-ZJ002`
- `inventory_items.current_stock`: `800` から `801`
- `production_results`: `0` 件から `1` 件
- テストは `ROLLBACK` で終了したためDB変更は残っていない

### 実画面確認

進捗管理画面で梱包数量を入力すると、在庫マスタに登録されることを確認済み。

確認対象:

- 注番: `ZJ-TEST-002`
- ロットNo: `LOT-ZJ002`
- 製品コード: `TEST-B002`
- 製品名: `注残テスト部品B`

## 対象データなしで未実施

### 計量登録では在庫が増えない

`supabase/checks/20260629_measurement_no_inventory_smoke_test.sql` の結果は `SKIPPED`。

理由:

- ロットNoがあり、計量工程に残登録可能数がある対象データが見つからなかったため。

コード上の対応:

- `app/manufacturing/page.tsx` から計量登録時の `inventory_items` 加算処理は削除済み。

### ロットNoなし梱包登録エラー

`supabase/checks/20260629_packaging_without_lot_error_smoke_test.sql` の結果は `SKIPPED`。

理由:

- ロットNoが空で、梱包/包装工程に残登録可能数がある対象データが見つからなかったため。

DB側の対応:

- `register_order_process_result` 内で、梱包/包装工程かつ `posts.lot_no` が空の場合はエラーにする実装済み。

## 判定

主目的である「梱包完了後に在庫へ入れる」仕様は、DBスモークテストと実画面確認の両方で確認済み。

残る2ケースは対象データ不足により未実施だが、実装方針とコード上の対応は完了している。

## 次に確認する場合

必要に応じて、以下のテストデータを作成して再確認する。

1. ロットNoがあり、計量工程に残登録可能数がある受注
2. ロットNoが空で、梱包/包装工程に残登録可能数がある受注
