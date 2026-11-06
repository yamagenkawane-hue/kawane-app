# Next.js 16系更新（2026-11-06）

## 対象・設計

- 依頼：Next.js 16系を更新する。
- npm公式レジストリで `next@16` と dist-tags を確認し、安定版 `16.4.5` を選択した。
- `next` と `eslint-config-next` を `16.2.6` → `16.4.5` に固定し、package-lock.jsonを同期する。
- Node.js 26.x / React 19.2.4は更新先の互換条件を満たすため継続する。
- 同梱ドキュメントのアップグレード手順を参照。アプリ機能・DBスキーマの変更は不要。

## ローカル検証結果

- `npm ls next eslint-config-next react react-dom --depth=0`：バージョン・依存関係を確認。
- `npm run build`：Next.js 16.4.5 / Turbopackで成功、TypeScript検査・全39静的ページ生成を完了。
- `npx eslint app pages lib next.config.ts`：成功。
- `git diff --check`：成功。
- 既存回帰スクリプト7本：計377チェック成功（独立シナリオ数ではない）。
  - verify-auth-api：46
  - verify-shipment-closure-api：37
  - verify-shipping-quantities：49
  - verify-progress-shipping-ui：156
  - verify-shipment-restoration-ui：26
  - verify-retention-input-ui：43
  - verify-inventory-visibility：20
- 更新後の本番ビルドを専用ポート3106で起動。トップ・進捗・出荷・外注・設定・履歴管理の6画面がHTTP 200でHTMLを返すことを確認。
- 未認証のauth/me・shipments・shipment-closures・AI statusのGET、AI runのPOSTがすべて401。AI処理は実行されていない。

## 既存課題・検証範囲

- 全体 `npm run lint` は、更新前と同じテストスクリプト内の3エラー・4警告で失敗。アプリ本体のLintは成功。
- Node.js 26でNext.js内部の `module.register()` 非推奨警告が出るがビルドは成功。
- npm install時のaudit集計は23件（low 1 / moderate 9 / high 11 / critical 2）。本更新で依存関係全体の脆弱性を解消したとは扱わない。自動修復・無関係なパッケージ更新は行っていない。
- 画面のHTTP応答・オフラインReact描画とAPI権限を検証した。ログイン後のブラウザー操作一式は未実施。
- 先のテスト報告で確認したF1〜F7は本更新の対象外であり、解消済みとは扱わない。
- 業務データ・DBの更新は行っていない。

## 公開手順

既存のGitHub main → Vercel本番連携で公開し、対象コミットのVercel状態と本番画面・未認証API応答を確認する。
