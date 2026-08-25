# Snack Vote 上傳說明

本版新增「上班地點」與「分地點活動」：員工和活動都會指定地點，不同地點可同時進行不同活動；預算結轉只會尋找同地點上一期。歷史紀錄也可直接回到活動管理修改預算、日期、地點及狀態，既有提名、投票、留言與採購紀錄會保留。

## 若尚未執行：升級 Supabase

進入 Supabase 的 `SQL Editor`，開啟並完整執行：

`supabase/upgrade-20260820-product-images-and-review.sql`

成功後會新增商品圖片空間、退回商品返還票數，以及前五名預算採購計算。這份增量檔可安全重複執行。

## 本次必做：啟用動態商品類別

接著在 Supabase `SQL Editor` 完整執行：

`supabase/upgrade-20260824-dynamic-categories.sql`

這會建立類別資料、後台維護權限與安全刪除規則。已存在的商品類別會自動匯入，不需要重新建立。

## 本次必做：啟用預算結轉

再於 Supabase `SQL Editor` 完整執行：

`supabase/upgrade-20260824-budget-rollover.sql`

既有活動會自動把目前預算設為基本預算，且預設不結轉，不會自行增加任何一期的可用金額。

若先前已經執行過上述預算結轉檔，請再執行：

`supabase/upgrade-20260824-budget-retention.sql`

它會補上「本期餘額是否保留」開關；既有期別預設為不保留。

## 本次必做：啟用上班地點與分地點活動

最後在 Supabase `SQL Editor` 完整執行：

`supabase/upgrade-20260824-work-locations.sql`

執行後會自動建立一筆「主要辦公室」，並把所有既有員工及活動歸入該地點，所以舊資料不會遺失。之後可在管理後台的「上班地點」新增地點，再到員工名單及活動管理分別指定。這份檔案也會把預算承接、活動參與名單及商品類別安全檢查更新為多地點版本。

## 本次必做：啟用測試活動強制刪除

在 Supabase `SQL Editor` 完整執行：

`supabase/upgrade-20260824-force-delete-campaign.sql`

完成後，管理者可在「歷史紀錄」展開活動並使用「強制刪除活動」。系統會進行兩次確認，並永久刪除該活動的參與名單、提名、投票、留言、採購項目及寄信紀錄；商品與員工名單不會被刪除。

## 本次必做：登入安全與員工名單預先驗證

先在 Supabase `SQL Editor` 完整執行：

`supabase/upgrade-20260824-login-security.sql`

完成後，登入頁會在寄信前確認 Email 是否屬於啟用員工；不在名單或已停用的 Email 不會寄出登入信。

### 啟用「要求重新登入」功能

管理後台現在可撤銷指定員工在所有裝置上的登入工作階段。這項操作必須由 Supabase Edge Function 安全執行，不能把管理金鑰放進 GitHub Pages。

請在 Supabase 專案的 `Edge Functions` 建立並部署名稱為：

`revoke-user-session`

程式內容使用壓縮檔中的：

`supabase/functions/revoke-user-session/index.ts`

Supabase 會自動提供該函式需要的 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 與 `SUPABASE_SERVICE_ROLE_KEY`，不要把 Service Role Key 加到 GitHub Variables。部署一次後，員工名單中的「要求重新登入」按鈕即可使用。

## 本次必做：Email 六位數驗證碼

本版僅保留 Email 六位數驗證碼登入，不使用 Microsoft Entra ID。請依照：

`EMAIL-OTP-SETUP.md`

完成 Supabase Email Template 設定。若只上傳程式而未修改信件範本，信件可能仍顯示舊的登入連結，而不是六位數驗證碼。

## 本版工作階段與文字顯示

- 登入頁可選「共用電腦」；開啟後，關閉該瀏覽器分頁即清除登入。
- 只有「共用電腦」模式閒置 30 分鐘會自動登出；個人電腦會保留登入，避免反覆驗證。
- 員工頁及後台會顯示目前工作階段模式、姓名與 Email。
- 全站預設字級已提高，並提供「一般／放大」文字切換；選擇會保存在該瀏覽器。

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
