# Email 六位數驗證碼設定

Snack Vote 僅使用 Email 六位數驗證碼登入，不需要 Microsoft Entra ID，也不需要員工設定密碼。

## 一、設定 Supabase Email Template

1. Supabase 進入 `Authentication` → `Email Templates` → `Magic Link`。
2. Subject 改為：`Snack Vote 登入驗證碼`。
3. 內文必須使用 `{{ .Token }}` 顯示驗證碼，不要只保留 `{{ .ConfirmationURL }}`。可使用：

```html
<h2>Snack Vote 登入驗證碼</h2>
<p>請回到 Snack Vote，輸入以下六位數驗證碼：</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px">{{ .Token }}</p>
<p>開啟 Snack Vote：<a href="{{ .SiteURL }}">{{ .SiteURL }}</a></p>
<p>若不是你本人要求登入，請忽略此信。</p>
```

4. 儲存後，用啟用員工名單中的 Email 測試。信件應顯示六位數字。

## 二、確認網站網址

Supabase `Authentication` → `URL Configuration`：

- Site URL：正式 GitHub Pages 網址。
- Redirect URLs：加入正式網址，結尾可使用 `/**`。

## 三、安全規則

- 登入頁會先呼叫 `is_login_email_allowed`，不在啟用員工名單中的 Email 不會寄信。
- 驗證碼由 Supabase Auth 產生並驗證，網站不自行保存驗證碼。
- 個人電腦會保留登入；使用者可主動登出，管理者也可撤銷工作階段。
- 共用電腦的登入只保存在分頁工作階段；關閉分頁即清除，閒置 30 分鐘也會自動登出。
- SMTP／Brevo 金鑰只能設定於 Supabase，禁止放進 GitHub 或前端程式。
