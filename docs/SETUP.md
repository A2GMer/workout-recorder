# セットアップ手順

## 0. ローカルで動かす（Supabase なし）
`.env.local` を作らずに起動すると、端末内（IndexedDB）だけで動きます。画面確認用。

```bash
npm install
npm run dev
```

## 1. Supabase プロジェクトを作る
1. https://supabase.com にログインし **New project**（リージョンは Tokyo 推奨）
2. **SQL Editor** を開き、`supabase/migrations/0001_init.sql` の中身を貼り付けて **Run**
3. **Authentication > Sign In / Providers**
   - Email を有効のまま、**Allow new users to sign up を OFF**（他人が登録できないように）
4. **Authentication > Users > Add user > Create new user**
   - 自分のメールを入力（パスワードは任意の値でOK。ログインには使わない）、**Auto Confirm User を ON**
5. **Authentication > Emails > Templates > Magic Link** の本文を、確認コードが載るように変更して保存
   ```html
   <h2>ログインコード</h2>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   ```
   - ログインはメールに届く確認コード方式。各端末で最初の1回だけ入力し、以降は自動ログイン
   - 標準のメール送信は1時間あたりの送信数に制限がある（個人利用なら問題なし）
6. **Project Settings > API**（または **Connect**）で次の2つを控える
   - Project URL
   - anon / publishable key（`service_role` / secret key は使わない・共有しない）

## 2. ローカルで Supabase に接続して確認
`.env.example` をコピーして `.env.local` を作成し、控えた値を入れる。

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

`npm run dev` → ログイン画面が出ればOK。

## 3. Vercel にデプロイ
1. このリポジトリを GitHub に push
2. Vercel で **Add New > Project** → リポジトリを選択（Framework は Vite が自動検出）
3. **Environment Variables** に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を追加
4. **Deploy**

## 4. スマホに入れる
- iPhone: Safari で開く → 共有 → **ホーム画面に追加**
- Android: Chrome で開く → メニュー → **アプリをインストール**

一度開いておけば、圏外でも起動・記録できます（電波が戻ると自動で送信）。
