# 画面横断テストシナリオ

最終更新: 2026-06-29

## 目的

受注、受注別工程、実績、計量、梱包、在庫、出荷が新方式の主要テーブルを中心に連携していることを確認します。

- 受注情報: `posts`
- 受注別工程: `order_processes`
- 実績: `production_results`
- 在庫: `inventory_items`

## 事前確認

### 2026-06-30 追加確認

工程日付5列は `posts` / `v_posts_with_master` から削除済みです。画面横断テストでは、旧工程日付カラムではなく、以下の現在のデータ経路で表示・登録が動くことを確認します。

- 受注・注残・出荷の予定日は `completion_scheduled_date` / `delivery_date` を使う
- 工程別の進捗・実績は `order_processes` / `production_results` を使う
- 梱包後の在庫登録は `register_order_process_result` 経由で `inventory_items` に反映される
- `npm.cmd run lint` と `npm.cmd run build` は成功済み

1. `supabase/migrations/20260629_packaging_inventory_registration.sql` が適用済み
2. `supabase/checks/20260629_workflow_integrity_checks.sql` の count 系チェックがすべて `0`
3. `production_results` の RLS が有効でも `register_order_process_result` が実行できる
4. `supabase/checks/20260629_packaging_inventory_smoke_test.sql` を実行し、梱包後在庫登録のスモークテストが成功する
5. `supabase/checks/20260629_measurement_no_inventory_smoke_test.sql` を実行し、計量登録では在庫が増えないことを確認する
6. `supabase/checks/20260629_packaging_without_lot_error_smoke_test.sql` を実行し、ロットNoなし梱包登録がエラーになることを確認する

既存データに条件を満たす受注がなく `SKIPPED` になる場合は、`supabase/checks/20260630_seeded_remaining_workflow_smoke_tests.sql` を実行します。
このSQLはトランザクション内で一時的に受注と工程を作成し、計量では在庫が増えないこと、ロットNoなし梱包がエラーになることを確認してから `ROLLBACK` します。
2026-06-30 時点で、この自己完結型SQLは2行とも `PASSED` を確認済みです。

スモークテストは `ROLLBACK` で終わるため、実績や在庫のテスト更新はDBに残りません。

画面テスト対象の候補受注を探す場合は、`supabase/checks/20260629_workflow_manual_test_targets.sql` を使います。
このSQLは読み取り専用です。

## シナリオ1: 計量登録では在庫が増えない

1. 計量登録画面を開く
2. 「計量する予定を選択」から検査完了済みの受注を選択する
3. ロットNoと計量数量を入力する
4. 確定登録を押す
5. 計量表出力に計量実績が表示されることを確認する
6. 在庫マスタで同じ製品コード、ロットNoの現在庫数が計量登録だけでは増えていないことを確認する

期待結果:

- `production_results` に計量実績が登録される
- `order_processes.completed_amount` に計量完了数が反映される
- `inventory_items.current_stock` は増えない

## シナリオ2: 梱包実績登録で在庫が増える

1. 進捗管理画面を開く
2. 対象受注の編集を押す
3. 梱包欄に日付と数量を入力する
4. 追加を押す
5. 在庫マスタを開く
6. 同じ製品コード、ロットNoの在庫が登録または加算されていることを確認する

期待結果:

- `production_results` に梱包実績が登録される
- `order_processes.completed_amount` に梱包完了数が反映される
- `inventory_items.current_stock` が梱包数量分だけ増える
- 同じ製品コード、ロットNoの在庫が既にある場合は既存行へ加算される

## シナリオ3: ロットNoなしの梱包実績は登録できない

1. ロットNoが空の受注を用意する
2. 進捗管理画面で梱包実績を登録する

期待結果:

- 「梱包完了後に在庫登録するにはロットNoが必要です」のエラーになる
- `production_results` に梱包実績は登録されない
- `order_processes.completed_amount` は更新されない
- `inventory_items` は更新されない

## シナリオ4: 前工程完了数を超える登録はできない

1. 進捗管理または実績登録画面を開く
2. 前工程の完了数量を超える数量を次工程に登録する

期待結果:

- 登録可能数量を超える旨のエラーになる
- `production_results` は登録されない
- `order_processes.completed_amount` は更新されない

## シナリオ5: 在庫引当から出荷まで

1. 在庫マスタで対象製品、ロットNoの現在庫数を確認する
2. 注残管理または受注管理で在庫引当を行う
3. `allocated_stock` が引当数量分だけ増えることを確認する
4. 出荷登録で出荷する
5. 在庫マスタで `current_stock` と `allocated_stock` が出荷数量分だけ減ることを確認する
6. 注残一覧と進捗管理から対象受注が除外されることを確認する

期待結果:

- 引当時点では `current_stock` は減らない
- 出荷時点で `current_stock` と `allocated_stock` が減る
- 出荷済み受注は注残一覧、進捗管理から除外される

## シナリオ6: 受注削除時の関連データ整理

1. 注残管理で対象受注を削除する
2. 関連する受注別工程、実績、生産予定、出荷、在庫引当が残っていないことを確認する
3. 在庫引当済みの受注では、在庫マスタの `allocated_stock` が未出荷引当分だけ戻ることを確認する

DB側の自己完結確認として、`supabase/checks/20260630_soft_delete_order_post_smoke_test.sql` を実行します。
このSQLはトランザクション内でテスト用の受注と関連データを作成し、`soft_delete_order_post` の実行結果を確認してから `ROLLBACK` します。

期待結果:

- `result` が `PASSED`
- `posts.delete` が `true` になる
- `order_processes` / `production_results` / `production_schedules` / `shipments` / `inventory_allocations` の対象行が削除される
- `inventory_items.allocated_stock` が戻る

## 完了条件

- 計量登録では在庫が増えない
- 梱包実績登録で在庫が増える
- ロットNoなしの梱包実績は登録できない
- 前工程完了数を超える実績は登録できない
- 在庫引当と出荷で `current_stock` / `allocated_stock` が仕様どおり更新される
- 受注削除時に関連データが残らず、在庫引当数も戻る
