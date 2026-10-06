# セットアップ手順

## 0. ローカルで動かす（Supabase なし）
`.env.local` を作らずに起動すると、端末内（IndexedDB）だけで動きます。画面確認用。

```bash
npm install
npm run dev
```

## 1. Supabase プロジェクトを作る
1. https://supabase.com にログインし **New project**（リージョンは Tokyo 推奨）
2. **SQL Editor** を開き、`supabase/migrations/` の SQL を番号順（0001 → 0002 → …）に貼り付けて **Run**
   - アプリの更新で SQL が増えたときも、未実行のものを番号順に実行する（実行前に使うと同期が止まる）
3. **Authentication > Sign In / Providers > Email**
   - **Allow new users to sign up を ON**（アプリの「新規登録」から登録するため）
   - **Confirm email を OFF**（登録後すぐログインできる。ON だと確認メールが必要で、送信数の制限にもかかる）
   - 自分の登録が済んだら、他人に登録されないよう **Allow new users to sign up を OFF** に戻してもよい
   - ログインは各端末で最初の1回だけ。以降は自動ログイン
4. **Project Settings > API**（または **Connect**）で次の2つを控える
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
