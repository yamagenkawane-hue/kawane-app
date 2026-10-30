# Windows Node.js更新（2026-10-26）

- ユーザーの更新依頼に基づき、Windowsにインストール済みのNode.js LTSを更新した。
- Node.js: v24.15.0 → v24.22.1（LTS）。npm: 11.12.1 → 11.19.1。
- 更新先は公式ダウンロードページとwingetのOpenJS.NodeJS.LTSパッケージで確認。
- `winget upgrade --id OpenJS.NodeJS.LTS --exact --source winget --version 24.22.1 --silent --disable-interactivity` を実行。
- 公式MSIをダウンロードし、wingetによるハッシュ検証に成功。Windowsの管理者確認はユーザーが許可し、インストール成功を確認した。
- 実行ファイル: `C:\Program Files\nodejs\node.exe`。更新後の `node --version`、`npm --version` を確認済み。
- 新しいNode.jsで `npm run build` が成功。TypeScript検査と全36ページの生成も成功。
- アプリの依存関係やロックファイルの更新は行っていない。本番公開アプリのデプロイは未実施。

## 併せて完了した画面修正

- 外注管理: 注番指定画面でも、各日程の行と日程入力欄に工程番号・工程名・外注先を表示。2外注先の表示テストと本番用ビルドが成功。
- 出荷管理: 「生産予定に戻る」の右隣に「進捗管理に戻る」を追加。ローカルブラウザーで `/reservation` へ遷移できることを確認。

公式情報: https://nodejs.org/en/download
