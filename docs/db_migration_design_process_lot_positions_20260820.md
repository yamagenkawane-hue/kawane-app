# ロット別工程位置管理 DBマイグレーション設計書

作成日: 2026年8月20日  
対象システム: kawane-app  
対象工程: implementation / DBマイグレーション設計  
前提資料: `docs/system_design_progress_lot_revision_20260819.md`

## 1. 目的

進捗管理を「工程ごとの累計実績」ではなく、「ロットごとの現在位置」として表示できるようにする。

今回の仕様では、同じ注番でも今日の生産分と翌日の生産分は別ロットとして扱い、画面上でもロット別に表示する。  
そのため、既存の `order_processes.completed_amount` だけではなく、ロットごとの現在工程と数量を保持するDB構造を追加する。

## 2. 確定仕様

- 工程間移動は注番単位ではなくロット単位で行う。
- 今日の生産分と翌日の生産分は別ロットとして別々に工程移動する。
- 進捗管理画面でもロット別に表示し、工程欄内で合算しない。
- 実績登録が完了した数量は、登録元工程に滞留させず、次工程の現在数量として表示する。
- 元工程に表示対象数量がない場合は `-` を表示する。
- `production_results` は履歴として残す。
- 新規テーブル `process_lot_positions` は現在位置として使う。
- 工程移動履歴は新規テーブル `process_lot_movements` に保存する。
- 直接編集も履歴に残し、通常の実績登録による工程移動と区別する。

## 3. 既存DBの扱い

| 既存テーブル | 今後の役割 | 方針 |
| --- | --- | --- |
| `posts` | 受注・注残の親 | 継続利用 |
| `order_processes` | 注番別工程マスタ、累計実績、ガント、外注日程 | 継続利用。ただし進捗画面の現在数量は主に新テーブルを参照 |
| `production_results` | 実績登録履歴 | 継続利用。登録事実を残す |
| `lots` | 注番配下のロット基本情報 | 継続利用。製造実績時にロットを作成または更新 |
| `inventory_items` | 在庫 | 梱包完了後または在庫化時に連携 |
| `inventory_allocations` | 引当 | 受注数量を上限に連携 |
| `shipments` | 出荷 | 受注数量を上限に連携 |

## 4. 追加テーブル設計

### 4.1 `process_lot_positions`

ロットごとに、現在どの工程に何個あるかを保持する。

| カラム | 型 | 必須 | 内容 |
| --- | --- | --- | --- |
| `id` | uuid | yes | 主キー |
| `post_id` | uuid | yes | `posts.id` |
| `order_no` | text | yes | 注番。表示・検索用 |
| `lot_id` | uuid | yes | `lots.id` |
| `lot_no` | text | yes | ロットNo。表示用 |
| `order_process_id` | uuid | yes | 現在いる `order_processes.id` |
| `process_name` | text | yes | 現在工程名 |
| `process_order` | integer | yes | 現在工程順 |
| `quantity` | integer | yes | そのロットが現在工程にある数量 |
| `source_result_id` | uuid | no | 作成元の `production_results.id` |
| `created_at` | timestamptz | yes | 作成日時 |
| `updated_at` | timestamptz | yes | 更新日時 |

### 4.2 `process_lot_movements`

ロットごとの工程間移動と直接編集を時系列で保存する。

| カラム | 型 | 必須 | 内容 |
| --- | --- | --- | --- |
| `id` | uuid | yes | 主キー |
| `post_id` | uuid | yes | `posts.id` |
| `order_no` | text | yes | 注番 |
| `lot_id` | uuid | yes | `lots.id` |
| `lot_no` | text | yes | ロットNo |
| `from_order_process_id` | uuid | no | 移動元工程。製造初回登録など元工程なしの場合はnull可 |
| `from_process_name` | text | no | 移動元工程名 |
| `from_process_order` | integer | no | 移動元工程順 |
| `to_order_process_id` | uuid | no | 移動先工程。在庫化・出荷など工程外の場合はnull可 |
| `to_process_name` | text | no | 移動先工程名 |
| `to_process_order` | integer | no | 移動先工程順 |
| `quantity` | integer | yes | 移動数量 |
| `movement_type` | text | yes | `result_move`, `manual_edit`, `stock_in`, `allocate`, `ship` |
| `source_result_id` | uuid | no | 関連する `production_results.id` |
| `before_quantity` | integer | no | 直接編集前数量 |
| `after_quantity` | integer | no | 直接編集後数量 |
| `note` | text | no | 理由・補足 |
| `created_at` | timestamptz | yes | 作成日時 |
| `created_by` | uuid | no | 編集者。認証情報が取れる場合に保存 |

## 5. 制約

### 5.1 `process_lot_positions`

- `quantity >= 0`
- `post_id` は `posts(id)` へ外部キー
- `lot_id` は `lots(id)` へ外部キー
- `order_process_id` は `order_processes(id)` へ外部キー
- `source_result_id` は `production_results(id)` へ外部キー
- 同一ロットが同一工程に複数行存在しないように、以下の一意制約を置く。

```sql
unique (lot_id, order_process_id)
```

### 5.2 `process_lot_movements`

- `quantity > 0`
- `movement_type` は定義済み値のみ許可
- `post_id`、`lot_id` は必須
- `from_order_process_id` と `to_order_process_id` はどちらか一方は必ず存在する
- 直接編集の場合、`before_quantity` と `after_quantity` を保存する

