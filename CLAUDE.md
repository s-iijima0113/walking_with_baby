# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## 役割
私はバックエンドエンジニアです。
個人でも仕事でもアプリを開発しています。

## 目標
効率的にアプリを開発したい。

## プロジェクト概要

「Walking With Baby」— 赤ちゃん連れの親向けに、さいたまエリアの散歩ルートを提案するWebアプリ。気分（Feel）・歩行時間を選ぶと、Mapbox地図上に円形の散歩ルートが描画される。
・施設フィルター（赤ちゃんトイレ、授乳室、地域ポイント加盟店）を選択すると、該当のアイコンを地図に表示させる。

## コマンド

**開発時（ホットリロードあり・推奨）:**
```sh
air
```

**手動ビルド＆起動:**
```sh
go build -o ./tmp/babywalking.exe ./cmd/babywalking
./tmp/babywalking.exe
```

サーバーは `http://localhost:8080` で起動する。

**静的解析:**
```sh
go vet ./...
```

自動テストは現時点では存在しない。

## セットアップ

1. PostgreSQLをローカルのポート5432で起動しておく:
   - ユーザー: `postgres`、パスワード: `password`、DB名: `babywalking`
   - 接続文字列は `internal/db/db.go:19` にハードコードされている

2. Mapboxトークンの設定:
   ```sh
   cp web/config.example.js web/config.js
   # web/config.js の MAPBOX_TOKEN を記入する
   ```
   `web/config.js` はgit管理外（.gitignore済み）。

## アーキテクチャ

```
cmd/babywalking/main.go   — エントリポイント: HTTPサーバー起動、DB初期化、CSVシーディング
internal/
  db/db.go                — DB接続、テーブルDDL、シードロジック、JSON APIハンドラー
  csv/csv.go              — CSV読み込み（Shift-JIS）＋住所→座標変換
  geocoding.go            — 国土地理院API（msearch.gsi.go.jp）で住所をジオコーディング
web/
  index.html              — シングルページHTML、MapboxGL JSをCDNから読み込む
  main.js                 — フロントエンド全ロジック（地図・ルート生成・マーカー描画）
  config.js               — Mapboxトークン（git管理外）
  style.css
data/
  babyfacilities.csv      — Shift-JIS: 赤ちゃんトイレ・授乳室データ
  cafe.csv                — Shift-JIS: カフェデータ（さいたまサポート特典）
  shop.csv                — UTF-8: さいコイン・たまポン加盟店データ
```

### 起動時のデータフロー

`main.go` は各DBテーブルにレコードがあるか確認し、空の場合は対応するCSVを読み込み、`internal/geocoding.go` で住所をジオコーディングしてから一括挿入する。この処理は起動時に同期実行されるため、DBが空の初回起動はジオコーディングAPIの呼び出し分だけ時間がかかる。`feel_spots` テーブルは `db.go` 内のGoスライス定数からシードされる。

### APIエンドポイント

| メソッド | パス | 説明 |
|--------|------|------|
| GET | `/api/facilities` | 赤ちゃんトイレ・授乳室の位置情報 |
| GET | `/api/coins` | さいコイン・たまポン加盟店の位置情報 |
| GET | `/api/feel-spots` | Feelタグ付きの散策スポット一覧 |
| POST | `/search` | フォーム送信（現時点では値をログ出力するのみ） |

### フロントエンドのルート生成ロジック（`web/main.js`）

- 出発・帰着地点は固定: `START_COORDINATES`（lng: 139.647238, lat: 35.86236）
- 歩行速度定数: 70 m/分
- `planRandomRoute` は候補のfeelスポットをシャッフルし、`buildWalkingRoute` を最大12回試行、スポットIDの連結文字列（シグネチャ）で前回と同一ルートの重複を排除する
- ルート座標は約60m間隔で補間（densify）した上でMapboxの `walk-route` GeoJSONソースに渡す
- 施設・コインのマーカーはfeel スポットマーカーとは独立してチェックボックスの状態で制御される

### DBテーブル

- `baby_facilities` — toilet/nursing（bool）、lat/lng、住所、営業時間など
- `cafes` — 名称、住所、lat/lng、特典内容、営業時間
- `coins` — 名称、業種、cointype（`さいコイン` / `たまポン`）、住所、lat/lng
- `feel_spots` — 名称、feel（TEXT[]配列）、lat/lng、説明文
