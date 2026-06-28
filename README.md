# 清水研究室 輪読サポートサイト

🔗 **公開サイト: https://zhuneiquanyilang-creator.github.io/simizu_seminer/**
（メンバーはこのURLを開き、共有の合言葉でログイン）

ストロガッツ『非線形ダイナミクスとカオス』の輪読会（7人）向けサポートサイト。

- **担当一覧** … 節ごとに担当者・発表日・状態を管理
- **レジュメ** … 節に紐づけてPDFをアップロード・閲覧
- ログインは**共有パスワード**（身内限定）

仕様は [SPEC.md](SPEC.md)、画面ラフは [WIREFRAME.md](WIREFRAME.md)、章節データは [data/toc.md](data/toc.md)。

---

## 構成

```
index.html            … ①ログインページ（合言葉入力）
app.html              … ②担当一覧 ③節詳細（入室後の本体）
css/style.css         … スタイル
js/config.js          … 設定（Supabase接続情報・メンバー名など）★ここを編集
js/store.js           … データ層（Supabase / デモ 共通）
js/login.js           … ログインページのロジック
js/app.js             … アプリ本体のロジック
js/toc-data.js        … 章・節カタログ（data/toc.md から自動生成）
supabase/schema.sql   … Supabase の DB / ストレージ / 権限の定義
```

ページ遷移: `index.html`（合言葉入力）→ 入室 → `app.html`（本体）。
未ログインで `app.html` を開くと `index.html` に戻されます。

---

## すぐ試す（デモモード）

`js/config.js` を空のままブラウザで `index.html` を開くと **デモモード**で起動します。

- 任意の合言葉で入室でき、担当の編集などを試せます
- データはそのブラウザの localStorage に保存（他の人とは共有されません）
- アップロードしたPDFはリロードすると実体が消えます（メタ情報のみ）

> ローカルで開く場合、ファイルを直接開くより簡易サーバ経由が安定します:
> `python -m http.server` を実行し `http://localhost:8000` を開く。

---

## 本番セットアップ（Supabase・無料）

### 1. Supabase プロジェクトを作る
[supabase.com](https://supabase.com) で無料プロジェクトを作成。

### 2. スキーマを流す
ダッシュボード → **SQL Editor** に [supabase/schema.sql](supabase/schema.sql) を貼り付けて実行。
（テーブル `assignments` / `resumes`、ストレージ `resumes`、権限が作られます）

### 3. 共有アカウントを1つ作る
ダッシュボード → **Authentication → Users → Add user**
- Email: 任意（例 `seminar@example.com`）
- Password: 輪読会の**合言葉**
- **Auto Confirm User** にチェック

### 4. config.js を編集
ダッシュボード → **Project Settings → API** の値を入れる:

```js
SUPABASE_URL:      "https://xxxx.supabase.co",
SUPABASE_ANON_KEY: "（anon public キー）",
SHARED_EMAIL:      "seminar@example.com",   // 手順3のメール
MEMBERS:           ["佐藤","鈴木", ...],     // 任意：担当者候補に出る
```

### 5. 公開（ホスティング・無料）
静的ファイルなので、以下のいずれかにそのまま置けます:
- **Cloudflare Pages** / **Vercel** / **Netlify** … リポジトリを連携
- **GitHub Pages** … リポジトリの Pages を有効化

> ⚠️ `js/config.js` の anon キーは公開されますが、RLS により
> **未ログイン（合言葉なし）では一切データを読めません**。合言葉のみで保護します。

---

## 章・節データの更新方法

節の追加・誤字修正は [data/toc.md](data/toc.md) を直接編集し、`js/toc-data.js` を再生成します
（生成スクリプトはリポジトリ管理者にて実行）。担当・発表日・状態・レジュメは
サイト上で編集され、Supabase（または localStorage）に保存されます。

---

## ステータスの定義
- ⚪ **担当未決定** … 担当者未割り当て
- 🔵 **準備中** … 担当が決まりレジュメ準備中
- 🟡 **未完了** … 発表したが時間切れで来週へ持ち越し
- ✅ **発表済み** … 発表完了
