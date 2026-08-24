# Snack Vote 上傳說明

本版已加入正式商品編輯視窗與背景資料同步；切換分頁不會清空表單，新增商品的文字草稿在重新整理後也會自動還原。

## 本次必做：先升級 Supabase

進入 Supabase 的 `SQL Editor`，開啟並完整執行：

`supabase/upgrade-20260820-product-images-and-review.sql`

成功後會新增商品圖片空間、退回商品返還票數，以及前五名預算採購計算。這份增量檔可安全重複執行。

## 上傳檔案

將壓縮檔解壓縮後，把資料夾內的所有檔案與資料夾上傳到 GitHub repository 根目錄。遇到同名檔案請覆蓋；不要只上傳壓縮檔。

## 設定 GitHub Variables

進入 repository：`Settings` → `Secrets and variables` → `Actions` → `Variables`，建立：

- `VITE_SUPABASE_URL`：Supabase Project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY`：`sb_publishable_...` 開頭的 Publishable Key

Publishable Key 可以供瀏覽器使用；請勿放入 Secret、Service Role、資料庫密碼或 SMTP 密碼。

## 開啟 GitHub Pages

進入 `Settings` → `Pages`，將 Source 設為 `GitHub Actions`。上傳至 `main` 後，Actions 會自動建置並發布。

## 設定 Supabase 登入網址

發布成功取得 GitHub Pages 網址後，進入 Supabase：`Authentication` → `URL Configuration`：

- Site URL：填入 GitHub Pages 網址
- Redirect URLs：加入相同網址，結尾可使用 `/**`

`supabase/schema.sql` 是完整資料庫結構備份。若已在 Supabase SQL Editor 執行成功，不需要重複執行。
