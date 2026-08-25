# Email OTP 驗證碼設定

Snack Vote 僅使用 Email OTP 登入，不需要 Microsoft Entra ID，也不需要員工設定密碼。Supabase 可將 Email OTP 設為 6～10 位數；前端會自動接受這個範圍，不需寫死長度。

## 一、設定 Supabase Email Template

1. Supabase 進入 `Authentication` → `Email Templates` → `Magic Link`。
2. Subject 改為：`Snack Vote 登入驗證碼`。
3. 內文必須使用 `{{ .Token }}` 顯示驗證碼，不要只保留 `{{ .ConfirmationURL }}`。可使用：

```html
<h2>Snack Vote 登入驗證碼</h2>
<p>請回到 Snack Vote，輸入以下登入驗證碼：</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px">{{ .Token }}</p>
<p><a href="{{ .RedirectTo }}" style="display:inline-block;padding:12px 20px;background:#164f3d;color:#fff;text-decoration:none;border-radius:8px">開啟 Snack Vote</a></p>
<p>若不是你本人要求登入，請忽略此信。</p>
```

`{{ .RedirectTo }}` 會使用 Snack Vote 寄信當下所在的完整網址，包含 GitHub Pages 的 `/snack-vote/` 子路徑；請勿改回 `{{ .SiteURL }}`，否則 Site URL 設定錯誤時可能開到 GitHub 404。

4. 儲存後，用啟用員工名單中的 Email 測試。信件應顯示一次性數字驗證碼；「開啟 Snack Vote」只負責回到登入頁，仍需輸入驗證碼。

## 二、確認網站網址

Supabase `Authentication` → `URL Configuration`：

- Site URL：正式 GitHub Pages 網址。
- Redirect URLs：加入正式網址，結尾可使用 `/**`，例如 `https://rogeryuan1981-rgb.github.io/snack-vote/**`。

若網站日後更名或換 repository，只要新網址已加入 Redirect URLs，程式寄信時就會自動帶入新網址，不需要再改 Email Template。

## 三、安全規則

- 登入頁會先呼叫 `is_login_email_allowed`，不在啟用員工名單中的 Email 不會寄信。
- 驗證碼由 Supabase Auth 產生並驗證，網站不自行保存驗證碼。
- 個人電腦會保留登入；使用者可主動登出，管理者也可撤銷工作階段。
- 共用電腦的登入只保存在分頁工作階段；關閉分頁即清除，閒置 30 分鐘也會自動登出。
- SMTP／Brevo 金鑰只能設定於 Supabase，禁止放進 GitHub 或前端程式。
