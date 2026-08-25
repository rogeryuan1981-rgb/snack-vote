# Snack Vote 部署說明

## 1. 更新 Supabase

本版已將全部資料表、欄位、RLS、Trigger、Realtime、Storage、函式與基礎商品整併成唯一檔案：

`supabase/final.sql`

進入 Supabase `SQL Editor`，新增 Query，貼上 `final.sql` 的完整內容後按 `Run`。此檔可用於目前既有資料庫，也可用於新的空白 Supabase 專案；重複執行會補齊缺少項目，不會清空既有員工、活動、投票、採購或評論資料。

以後不再需要判斷要執行哪一個 `upgrade-*.sql`。

本版資料庫更新包含：

- 前台最近三期活動、採購結果及商品心得。
- 每位同仁每期每項已採購商品可留一則心得，並可修改或刪除自己的內容。
- 同仁意見問卷：提名、投票、結果／採購三階段滿意度與文字建議。
- 意見僅本人與管理者可見；同仁可追蹤未閱讀、已閱讀、已回覆與已結案狀態。
- 管理後台可篩選意見、查看階段平均分、留下回覆並標記結案。
- 未鎖定採購清單會隨提名、投票與商品狀態同步。
- 動態分類、分地點活動、預算保留、競賽排名、採購鎖定及到貨日期。

## 2. 上傳 GitHub

將壓縮檔解壓縮後，把資料夾內的所有檔案與資料夾上傳到 GitHub repository 根目錄。遇到同名檔案請覆蓋；不要只上傳壓縮檔。

## 3. GitHub Actions Variables

進入 repository：`Settings` → `Secrets and variables` → `Actions` → `Variables`，確認已有：

- `VITE_SUPABASE_URL`：Supabase Project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY`：`sb_publishable_...` 開頭的 Publishable Key

Publishable Key 可供瀏覽器使用。請勿放入 Service Role Key、資料庫密碼或 SMTP 密碼。

## 4. GitHub Pages

進入 `Settings` → `Pages`，將 Source 設為 `GitHub Actions`。上傳至 `main` 後，Actions 會自動建置並發布。

## 5. Email OTP

本工具使用 Email OTP 驗證碼登入。請依照 `EMAIL-OTP-SETUP.md` 設定 Supabase Email Template。

Supabase `Authentication` → `URL Configuration`：

- Site URL：GitHub Pages 網址
- Redirect URLs：相同網址，結尾可使用 `/**`

## 6. 要求員工重新登入（選用）

若要使用後台「要求重新登入」，需在 Supabase Edge Functions 部署：

`supabase/functions/revoke-user-session/index.ts`

函式名稱必須是 `revoke-user-session`。不要把 Service Role Key 放進 GitHub。

## 7. 預算報表 PDF

後台進入「預算分析」，設定地點與期間後按「匯出 PDF」。瀏覽器會開啟列印視窗，目的地選擇「另存為 PDF」即可。輸出版本會自動移除後台側欄、按鈕與篩選控制，只保留正式報表內容。
