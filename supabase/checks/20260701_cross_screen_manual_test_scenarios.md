# 画面横断 手動確認シナリオ

最終更新: 2026-07-01

## 目的

受注登録から出荷登録まで、主要画面が `posts`、`order_processes`、`production_results`、`inventory_items`、`inventory_allocations`、`shipments` を同じ受注ID/工程ID/製品ID/得意先IDで参照できていることを確認する。

## 事前SQL確認

1. `supabase/checks/20260701_cross_screen_readiness_checks.sql` を実行する
2. `check_type = 'count'` の行がすべて `0` であることを確認する
3. `check_type = 'rls_status'` は情報確認として扱う

## シナリオA: 受注登録から受注別工程作成

対象画面:

- 受注登録
- 受注管理
- 注残管理
- 受注別工程管理

手順:

1. 受注登録で、製品マスタと得意先マスタに存在する製品/得意先を選択して受注を登録する
2. 受注管理に登録した受注が表示されることを確認する
3. 注残管理に同じ注番、製品、得意先、受注数、納期で表示されることを確認する
4. 受注別工程管理で対象受注を選択し、工程一覧が製品工程マスタから作成されていることを確認する
5. `supabase/checks/20260701_cross_screen_scenario_a_order_creation_check.sql` の `target_order_no` を登録した注番に変更して実行する
6. `FAILED` がある場合は、`supabase/checks/20260701_cross_screen_scenario_a_order_creation_detail.sql` の `target_order_no` も登録した注番に変更して、製品工程マスタと受注別工程の差分を確認する
7. 製品工程マスタの工程順が飛び番で、受注別工程も飛び番になった場合は、`supabase/migrations/20260701_normalize_order_process_sequence.sql` を適用し、`supabase/checks/20260701_cross_screen_scenario_a_normalize_existing_order.sql` の `target_order_no` を登録した注番に変更して実行する

期待結果:

- `posts.product_id` / `posts.customer_id` が入る
- `order_processes.post_id` が対象 `posts.id` を参照する
- `order_processes.product_id` / `order_processes.customer_id` が対象受注と一致する
- 工程順が重複せず、1から順番に並ぶ
- シナリオA確認SQLの全行が `PASSED`

## シナリオB: 実績登録から進捗管理/計量表出力

対象画面:

- 実績登録
- 進捗管理
- 計量登録
- 計量表出力

手順:

1. 実績登録または進捗管理で、製造から検査まで順に実績を登録する
2. 検査完了後、計量登録に対象受注が表示されることを確認する
3. 計量登録で計量実績を登録する
4. 計量表出力に、登録した計量実績が表示されることを確認する
5. 進捗管理で各工程の完了数量と状態表示を確認する
6. `supabase/checks/20260701_cross_screen_scenario_b_results_measurement_check.sql` の `target_order_no` を対象注番に変更して実行する
7. `FAILED` がある場合は、`supabase/checks/20260701_cross_screen_scenario_b_results_measurement_detail.sql` の `target_order_no` を対象注番に変更して、工程と実績の登録状況を確認する

期待結果:

- `production_results.post_id` が対象 `posts.id` を参照する
- `production_results.order_process_id` が対象 `order_processes.id` を参照する
- `order_processes.completed_amount` が実績合計と一致する
- 計量登録だけでは `inventory_items.current_stock` は増えない
- 計量表出力は `production_results` の計量実績を表示する
- シナリオB確認SQLの全行が `PASSED`

## シナリオC: 梱包から在庫マスタ

対象画面:

- 進捗管理
- 在庫マスタ

手順:

1. 対象受注にロットNoが入っていることを確認する
2. 進捗管理で梱包/包装工程の実績を登録する
3. 在庫マスタで同じ製品コード、ロットNoの在庫が登録または加算されていることを確認する

期待結果:

- 梱包/包装工程の `production_results` が登録される
- 対象 `order_processes.completed_amount` が増える
- `inventory_items.current_stock` が梱包数量分増える
- ロットNoが空の場合は登録エラーになり、実績と在庫は更新されない

## シナリオD: 在庫引当から出荷登録

対象画面:

- 注残管理
- 在庫マスタ
- 出荷登録
- 受注管理
- 進捗管理

手順:

1. 在庫マスタで対象製品の `current_stock` と `allocated_stock` を確認する
2. 注残管理で対象受注の在庫引当を確定する
3. 在庫マスタで `allocated_stock` が引当数量分増えていることを確認する
4. 出荷登録で対象受注を出荷する
5. 在庫マスタで `current_stock` と `allocated_stock` が出荷数量分減っていることを確認する
6. 全数出荷済みの場合、受注管理/注残管理/進捗管理の状態が出荷済みに沿って変わることを確認する

期待結果:

- `inventory_allocations.post_id` が対象 `posts.id` を参照する
- `inventory_allocations.inventory_item_id` が対象在庫を参照する
- 出荷時に `inventory_allocations.shipped_amount` が増える
- `shipments.post_id` が対象 `posts.id` を参照する
- 出荷数量が受注数を超えない

## シナリオE: 削除時の関連データ整理

対象画面:

- 注残管理
- 受注管理
- 在庫マスタ
- 出荷登録
- 進捗管理

手順:

1. テスト用受注で工程、実績、在庫引当、出荷データを作成する
2. 注残管理で対象受注を削除する
3. 関連する工程、実績、生産予定、出荷、在庫引当が残っていないことを確認する
4. 未出荷の在庫引当がある場合、在庫マスタの `allocated_stock` が戻ることを確認する

期待結果:

- `posts.delete` が `true` になる
- 関連する `order_processes` / `production_results` / `production_schedules` / `shipments` / `inventory_allocations` が整理される
- `inventory_items.allocated_stock` が未出荷引当分だけ戻る

## 完了条件

- 事前SQL確認の count 系がすべて `0`
- 主要画面で同じ注番、製品、得意先、ロットNoが一貫して表示される
- 実績登録、計量登録、梱包、在庫、引当、出荷が現在の主要テーブルでつながる
- 旧工程日付カラムや旧JSONログに依存した表示/登録がない

## 最終表示回帰確認

シナリオA〜E完了後、`supabase/checks/20260701_active_work_screen_visibility_check.sql` を実行する。

確認観点:

- `result = FAILED` の行がないこと
- `deleted_posts_have_no_work_rows` が `PASSED` であること
- `INFO` 行は診断用件数として扱うこと
- 生産予定、実績登録、受注別工程管理に、削除済み、最終工程完了済み、全数出荷済みの受注が作業対象として表示されないこと
