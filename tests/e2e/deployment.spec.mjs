import { test, expect } from "@playwright/test";
async function signIn(page, request, email) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "寄送登入信", exact: true }).click();
  await page
    .getByRole("button", { name: "確認並寄送登入信", exact: true })
    .click();
  await expect(page.getByLabel("登入驗證碼")).toBeVisible();
  const inbox = await (
    await request.get("http://127.0.0.1:4174/local/inbox")
  ).json();
  await page
    .getByLabel("登入驗證碼")
    .fill(inbox.find((x) => x.email === email && x.code).code);
  await page.getByRole("button", { name: "驗證並登入", exact: true }).click();
}
test("uninitialized training database preserves the existing snack portal and admin", async ({
  page,
  request,
}) => {
  await page.route("**/rest/v1/rpc/portal_rpc", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        code: "PGRST202",
        message:
          "Could not find the function public.portal_rpc(action, p) in the schema cache",
      }),
    }),
  );
  await signIn(page, request, "admin@example.test");
  await expect(page.getByRole("heading", { name: /歡迎回來/ })).toBeVisible();
  await expect(page.getByLabel("教育訓練尚未開放")).toBeVisible();
  await expect(page.getByRole("link", { name: /教育訓練/ })).toHaveCount(0);
  await page.getByRole("link", { name: /零食投票.*進入系統/ }).click();
  await expect(
    page.getByRole("link", { name: "本期活動", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "管理後台", exact: true }).click();
  await expect(page.getByRole("link", { name: /返回員工入口/ })).toHaveCount(0);
  await page.goto("/#/training");
  await expect(
    page.getByText("尚待管理員完成平台初始化，目前未開放學習與測驗。"),
  ).toBeVisible();
});
test("permission denial never falls back to legacy access", async ({
  page,
  request,
}) => {
  await page.route("**/rest/v1/rpc/portal_rpc", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        code: "42501",
        message: "permission denied for function portal_rpc",
      }),
    }),
  );
  await signIn(page, request, "other@example.test");
  await expect(page.getByRole("alert")).toHaveText(
    "permission denied for function portal_rpc",
  );
  await expect(page.getByRole("link", { name: /進入系統/ })).toHaveCount(0);
});
