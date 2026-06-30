# ワークフロー確認結果

確認日: 2026-06-29

## 対象

梱包完了後に在庫へ登録または加算する仕様への変更確認。

## 確認済み

### 2026-06-30 回帰確認

工程日付カラム削除後のアプリ側回帰確認として、以下を実行済み。

- `npm.cmd run lint`: 成功、warning 0件
- `npm.cmd run build`: 成功
- active `app` / `pages` code に `manufacturing_date`, `cleaning_date`, `inspection_date`, `measurement_date`, `packaging_date` の参照なし
- active `app` / `pages` code に `select("*")` なし

Supabase 側では最終確認SQLが `Success. No rows returned` となり、`posts` / `v_posts_with_master` に旧工程日付5列が残っていないことを確認済み。

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

### 残ケース自己完結スモークテスト

2026-06-30 に、既存データへ依存せず確認できる自己完結型SQLとして `supabase/checks/20260630_seeded_remaining_workflow_smoke_tests.sql` を実行し、2行とも `PASSED` を確認済み。
このSQLはトランザクション内でテスト用の受注と工程を作成し、確認後に `ROLLBACK` するためDB変更は残らない。

確認済み項目:

- `measurement_no_inventory`: `PASSED`
- `packaging_without_lot_error`: `PASSED`

### 計量登録では在庫が増えない

確認内容:

- `production_results` に計量実績が登録される
- `app/manufacturing/page.tsx` から計量登録時の `inventory_items` 加算処理は削除済み。
- `inventory_items.current_stock` は増えない

### ロットNoなし梱包登録エラー

確認内容:

- `register_order_process_result` 内で、梱包/包装工程かつ `posts.lot_no` が空の場合はエラーにする実装済み。
- `production_results` は登録されない

### 受注削除時の関連データ整理

2026-06-30 に `supabase/checks/20260630_soft_delete_order_post_smoke_test.sql` を実行し、`PASSED` を確認済み。
このSQLはトランザクション内でテスト用の受注、受注別工程、実績、生産予定、出荷、在庫引当を作成し、`soft_delete_order_post` で関連データが整理されることを確認してから `ROLLBACK` する。

確認結果:

- `result`: `PASSED`
- `order_processes_after`: `0`
- `production_results_after`: `0`
- `production_schedules_after`: `0`
- `shipments_after`: `0`
- `inventory_allocations_after`: `0`

### 前工程完了数を超える登録制御

2026-06-30 に `supabase/checks/20260630_process_allowance_smoke_test.sql` を実行し、`PASSED` を確認済み。
このSQLはトランザクション内で前工程完了数が `2` の通常工程を作成し、次工程へ `3` を登録しようとしてエラーになることを確認してから `ROLLBACK` する。

確認結果:

- `result`: `PASSED`
- `results_after` = `results_before`
- `next_completed_after` = `next_completed_before`

### 状態表示の派生ロジック

2026-06-30 に `supabase/migrations/20260630_restore_posts_view_derived_status.sql` を適用。
工程日付カラム削除後に `posts.status` へ戻っていた `v_posts_with_master.status` を、現在の `order_processes` / `shipments` から派生する形へ戻す。

初回確認で `inspection_completed_status` が `FAILED` になったため、`supabase/migrations/20260630_fix_posts_view_status_final_process.sql` を適用。
最終工程が検査など梱包以外の場合に、受注数まで完了しているだけで `梱包完了` と表示しないよう補正する。

`supabase/checks/20260630_posts_view_status_smoke_test.sql` を再実行し、全行 `PASSED` を確認済み。

確認結果:

- `outsource_sent_status`: `PASSED`
- `outsource_returned_status`: `PASSED`
- `inspection_completed_status`: `PASSED`
- `measurement_in_progress_status`: `PASSED`

## 次に確認する項目

### 製品工程マスタから受注別工程への反映

`supabase/migrations/20260630_sync_order_processes_from_product_master.sql` を追加。
受注別工程管理画面の「製品工程マスタから更新」は、このRPC `sync_order_processes_from_product_master` を呼び出す形に変更。

確認SQLとして `supabase/checks/20260630_product_process_sync_smoke_test.sql` を追加し、`PASSED` を確認済み。

確認結果:

- `result`: `PASSED`
- 未完了の既存工程が製品工程マスタから更新される
- 完了済みの既存工程は保持される
- 未作成の工程が追加される

### 受注別工程の工程順変更

`supabase/migrations/20260630_reorder_order_processes.sql` を追加。
受注別工程管理画面のドラッグ＆ドロップ保存は、このRPC `reorder_order_processes` を呼び出す形に変更。

確認SQLとして `supabase/checks/20260630_reorder_order_processes_smoke_test.sql` を追加。

- `result`: `PASSED`
- 工程順が指定順に保存される
- 実績登録時の前工程完了数チェックが変更後の工程順で判定される
- `v_posts_with_master.status` が変更後の工程順で最新完了工程を判定する

## 判定

主目的である「梱包完了後に在庫へ入れる」仕様は、DBスモークテストと実画面確認の両方で確認済み。

残っていた2ケース、受注削除時の関連データ整理、前工程完了数を超える登録制御、状態表示の派生ロジックも自己完結スモークテストで確認済み。