## 6. インデックス

| テーブル | インデックス | 目的 |
| --- | --- | --- |
| `process_lot_positions` | `(post_id, process_order)` | 進捗管理一覧の工程順表示 |
| `process_lot_positions` | `(lot_id)` | 注番管理・ロット詳細 |
| `process_lot_positions` | `(order_process_id)` | 工程別取得 |
| `process_lot_positions` | `(order_no)` | 注番検索 |
| `process_lot_movements` | `(post_id, created_at)` | 注番詳細の時系列表示 |
| `process_lot_movements` | `(lot_id, created_at)` | ロット詳細の時系列表示 |
| `process_lot_movements` | `(movement_type)` | 履歴種別絞り込み |

## 7. 進捗管理向けビュー

### 7.1 `v_process_lot_positions_with_master`

進捗管理画面と注番管理画面で使う表示用ビューを追加する。

含める主な項目:

- `post_id`
- `order_no`
- `product_code`
- `product_name`
- `customer_name`
- `order_amount`
- `delivery_date`
- `lot_id`
- `lot_no`
- `material_lot_no`
- `order_process_id`
- `process_name`
- `process_order`
- `quantity`
- `source_result_id`
- `updated_at`

### 7.2 表示ルール

- 進捗管理では、工程欄内にロット別で表示する。
- 同一工程に複数ロットがある場合、`lot_no`、`quantity` を縦に並べる。
- 数量がない工程は `-` を表示する。
- 合計欄は、対象注番の `process_lot_positions.quantity` の合計を表示する。
- 製造・洗浄はDB上は別工程のまま保持する。表示統合が必要な場合は画面側で扱う。

## 8. 実績登録RPCへの影響

既存の `register_order_process_result(...)` は、以下を追加で行う。

1. `production_results` に実績履歴を登録する。
2. 製造工程の場合、`lots` を作成または更新する。
3. 登録数量を次工程の `process_lot_positions` に登録する。
4. 登録元工程には現在数量を残さない。
5. `process_lot_movements` に `movement_type = 'result_move'` で履歴を登録する。
6. 梱包工程または在庫化工程の場合は、既存の在庫登録処理へ連携する。

## 9. 次工程判定

次工程は、同一 `post_id` の `order_processes` から以下の条件で取得する。

```sql
process_order > current_process.process_order
```

最小の `process_order` を次工程とする。  
次工程が存在しない場合は、最終工程完了扱いとし、在庫化または完了処理へ進める。

## 10. 直接編集

進捗管理画面で数量を直接編集した場合、以下の動きにする。

- `process_lot_positions.quantity` を更新する。
- `process_lot_movements` に `movement_type = 'manual_edit'` として履歴を残す。
- `before_quantity` と `after_quantity` を必ず保存する。
- 直接編集は通常の `production_results` には登録しない。

## 11. データ移行方針

既存データについては、初回マイグレーション時に無理に全履歴を復元しない。

理由:

- 既存の `completed_amount` は累計であり、ロット別現在位置を正確に復元できない場合がある。
- 既存ロットと工程位置の対応が完全でない可能性がある。

方針:

- 新仕様適用後の登録分から `process_lot_positions` と `process_lot_movements` を正として扱う。
- 既存データは `production_results`、`lots`、`v_lot_flow_status` で参照を継続する。
- 必要な場合のみ、別SQLで特定注番の初期位置を投入する。

## 12. RLS / 権限

既存方針に合わせ、まずは以下を付与する。

- `select`, `insert`, `update`, `delete` を `authenticated` に付与
- 必要に応じて `anon` にも既存画面の互換範囲で付与
- RPCは `security definer` とし、画面側はRPC経由で更新する

物理削除は原則行わず、履歴は保持する。  
ただし、将来的に管理者向けの削除機能が必要な場合は別途設計する。

## 13. マイグレーション作成順

1. `process_lot_positions` 作成
2. `process_lot_movements` 作成
3. 制約・インデックス作成
4. `v_process_lot_positions_with_master` 作成
5. `register_order_process_result(...)` の更新
6. 直接編集用RPCの追加
7. チェックSQL作成

## 14. チェックSQL観点

| 優先度 | チェック |
| --- | --- |
| Critical | `process_lot_positions` と `process_lot_movements` が存在する |
| Critical | ロット別に現在工程と数量を保持できる |
| Critical | 同一ロット・同一工程の重複行が作られない |
| Critical | 実績登録後、次工程にロット別数量が作成される |
| Critical | 画面表示用ビューで注番、製品、得意先、ロット、工程、数量が取得できる |
| High | 直接編集が履歴に残る |
| High | 数量がマイナスにならない |
| High | 既存の `production_results` が履歴として残る |
| Medium | 既存データが参照不能にならない |

## 15. 未確定事項

現時点でDBマイグレーション設計を止める未確定事項はなし。

ただし、実装時に以下は既存DBを確認して調整する。

- 認証ユーザーIDを `created_by` に保存できるか
- `anon` への権限付与が必要か
- 最終工程完了時に即在庫化するか、梱包工程のみ在庫化するか

## 16. 次工程

次はSQLマイグレーションを作成する。

作成予定ファイル:

```text
supabase/migrations/20260820_process_lot_positions.sql
supabase/checks/20260820_process_lot_positions_check.sql
```
