import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSessionMode, isSupabaseConfigured, setSessionMode, supabase } from "./lib/supabase";
import { starterProducts } from "./starterProducts";
type WorkLocation = {
    id: string;
    name: string;
    active: boolean;
};
type EmployeeLocation = {
    employee_id: string;
    work_location_id: string;
};
type CampaignLocation = {
    campaign_id: string;
    work_location_id: string;
};
type ProductLocation = {
    product_id: string;
    work_location_id: string;
};
type Employee = {
    id: string;
    user_id?: string | null;
    name: string;
    email: string;
    role: "employee" | "admin";
    active: boolean;
    work_location_id: string;
};
type Campaign = {
    id: string;
    label: string;
    description: string;
    budget: number;
    base_budget: number;
    carryover_enabled: boolean;
    retain_unused_budget: boolean;
    carryover_amount: number;
    carryover_from: string | null;
    work_location_id: string;
    nomination_limit: number;
    vote_limit: number;
    start_at: string;
    nomination_deadline: string;
    voting_deadline: string;
    purchase_at: string;
    status: string;
    purchase_plan_locked_at: string | null;
    purchase_plan_locked_by: string | null;
    purchase_plan_generated_at: string | null;
    purchase_expected_arrival_date: string | null;
};
type Product = {
    id: string;
    brand: string;
    name: string;
    category: string;
    size: string;
    reference_price: number | null;
    image_path: string | null;
    origin: "catalog" | "employee";
    approval_status: string;
    created_by: string | null;
    active: boolean;
    deleted_at: string | null;
};
type ProductCategory = {
    id: string;
    name: string;
    sort_order: number;
};
type CampaignMember = {
    id: string;
    campaign_id: string;
    employee_id: string;
    name_snapshot: string;
    email_snapshot: string;
    active: boolean;
};
type Nomination = {
    id: string;
    campaign_id: string;
    product_id: string;
    employee_id: string;
    nominator_name: string;
    created_at: string;
};
type Vote = {
    id: string;
    campaign_id: string;
    product_id: string;
    employee_id: string;
    voter_name: string;
    kind: "nomination" | "regular";
    created_at: string;
};
type Comment = {
    id: string;
    campaign_id: string;
    product_id: string;
    employee_id: string;
    author_name: string;
    body: string;
    created_at: string;
};
type ProductReaction = {
    id: string;
    product_id: string;
    employee_id: string;
    reactor_name: string;
    reaction: -1 | 1;
    created_at: string;
    updated_at: string;
};
type PurchaseReview = {
    id: string;
    campaign_id: string;
    product_id: string;
    employee_id: string;
    author_name: string;
    body: string;
    created_at: string;
    updated_at: string;
};
type FeedbackSubmission = {
    id: string;
    employee_id: string;
    author_name: string;
    category: string;
    nomination_rating: number;
    voting_rating: number;
    results_rating: number;
    body: string;
    status: "unread" | "read" | "replied" | "closed";
    read_at: string | null;
    admin_reply: string | null;
    replied_at: string | null;
    replied_by: string | null;
    created_at: string;
    updated_at: string;
};
type PurchaseItem = {
    id: string;
    campaign_id: string;
    product_id: string;
    rank: number;
    vote_count: number;
    unit_price: number;
    suggested_quantity: number;
    final_quantity: number | null;
    purchased: boolean;
    note: string | null;
};
type Phase = "upcoming" | "nomination" | "voting" | "results" | "purchase";
type ProductSort = "smart" | "votes" | "name" | "price-asc" | "price-desc";
const icons: Record<string, string> = { 堅果: "♧", 巧克力: "◆", 洋芋片: "◒", 米果: "❋", 糖果: "●", 餅乾: "▦", 海苔肉乾: "▤" };
const tones = ["tone-1", "tone-2", "tone-3", "tone-4", "tone-5", "tone-6"];
function phaseOf(c: Campaign): Phase { const now = Date.now(); if (now < +new Date(c.start_at))
    return "upcoming"; if (now < +new Date(c.nomination_deadline))
    return "nomination"; if (now < +new Date(c.voting_deadline))
    return "voting"; if (now < +new Date(c.purchase_at))
    return "results"; return "purchase"; }
function shortDate(value: string) { return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(value)); }
function dateTimeInput(value: string) { const d = new Date(value); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
function errorText(error: unknown) {
    if (error instanceof Error)
        return error.message;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
        return error.message;
    return "操作失敗，請稍後再試";
}
function appEntryUrl() { return new URL("./", document.baseURI).href.split("#")[0]; }
function productImageUrl(path: string | null) { return path ? supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl : ""; }
function competitionRankMap<T>(rows: T[], key: (row: T) => string, score: (row: T) => number) { const ranks = new Map<string, number>(); let previousScore: number | undefined; let currentRank = 0; rows.forEach((row, index) => { const value = score(row); if (index === 0 || value !== previousScore)
    currentRank = index + 1; ranks.set(key(row), currentRank); previousScore = value; }); return ranks; }
async function uploadProductImage(file: File, employeeId: string) { if (file.size > 5 * 1024 * 1024)
    throw new Error("圖片不可超過 5MB"); if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type))
    throw new Error("僅支援 JPG、PNG、WebP 或 GIF 圖片"); const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, ""); const path = `${employeeId}/${crypto.randomUUID()}.${ext || "jpg"}`; const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false }); if (error)
    throw error; return path; }
function readFormDraft(key: string) { try {
    return JSON.parse(sessionStorage.getItem(key) || "{}") as Record<string, string>;
}
catch {
    return {};
} }
function saveFormDraft(key: string, form: HTMLFormElement) { const draft: Record<string, string> = {}; new FormData(form).forEach((value, name) => { if (typeof value === "string")
    draft[name] = value; }); sessionStorage.setItem(key, JSON.stringify(draft)); }
function locationNames(ids: string[], locations: WorkLocation[]) { return ids.map(id => locations.find(row => row.id === id)?.name).filter(Boolean).join("、") || "未設定"; }
function LocationPicker({ locations, selected, onChange, name = "location_ids", includeInactive = false }: {
    locations: WorkLocation[];
    selected: string[];
    onChange?: (ids: string[]) => void;
    name?: string;
    includeInactive?: boolean;
}) { const rows = locations.filter(row => includeInactive || row.active || selected.includes(row.id)); return <div className="location-picker">{rows.map(row => { const active = selected.includes(row.id); return <label key={row.id} className={active ? "selected" : ""}><input type="checkbox" name={name} value={row.id} checked={active} onChange={() => onChange?.(active ? selected.filter(id => id !== row.id) : [...selected, row.id])}/><span>⌖</span>{row.name}</label>; })}</div>; }
type ConfirmOptions = {
    title: string;
    items: string[];
    confirmLabel?: string;
    danger?: boolean;
};
function useConfirmDialog() { const [dialog, setDialog] = useState<(ConfirmOptions & {
    resolve: (value: boolean) => void;
}) | null>(null); const ask = (options: ConfirmOptions) => new Promise<boolean>(resolve => setDialog({ ...options, resolve })); const close = (answer: boolean) => { dialog?.resolve(answer); setDialog(null); }; const element = dialog ? <div className="confirm-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget)
    close(false); }}><section className={`confirm-card ${dialog.danger ? "danger" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><span className="confirm-icon">{dialog.danger ? "!" : "✓"}</span><h2 id="confirm-title">{dialog.title}</h2><div className="confirm-items">{dialog.items.map((item, index) => <p key={index}>{item}</p>)}</div><div className="confirm-actions"><button onClick={() => close(false)}>取消</button><button className="confirm-primary" onClick={() => close(true)}>{dialog.confirmLabel ?? "確認"}</button></div></section></div> : null; return { ask, element }; }
export default function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [employee, setEmployee] = useState<Employee | null>(null);
    const [loading, setLoading] = useState(true);
    const [denied, setDenied] = useState(false);
    const [route, setRoute] = useState(() => location.hash || "#/");
    useEffect(() => {
        if (!isSupabaseConfigured) {
            setLoading(false);
            return;
        }
        supabase.auth.getSession().then(({ data }) => setSession(data.session));
        const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
        return () => data.subscription.unsubscribe();
    }, []);
    useEffect(() => {
        const handleRouteChange = () => setRoute(location.hash || "#/");
        window.addEventListener("hashchange", handleRouteChange);
        return () => window.removeEventListener("hashchange", handleRouteChange);
    }, []);
    useEffect(() => { if (!session || getSessionMode() !== "shared")
        return; let timer = 0; let lastReset = 0; const signOutForIdle = () => void supabase.auth.signOut(); const reset = () => { const now = Date.now(); if (now - lastReset < 15000)
        return; lastReset = now; window.clearTimeout(timer); timer = window.setTimeout(signOutForIdle, 30 * 60 * 1000); }; const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const; events.forEach(event => window.addEventListener(event, reset, { passive: true })); reset(); return () => { window.clearTimeout(timer); events.forEach(event => window.removeEventListener(event, reset)); }; }, [session?.user.id]);
    useEffect(() => {
        if (!session) {
            setEmployee(null);
            setDenied(false);
            setLoading(false);
            return;
        }
        setLoading(true);
        supabase.from("employees").select("id,name,email,role,active,work_location_id").eq("user_id", session.user.id).maybeSingle()
            .then(({ data, error }) => { setEmployee(data as Employee | null); setDenied(!data || Boolean(error)); setLoading(false); });
    }, [session?.user.id]);
    if (!isSupabaseConfigured)
        return <SetupScreen />;
    if (loading)
        return <main className="loading-screen">正在確認公司名單…</main>;
    if (!session)
        return <Login />;
    if (denied || !employee)
        return <Unauthorized email={session.user.email ?? ""}/>;
    const adminRoute = route.startsWith("#/admin");
    if (adminRoute && employee.role !== "admin")
        return <Unauthorized email={employee.email} adminOnly/>;
    return adminRoute ? <AdminApp employee={employee}/> : <EmployeeApp employee={employee} route={route}/>;
}
function SetupScreen() { return <main className="system-card"><p className="section-kicker">連線設定</p><h1>網站程式已準備連接 Supabase</h1><p>請建立 <code>.env.local</code>，填入 Project URL 與 Publishable Key，再重新啟動網站。</p><code>VITE_SUPABASE_URL=...<br />VITE_SUPABASE_PUBLISHABLE_KEY=...</code></main>; }
function Login() {
    const [email, setEmail] = useState("");
    const [token, setToken] = useState("");
    const [step, setStep] = useState<"email" | "otp">("email");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState(false);
    const [shared, setShared] = useState(() => getSessionMode() === "shared");
    const [resendIn, setResendIn] = useState(0);
    useEffect(() => {
        if (resendIn <= 0)
            return;
        const timer = window.setInterval(() => setResendIn(value => Math.max(0, value - 1)), 1000);
        return () => window.clearInterval(timer);
    }, [resendIn]);
    function applySessionMode() { setSessionMode(shared ? "shared" : "personal"); }
    function showError(text: string) { setError(true); setMessage(text); }
    async function sendOtp(e?: FormEvent) {
        e?.preventDefault();
        setBusy(true);
        setMessage("");
        setError(false);
        const normalized = email.trim().toLowerCase();
        applySessionMode();
        const allowed = await supabase.rpc("is_login_email_allowed", { p_email: normalized });
        if (allowed.error) {
            setBusy(false);
            return showError("目前無法確認員工名單，請稍後再試或聯絡管理者。");
        }
        if (!allowed.data) {
            setBusy(false);
            return showError("此 Email 不在啟用的員工名單中，系統不會寄出驗證碼。");
        }
        const { error } = await supabase.auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: true, emailRedirectTo: appEntryUrl() } });
        setBusy(false);
        if (error)
            return showError(error.message.includes("rate limit") ? "驗證碼寄送次數過於頻繁，請稍後再試。" : error.message);
        setEmail(normalized);
        setToken("");
        setStep("otp");
        setResendIn(60);
        setMessage("登入驗證碼已寄出，請查看信箱。");
    }
    async function verify(e: FormEvent) {
        e.preventDefault();
        if (!/^\d{6,10}$/.test(token))
            return showError("請輸入信件中的 6～10 位數字驗證碼。");
        setBusy(true);
        setMessage("");
        setError(false);
        applySessionMode();
        const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: "email" });
        setBusy(false);
        if (error)
            return showError("驗證碼錯誤或已失效，請重新確認或再寄一次。");
    }
    const deviceControl = <button type="button" className={`shared-device ${shared ? "selected" : ""}`} role="switch" aria-checked={shared} onClick={() => setShared(x => !x)}><span>共用電腦</span><strong>{shared ? "已開啟" : "未開啟"}</strong><small>{shared ? "關閉分頁即清除登入；閒置 30 分鐘也會自動登出。" : "個人電腦會安全保留登入，之後可直接開啟使用。"}</small></button>;
    return <main className="auth-shell">
    <section className="auth-brand-panel">
      <div className="brand"><span className="brand-mark">S</span><div><strong>Snack Vote</strong><small>公司零食共選</small></div></div>
      <div className="auth-copy"><p className="section-kicker">MONTHLY SNACK CLUB</p><h1>把想吃的，<br />變成下個月的零食。</h1><p>同仁提名、公開具名投票，再依預算產生採購建議。規則透明，選擇也更有參與感。</p></div>
      <div className="auth-flow"><span>01 提名</span><span>02 投票</span><span>03 結果揭曉</span><span>04 安排採購</span></div>
    </section>
    <section className="auth-panel">
      <div className="auth-tools"><TextSizeControl /></div>
      <div className="auth-card">
        <p className="section-kicker">EMPLOYEE SIGN IN</p>
        {step === "email" && <form onSubmit={sendOtp}>
          <h2>使用公司 Email 登入</h2>
          <p>不需要密碼。輸入員工名單中的 Email，我們會寄送一次性登入驗證碼。</p>
          <label>Email<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" autoFocus/></label>
          {deviceControl}
          <button className="auth-submit" disabled={busy}>{busy ? "寄送中…" : "寄送登入驗證碼"}</button>
        </form>}
        {step === "otp" && <form onSubmit={verify}>
          <button type="button" className="auth-back" onClick={() => { setStep("email"); setToken(""); setMessage(""); setError(false); }}>← 修改 Email</button>
          <h2>輸入驗證碼</h2>
          <p>驗證碼已寄到 <strong>{email}</strong>。請在有效時間內完成登入。</p>
          <label>登入驗證碼<input className="otp-input" type="text" required inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={10} pattern="[0-9]{6,10}" value={token} onChange={e => setToken(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="00000000" autoFocus/></label>
          <button className="auth-submit" disabled={busy || token.length < 6}>{busy ? "驗證中…" : "驗證並登入"}</button>
          <button type="button" className="resend-code" disabled={busy || resendIn > 0} onClick={() => void sendOtp()}>{resendIn > 0 ? `${resendIn} 秒後可重新寄送` : "重新寄送驗證碼"}</button>
        </form>}
        {message && <p className={`auth-message ${error ? "error" : ""}`}>{message}</p>}
        <small className="auth-note">系統只會寄信給啟用名單中的 Email。個人電腦會保留登入；共用裝置請開啟共用模式。</small>
      </div>
    </section>
  </main>;
}
function TextSizeControl() { const [large, setLarge] = useState(() => localStorage.getItem("snack-vote-text-size") === "large"); useEffect(() => { document.documentElement.dataset.textSize = large ? "large" : "comfortable"; localStorage.setItem("snack-vote-text-size", large ? "large" : "comfortable"); }, [large]); return <div className="text-size-control" aria-label="文字大小"><span>文字</span><button type="button" className={!large ? "active" : ""} onClick={() => setLarge(false)}>一般</button><button type="button" className={large ? "active" : ""} onClick={() => setLarge(true)}>放大</button></div>; }
function Unauthorized({ email, adminOnly = false }: {
    email: string;
    adminOnly?: boolean;
}) { return <main className="system-card"><p className="section-kicker">ACCESS CONTROL</p><h1>{adminOnly ? "這個頁面僅限管理者" : "此 Email 不在啟用名單中"}</h1><p>{email}</p><p>{adminOnly ? "你仍可回到員工頁面。" : "請聯絡管理者確認名單，完成後重新登入。"}</p><button className="auth-submit" onClick={() => adminOnly ? location.hash = "#/" : supabase.auth.signOut()}>{adminOnly ? "回員工頁面" : "登出"}</button></main>; }
function EmployeeApp({ employee, route }: {
    employee: Employee;
    route: string;
}) {
    const { ask: askConfirm, element: confirmElement } = useConfirmDialog();
    const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([]);
    const [selectedEmployeeCampaignId, setSelectedEmployeeCampaignId] = useState<string | null>(null);
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [historyCampaigns, setHistoryCampaigns] = useState<Campaign[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [historyProducts, setHistoryProducts] = useState<Product[]>([]);
    const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
    const [nominations, setNominations] = useState<Nomination[]>([]);
    const [votes, setVotes] = useState<Vote[]>([]);
    const [comments, setComments] = useState<Comment[]>([]);
    const [productReactions, setProductReactions] = useState<ProductReaction[]>([]);
    const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
    const [historyNominations, setHistoryNominations] = useState<Nomination[]>([]);
    const [historyVotes, setHistoryVotes] = useState<Vote[]>([]);
    const [historyPurchases, setHistoryPurchases] = useState<PurchaseItem[]>([]);
    const [purchaseReviews, setPurchaseReviews] = useState<PurchaseReview[]>([]);
    const [busy, setBusy] = useState(true);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("全部");
    const [sortMode, setSortMode] = useState<ProductSort>("smart");
    const [draftNominations, setDraftNominations] = useState<string[]>([]);
    const [toast, setToast] = useState("");
    const [customOpen, setCustomOpen] = useState(() => Object.keys(readFormDraft("snack-vote-custom-product-draft")).length > 0);
    const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
    const load = useCallback(async (silent = false) => {
        if (!silent)
            setBusy(true);
        const [{ data: c }, { data: myMemberships }] = await Promise.all([supabase.from("campaigns").select("*").neq("status", "draft").order("start_at", { ascending: false }), supabase.from("campaign_members").select("campaign_id,active").eq("employee_id", employee.id)]);
        const accessibleIds = new Set((myMemberships ?? []).filter(row => row.active).map(row => row.campaign_id));
        const all = ((c ?? []) as Campaign[]).filter(row => accessibleIds.has(row.id));
        const now = Date.now();
        const activeCampaigns = all.filter(x => x.status === "active");
        const current = activeCampaigns.find(x => x.id === selectedEmployeeCampaignId) ?? activeCampaigns.find(x => +new Date(x.start_at) <= now) ?? activeCampaigns[0] ?? null;
        const history = all.filter(x => !activeCampaigns.some(active => active.id === x.id) && +new Date(x.start_at) <= now).slice(0, 3);
        setAvailableCampaigns(activeCampaigns);
        setCampaign(current);
        setHistoryCampaigns(history);
        const campaignIds = [...(current ? [current.id] : []), ...history.map(x => x.id)];
        const ids = campaignIds.length ? campaignIds : ["00000000-0000-0000-0000-000000000000"];
        const [{ data: p }, { data: ca }, { data: n }, { data: v }, { data: co }, { data: rr }, { data: pi }, { data: pr }] = await Promise.all([
            supabase.from("products").select("*").order("category"), supabase.from("product_categories").select("id,name,sort_order").order("sort_order").order("name"),
            supabase.from("nominations").select("*").in("campaign_id", ids), supabase.from("votes").select("*").in("campaign_id", ids),
            supabase.from("comments").select("*").in("campaign_id", ids).is("deleted_at", null).order("created_at"), supabase.from("product_reactions").select("*").order("created_at"), supabase.from("purchase_items").select("*").in("campaign_id", ids).order("rank"),
            supabase.from("purchase_reviews").select("*").in("campaign_id", ids).order("created_at")
        ]);
        const [{ data: pl }, { data: cl }] = await Promise.all([supabase.from("product_work_locations").select("product_id,work_location_id"), supabase.from("campaign_work_locations").select("campaign_id,work_location_id").in("campaign_id", ids)]);
        const productLocationRows = (pl ?? []) as ProductLocation[];
        const currentLocationIds = new Set(((cl ?? []) as CampaignLocation[]).filter(row => row.campaign_id === current?.id).map(row => row.work_location_id));
        const visibleProductIds = new Set(productLocationRows.filter(row => currentLocationIds.has(row.work_location_id)).map(row => row.product_id));
        const allProducts = (p ?? []) as Product[];
        const allNominations = (n ?? []) as Nomination[];
        const allVotes = (v ?? []) as Vote[];
        const allPurchases = (pi ?? []) as PurchaseItem[];
        setHistoryProducts(allProducts);
        setProducts(allProducts.filter(x => x.active && !x.deleted_at && visibleProductIds.has(x.id)));
        setProductCategories((ca ?? []) as ProductCategory[]);
        setHistoryNominations(allNominations.filter(x => history.some(campaign => campaign.id === x.campaign_id)));
        setHistoryVotes(allVotes.filter(x => history.some(campaign => campaign.id === x.campaign_id)));
        setHistoryPurchases(allPurchases.filter(x => history.some(campaign => campaign.id === x.campaign_id)));
        setPurchaseReviews((pr ?? []) as PurchaseReview[]);
        setProductReactions((rr ?? []) as ProductReaction[]);
        setNominations(allNominations.filter(x => x.campaign_id === current?.id));
        setVotes(allVotes.filter(x => x.campaign_id === current?.id));
        setComments(((co ?? []) as Comment[]).filter(x => x.campaign_id === current?.id));
        setPurchases(allPurchases.filter(x => x.campaign_id === current?.id));
        setDraftNominations(allNominations.filter(x => x.campaign_id === current?.id && x.employee_id === employee.id).map(x => x.product_id));
        setBusy(false);
    }, [employee.id, selectedEmployeeCampaignId]);
    useEffect(() => { void load(false); }, [load]);
    useEffect(() => { if (!campaign)
        return; const channel = supabase.channel(`campaign-${campaign.id}`).on("postgres_changes", { event: "*", schema: "public" }, () => void load(true)).subscribe(); return () => { void supabase.removeChannel(channel); }; }, [campaign?.id, load]);
    useEffect(() => { if (!customOpen)
        return; const form = document.querySelector<HTMLFormElement>("form.custom-product-form"); if (!form)
        return; const draft = readFormDraft("snack-vote-custom-product-draft"); Object.entries(draft).forEach(([name, value]) => { const field = form.elements.namedItem(name); if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        if (field.type !== "file")
            field.value = value;
    } }); const save = () => saveFormDraft("snack-vote-custom-product-draft", form); form.addEventListener("input", save); form.addEventListener("change", save); return () => { form.removeEventListener("input", save); form.removeEventListener("change", save); }; }, [customOpen]);
    function notify(message: string) { setToast(message); setTimeout(() => setToast(""), 2600); }
    if (busy)
        return <main className="loading-screen">同步本月零食清單…</main>;
    async function savePurchaseReview(campaignId: string, productId: string, body: string) { const clean = body.trim(); if (!clean)
        return notify("請輸入評論內容"); const { error } = await supabase.from("purchase_reviews").upsert({ campaign_id: campaignId, product_id: productId, employee_id: employee.id, author_name: employee.name, body: clean }, { onConflict: "campaign_id,product_id,employee_id" }); if (error)
        return notify(error.message); notify("評論已儲存，其他同仁現在可以看到了"); await load(true); }
    async function deletePurchaseReview(review: PurchaseReview) { if (!await askConfirm({ title: "刪除這則評論？", items: ["刪除後其他同仁將無法再看到這則心得。"], confirmLabel: "確認刪除", danger: true }))
        return; const { error } = await supabase.from("purchase_reviews").delete().eq("id", review.id); if (error)
        return notify(error.message); notify("評論已刪除"); await load(true); }
    async function toggleProductReaction(productId: string, reaction: -1 | 1) { const previous = productReactions; const mine = productReactions.find(row => row.product_id === productId && row.employee_id === employee.id); if (mine?.reaction === reaction)
        setProductReactions(current => current.filter(row => row.id !== mine.id));
    else {
        const optimistic: ProductReaction = { id: mine?.id ?? `optimistic-${crypto.randomUUID()}`, product_id: productId, employee_id: employee.id, reactor_name: employee.name, reaction, created_at: mine?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() };
        setProductReactions(current => [...current.filter(row => row.product_id !== productId || row.employee_id !== employee.id), optimistic]);
    } const result = mine?.reaction === reaction ? await supabase.from("product_reactions").delete().eq("id", mine.id) : await supabase.from("product_reactions").upsert({ product_id: productId, employee_id: employee.id, reactor_name: employee.name, reaction }, { onConflict: "product_id,employee_id" }); if (result.error) {
        setProductReactions(previous);
        notify(result.error.message);
    } }
    if (route.startsWith("#/history"))
        return <ShellHeader employee={employee} currentPage="history"><EmployeePageIntro kicker="RECENT ACTIVITY" title="近三期活動回顧" description="集中查看過去的投票結果、實際採購與同仁心得，不干擾本期提名與投票。"/><EmployeeActivityHistory standalone employee={employee} campaigns={historyCampaigns} products={historyProducts} nominations={historyNominations} votes={historyVotes} purchases={historyPurchases} reviews={purchaseReviews} reactions={productReactions} onToggleReaction={toggleProductReaction} onSaveReview={savePurchaseReview} onDeleteReview={deletePurchaseReview}/>{toast && <div className="toast">{toast}</div>}{confirmElement}</ShellHeader>;
    if (route.startsWith("#/feedback"))
        return <ShellHeader employee={employee} currentPage="feedback"><EmployeePageIntro kicker="YOUR FEEDBACK" title="使用意見與改善建議" description="各階段滿意度與修改建議集中在這裡，也能追蹤管理者是否閱讀及回覆。"/><EmployeeFeedbackPanel employee={employee}/></ShellHeader>;
    if (!campaign)
        return <ShellHeader employee={employee}><section className="empty-campaign"><h2>本期活動尚未建立</h2><p>目前仍可查看過去三期的投票與採購紀錄。</p></section><EmployeeActivityHistory employee={employee} campaigns={historyCampaigns} products={historyProducts} nominations={historyNominations} votes={historyVotes} purchases={historyPurchases} reviews={purchaseReviews} onSaveReview={savePurchaseReview} onDeleteReview={deletePurchaseReview}/>{toast && <div className="toast">{toast}</div>}{confirmElement}</ShellHeader>;
    const phase = phaseOf(campaign);
    const myVotes = votes.filter(v => v.employee_id === employee.id);
    const categories = ["全部", ...(productCategories.length ? productCategories.map(c => c.name) : [...new Set(products.map(p => p.category))])];
    const nominatedProducts = new Set(nominations.map(n => n.product_id));
    const voteCount = (productId: string) => votes.filter(v => v.product_id === productId).length;
    const rankedProducts = products.filter(p => nominatedProducts.has(p.id)).sort((a, b) => voteCount(b.id) - voteCount(a.id) || a.name.localeCompare(b.name, "zh-Hant"));
    const rankMap = competitionRankMap(rankedProducts, p => p.id, p => voteCount(p.id));
    const isMyChoice = (productId: string) => draftNominations.includes(productId) || myVotes.some(v => v.product_id === productId);
    const comparePrice = (a: Product, b: Product, direction: 1 | -1) => { if (a.reference_price == null && b.reference_price == null)
        return a.name.localeCompare(b.name, "zh-Hant"); if (a.reference_price == null)
        return 1; if (b.reference_price == null)
        return -1; return (a.reference_price - b.reference_price) * direction || a.name.localeCompare(b.name, "zh-Hant"); };
    const finalRanking = ["results", "purchase"].includes(phase);
    const compareProducts = (a: Product, b: Product) => { if (finalRanking)
        return voteCount(b.id) - voteCount(a.id) || a.name.localeCompare(b.name, "zh-Hant"); const choiceOrder = Number(isMyChoice(b.id)) - Number(isMyChoice(a.id)); if (choiceOrder)
        return choiceOrder; if (sortMode === "votes")
        return voteCount(b.id) - voteCount(a.id) || a.name.localeCompare(b.name, "zh-Hant"); if (sortMode === "name")
        return a.name.localeCompare(b.name, "zh-Hant"); if (sortMode === "price-asc")
        return comparePrice(a, b, 1); if (sortMode === "price-desc")
        return comparePrice(a, b, -1); return ["voting", "results", "purchase"].includes(phase) ? voteCount(b.id) - voteCount(a.id) || a.name.localeCompare(b.name, "zh-Hant") : a.category.localeCompare(b.category, "zh-Hant") || a.name.localeCompare(b.name, "zh-Hant"); };
    const displaySource = finalRanking ? rankedProducts : products;
    const filteredProducts = displaySource.filter(p => (phase === "nomination" || phase === "upcoming" || nominatedProducts.has(p.id)) && (category === "全部" || p.category === category) && `${p.brand}${p.name}${p.category}`.toLowerCase().includes(query.trim().toLowerCase()));
    const shown = finalRanking ? filteredProducts : filteredProducts.sort(compareProducts);
    async function toggleNomination(product: Product) { if (phase !== "nomination")
        return; const selected = draftNominations.includes(product.id); if (!selected && draftNominations.length >= campaign!.nomination_limit)
        return notify(`最多提名 ${campaign!.nomination_limit} 項`); if (!selected) {
        const others = nominations.filter(n => n.product_id === product.id && n.employee_id !== employee.id);
        if (others.length && !await askConfirm({ title: "這項商品已有人提名", items: [`${others.map(x => x.nominator_name).join("、")} 已經提名這項商品。`, `共同提名後，會固定使用你的 1 票。`], confirmLabel: "仍要共同提名" }))
            return;
    } const previousDraft = draftNominations; const previousNominations = nominations; const previousVotes = votes; const next = selected ? draftNominations.filter(id => id !== product.id) : [...draftNominations, product.id]; setDraftNominations(next); if (selected) {
        setNominations(nominations.filter(n => n.employee_id !== employee.id || n.product_id !== product.id));
        setVotes(votes.filter(v => v.employee_id !== employee.id || v.product_id !== product.id || v.kind !== "nomination"));
    }
    else {
        const now = new Date().toISOString();
        setNominations([...nominations, { id: `optimistic-n-${product.id}`, campaign_id: campaign!.id, product_id: product.id, employee_id: employee.id, nominator_name: employee.name, created_at: now }]);
        setVotes([...votes, { id: `optimistic-v-${product.id}`, campaign_id: campaign!.id, product_id: product.id, employee_id: employee.id, voter_name: employee.name, kind: "nomination", created_at: now }]);
    } const { error } = await supabase.rpc("set_nominations", { p_campaign_id: campaign!.id, p_product_ids: next }); if (error) {
        setDraftNominations(previousDraft);
        setNominations(previousNominations);
        setVotes(previousVotes);
        notify(error.message);
    }
    else {
        notify(selected ? "已取消提名，名額與固定票已返還" : "已加入提名並計入固定票");
        await load(true);
    } }
    async function toggleVote(product: Product) { if (phase !== "voting")
        return; const fixed = myVotes.some(v => v.product_id === product.id && v.kind === "nomination"); if (fixed)
        return notify("提名票已鎖定，投票階段不能取消"); const regular = myVotes.filter(v => v.kind === "regular").map(v => v.product_id); const next = regular.includes(product.id) ? regular.filter(id => id !== product.id) : [...regular, product.id]; if (next.length + myVotes.filter(v => v.kind === "nomination").length > campaign!.vote_limit)
        return notify(`本期最多 ${campaign!.vote_limit} 票`); const previous = votes; const otherVotes = votes.filter(v => v.employee_id !== employee.id || v.kind !== "regular"); const optimistic = next.map(productId => ({ id: `optimistic-${productId}`, campaign_id: campaign!.id, product_id: productId, employee_id: employee.id, voter_name: employee.name, kind: "regular" as const, created_at: new Date().toISOString() })); setVotes([...otherVotes, ...optimistic]); const { error } = await supabase.rpc("set_regular_votes", { p_campaign_id: campaign!.id, p_product_ids: next }); if (error) {
        setVotes(previous);
        notify(error.message);
    }
    else {
        notify(regular.includes(product.id) ? "已取消這一票" : "投票已更新");
        await load(true);
    } }
    async function addCustomProduct(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (draftNominations.length >= campaign!.nomination_limit)
        return notify(`已達提名上限 ${campaign!.nomination_limit} 項`); const form = new FormData(e.currentTarget); const file = form.get("image") instanceof File && form.get("image") as File; try {
        const { data, error } = await supabase.rpc("add_custom_product_and_nominate", { p_campaign_id: campaign!.id, p_name: String(form.get("name")), p_category: String(form.get("category")), p_brand: String(form.get("brand") || ""), p_size: String(form.get("size") || ""), p_reference_price: form.get("reference_price") ? Number(form.get("reference_price")) : null, p_source_url: null });
        if (error)
            throw error;
        if (file && file.size > 0) {
            const path = await uploadProductImage(file, employee.id);
            const attached = await supabase.rpc("set_product_image", { p_product_id: data, p_image_path: path });
            if (attached.error)
                throw attached.error;
        }
        sessionStorage.removeItem("snack-vote-custom-product-draft");
        setCustomOpen(false);
        notify("商品已送審，並先計入你的提名與固定票");
        await load(true);
    }
    catch (error) {
        const text = errorText(error);
        notify(text.includes("DUPLICATE_PRODUCT") ? "商品庫已有相同品項，請直接提名既有商品" : text.includes("CAMPAIGN_LOCATION_REQUIRED") ? "本期活動尚未設定適用地點，請聯絡管理員完成活動地點設定" : text);
    } }
    async function addComment(productId: string) { const body = (commentDrafts[productId] ?? "").trim(); if (!body)
        return; const previous = comments; const optimistic: Comment = { id: `optimistic-${crypto.randomUUID()}`, campaign_id: campaign!.id, product_id: productId, employee_id: employee.id, author_name: employee.name, body, created_at: new Date().toISOString() }; setComments([...comments, optimistic]); setCommentDrafts(x => ({ ...x, [productId]: "" })); const { error } = await supabase.from("comments").insert({ campaign_id: campaign!.id, product_id: productId, employee_id: employee.id, author_name: employee.name, body }); if (error) {
        setComments(previous);
        setCommentDrafts(x => ({ ...x, [productId]: body }));
        return notify(error.message);
    } await load(true); }
    const copy = phase === "nomination" ? ["商品提名中", "把想吃的，放進本月候選單", `截止前可隨時更換；每項提名固定使用 1 票。`] : phase === "voting" ? ["具名投票中", "本月零食，現在由大家決定", `你共有 ${campaign.vote_limit} 票；額外票可在截止前更換。`] : phase === "results" ? ["結果揭曉中", "票數已鎖定，看看本月結果", "排名與具名票數已公開。"] : phase === "upcoming" ? ["本期尚未開始", "本月零食活動即將開始", `提名將於 ${shortDate(campaign.start_at)} 開放。`] : ["安排採購中", "本月採購清單整理中", "管理者正依排名、預算與實際售價確認數量。"];
    return <ShellHeader employee={employee}>{availableCampaigns.length > 1 && <div className="employee-campaign-switch"><span>目前活動</span><select value={campaign.id} onChange={event => setSelectedEmployeeCampaignId(event.target.value)}>{availableCampaigns.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select><small>你同時符合多個活動，可在此切換。</small></div>}<section className="hero"><div className="hero-main"><div className="eyebrow"><span className="live-dot"/>{copy[0]} · {campaign.label}</div><h1>{copy[1]}</h1><p>{copy[2]}</p>{campaign.description?.trim() && <div className="campaign-brief"><span>本期活動說明</span><p>{campaign.description}</p></div>}<div className="quota-row"><div className="quota-card"><span>我的提名</span><strong>{draftNominations.length}<small>／{campaign.nomination_limit}</small></strong></div><div className="quota-card"><span>本期票數</span><strong>{myVotes.length}<small>／{campaign.vote_limit}</small></strong></div></div></div><Timeline campaign={campaign} phase={phase}/></section>{campaign.purchase_plan_locked_at && <EmployeePurchasePlan campaign={campaign} products={products} purchases={purchases}/>}<section className="content-head"><div><p className="section-kicker">SNACK CATALOG</p><h2>{phase === "nomination" ? "今天想提名哪一款？" : "看看大家支持誰"}</h2></div>{phase === "nomination" && <button className="custom-product-button" onClick={() => setCustomOpen(x => !x)}>＋ 找不到商品？自行新增</button>}</section>{customOpen && <form className="custom-product-form" onSubmit={addCustomProduct}><div><strong>新增商品並提名</strong><small>送出後會先列為待審商品；若被退回，提名名額與固定票會自動返還。</small></div><input required name="name" placeholder="商品名稱"/><input name="brand" placeholder="品牌（選填）"/><select required name="category" defaultValue=""><option value="" disabled>選擇分類</option>{categories.slice(1).map(x => <option key={x}>{x}</option>)}</select><input name="size" placeholder="規格（選填）"/><input name="reference_price" type="number" min="0" placeholder="參考價（選填）"/><label className="image-input">商品圖<input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif"/></label><button>送出並提名</button></form>}<div className="filters filters-with-sort"><label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋商品、品牌或分類"/></label><div className="category-list">{categories.map(c => <button key={c} className={c === category ? "active" : ""} onClick={() => setCategory(c)}>{c}</button>)}</div>{finalRanking ? <div className="final-ranking-control"><span>顯示順序</span><strong>依最終名次</strong><small>同票並列名次</small></div> : <label className="sort-control"><span>排序方式</span><select value={sortMode} onChange={e => setSortMode(e.target.value as ProductSort)}><option value="smart">智慧排序</option><option value="votes">票數高到低</option><option value="name">商品名稱</option><option value="price-asc">價格低到高</option><option value="price-desc">價格高到低</option></select><small>我的提名／投票優先</small></label>}</div><section className="product-grid">{shown.map((p, index) => { const ns = nominations.filter(n => n.product_id === p.id); const vs = votes.filter(v => v.product_id === p.id); const pcs = comments.filter(c => c.product_id === p.id); const selected = draftNominations.includes(p.id); const voted = myVotes.some(v => v.product_id === p.id); return <article className="product-card" key={p.id}><div className={`product-visual ${tones[index % tones.length]} ${p.image_path ? "has-image" : ""}`}>{p.image_path ? <img src={productImageUrl(p.image_path)} alt={`${p.brand} ${p.name}`}/> : <span>{icons[p.category] ?? "✦"}</span>}<small>{p.category}</small>{rankMap.has(p.id) && ["voting", "results", "purchase"].includes(phase) && <b>第 {rankMap.get(p.id)} 名</b>}</div><div className="product-body"><div className="brand-line"><span>{p.brand}{p.approval_status === "pending" ? " · 待管理者審核" : ""}</span><strong>{p.reference_price == null ? "待確認" : `參考 $${p.reference_price}`}</strong></div><h3>{p.name}</h3><p>{p.size}</p><ProductReactionControls productId={p.id} employeeId={employee.id} reactions={productReactions} onToggle={toggleProductReaction}/>{ns.length > 0 && <div className="nominator"><span>{ns.map(n => n.nominator_name).join("、")} 提名</span></div>}{["voting", "results", "purchase"].includes(phase) && <div className="voter-line"><strong>第 {rankMap.get(p.id)} 名 · {vs.length} 票</strong><span>{vs.map(v => v.voter_name).join("、") || "尚無投票"}</span></div>}<div className="card-actions">{phase === "nomination" ? <button className={`primary-action ${selected ? "selected" : ""}`} onClick={() => toggleNomination(p)}>{selected ? "✓ 已提名（可取消）" : "＋ 納入本期"}</button> : phase === "voting" ? <button className={`primary-action ${voted ? "selected" : ""}`} onClick={() => toggleVote(p)}>{voted ? (myVotes.some(v => v.product_id === p.id && v.kind === "nomination") ? "▣ 提名票" : "✓ 已投票") : "投一票"}</button> : <span className="rank-label">第 {rankMap.get(p.id)} 名 · {vs.length} 票</span>}</div>{["nomination", "voting"].includes(phase) && <div className="comment-box"><div className="comment-list">{pcs.slice(-3).map(c => <p key={c.id}><strong>{c.author_name}</strong>{c.body}</p>)}{!pcs.length && <small>還沒有人留言，來幫這款拉票吧。</small>}</div><div className="comment-compose"><input maxLength={500} value={commentDrafts[p.id] ?? ""} onChange={e => setCommentDrafts(x => ({ ...x, [p.id]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") {
        e.preventDefault();
        void addComment(p.id);
    } }} placeholder="留言拉票…"/><button onClick={() => addComment(p.id)}>送出</button></div></div>}</div></article>; })}{!shown.length && <div className="empty-campaign">目前沒有符合條件的商品。</div>}</section><EmployeeActivityHistory employee={employee} campaigns={historyCampaigns} products={historyProducts} nominations={historyNominations} votes={historyVotes} purchases={historyPurchases} reviews={purchaseReviews} onSaveReview={savePurchaseReview} onDeleteReview={deletePurchaseReview}/>{toast && <div className="toast">{toast}</div>}{confirmElement}</ShellHeader>;
}
function ProductReactionControls({ productId, employeeId, reactions, onToggle }: {
    productId: string;
    employeeId: string;
    reactions: ProductReaction[];
    onToggle: (productId: string, reaction: -1 | 1) => Promise<void>;
}) { const rows = reactions.filter(row => row.product_id === productId); return <div className="product-reactions" aria-label="商品長期偏好">{([1, -1] as const).map(value => { const people = rows.filter(row => row.reaction === value); const mine = people.some(row => row.employee_id === employeeId); const label = value === 1 ? "按讚" : "倒讚"; return <div className={`reaction-choice ${mine ? "selected" : ""}`} key={value}><button type="button" aria-label={mine ? `取消${label}` : label} aria-pressed={mine} onClick={() => void onToggle(productId, value)}><span aria-hidden="true">{value === 1 ? "👍" : "👎"}</span></button><span className={`reaction-count ${people.length ? "has-people" : ""}`} tabIndex={people.length ? 0 : -1}>{people.length}{people.length > 0 && <i role="tooltip"><b>{label}的同仁</b>{people.map(row => row.reactor_name).join("、")}</i>}</span></div>; })}</div>; }
function EmployeeActivityHistory({ standalone = false, employee, campaigns, products, nominations, votes, purchases, reviews, reactions = [], onToggleReaction = async () => { }, onSaveReview, onDeleteReview }: {
    standalone?: boolean;
    employee: Employee;
    campaigns: Campaign[];
    products: Product[];
    nominations: Nomination[];
    votes: Vote[];
    purchases: PurchaseItem[];
    reviews: PurchaseReview[];
    reactions?: ProductReaction[];
    onToggleReaction?: (productId: string, reaction: -1 | 1) => Promise<void>;
    onSaveReview: (campaignId: string, productId: string, body: string) => Promise<void>;
    onDeleteReview: (review: PurchaseReview) => Promise<void>;
}) {
    const [selectedId, setSelectedId] = useState(campaigns[0]?.id ?? "");
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState<string | null>(null);
    useEffect(() => { if (!campaigns.some(row => row.id === selectedId))
        setSelectedId(campaigns[0]?.id ?? ""); }, [campaigns, selectedId]);
    const selected = campaigns.find(row => row.id === selectedId) ?? campaigns[0];
    if (!standalone)
        return null;
    if (!campaigns.length)
        return <section id="activity-history" className="employee-history"><header><div><p className="section-kicker">RECENT ACTIVITY</p><h2>最近三期活動回顧</h2></div></header><div className="history-empty">目前還沒有可回顧的歷史活動。</div></section>;
    if (!selected)
        return null;
    const campaignNominations = nominations.filter(row => row.campaign_id === selected.id);
    const campaignVotes = votes.filter(row => row.campaign_id === selected.id);
    const nominatedIds = [...new Set(campaignNominations.map(row => row.product_id))];
    const ranking = nominatedIds.map(id => ({ id, count: campaignVotes.filter(row => row.product_id === id).length })).filter(row => row.count > 0).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
    const ranks = competitionRankMap(ranking, row => row.id, row => row.count);
    const purchasedRows = purchases.filter(row => row.campaign_id === selected.id && row.purchased && Number(row.final_quantity ?? row.suggested_quantity) > 0).sort((a, b) => a.rank - b.rank || a.product_id.localeCompare(b.product_id));
    const plannedRows = purchases.filter(row => row.campaign_id === selected.id && Number(row.final_quantity ?? row.suggested_quantity) > 0);
    const spent = purchasedRows.reduce((sum, row) => sum + Number(row.unit_price) * Number(row.final_quantity ?? row.suggested_quantity), 0);
    const progress = plannedRows.length ? Math.round(purchasedRows.length / plannedRows.length * 100) : 0;
    const campaignReviews = reviews.filter(row => row.campaign_id === selected.id);
    return <section id="activity-history" className="employee-history">
    <header><div><p className="section-kicker">RECENT ACTIVITY</p><h2>最近三期活動回顧</h2><p>查看過去的投票、實際採購與同仁心得，作為下次提名參考。</p></div><span>顯示最近 {campaigns.length} 期</span></header>
    <div className="history-period-tabs">{campaigns.map(row => <button key={row.id} className={row.id === selected.id ? "active" : ""} onClick={() => setSelectedId(row.id)}><strong>{row.label}</strong><small>{shortDate(row.start_at)}－{shortDate(row.purchase_at)}</small></button>)}</div>
    <div className="history-overview"><div><span>本期預算</span><strong>NT$ {Number(selected.budget).toLocaleString()}</strong></div><div><span>實際採購</span><strong>NT$ {spent.toLocaleString()}</strong></div><div><span>採購完成度</span><strong>{progress}%</strong></div><div><span>同仁心得</span><strong>{campaignReviews.length} 則</strong></div></div>
    <div className="history-columns"><section className="history-ranking"><div className="history-panel-title"><div><small>FINAL RANKING</small><h3>最終投票結果</h3></div><span>{campaignVotes.length} 票</span></div>{ranking.length ? ranking.map(row => { const product = products.find(item => item.id === row.id); const purchase = purchases.find(item => item.campaign_id === selected.id && item.product_id === row.id && Number(item.final_quantity ?? item.suggested_quantity) > 0); const voters = campaignVotes.filter(item => item.product_id === row.id).map(item => item.voter_name); return <article key={row.id}><b>第 {ranks.get(row.id)} 名</b><div><strong>{product ? `${product.brand} ${product.name}` : "商品資料已移除"}</strong><small>投票者：{voters.join("、")}</small><ProductReactionControls productId={row.id} employeeId={employee.id} reactions={reactions} onToggle={onToggleReaction}/></div><span>{row.count} 票</span>{purchase && <em>{purchase.purchased ? `已購買 ${purchase.final_quantity ?? purchase.suggested_quantity} 份` : "列入清單"}</em>}</article>; }) : <div className="history-empty">本期沒有投票資料。</div>}</section>
      <section className="history-reviews"><div className="history-panel-title"><div><small>TEAM REVIEWS</small><h3>實際購買心得</h3></div><span>每人每項 1 則</span></div>{purchasedRows.length ? purchasedRows.map(row => { const product = products.find(item => item.id === row.product_id); const itemReviews = campaignReviews.filter(item => item.product_id === row.product_id); const mine = itemReviews.find(item => item.employee_id === employee.id); const draftKey = `${selected.id}:${row.product_id}`; const value = drafts[draftKey] ?? mine?.body ?? ""; return <article className="review-product" key={row.id}><header><div><strong>{product ? `${product.brand} ${product.name}` : "商品資料已移除"}</strong><small>本期購買 {row.final_quantity ?? row.suggested_quantity} 份 · {itemReviews.length} 則心得</small></div><b>第 {row.rank} 名</b></header><div className="review-stream">{itemReviews.map(review => <p key={review.id} className={review.employee_id === employee.id ? "mine" : ""}><span><strong>{review.author_name}</strong><small>{new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(review.updated_at))}{review.updated_at !== review.created_at ? " · 已編輯" : ""}</small></span>{review.body}{review.employee_id === employee.id && <button onClick={() => void onDeleteReview(review)}>刪除</button>}</p>)}{!itemReviews.length && <small>還沒有心得，成為第一位分享的人。</small>}</div><div className="review-compose"><textarea maxLength={500} value={value} onChange={event => setDrafts(current => ({ ...current, [draftKey]: event.target.value }))} placeholder="口味、份量或是否值得再次購買…"/><div><small>{value.trim().length}/500</small><button disabled={!value.trim() || saving === draftKey} onClick={async () => { setSaving(draftKey); await onSaveReview(selected.id, row.product_id, value); setDrafts(current => { const next = { ...current }; delete next[draftKey]; return next; }); setSaving(null); }}>{saving === draftKey ? "儲存中…" : mine ? "更新心得" : "發表心得"}</button></div></div></article>; }) : <div className="history-empty">本期尚未有已採購商品，因此暫時不能留下購買心得。</div>}</section></div>
  </section>;
}
const feedbackStatusLabels: Record<FeedbackSubmission["status"], string> = { unread: "尚未閱讀", read: "管理者已閱讀", replied: "管理者已回覆", closed: "已結案" };
function RatingPicker({ name, label, defaultValue = 3 }: {
    name: string;
    label: string;
    defaultValue?: number;
}) { const [value, setValue] = useState(defaultValue); return <fieldset className="feedback-rating"><legend>{label}</legend><input type="hidden" name={name} value={value}/><div>{[1, 2, 3, 4, 5].map(score => <button key={score} type="button" className={value === score ? "active" : ""} onClick={() => setValue(score)} aria-pressed={value === score}>{score}<small>{score === 1 ? "不滿意" : score === 5 ? "很滿意" : ""}</small></button>)}</div></fieldset>; }
function EmployeeFeedbackPanel({ employee }: { employee: Employee }) {
    const [rows, setRows] = useState<FeedbackSubmission[]>([]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const load = useCallback(async () => { const { data } = await supabase.from("feedback_submissions").select("*").order("created_at", { ascending: false }); setRows((data ?? []) as FeedbackSubmission[]); }, []);
    useEffect(() => { void load(); }, [load]);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const body = String(data.get("body") || "").trim();
        if (body.length < 5) return setMessage("建議內容至少需要 5 個字");
        setBusy(true); setMessage("");
        const { error } = await supabase.from("feedback_submissions").insert({ employee_id: employee.id, author_name: employee.name, category: "other", nomination_rating: Number(data.get("nomination_rating")), voting_rating: Number(data.get("voting_rating")), results_rating: Number(data.get("results_rating")), body, status: "unread" });
        setBusy(false); if (error) return setMessage(error.message); form.reset(); setMessage("意見已送出，可在右側追蹤管理者處理狀態。"); await load();
    }
    return <section id="employee-feedback" className="employee-feedback">
      <header><div><p className="section-kicker">YOUR FEEDBACK</p><h2>幫我們把下期做得更好</h2><p>先為三個階段評分，再告訴我們可以怎麼改進，大約一分鐘即可完成。</p></div><span>只有你與管理者看得到</span></header>
      <div className="feedback-layout"><form onSubmit={submit}>
        <div className="feedback-ratings"><RatingPicker name="nomination_rating" label="提名階段滿意度"/><RatingPicker name="voting_rating" label="投票階段滿意度"/><RatingPicker name="results_rating" label="結果／採購資訊滿意度"/></div>
        <label>修改建議<textarea name="body" required minLength={5} maxLength={1000} placeholder="哪裡不順、缺少什麼，或你希望下期怎麼調整？"/></label>
        <div className="feedback-submit-row"><small>{message || "送出後仍可查看是否已被閱讀與回覆。"}</small><button disabled={busy}>{busy ? "送出中…" : "送出回饋"}</button></div>
      </form><section className="my-feedback"><div className="history-panel-title"><div><small>MY SUBMISSIONS</small><h3>我的意見紀錄</h3></div><span>{rows.length} 則</span></div>{rows.length ? <div className="my-feedback-list">{rows.map(row => <article key={row.id}><header><div><strong>滿意度與建議</strong><small>{new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(row.created_at))}</small></div><span className={`feedback-status ${row.status}`}>{feedbackStatusLabels[row.status]}</span></header><p>{row.body}</p><div className="feedback-score-summary"><span>提名 {row.nomination_rating}</span><span>投票 {row.voting_rating}</span><span>結果／採購 {row.results_rating}</span></div>{row.admin_reply && <blockquote><strong>管理者回覆</strong>{row.admin_reply}<small>{row.replied_at ? new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(row.replied_at)) : ""}</small></blockquote>}</article>)}</div> : <div className="history-empty">尚未送出意見。</div>}</section></div>
    </section>;
}
function EmployeePurchasePlan({ campaign, products, purchases }: {
    campaign: Campaign;
    products: Product[];
    purchases: PurchaseItem[];
}) { const rows = purchases.filter(row => row.campaign_id === campaign.id && Number(row.final_quantity ?? row.suggested_quantity) > 0).sort((a, b) => a.rank - b.rank || b.vote_count - a.vote_count || a.product_id.localeCompare(b.product_id)); const allPurchased = rows.length > 0 && rows.every(row => row.purchased); const spent = rows.reduce((sum, row) => sum + Number(row.unit_price) * Number(row.final_quantity ?? row.suggested_quantity), 0); const remaining = Number(campaign.budget) - spent; const arrival = campaign.purchase_expected_arrival_date ? new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${campaign.purchase_expected_arrival_date}T00:00:00`)) : null; return <section className="employee-purchase-plan"><header><div><p className="section-kicker">LOCKED PURCHASE PLAN</p><h2>本期購買清單</h2><span>{allPurchased ? "✓ 已完成採購" : "採購安排已確認"}</span></div>{arrival && <div className="arrival-card"><small>預計到貨</small><strong>{arrival}</strong></div>}</header>{rows.length ? <div className="employee-purchase-list">{rows.map(row => { const product = products.find(item => item.id === row.product_id); const quantity = Number(row.final_quantity ?? row.suggested_quantity); return <article key={row.id}><b>第 {row.rank} 名</b><div><strong>{product ? `${product.brand} ${product.name}` : "商品資料已移除"}</strong><small>{quantity} 份 · 單價 NT$ {Number(row.unit_price).toLocaleString()} · 小計 NT$ {(Number(row.unit_price) * quantity).toLocaleString()}</small></div><span className={row.purchased ? "purchased" : ""}>{row.purchased ? "已採購" : "待採購"}</span></article>; })}</div> : <div className="purchase-plan-empty">清單已鎖定，目前沒有配置採購數量的商品。</div>}{allPurchased && <div className="employee-budget-summary"><div><span>本期預算</span><strong>NT$ {Number(campaign.budget).toLocaleString()}</strong></div><div><span>實際採購金額</span><strong>NT$ {spent.toLocaleString()}</strong></div><div className={remaining < 0 ? "negative" : ""}><span>{remaining < 0 ? "超出預算" : "預算餘額"}</span><strong>NT$ {Math.abs(remaining).toLocaleString()}</strong></div></div>}</section>; }
function EmployeePageIntro({ kicker, title, description }: {
    kicker: string;
    title: string;
    description: string;
}) { return <section className="employee-page-intro"><p className="section-kicker">{kicker}</p><h1>{title}</h1><p>{description}</p></section>; }
function ShellHeader({ employee, children, currentPage = "campaign" }: {
    employee: Employee;
    children: React.ReactNode;
    currentPage?: "campaign" | "history" | "feedback";
}) { const shared = getSessionMode() === "shared"; return <main className="employee-shell"><header className="topbar"><div className="brand"><span className="brand-mark">S</span><div><strong>Snack Vote</strong><small>公司零食共選</small></div></div><nav className="employee-page-nav" aria-label="主要功能"><a href="#/" className={currentPage === "campaign" ? "active" : ""}>本期活動</a><a href="#/history" className={currentPage === "history" ? "active" : ""}>近三期回顧</a><a href="#/feedback" className={currentPage === "feedback" ? "active" : ""}>意見問卷</a></nav><div className="top-actions"><TextSizeControl /><span className={`session-mode ${getSessionMode()}`}>{shared ? "共用電腦模式" : "此瀏覽器已登入"}</span>{employee.role === "admin" && <a href="#/admin">管理後台</a>}<button onClick={() => supabase.auth.signOut()}>登出</button><div className="profile"><span className="avatar">{employee.name.slice(0, 1)}</span><div><strong>{employee.name}</strong><small>{employee.email}{shared ? " · 閒置 30 分鐘自動登出" : ""}</small></div></div></div></header>{children}<footer>商品與價格僅供採購參考，實際售價及庫存以門市為準。</footer></main>; }
function Timeline({ campaign, phase }: {
    campaign: Campaign;
    phase: Phase;
}) { const index = { upcoming: -1, nomination: 0, voting: 1, results: 2, purchase: 3 }[phase]; const items = [["開始", campaign.start_at], ["提名截止", campaign.nomination_deadline], ["投票截止", campaign.voting_deadline], ["安排採購", campaign.purchase_at]]; return <div className="timeline-panel"><div className="milestone-row">{items.map((x, i) => <div key={x[0]} className={`milestone ${i <= index ? "done" : ""} ${i === index ? "current" : ""}`}><span>{i + 1}</span><strong>{x[0]}</strong><small>{shortDate(x[1])}</small></div>)}</div><div className="period-row"><div className={`period ${phase === "nomination" ? "active" : ""}`}><strong>提名階段</strong><small>{shortDate(campaign.start_at)}–{shortDate(campaign.nomination_deadline)}</small></div><div className={`period ${phase === "voting" ? "active" : ""}`}><strong>投票階段</strong><small>{shortDate(campaign.nomination_deadline)}–{shortDate(campaign.voting_deadline)}</small></div><div className={`period ${phase === "results" ? "active" : ""}`}><strong>結果揭曉階段</strong><small>{shortDate(campaign.voting_deadline)}–{shortDate(campaign.purchase_at)}</small></div></div></div>; }
type AdminTab = "overview" | "campaign" | "employees" | "locations" | "products" | "pending" | "purchase" | "budget" | "feedback" | "history";
const adminTabs: {
    id: AdminTab;
    icon: string;
    label: string;
}[] = [{ id: "overview", icon: "⌂", label: "管理總覽" }, { id: "campaign", icon: "◫", label: "活動管理" }, { id: "employees", icon: "◎", label: "員工名單" }, { id: "locations", icon: "⌖", label: "上班地點" }, { id: "products", icon: "▦", label: "商品資料庫" }, { id: "pending", icon: "◇", label: "待審商品" }, { id: "purchase", icon: "✓", label: "採購清單" }, { id: "budget", icon: "◒", label: "預算分析" }, { id: "feedback", icon: "✦", label: "意見回饋" }, { id: "history", icon: "↺", label: "歷史紀錄" }];
function AdminApp({ employee }: {
    employee: Employee;
}) {
    const { ask: askConfirm, element: confirmElement } = useConfirmDialog();
    const [tab, setTab] = useState<AdminTab>("overview");
    const [newProductLocationIds, setNewProductLocationIds] = useState<string[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [workLocations, setWorkLocations] = useState<WorkLocation[]>([]);
    const [employeeLocations, setEmployeeLocations] = useState<EmployeeLocation[]>([]);
    const [campaignLocations, setCampaignLocations] = useState<CampaignLocation[]>([]);
    const [productLocations, setProductLocations] = useState<ProductLocation[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
    const [purchaseCampaignId, setPurchaseCampaignId] = useState<string | null>(null);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
    const [members, setMembers] = useState<CampaignMember[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
    const [nominations, setNominations] = useState<Nomination[]>([]);
    const [votes, setVotes] = useState<Vote[]>([]);
    const [comments, setComments] = useState<Comment[]>([]);
    const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
    const [feedbackSubmissions, setFeedbackSubmissions] = useState<FeedbackSubmission[]>([]);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [employeeLocationIds, setEmployeeLocationIds] = useState<string[]>([]);
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [emailingEmployeeId, setEmailingEmployeeId] = useState<string | null>(null);
    const [sentEmployeeIds, setSentEmployeeIds] = useState<Set<string>>(() => new Set());
    const [newCampaign, setNewCampaign] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const now = Date.now();
    const latest = campaigns.find(c => c.id === selectedCampaignId) ?? campaigns.find(c => c.status === "active" && +new Date(c.start_at) <= now) ?? campaigns.find(c => c.status === "active") ?? campaigns[0] ?? null;
    const campaignForForm = editingCampaign ?? latest;
    const catalogProducts = products.filter(p => !p.deleted_at);
    const pending = catalogProducts.filter(p => p.approval_status === "pending");
    const purchaseCampaigns = campaigns.filter(c => { if (c.status === "draft")
        return false; const rows = purchases.filter(row => row.campaign_id === c.id && Number(row.final_quantity ?? row.suggested_quantity) > 0); return c.status === "active" || (rows.length > 0 && !rows.every(row => row.purchased)) || c.id === purchaseCampaignId; }).sort((a, b) => { const aRows = purchases.filter(row => row.campaign_id === a.id && Number(row.final_quantity ?? row.suggested_quantity) > 0); const bRows = purchases.filter(row => row.campaign_id === b.id && Number(row.final_quantity ?? row.suggested_quantity) > 0); const aPending = aRows.length > 0 && !aRows.every(row => row.purchased); const bPending = bRows.length > 0 && !bRows.every(row => row.purchased); return Number(bPending) - Number(aPending) || +new Date(a.purchase_at) - +new Date(b.purchase_at); });
    const purchaseCampaign = campaigns.find(c => c.id === purchaseCampaignId) ?? purchaseCampaigns[0] ?? campaigns.find(c => c.status !== "draft") ?? null;
    const load = useCallback(async () => { const [{ data: e }, { data: l }, { data: el }, { data: cl }, { data: pl }, { data: c }, { data: m }, { data: p }, { data: ca }, { data: n }, { data: v }, { data: co }, { data: pi }, { data: fb }] = await Promise.all([supabase.from("employees").select("id,user_id,name,email,role,active,work_location_id").order("name"), supabase.from("work_locations").select("id,name,active").order("name"), supabase.from("employee_work_locations").select("employee_id,work_location_id"), supabase.from("campaign_work_locations").select("campaign_id,work_location_id"), supabase.from("product_work_locations").select("product_id,work_location_id"), supabase.from("campaigns").select("*").order("start_at", { ascending: false }), supabase.from("campaign_members").select("*").order("name_snapshot"), supabase.from("products").select("*").order("category"), supabase.from("product_categories").select("id,name,sort_order").order("sort_order").order("name"), supabase.from("nominations").select("*").order("created_at"), supabase.from("votes").select("*").order("created_at"), supabase.from("comments").select("*").is("deleted_at", null).order("created_at"), supabase.from("purchase_items").select("*").order("rank"), supabase.from("feedback_submissions").select("*").order("created_at", { ascending: false })]); setEmployees((e ?? []) as Employee[]); setWorkLocations((l ?? []) as WorkLocation[]); setEmployeeLocations((el ?? []) as EmployeeLocation[]); setCampaignLocations((cl ?? []) as CampaignLocation[]); setProductLocations((pl ?? []) as ProductLocation[]); setCampaigns((c ?? []) as Campaign[]); setMembers((m ?? []) as CampaignMember[]); setProducts((p ?? []) as Product[]); setProductCategories((ca ?? []) as ProductCategory[]); setNominations((n ?? []) as Nomination[]); setVotes((v ?? []) as Vote[]); setComments((co ?? []) as Comment[]); setPurchases((pi ?? []) as PurchaseItem[]); setFeedbackSubmissions((fb ?? []) as FeedbackSubmission[]); }, []);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => { if (tab !== "purchase" || !purchaseCampaign)
        return; if (!purchaseCampaignId || !campaigns.some(c => c.id === purchaseCampaignId))
        setPurchaseCampaignId(purchaseCampaign.id); }, [tab, purchaseCampaign?.id, purchaseCampaignId, campaigns]);
    useEffect(() => { if (tab !== "products")
        return; const form = document.querySelector<HTMLFormElement>("form.product-form-with-image"); if (!form)
        return; const draft = readFormDraft("snack-vote-admin-product-draft"); Object.entries(draft).forEach(([name, value]) => { const field = form.elements.namedItem(name); if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
        if (field.type !== "file")
            field.value = value;
    } }); const save = () => saveFormDraft("snack-vote-admin-product-draft", form); form.addEventListener("input", save); form.addEventListener("change", save); return () => { form.removeEventListener("input", save); form.removeEventListener("change", save); }; }, [tab]);
    useEffect(() => { const campaignId = purchaseCampaign?.id; if (tab !== "purchase" || !campaignId)
        return; let timer: number | undefined; const refresh = () => { window.clearTimeout(timer); timer = window.setTimeout(async () => { const { data, error } = await supabase.from("purchase_items").select("*").eq("campaign_id", campaignId).order("rank").order("product_id"); if (error)
        return; setPurchases(current => [...current.filter(row => row.campaign_id !== campaignId), ...((data ?? []) as PurchaseItem[])]); }, 180); }; const channel = supabase.channel(`admin-purchase-plan-${campaignId}`).on("postgres_changes", { event: "*", schema: "public", table: "purchase_items" }, refresh).subscribe(); return () => { window.clearTimeout(timer); void supabase.removeChannel(channel); }; }, [tab, purchaseCampaign?.id]);
    function flash(text: string) { setMessage(text); window.setTimeout(() => setMessage(""), 3500); }
    async function addEmployee(e: FormEvent) { e.preventDefault(); if (!employeeLocationIds.length)
        return flash("請至少選擇一個上班地點"); setBusy(true); const created = await supabase.from("employees").insert({ name: name.trim(), email: email.trim().toLowerCase(), role: "employee", work_location_id: employeeLocationIds[0] }).select("id").single(); if (created.error) {
        setBusy(false);
        return flash(created.error.message);
    } const assigned = await supabase.rpc("set_employee_locations", { p_employee_id: created.data.id, p_location_ids: employeeLocationIds }); setBusy(false); if (assigned.error)
        return flash(assigned.error.message); setName(""); setEmail(""); setEmployeeLocationIds([]); flash("員工已新增，可請對方使用 Email 驗證碼登入"); await load(); }
    async function sendLoginEmail(row: Employee) { if (!row.active)
        return flash("請先重新啟用這位員工，再寄送驗證碼"); setEmailingEmployeeId(row.id); const { error } = await supabase.auth.signInWithOtp({ email: row.email, options: { shouldCreateUser: true, emailRedirectTo: appEntryUrl() } }); setEmailingEmployeeId(null); if (error)
        return flash(error.message.includes("rate limit") ? "寄信次數過於頻繁，請稍後再試" : error.message); setSentEmployeeIds(previous => new Set(previous).add(row.id)); flash(`已寄送登入驗證碼給 ${row.name}`); }
    async function revokeEmployeeSessions(row: Employee) { if (!row.user_id)
        return flash("這位員工尚未登入過，沒有可撤銷的工作階段"); if (row.id === employee.id)
        return flash("不能從這裡撤銷目前登入的管理者工作階段"); if (!await askConfirm({ title: `要求 ${row.name} 重新登入？`, items: ["此帳號在其他電腦與瀏覽器的登入工作階段都會失效。", "員工下次使用時必須重新收取 Email 驗證碼登入。"], confirmLabel: "撤銷所有登入", danger: true }))
        return; setBusy(true); const { error } = await supabase.functions.invoke("revoke-user-session", { body: { employeeId: row.id } }); setBusy(false); if (error)
        return flash(`撤銷失敗：${error.message}`); flash(`${row.name} 的登入工作階段已全部撤銷`); }
    async function updateEmployee(row: Employee, patch: Partial<Employee>) { if (row.id === employee.id && patch.active === false)
        return flash("不能停用目前登入的管理者"); const { error } = await supabase.from("employees").update(patch).eq("id", row.id); if (error)
        flash(error.message);
    else
        await load(); }
    async function updateEmployeeLocations(row: Employee, ids: string[]) { if (!ids.length)
        return flash("每位同仁至少需要一個上班地點"); const { error } = await supabase.rpc("set_employee_locations", { p_employee_id: row.id, p_location_ids: ids }); if (error)
        return flash(error.message); flash(`${row.name} 的上班地點已更新`); await load(); }
    async function addLocation(locationName: string) { const clean = locationName.trim(); if (!clean)
        return; const { error } = await supabase.from("work_locations").insert({ name: clean }); if (error)
        return flash(error.code === "23505" ? "已有同名地點" : error.message); flash(`已新增「${clean}」`); await load(); }
    async function renameLocation(row: WorkLocation, newName: string) { const clean = newName.trim(); if (!clean || clean === row.name)
        return; const { error } = await supabase.from("work_locations").update({ name: clean }).eq("id", row.id); if (error)
        return flash(error.code === "23505" ? "已有同名地點" : error.message); flash("上班地點已更新"); await load(); }
    async function deleteLocation(row: WorkLocation) { if (!await askConfirm({ title: `刪除「${row.name}」？`, items: ["只有未分配員工、且沒有活動紀錄的地點可以刪除。"], confirmLabel: "確認刪除", danger: true }))
        return; const { error } = await supabase.rpc("delete_work_location", { p_location_id: row.id }); if (error)
        return flash(error.message.includes("LOCATION_HAS_EMPLOYEES") ? "仍有員工屬於此地點，請先調整員工地點" : error.message.includes("LOCATION_HAS_CAMPAIGNS") ? "此地點已有活動紀錄，因此不可刪除；可改為停用" : error.message.includes("LOCATION_HAS_PRODUCTS") ? "仍有商品適用於此地點，請先調整商品地點" : error.message); flash("上班地點已刪除"); await load(); }
    async function toggleLocation(row: WorkLocation) { const { error } = await supabase.from("work_locations").update({ active: !row.active }).eq("id", row.id); if (error)
        return flash(error.message); flash(row.active ? "上班地點已停用；既有活動與員工資料仍保留" : "上班地點已重新啟用"); await load(); }
    async function saveCampaign(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form = new FormData(e.currentTarget); const id = String(form.get("id") || ""); const wasNew = !id; const previous = campaigns.find(c => c.id === id); const previousLocationIds = campaignLocations.filter(row => row.campaign_id === id).map(row => row.work_location_id); const locationIds = form.getAll("location_ids").map(String); const baseBudget = Number(form.get("budget")); const workLocationId = locationIds[0] || ""; const locationChanged = Boolean(previous && (previousLocationIds.length !== locationIds.length || previousLocationIds.some(locationId => !locationIds.includes(locationId)))); const carryoverEnabled = form.get("carryover_enabled") === "true"; const retainUnusedBudget = form.get("retain_unused_budget") === "true"; const nominationLimit = Number(form.get("nomination_limit")); const voteLimit = Number(form.get("vote_limit")); if (!locationIds.length)
        return flash("請至少選擇一個活動地點"); if (!Number.isSafeInteger(baseBudget) || baseBudget < 0)
        return flash("預算必須是 0 以上的整數"); if (!Number.isInteger(nominationLimit) || !Number.isInteger(voteLimit) || nominationLimit < 1 || voteLimit < nominationLimit)
        return flash("總票數不可少於提名上限"); const startAt = new Date(String(form.get("start_at"))).toISOString(); let carryoverAmount = 0; let carryoverFrom: string | null = null; let carryoverLabel = ""; let carryoverAvailable = true; if (carryoverEnabled) {
        const carry = await supabase.rpc("calculate_campaign_carryover", { p_start_at: startAt, p_work_location_id: workLocationId, p_exclude_campaign_id: id || null });
        if (carry.error)
            return flash(carry.error.message);
        const detail = carry.data as {
            campaign_id: string | null;
            label: string | null;
            remaining: number;
            retained: boolean;
        };
        carryoverAmount = Number(detail.remaining) || 0;
        carryoverFrom = detail.campaign_id;
        carryoverLabel = detail.label ?? "";
        carryoverAvailable = detail.retained;
    } const totalBudget = baseBudget + carryoverAmount; const useBreakdown = carryoverEnabled ? (carryoverAvailable ? `基本預算 NT$ ${baseBudget.toLocaleString()}＋${carryoverLabel || "同地點上期"}保留款 NT$ ${carryoverAmount.toLocaleString()}＝可用 NT$ ${totalBudget.toLocaleString()}` : `已選擇使用同地點上期保留款，但${carryoverLabel || "上一期"}未選擇保留，因此本期沒有結轉金額`) : `本期不使用上期保留款，可用 NT$ ${baseBudget.toLocaleString()}`; const retainBreakdown = retainUnusedBudget ? "本期未用餘額會保留給同地點下一期" : "本期未用餘額不保留"; const locationBreakdown = locationChanged ? "活動地點變更後，參與名單會依新地點重新整理；既有提名、投票、留言與採購紀錄不會刪除。" : null; if (!await askConfirm({ title: `確認${wasNew ? "新一期" : "活動"}設定`, items: [useBreakdown, retainBreakdown, ...(locationBreakdown ? [locationBreakdown] : [])], confirmLabel: "確認並儲存" }))
        return; setBusy(true); const payload = { label: String(form.get("label")), description: String(form.get("description") || "").trim(), budget: totalBudget, base_budget: baseBudget, carryover_enabled: carryoverEnabled, retain_unused_budget: retainUnusedBudget, carryover_amount: carryoverAmount, carryover_from: carryoverFrom, work_location_id: workLocationId, nomination_limit: nominationLimit, vote_limit: voteLimit, start_at: startAt, nomination_deadline: new Date(String(form.get("nomination_deadline"))).toISOString(), voting_deadline: new Date(String(form.get("voting_deadline"))).toISOString(), purchase_at: new Date(String(form.get("purchase_at"))).toISOString(), status: String(form.get("status")), created_by: employee.id }; const result = id ? await supabase.from("campaigns").update(payload).eq("id", id).select("id").single() : await supabase.from("campaigns").insert(payload).select("id").single(); if (result.error) {
        setBusy(false);
        return flash(result.error.message);
    } const savedId = result.data.id; const locationResult = await supabase.rpc("set_campaign_locations", { p_campaign_id: savedId, p_location_ids: locationIds }); if (locationResult.error) { setBusy(false); return flash(locationResult.error.message); } if (wasNew || locationChanged) {
        const snap = await supabase.rpc("snapshot_active_employees", { p_campaign_id: savedId });
        if (snap.error) {
            setBusy(false);
            return flash(snap.error.message);
        }
    } setBusy(false); setNewCampaign(false); setEditingCampaign(null); setSelectedCampaignId(savedId); flash(`活動設定已更新；可用預算為 NT$ ${totalBudget.toLocaleString()}${locationChanged ? "，參與名單已依新地點重整" : ""}`); await load(); }
    async function addProduct(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setBusy(true);
        const form = new FormData(e.currentTarget);
        const locationIds = form.getAll("product_location_ids").map(String);
        if (!locationIds.length) { setBusy(false); return flash("請至少選擇一個商品適用地點"); }
        try {
            const image = form.get("image");
            const imagePath = image instanceof File && image.size > 0 ? await uploadProductImage(image, employee.id) : null;
            const payload = { brand: String(form.get("brand")).trim(), name: String(form.get("name")).trim(), category: String(form.get("category")).trim(), size: String(form.get("size")).trim(), reference_price: form.get("reference_price") ? Number(form.get("reference_price")) : null, image_path: imagePath, origin: "catalog", approval_status: "approved", active: true };
            const created = await supabase.from("products").insert(payload).select("id").single();
            if (created.error) throw created.error;
            const assigned = await supabase.rpc("set_product_locations", { p_product_id: created.data.id, p_location_ids: locationIds });
            if (assigned.error) throw assigned.error;
            sessionStorage.removeItem("snack-vote-admin-product-draft");
            e.currentTarget.reset();
            setNewProductLocationIds([]);
            flash("商品已加入資料庫");
            await load();
        } catch (error) { flash(errorText(error)); } finally { setBusy(false); }
    }
    async function addStarterProducts() { const existing = new Set(products.filter(p => p.active).map(p => `${p.brand.trim().toLowerCase()}|${p.name.trim().toLowerCase()}|${p.size.trim().toLowerCase()}`)); const rows = starterProducts.filter(([brand, name, , size]) => !existing.has(`${brand.toLowerCase()}|${name.toLowerCase()}|${size.toLowerCase()}`)).map(([brand, name, category, size]) => ({ brand, name, category, size, reference_price: null, source_url: null, origin: "catalog", approval_status: "approved", active: true })); if (!rows.length)
        return flash("基礎商品都已經在資料庫中"); if (!await askConfirm({ title: "加入基礎商品", items: [`將加入 ${rows.length} 項基礎商品。`, `價格會先標示為待確認，可再逐項補充。`], confirmLabel: "確認加入" }))
        return; setBusy(true); const existingCategories = new Set(productCategories.map(c => c.name)); const missingCategories = [...new Set(rows.map(r => r.category))].filter(category => !existingCategories.has(category)); if (missingCategories.length) {
        const categoryResult = await supabase.from("product_categories").insert(missingCategories.map((category, index) => ({ name: category, sort_order: (productCategories.at(-1)?.sort_order ?? 0) + (index + 1) * 10 })));
        if (categoryResult.error) {
            setBusy(false);
            return flash(categoryResult.error.message);
        }
    } const created = await supabase.from("products").insert(rows).select("id"); if (created.error) { setBusy(false); return flash(created.error.message); } const activeLocationIds = workLocations.filter(row => row.active).map(row => row.id); if (activeLocationIds.length && created.data?.length) { const links = created.data.flatMap(product => activeLocationIds.map(work_location_id => ({ product_id: product.id, work_location_id }))); const linked = await supabase.from("product_work_locations").insert(links); if (linked.error) { setBusy(false); return flash(linked.error.message); } } setBusy(false); flash(`已加入 ${rows.length} 項基礎商品，適用於所有啟用地點`); await load(); }
    async function addCategory(categoryName: string) { const clean = categoryName.trim(); if (!clean)
        return; setBusy(true); const nextOrder = (productCategories.at(-1)?.sort_order ?? 0) + 10; const { error } = await supabase.from("product_categories").insert({ name: clean, sort_order: nextOrder }); setBusy(false); if (error)
        return flash(error.code === "23505" ? "已有同名類別" : error.message); flash(`已新增「${clean}」類別`); await load(); }
    async function renameCategory(row: ProductCategory, newName: string) { const clean = newName.trim(); if (!clean || clean === row.name)
        return; setBusy(true); const { error } = await supabase.rpc("rename_product_category", { p_category_id: row.id, p_new_name: clean }); setBusy(false); if (error)
        return flash(error.message.includes("CATEGORY_ALREADY_EXISTS") ? "已有同名類別" : error.message); flash(`類別已改名為「${clean}」，相關商品已同步更新`); await load(); }
    async function deleteCategory(row: ProductCategory) { const related = catalogProducts.filter(p => p.category === row.name); const relatedIds = new Set(related.map(p => p.id)); const activeCampaignIds = new Set(campaigns.filter(c => c.status === "active").map(c => c.id)); const used = [...nominations, ...votes].some(x => activeCampaignIds.has(x.campaign_id) && relatedIds.has(x.product_id)); if (used)
        return flash("此類別的商品已在進行中的活動被提名或投票，因此不可刪除"); const warning = related.length ? `刪除「${row.name}」會一併刪除其中 ${related.length} 項商品。過往活動紀錄仍會保留。確定刪除嗎？` : `確定刪除空白類別「${row.name}」嗎？`; if (!await askConfirm({ title: `刪除「${row.name}」類別`, items: [warning.replace("確定刪除嗎？", "").replace(`確定刪除空白類別「${row.name}」嗎？`, `這個類別目前沒有商品。`)], confirmLabel: "確認刪除", danger: true }))
        return; setBusy(true); const { data, error } = await supabase.rpc("delete_product_category", { p_category_id: row.id }); setBusy(false); if (error)
        return flash(error.message.includes("CATEGORY_IN_USE_CURRENT_CAMPAIGN") ? "此類別的商品已在進行中的活動被提名或投票，因此不可刪除" : error.message); flash(`已刪除「${row.name}」與 ${data ?? related.length} 項商品`); await load(); }
    async function updateProduct(id: string, patch: Record<string, unknown>, success: string) { const { error } = await supabase.from("products").update(patch).eq("id", id); if (error)
        flash(error.message);
    else {
        flash(success);
        await load();
    } }
    async function replaceProductImage(product: Product, file: File) { try {
        setBusy(true);
        const path = await uploadProductImage(file, employee.id);
        const { error } = await supabase.rpc("set_product_image", { p_product_id: product.id, p_image_path: path });
        if (error)
            throw error;
        flash("商品圖片已更新");
        await load();
    }
    catch (error) {
        flash(errorText(error));
    }
    finally {
        setBusy(false);
    } }
    async function savePendingProductLocations(product: Product, locationIds: string[]) {
        if (!locationIds.length) {
            flash("請至少選擇一個商品適用地點");
            return false;
        }
        setBusy(true);
        const { error } = await supabase.rpc("set_product_locations", { p_product_id: product.id, p_location_ids: locationIds });
        setBusy(false);
        if (error) {
            flash(error.message);
            return false;
        }
        flash("待審商品的適用地點已更新");
        await load();
        return true;
    }
    async function reviewProduct(product: Product, decision: "approved" | "rejected", locationIds?: string[]) {
        if (decision === "rejected" && !await askConfirm({ title: `退回「${product.name}」`, items: [`相關提名與固定票會立即移除。`, `受影響同仁的提名名額與票數會自動返還。`], confirmLabel: "確認退回", danger: true }))
            return;
        if (decision === "approved" && locationIds) {
            const currentIds = productLocations.filter(row => row.product_id === product.id).map(row => row.work_location_id).sort();
            const nextIds = [...locationIds].sort();
            if (!nextIds.length)
                return flash("請至少選擇一個商品適用地點，再核准商品");
            if (currentIds.join("|") !== nextIds.join("|")) {
                const saved = await savePendingProductLocations(product, nextIds);
                if (!saved)
                    return;
            }
        }
        setBusy(true);
        const { data, error } = await supabase.rpc("review_product", { p_product_id: product.id, p_decision: decision });
        setBusy(false);
        if (error)
            return flash(error.message.includes("PRODUCT_LOCATION_REQUIRED") ? "請先設定至少一個商品適用地點，再核准商品" : error.message);
        flash(decision === "approved" ? "商品已核准並加入商品庫" : `商品已退回，已返還 ${data ?? 0} 筆提名與固定票`);
        await load();
    }
    function editProduct(product: Product) { setEditingProduct(product); }
    async function saveEditedProduct(form: FormData, image: File | null) { if (!editingProduct)
        return; try {
        setBusy(true);
        let imagePath = editingProduct.image_path;
        if (image) {
            imagePath = await uploadProductImage(image, employee.id);
        }
        const payload = { brand: String(form.get("brand") || "").trim(), name: String(form.get("name") || "").trim(), category: String(form.get("category") || "").trim(), size: String(form.get("size") || "").trim(), reference_price: form.get("reference_price") ? Number(form.get("reference_price")) : null, image_path: imagePath, active: String(form.get("active")) === "true" };
        const { error } = await supabase.from("products").update(payload).eq("id", editingProduct.id);
        if (error)
            throw error;
        const locationIds = form.getAll("location_ids").map(String);
        const assigned = await supabase.rpc("set_product_locations", { p_product_id: editingProduct.id, p_location_ids: locationIds });
        if (assigned.error)
            throw assigned.error;
        setEditingProduct(null);
        flash("商品資料已完整更新");
        await load();
    }
    catch (error) {
        flash(errorText(error));
    }
    finally {
        setBusy(false);
    } }
    async function generatePurchase() { if (!purchaseCampaign)
        return flash("請先選擇採購活動"); setBusy(true); const { data, error } = await supabase.rpc("generate_purchase_plan", { p_campaign_id: purchaseCampaign.id }); setBusy(false); if (error)
        return flash(error.message); const result = data as {
        remaining: number;
        missing_prices: number;
    }; flash(result.missing_prices ? `${purchaseCampaign.label} 清單已產生；${result.missing_prices} 項尚未設定價格，因此未配置數量` : `${purchaseCampaign.label} 清單已產生，預算餘額 NT$ ${Number(result.remaining).toLocaleString()}`); await load(); }
    async function updatePurchase(row: PurchaseItem, patch: Partial<PurchaseItem>) { const { error } = await supabase.from("purchase_items").update(patch).eq("id", row.id); if (error) {
        flash(error.message);
        return false;
    } setPurchases(current => current.map(item => item.id === row.id ? { ...item, ...patch } : item)); return true; }
    async function setPurchasePlanLocked(locked: boolean) { if (!purchaseCampaign)
        return; if (locked && !purchases.some(row => row.campaign_id === purchaseCampaign.id))
        return flash("請先產生採購建議"); const confirmed = await askConfirm(locked ? { title: `鎖定「${purchaseCampaign.label}」採購清單？`, items: ["只會鎖定目前選擇的活動，不影響其他地點或期別。", "鎖定後單價、數量與排名會固定；仍可逐項標記是否已採購。"], confirmLabel: "確認鎖定" } : { title: `解鎖「${purchaseCampaign.label}」採購清單？`, items: ["只會解鎖目前選擇的活動。", "既有清單與已採購標記都會保留。"], confirmLabel: "確認解鎖", danger: true }); if (!confirmed)
        return; setBusy(true); const { error } = await supabase.rpc("set_purchase_plan_lock", { p_campaign_id: purchaseCampaign.id, p_locked: locked }); setBusy(false); if (error)
        return flash(error.message); flash(locked ? `${purchaseCampaign.label} 採購清單已鎖定` : `${purchaseCampaign.label} 採購清單已解鎖`); await load(); }
    async function updateExpectedArrival(value: string) { if (!purchaseCampaign?.purchase_plan_locked_at)
        return false; const next = value || null; const { error } = await supabase.from("campaigns").update({ purchase_expected_arrival_date: next }).eq("id", purchaseCampaign.id); if (error) {
        flash(error.message);
        return false;
    } setCampaigns(current => current.map(row => row.id === purchaseCampaign.id ? { ...row, purchase_expected_arrival_date: next } : row)); flash(next ? `${purchaseCampaign.label} 預計到貨日期已更新` : "已清除預計到貨日期"); return true; }
    async function toggleCampaignMember(row: Employee) { if (!campaignForForm)
        return; const current = members.find(m => m.campaign_id === campaignForForm.id && m.employee_id === row.id); const active = !(current?.active ?? false); const result = current ? await supabase.from("campaign_members").update({ active }).eq("id", current.id) : await supabase.from("campaign_members").insert({ campaign_id: campaignForForm.id, employee_id: row.id, name_snapshot: row.name, email_snapshot: row.email, active }); if (result.error)
        flash(result.error.message);
    else {
        flash(active ? `${row.name} 已加入本期` : `${row.name} 已從本期排除`);
        await load();
    } }
    async function markFeedbackRead(row: FeedbackSubmission) { if (row.status !== "unread")
        return; const { error } = await supabase.from("feedback_submissions").update({ status: "read", read_at: new Date().toISOString() }).eq("id", row.id); if (error)
        return flash(error.message); setFeedbackSubmissions(current => current.map(item => item.id === row.id ? { ...item, status: "read", read_at: new Date().toISOString() } : item)); }
    async function replyFeedback(row: FeedbackSubmission, reply: string, close = false) { const clean = reply.trim(); if (!clean && !close)
        return flash("請先輸入管理者回覆"); const now = new Date().toISOString(); const patch = { status: close ? "closed" : "replied", read_at: row.read_at ?? now, admin_reply: clean || row.admin_reply, replied_at: clean ? now : row.replied_at, replied_by: clean ? employee.id : row.replied_by }; const { error } = await supabase.from("feedback_submissions").update(patch).eq("id", row.id); if (error)
        return flash(error.message); flash(close ? "意見已標記結案" : "管理者回覆已儲存"); await load(); }
    async function forceDeleteCampaign(row: Campaign) { const nominationCount = nominations.filter(x => x.campaign_id === row.id).length; const voteCount = votes.filter(x => x.campaign_id === row.id).length; const commentCount = comments.filter(x => x.campaign_id === row.id).length; const purchaseCount = purchases.filter(x => x.campaign_id === row.id).length; if (!await askConfirm({ title: `強制刪除「${row.label}」？`, items: [`將永久刪除 ${nominationCount} 筆提名、${voteCount} 票、${commentCount} 則留言與 ${purchaseCount} 筆採購項目。`, `活動參與名單、寄信紀錄也會一併刪除；商品與員工資料不受影響。`], confirmLabel: "繼續確認", danger: true }))
        return; if (!await askConfirm({ title: "最後確認：此操作無法復原", items: [`確定永久刪除「${row.label}」？`, `若只是暫時不顯示，應改為封存而不是刪除。`], confirmLabel: "永久刪除活動", danger: true }))
        return; setBusy(true); const { error } = await supabase.rpc("force_delete_campaign", { p_campaign_id: row.id, p_expected_label: row.label }); setBusy(false); if (error)
        return flash(error.message.includes("CAMPAIGN_LABEL_MISMATCH") ? "活動名稱驗證失敗，請重新整理後再試" : error.message); if (selectedCampaignId === row.id)
        setSelectedCampaignId(null); if (editingCampaign?.id === row.id)
        setEditingCampaign(null); flash(`已永久刪除「${row.label}」及其活動資料`); await load(); }
    const title = adminTabs.find(x => x.id === tab)?.label ?? "管理總覽";
    return <main className="admin-shell"><aside className="admin-nav"><div className="brand admin-brand"><span className="brand-mark">S</span><div><strong>Snack Vote</strong><small>管理後台</small></div></div><nav>{adminTabs.map(item => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><span>{item.icon}</span>{item.label}{item.id === "pending" && pending.length > 0 && <b className="nav-badge">{pending.length}</b>}</button>)}<a href="#/"><button><span>←</span>回員工頁面</button></a></nav><div className="admin-user"><span className="avatar">{employee.name.slice(0, 1)}</span><div><strong>{employee.name}</strong><small>系統管理者</small></div></div></aside><section className="admin-main"><header className="admin-top"><div><p className="section-kicker">ADMIN CONSOLE</p><h1>{title}</h1></div><div className="admin-status"><TextSizeControl /><span className={`session-mode ${getSessionMode()}`}>{getSessionMode() === "shared" ? "共用電腦模式" : "此瀏覽器已登入"}</span>{latest && <span className={`status-pill ${phaseOf(latest)}`}>{latest.label} · {phaseLabel(phaseOf(latest))}</span>}<button className="table-action" onClick={() => supabase.auth.signOut()}>登出</button></div></header>{message && <div className="admin-toast">{message}</div>}<div className="admin-content">
    {tab === "overview" && <><div className="stat-grid"><article><span>啟用員工</span><strong>{employees.filter(e => e.active).length}</strong><small>人</small></article><article><span>活動紀錄</span><strong>{campaigns.length}</strong><small>期</small></article><article><span>啟用商品</span><strong>{catalogProducts.filter(p => p.active && p.approval_status === "approved").length}</strong><small>項</small></article><article><span>待審商品</span><strong>{pending.length}</strong><small>項</small></article></div><div className="admin-two"><section className="admin-card"><div className="card-title"><div><p className="section-kicker">CURRENT CAMPAIGN</p><h2>{latest?.label ?? "尚未建立本期活動"}</h2></div>{latest && <button onClick={() => setTab("campaign")}>編輯設定 →</button>}</div>{latest ? <><Timeline campaign={latest} phase={phaseOf(latest)}/><div className="rule-note"><strong>本期規則</strong><span>預算 NT$ {Number(latest.budget).toLocaleString()} · 每人提名 {latest.nomination_limit} 項 · 共 {latest.vote_limit} 票</span></div></> : <div className="admin-empty"><button className="solid-button" onClick={() => setTab("campaign")}>建立第一期活動</button></div>}</section><section className="admin-card"><div className="card-title"><div><p className="section-kicker">QUICK ACTIONS</p><h2>接下來要處理</h2></div></div><div className="quick-list"><button onClick={() => setTab("pending")}><strong>{pending.length}</strong><span>筆待審商品</span><em>前往審核 →</em></button><button onClick={() => setTab("purchase")}><strong>{latest ? votes.filter(v => v.campaign_id === latest.id).length : 0}</strong><span>張本期票數</span><em>安排採購 →</em></button><button onClick={() => setTab("employees")}><strong>{employees.filter(e => e.active).length}</strong><span>位啟用員工</span><em>管理名單 →</em></button></div></section></div></>}
    {tab === "campaign" && <><div className="section-actions"><div><p>{newCampaign ? "設定新一期活動；既有活動會保留在歷史紀錄。" : "目前顯示啟用中的本期活動；此處金額與採購清單使用同一筆資料。"}</p>{!newCampaign && <select className="campaign-switch" value={campaignForForm?.id ?? ""} onChange={e => { setSelectedCampaignId(e.target.value); setEditingCampaign(null); }}>{campaigns.map(c => <option key={c.id} value={c.id}>{locationNames(campaignLocations.filter(row => row.campaign_id === c.id).map(row => row.work_location_id), workLocations)}｜{c.label}</option>)}</select>}</div><button className="solid-button" onClick={() => { setNewCampaign(x => !x); setEditingCampaign(null); }}>{newCampaign ? "取消建立新活動" : "＋ 建立下一期"}</button></div><CampaignForm key={newCampaign ? "new" : campaignForForm ? `${campaignForForm.id}:${campaignForForm.description}:${campaignForForm.base_budget}:${campaignForForm.carryover_enabled}:${campaignForForm.retain_unused_budget}:${campaignForForm.carryover_amount}:${campaignForForm.budget}:${campaignForForm.start_at}:${campaignForForm.nomination_deadline}:${campaignForForm.voting_deadline}:${campaignForForm.purchase_at}:${campaignForForm.nomination_limit}:${campaignForForm.vote_limit}:${campaignForForm.status}` : "empty"} campaign={newCampaign ? null : campaignForForm} locations={workLocations} selectedLocationIds={newCampaign ? [] : campaignLocations.filter(row => row.campaign_id === campaignForForm?.id).map(row => row.work_location_id)} busy={busy} onSubmit={saveCampaign}/>{!newCampaign && campaignForForm && <CampaignMemberPanel campaign={campaignForForm} employees={employees} members={members} employeeLocations={employeeLocations} campaignLocations={campaignLocations} onToggle={toggleCampaignMember}/>}</>}
{tab === "employees" && <section className="admin-card">
      <div className="card-title"><div><p className="section-kicker">EMPLOYEE ROSTER</p><h2>員工名單</h2></div><span className="count-tag">{employees.length} 人</span></div>
      <form className="add-employee multi-location-form" onSubmit={addEmployee}>
        <input required placeholder="姓名" value={name} onChange={e => setName(e.target.value)}/>
        <input required type="email" placeholder="公司 Email" value={email} onChange={e => setEmail(e.target.value)}/>
        <div className="location-field"><span>上班地點（可複選）</span><LocationPicker locations={workLocations} selected={employeeLocationIds} onChange={setEmployeeLocationIds} name="new_employee_locations"/></div>
        <button disabled={busy}>＋ 新增員工</button>
      </form>
      <div className="table-wrap"><table><thead><tr><th>姓名</th><th>Email</th><th>上班地點</th><th>權限</th><th>名單狀態</th><th>登入狀態</th><th>操作</th></tr></thead><tbody>{employees.map(row => {
        const selected = employeeLocations.filter(item => item.employee_id === row.id).map(item => item.work_location_id);
        return <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.email}</td><td className="location-cell"><LocationPicker locations={workLocations} selected={selected} includeInactive onChange={ids => void updateEmployeeLocations(row, ids)} name={`employee_locations_${row.id}`}/></td><td><select value={row.role} onChange={e => updateEmployee(row, { role: e.target.value as Employee["role"] })}><option value="employee">員工</option><option value="admin">管理者</option></select></td><td><span className={row.active ? "active-dot" : "inactive-dot"}>{row.active ? "啟用" : "停用"}</span></td><td><span className={row.user_id ? "login-ready" : "login-pending"}>{row.user_id ? "已登入過" : "尚未登入"}</span></td><td><div className="employee-actions"><button className="table-action" onClick={() => updateEmployee(row, { active: !row.active })}>{row.active ? "停用" : "重新啟用"}</button><button className="table-action email-action" disabled={!row.active || emailingEmployeeId === row.id || sentEmployeeIds.has(row.id)} onClick={() => sendLoginEmail(row)}>{emailingEmployeeId === row.id ? "寄送中…" : sentEmployeeIds.has(row.id) ? "✓ 已寄送" : row.user_id ? "寄送登入信" : "寄送首次登入信"}</button></div></td></tr>;
      })}</tbody></table></div>
    </section>}
    {tab === "locations" && <WorkLocationManager locations={workLocations} employeeLocations={employeeLocations} campaignLocations={campaignLocations} productLocations={productLocations} onAdd={addLocation} onRename={renameLocation} onDelete={deleteLocation} onToggle={toggleLocation}/>} 
{tab === "products" && <>
      <CategoryManager categories={productCategories} products={catalogProducts} nominations={nominations} votes={votes} currentCampaigns={campaigns.filter(c => c.status === "active")} busy={busy} onAdd={addCategory} onRename={renameCategory} onDelete={deleteCategory}/>
      <section className="admin-card"><div className="card-title"><div><p className="section-kicker">ADD PRODUCT</p><h2>新增商品</h2></div><button className="seed-button" disabled={busy} onClick={addStarterProducts}>一鍵加入 {starterProducts.length} 項基礎商品</button></div>
        <form className="product-form product-form-with-image multi-location-form" onSubmit={addProduct}>
          <input name="brand" placeholder="品牌（可空白）"/><input required name="name" placeholder="商品名稱"/>
          <select required name="category" defaultValue=""><option value="" disabled>選擇分類</option>{productCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
          <input name="size" placeholder="規格，例如 100g"/><input name="reference_price" type="number" min="0" step="1" placeholder="參考價格"/>
          <label className="compact-file">選擇商品圖<input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif"/></label>
          <div className="location-field product-location-field"><span>適用地點</span><LocationPicker locations={workLocations} selected={newProductLocationIds} onChange={setNewProductLocationIds} name="product_location_ids"/></div>
          <button disabled={busy}>＋ 加入商品庫</button>
        </form><div className="seed-note">商品可適用多個地點；員工只會看到與本期活動地點相符的商品。</div>
      </section>
      <section className="admin-card"><div className="card-title"><div><p className="section-kicker">PRODUCT CATALOG</p><h2>商品資料庫</h2></div><span className="count-tag">{catalogProducts.length} 項</span></div>
        <div className="table-wrap"><table><thead><tr><th>圖片</th><th>商品</th><th>分類</th><th>適用地點</th><th>參考價</th><th>來源</th><th>狀態</th><th>操作</th></tr></thead><tbody>{catalogProducts.filter(p => p.approval_status !== "pending").map(p => {
          const ids = productLocations.filter(row => row.product_id === p.id).map(row => row.work_location_id);
          return <tr key={p.id}><td>{p.image_path ? <img className="product-thumb" src={productImageUrl(p.image_path)} alt=""/> : <span className="thumb-placeholder">{icons[p.category] ?? "✦"}</span>}</td><td><strong>{p.brand} {p.name}</strong><small className="cell-sub">{p.size || "未填規格"}</small></td><td>{p.category}</td><td>{locationNames(ids, workLocations)}</td><td>{p.reference_price == null ? "待確認" : `NT$ ${p.reference_price}`}</td><td>{p.origin === "employee" ? "同仁新增" : "商品庫"}</td><td><span className={p.active ? "active-dot" : "inactive-dot"}>{p.active ? "啟用" : "停用"}</span></td><td><button className="table-action" onClick={() => editProduct(p)}>修改</button><label className="table-upload">換圖<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => { const file = e.target.files?.[0]; if (file) void replaceProductImage(p, file); }}/></label><button className="table-action" onClick={() => updateProduct(p.id, { active: !p.active }, p.active ? "商品已停用" : "商品已重新啟用")}>{p.active ? "停用" : "啟用"}</button></td></tr>;
        })}</tbody></table></div>
      </section>
    </>}
    {tab === "pending" && <section className="admin-card"><div className="card-title"><div><p className="section-kicker">PRODUCT REVIEW</p><h2>同仁新增商品審核</h2></div><span className="count-tag">{pending.length} 項</span></div>{pending.length ? <div className="review-grid">{pending.map(p => <PendingProductReviewCard key={p.id} product={p} submitterName={p.created_by ? (employees.find(x => x.id === p.created_by)?.name ?? "原新增者已不在名單") : "未記錄"} locations={workLocations} selectedLocationIds={productLocations.filter(row => row.product_id === p.id).map(row => row.work_location_id)} busy={busy} onEdit={() => editProduct(p)} onSaveLocations={ids => savePendingProductLocations(p, ids)} onReview={(decision, ids) => reviewProduct(p, decision, ids)}/>)}</div> : <div className="admin-empty">目前沒有待審商品。</div>}</section>}
    {tab === "purchase" && <><PurchaseCampaignSwitcher campaigns={purchaseCampaigns} selected={purchaseCampaign} locations={workLocations} campaignLocations={campaignLocations} purchases={purchases} onSelect={setPurchaseCampaignId}/><PurchasePanel campaign={purchaseCampaign} products={products} purchases={purchases} busy={busy} onGenerate={generatePurchase} onUpdate={updatePurchase} onSetLocked={setPurchasePlanLocked} onUpdateArrival={updateExpectedArrival}/></>} 
    {tab === "budget" && <BudgetReportPanel campaigns={campaigns} locations={workLocations} purchases={purchases} products={products} votes={votes}/>} 
    {tab === "feedback" && <FeedbackAdminPanel submissions={feedbackSubmissions} onRead={markFeedbackRead} onReply={replyFeedback}/>} 
    {tab === "history" && <HistoryPanel campaigns={campaigns} locations={workLocations} products={products} nominations={nominations} votes={votes} comments={comments} purchases={purchases} onEdit={campaign => { setEditingCampaign(campaign); setSelectedCampaignId(campaign.id); setNewCampaign(false); setTab("campaign"); }} onDelete={forceDeleteCampaign}/>} 
  </div></section>{editingProduct && <ProductEditor product={editingProduct} categories={productCategories} locations={workLocations} selectedLocationIds={productLocations.filter(row => row.product_id === editingProduct.id).map(row => row.work_location_id)} busy={busy} onClose={() => setEditingProduct(null)} onSave={saveEditedProduct}/>} {confirmElement}</main>;
}
function PendingProductReviewCard({ product, submitterName, locations, selectedLocationIds, busy, onEdit, onSaveLocations, onReview }: {
    product: Product;
    submitterName: string;
    locations: WorkLocation[];
    selectedLocationIds: string[];
    busy: boolean;
    onEdit: () => void;
    onSaveLocations: (ids: string[]) => Promise<boolean>;
    onReview: (decision: "approved" | "rejected", ids: string[]) => void;
}) {
    const [locationIds, setLocationIds] = useState(selectedLocationIds);
    useEffect(() => setLocationIds(selectedLocationIds), [selectedLocationIds.join("|")]);
    const normalizedCurrent = [...selectedLocationIds].sort().join("|");
    const normalizedDraft = [...locationIds].sort().join("|");
    const locationChanged = normalizedCurrent !== normalizedDraft;
    return <article className="pending-review-card">
      {product.image_path ? <img className="review-image" src={productImageUrl(product.image_path)} alt={product.name}/> : <div className="review-icon">{icons[product.category] ?? "✦"}</div>}
      <div className="pending-review-content">
        <span>{product.category} · {product.brand || "未填品牌"}</span>
        <h3>{product.name}</h3>
        <p>{product.size || "未填規格"} · {product.reference_price == null ? "價格待確認" : `參考 NT$ ${product.reference_price}`}</p>
        <p className="review-submitter"><b>新增同仁</b><span>{submitterName}</span></p>
        <div className="pending-location-editor">
          <div><b>適用地點</b><small>預設繼承此次活動；核准前可直接調整</small></div>
          <LocationPicker locations={locations} selected={locationIds} onChange={setLocationIds} name={`pending_locations_${product.id}`}/>
          <button type="button" disabled={busy || !locationChanged || !locationIds.length} onClick={() => void onSaveLocations(locationIds)}>{locationChanged ? "儲存地點" : "地點已儲存"}</button>
        </div>
      </div>
      <div className="review-actions">
        <button type="button" onClick={onEdit}>編輯完整資料</button>
        <button type="button" className="approve" disabled={busy || !locationIds.length} onClick={() => onReview("approved", locationIds)}>{locationChanged ? "儲存地點並核准" : "核准"}</button>
        <button type="button" disabled={busy} onClick={() => onReview("rejected", locationIds)}>退回並返還票數</button>
      </div>
    </article>;
}
function phaseLabel(phase: Phase) { return ({ upcoming: "尚未開始", nomination: "提名階段", voting: "投票階段", results: "結果揭曉", purchase: "安排採購" })[phase]; }
function DateTime24Field({ name, label, value }: {
    name: string;
    label: string;
    value: string;
}) {
    const initial = dateTimeInput(value);
    const [date, setDate] = useState(initial.slice(0, 10));
    const [hour, setHour] = useState(initial.slice(11, 13));
    const [minute, setMinute] = useState(initial.slice(14, 16));
    const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
    const minuteOptions = [...new Set([...Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0")), minute])].sort();
    return <label className="datetime-24-field">
    <span>{label}<small>24H</small></span>
    <div className="datetime-24-control">
      <input type="date" required aria-label={`${label}日期`} value={date} onChange={event => setDate(event.target.value)}/>
      <select required aria-label={`${label}小時`} value={hour} onChange={event => setHour(event.target.value)}>{hours.map(value => <option key={value} value={value}>{value}</option>)}</select>
      <i>:</i>
      <select required aria-label={`${label}分鐘`} value={minute} onChange={event => setMinute(event.target.value)}>{minuteOptions.map(value => <option key={value} value={value}>{value}</option>)}</select>
      <input type="hidden" name={name} value={`${date}T${hour}:${minute}`}/>
    </div>
  </label>;
}
function CampaignForm({ campaign, locations, selectedLocationIds, busy, onSubmit }: {
    campaign: Campaign | null;
    locations: WorkLocation[];
    selectedLocationIds: string[];
    busy: boolean;
    onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
    const [retainUnused, setRetainUnused] = useState(campaign?.retain_unused_budget ?? false);
    const [usePrevious, setUsePrevious] = useState(campaign?.carryover_enabled ?? false);
    const [locationIds, setLocationIds] = useState(selectedLocationIds.length ? selectedLocationIds : locations.filter(row => row.active).slice(0, 1).map(row => row.id));
    const base = new Date();
    const defaults = { start: new Date(base.getTime() + 86400000), nomination: new Date(base.getTime() + 8 * 86400000), voting: new Date(base.getTime() + 15 * 86400000), purchase: new Date(base.getTime() + 18 * 86400000) };
    return <section className="admin-card form-card">
      <div className="card-title"><div><p className="section-kicker">CAMPAIGN SETTINGS</p><h2>{campaign ? "編輯本期活動" : "建立本期活動"}</h2></div>{campaign && <span className={`status-pill ${phaseOf(campaign)}`}>{phaseLabel(phaseOf(campaign))}</span>}</div>
      <form onSubmit={onSubmit}>
        <input type="hidden" name="id" value={campaign?.id ?? ""}/>
        <div className="form-grid">
          <label><span>活動名稱</span><input required name="label" defaultValue={campaign?.label ?? `${base.getFullYear()} 年 ${base.getMonth() + 2} 月零食共選`}/></label>
          <div className="location-field"><span>活動適用地點</span><LocationPicker locations={locations} selected={locationIds} onChange={setLocationIds}/><small>可複選；屬於任一所選地點的同仁都能參與，且只會看到適用商品。</small></div>
          <label className="campaign-description-field"><span>活動說明</span><textarea name="description" maxLength={1000} rows={4} defaultValue={campaign?.description ?? ""} placeholder="例如：本期以低糖、獨立包裝為主。"/><small>會醒目顯示在員工首頁。</small></label>
          <label className="campaign-budget-field"><span>每期預算金額</span><div className="input-prefix"><i>NT$</i><input required name="budget" type="number" min="0" step="1" inputMode="numeric" defaultValue={campaign?.base_budget ?? campaign?.budget ?? 5000} onFocus={e => e.currentTarget.select()} onWheel={e => e.currentTarget.blur()}/></div><small>此欄為本期基本預算，不包含上期結轉。</small></label>
          <div className="rollover-field"><span>本期未用預算</span><input type="hidden" name="retain_unused_budget" value={String(retainUnused)}/><button type="button" className={`budget-choice ${retainUnused ? "selected" : ""}`} role="switch" aria-checked={retainUnused} onClick={() => setRetainUnused(x => !x)}><b>↓</b><span><strong>保留至下一期</strong><small>決定本期剩餘的錢是否留下</small></span><em>{retainUnused ? "已開啟" : "不保留"}</em></button></div>
          <div className="rollover-field"><span>上期保留預算</span><input type="hidden" name="carryover_enabled" value={String(usePrevious)}/><button type="button" className={`budget-choice ${usePrevious ? "selected" : ""}`} role="switch" aria-checked={usePrevious} onClick={() => setUsePrevious(x => !x)}><b>＋</b><span><strong>加入本期使用</strong><small>以第一個適用地點的上一期保留款計算</small></span><em>{usePrevious ? "已開啟" : "不使用"}</em></button>{usePrevious && campaign?.carryover_enabled && <p className="rollover-summary">目前使用 NT$ {Number(campaign.carryover_amount).toLocaleString()}，可用總額 NT$ {Number(campaign.budget).toLocaleString()}</p>}</div>
          <DateTime24Field name="start_at" label="開始" value={campaign?.start_at ?? defaults.start.toISOString()}/>
          <DateTime24Field name="nomination_deadline" label="提名截止" value={campaign?.nomination_deadline ?? defaults.nomination.toISOString()}/>
          <DateTime24Field name="voting_deadline" label="投票截止" value={campaign?.voting_deadline ?? defaults.voting.toISOString()}/>
          <DateTime24Field name="purchase_at" label="安排採購" value={campaign?.purchase_at ?? defaults.purchase.toISOString()}/>
          <label><span>每人提名上限</span><input required name="nomination_limit" type="number" min="1" defaultValue={campaign?.nomination_limit ?? 2}/><small>提名項目會各固定占用一票</small></label>
          <label><span>每人總票數上限</span><input required name="vote_limit" type="number" min="1" defaultValue={campaign?.vote_limit ?? 4}/><small>不得少於提名上限</small></label>
          <label><span>發布狀態</span><select name="status" defaultValue={campaign?.status ?? "active"}><option value="draft">草稿（員工不可見）</option><option value="active">啟用</option><option value="archived">封存</option></select></label>
        </div>
        <div className="form-footer"><div className="rule-note"><strong>參與名單</strong><span>建立或變更地點時會依地點交集更新參與名單，之後仍可逐一調整。</span></div><button className="solid-button" disabled={busy}>{busy ? "儲存中…" : "儲存活動設定"}</button></div>
      </form>
    </section>;
}
function CampaignMemberPanel({ campaign, employees, members, employeeLocations, campaignLocations, onToggle }: {
    campaign: Campaign;
    employees: Employee[];
    members: CampaignMember[];
    employeeLocations: EmployeeLocation[];
    campaignLocations: CampaignLocation[];
    onToggle: (employee: Employee) => void;
}) {
    const rows = members.filter(row => row.campaign_id === campaign.id);
    const allowed = new Set(campaignLocations.filter(row => row.campaign_id === campaign.id).map(row => row.work_location_id));
    const eligibleEmployees = employees.filter(employee => employeeLocations.some(row => row.employee_id === employee.id && allowed.has(row.work_location_id)));
    const activeCount = rows.filter(member => member.active && eligibleEmployees.some(employee => employee.id === member.employee_id)).length;
    return <section className="admin-card">
      <div className="card-title"><div><p className="section-kicker">CAMPAIGN MEMBERS</p><h2>本期參與名單</h2></div><span className="count-tag">{activeCount} 人參與</span></div>
      <p className="panel-help">列出與活動任一適用地點相符的同仁。調整只影響「{campaign.label}」。</p>
      <div className="member-grid">{eligibleEmployees.map(row => { const member = rows.find(item => item.employee_id === row.id); const checked = member?.active ?? false; return <button type="button" key={row.id} className={checked ? "selected" : ""} role="switch" aria-checked={checked} onClick={() => onToggle(row)}><span className="avatar small">{row.name.slice(0, 1)}</span><span><strong>{row.name}</strong><small>{row.email}</small></span><em>{checked ? "本期參與" : "本期排除"}</em></button>; })}</div>
    </section>;
}
function WorkLocationManager({ locations, employeeLocations, campaignLocations, productLocations, onAdd, onRename, onDelete, onToggle }: {
    locations: WorkLocation[];
    employeeLocations: EmployeeLocation[];
    campaignLocations: CampaignLocation[];
    productLocations: ProductLocation[];
    onAdd: (name: string) => void;
    onRename: (row: WorkLocation, name: string) => void;
    onDelete: (row: WorkLocation) => void;
    onToggle: (row: WorkLocation) => void;
}) {
    const [name, setName] = useState("");
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    useEffect(() => setDrafts(Object.fromEntries(locations.map(row => [row.id, row.name]))), [locations]);
    return <section className="admin-card location-manager"><div className="card-title"><div><p className="section-kicker">WORK LOCATIONS</p><h2>上班地點</h2></div><span className="count-tag">{locations.length} 處</span></div>
      <p className="panel-help">同仁、活動與商品都能屬於多個地點；有任何關聯資料的地點只能停用，不能直接刪除。</p>
      <form className="category-add" onSubmit={event => { event.preventDefault(); if (name.trim()) { onAdd(name); setName(""); } }}><input value={name} onChange={event => setName(event.target.value)} placeholder="例如：台北辦公室"/><button>＋ 新增地點</button></form>
      <div className="location-list">{locations.map(row => { const employeeCount = employeeLocations.filter(item => item.work_location_id === row.id).length; const campaignCount = campaignLocations.filter(item => item.work_location_id === row.id).length; const productCount = productLocations.filter(item => item.work_location_id === row.id).length; return <article key={row.id}><span className="location-pin">⌖</span><input value={drafts[row.id] ?? row.name} onChange={event => setDrafts(current => ({ ...current, [row.id]: event.target.value }))}/><span>{employeeCount} 位員工 · {campaignCount} 期活動 · {productCount} 項商品</span><div><button disabled={(drafts[row.id] ?? row.name).trim() === row.name} onClick={() => onRename(row, drafts[row.id] ?? row.name)}>儲存名稱</button><button onClick={() => onToggle(row)}>{row.active ? "停用" : "啟用"}</button><button className="danger" onClick={() => onDelete(row)}>刪除</button></div></article>; })}</div>
    </section>;
}
function CategoryManager({ categories, products, nominations, votes, currentCampaigns, busy, onAdd, onRename, onDelete }: {
    categories: ProductCategory[];
    products: Product[];
    nominations: Nomination[];
    votes: Vote[];
    currentCampaigns: Campaign[];
    busy: boolean;
    onAdd: (name: string) => void;
    onRename: (row: ProductCategory, name: string) => void;
    onDelete: (row: ProductCategory) => void;
}) {
    const [newName, setNewName] = useState("");
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    useEffect(() => { setDrafts(Object.fromEntries(categories.map(c => [c.id, c.name]))); }, [categories]);
    function submit(event: FormEvent) { event.preventDefault(); const clean = newName.trim(); if (!clean)
        return; onAdd(clean); setNewName(""); }
    return <section className="admin-card category-manager"><div className="card-title"><div><p className="section-kicker">PRODUCT CATEGORIES</p><h2>商品類別</h2></div><span className="count-tag">{categories.length} 類</span></div><p className="panel-help">新增或改名後，員工端與所有商品表單會立即同步。刪除類別會一併移除其中商品，但不破壞過往活動紀錄。</p><form className="category-add" onSubmit={submit}><input value={newName} onChange={e => setNewName(e.target.value)} maxLength={80} placeholder="輸入新類別名稱"/><button disabled={busy || !newName.trim()}>＋ 新增類別</button></form><div className="category-admin-list">{categories.map(row => { const related = products.filter(p => p.category === row.name); const ids = new Set(related.map(p => p.id)); const activeIds = new Set(currentCampaigns.map(c => c.id)); const used = [...nominations, ...votes].some(x => activeIds.has(x.campaign_id) && ids.has(x.product_id)); const draft = drafts[row.id] ?? row.name; return <article key={row.id} className={used ? "protected" : ""}><span className="category-symbol">{icons[row.name] ?? "✦"}</span><label><small>類別名稱</small><input value={draft} maxLength={80} onChange={e => setDrafts(x => ({ ...x, [row.id]: e.target.value }))}/></label><span className="category-count"><strong>{related.length}</strong> 項商品</span>{used && <span className="category-lock">活動使用中</span>}<div><button disabled={busy || !draft.trim() || draft.trim() === row.name} onClick={() => onRename(row, draft)}>儲存名稱</button><button className="danger" disabled={busy || used} title={used ? "進行中的活動已有商品被提名或投票，不可刪除" : "刪除類別與其中商品"} onClick={() => onDelete(row)}>刪除</button></div></article>; })}</div></section>;
}
function ProductEditor({ product, categories, locations, selectedLocationIds, busy, onClose, onSave }: {
    product: Product;
    categories: ProductCategory[];
    locations: WorkLocation[];
    selectedLocationIds: string[];
    busy: boolean;
    onClose: () => void;
    onSave: (form: FormData, image: File | null) => void;
}) {
    const { ask: askConfirm, element: confirmElement } = useConfirmDialog();
    const [dirty, setDirty] = useState(false);
    const [image, setImage] = useState<File | null>(null);
    const [preview, setPreview] = useState(productImageUrl(product.image_path));
    const [removeImage, setRemoveImage] = useState(false);
    const [locationIds, setLocationIds] = useState(selectedLocationIds);
    async function requestClose() { if (!dirty || await askConfirm({ title: "放棄尚未儲存的修改？", items: ["關閉後，本次編輯的文字、圖片與地點變更都不會保留。"], confirmLabel: "放棄修改", danger: true })) onClose(); }
    useEffect(() => { const handle = (event: KeyboardEvent) => { if (event.key === "Escape") void requestClose(); }; window.addEventListener("keydown", handle); return () => window.removeEventListener("keydown", handle); }, [dirty]);
    useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (!dirty) return; event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
    useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);
    function selectImage(file: File | null) { if (!file) return; if (file.size > 5 * 1024 * 1024) return alert("圖片不可超過 5MB"); if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) return alert("僅支援 JPG、PNG、WebP 或 GIF 圖片"); if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); setImage(file); setPreview(URL.createObjectURL(file)); setRemoveImage(false); setDirty(true); }
    function remove() { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); setImage(null); setPreview(""); setRemoveImage(true); setDirty(true); }
    function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!locationIds.length) return alert("請至少選擇一個商品適用地點"); const form = new FormData(event.currentTarget); form.set("remove_image", String(removeImage)); onSave(form, image); }
    return <div className="editor-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) void requestClose(); }}><section className="product-editor" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
      <header><div><p className="section-kicker">PRODUCT EDITOR</p><h2 id="product-editor-title">編輯商品資料</h2><span>{product.origin === "employee" ? "同仁新增" : "管理者商品庫"} · {product.approval_status === "approved" ? "已核准" : product.approval_status === "pending" ? "待審核" : "已退回"}</span></div><button type="button" onClick={() => void requestClose()} aria-label="關閉編輯視窗">×</button></header>
      <form onSubmit={submit} onChange={() => setDirty(true)}><div className="editor-layout"><div className="editor-image"><div className="editor-preview">{preview ? <img src={preview} alt="商品圖片預覽"/> : <span>{icons[product.category] ?? "✦"}<small>尚無商品圖</small></span>}</div><label className="image-change">上傳或更換圖片<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => selectImage(e.target.files?.[0] ?? null)}/></label>{preview && <button type="button" className="remove-image" onClick={remove}>移除圖片</button>}<small>JPG、PNG、WebP、GIF，最大 5MB</small></div>
        <div className="editor-fields"><label className="field-wide"><span>商品名稱 *</span><input required name="name" defaultValue={product.name} maxLength={160}/></label><label><span>品牌</span><input name="brand" defaultValue={product.brand} maxLength={80}/></label><label><span>分類 *</span><select required name="category" defaultValue={product.category}>{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label><label><span>規格</span><input name="size" defaultValue={product.size} maxLength={80}/></label><label><span>參考價格</span><div className="editor-price"><i>NT$</i><input name="reference_price" type="number" min="0" step="1" defaultValue={product.reference_price ?? ""}/></div></label><div className="field-wide location-field"><span>適用地點</span><LocationPicker locations={locations} selected={locationIds} onChange={ids => { setLocationIds(ids); setDirty(true); }} name="location_ids"/></div><label className="field-wide"><span>商品狀態</span><select name="active" defaultValue={String(product.active)}><option value="true">啟用－員工可在商品庫看到</option><option value="false">停用－保留歷史但不供新提名</option></select></label></div>
      </div><footer><div>{dirty ? <><span className="unsaved-dot"/>尚有未儲存的修改</> : "目前沒有修改"}</div><button type="button" className="editor-cancel" onClick={() => void requestClose()}>取消</button><button className="editor-save" disabled={busy || !dirty}>{busy ? "儲存中…" : "儲存商品"}</button></footer></form>
    </section>{confirmElement}</div>;
}
function PurchaseRow({ row, product, locked, onUpdate, onPendingChange }: {
    row: PurchaseItem;
    product: Product | undefined;
    locked: boolean;
    onUpdate: (row: PurchaseItem, patch: Partial<PurchaseItem>) => Promise<boolean>;
    onPendingChange: (id: string, pending: boolean) => void;
}) { const quantity = row.final_quantity ?? row.suggested_quantity; const [priceDraft, setPriceDraft] = useState(String(row.unit_price)); const [quantityDraft, setQuantityDraft] = useState(String(quantity)); const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle"); const dirty = priceDraft !== String(row.unit_price) || quantityDraft !== String(quantity); useEffect(() => { setPriceDraft(String(row.unit_price)); setQuantityDraft(String(row.final_quantity ?? row.suggested_quantity)); setSaveState("idle"); }, [row.id, row.unit_price, row.final_quantity, row.suggested_quantity]); useEffect(() => { onPendingChange(row.id, dirty || saveState === "saving"); return () => onPendingChange(row.id, false); }, [row.id, dirty, saveState, onPendingChange]); async function commit(field: "unit_price" | "final_quantity", raw: string) { if (locked)
    return; const next = Number(raw); const valid = Number.isFinite(next) && next >= 0 && (field === "unit_price" || Number.isInteger(next)); if (!valid) {
    field === "unit_price" ? setPriceDraft(String(row.unit_price)) : setQuantityDraft(String(row.final_quantity ?? row.suggested_quantity));
    setSaveState("error");
    return;
} const current = field === "unit_price" ? Number(row.unit_price) : Number(row.final_quantity ?? row.suggested_quantity); if (next === current) {
    setSaveState("idle");
    return;
} setSaveState("saving"); const saved = await onUpdate(row, { [field]: next }); if (saved)
    setSaveState("saved");
else {
    field === "unit_price" ? setPriceDraft(String(row.unit_price)) : setQuantityDraft(String(row.final_quantity ?? row.suggested_quantity));
    setSaveState("error");
} } const price = Number(priceDraft) || 0; const qty = Number(quantityDraft) || 0; const included = qty > 0; const keyAction = (event: React.KeyboardEvent<HTMLInputElement>, reset: () => void) => { if (event.key === "Enter") {
    event.preventDefault();
    event.currentTarget.blur();
}
else if (event.key === "Escape") {
    reset();
    event.currentTarget.blur();
} }; return <tr className={locked ? "purchase-row-locked" : ""}><td><strong>#{row.rank}</strong></td><td>{product ? `${product.brand} ${product.name}` : "商品資料已移除"}{price <= 0 && <small className="cell-warning">尚未設定價格</small>}</td><td>{row.vote_count} 票</td><td><div className="purchase-input-cell"><input disabled={locked} className="price-input" type="number" min="0" step="0.01" inputMode="decimal" value={priceDraft} onChange={e => { setPriceDraft(e.target.value); setSaveState("idle"); }} onBlur={() => void commit("unit_price", priceDraft)} onKeyDown={e => keyAction(e, () => setPriceDraft(String(row.unit_price)))}/><small className={`purchase-save-state ${saveState}`}>{locked ? "已鎖定" : saveState === "saving" ? "儲存中…" : saveState === "saved" ? "已儲存" : saveState === "error" ? "儲存失敗" : "離開欄位後儲存"}</small></div></td><td><input disabled={locked} className="qty-input" type="number" min="0" step="1" inputMode="numeric" value={quantityDraft} onChange={e => { setQuantityDraft(e.target.value); setSaveState("idle"); }} onBlur={() => void commit("final_quantity", quantityDraft)} onKeyDown={e => keyAction(e, () => setQuantityDraft(String(row.final_quantity ?? row.suggested_quantity)))}/></td><td>NT$ {(price * qty).toLocaleString()}</td><td><button type="button" disabled={!locked || !included} className={`purchase-status-button ${row.purchased ? "purchased" : ""}`} onClick={() => void onUpdate(row, { purchased: !row.purchased })}>{!included ? "未列入採購" : !locked ? "鎖定後登記" : row.purchased ? "✓ 已採購" : "標記已採購"}</button></td></tr>; }
function PurchaseCampaignSwitcher({ campaigns, selected, locations, campaignLocations, purchases, onSelect }: {
    campaigns: Campaign[];
    selected: Campaign | null;
    locations: WorkLocation[];
    campaignLocations: CampaignLocation[];
    purchases: PurchaseItem[];
    onSelect: (id: string) => void;
}) { return <section className="purchase-campaign-switcher"><header><div><p className="section-kicker">PURCHASE WORKSPACE</p><h2>選擇要處理的採購活動</h2><p>依活動與地點分開保存；尚未買完的舊活動會優先排列。</p></div><span>{campaigns.filter(c => { const rows = purchases.filter(row => row.campaign_id === c.id && Number(row.final_quantity ?? row.suggested_quantity) > 0); return rows.length > 0 && !rows.every(row => row.purchased); }).length} 個待完成</span></header>{campaigns.length ? <div className="purchase-campaign-list">{campaigns.map(campaign => { const rows = purchases.filter(row => row.campaign_id === campaign.id && Number(row.final_quantity ?? row.suggested_quantity) > 0); const bought = rows.filter(row => row.purchased).length; const completed = rows.length > 0 && bought === rows.length; const pending = rows.length > 0 && !completed; const location = locationNames(campaignLocations.filter(row => row.campaign_id === campaign.id).map(row => row.work_location_id), locations); return <button key={campaign.id} className={`${selected?.id === campaign.id ? "active" : ""} ${pending ? "pending" : completed ? "completed" : "new"}`} onClick={() => onSelect(campaign.id)}><span><small>{location}</small><strong>{campaign.label}</strong></span><em>{pending ? `待採購 ${rows.length - bought} 項` : completed ? "採購完成" : phaseLabel(phaseOf(campaign))}</em><div><span>{rows.length ? `${bought}／${rows.length} 項已採購` : "尚未產生清單"}</span><small>預算 NT$ {Number(campaign.budget).toLocaleString()}</small></div></button>; })}</div> : <div className="admin-empty">目前沒有進行中或尚待採購的活動。</div>}</section>; }
function PurchasePanel({ campaign, products, purchases, busy, onGenerate, onUpdate, onSetLocked, onUpdateArrival }: {
    campaign: Campaign | null;
    products: Product[];
    purchases: PurchaseItem[];
    busy: boolean;
    onGenerate: () => void;
    onUpdate: (row: PurchaseItem, patch: Partial<PurchaseItem>) => Promise<boolean>;
    onSetLocked: (locked: boolean) => void;
    onUpdateArrival: (value: string) => void;
}) { const [pendingRows, setPendingRows] = useState<Set<string>>(() => new Set()); const reportPending = useCallback((id: string, pending: boolean) => setPendingRows(current => { const next = new Set(current); pending ? next.add(id) : next.delete(id); if (next.size === current.size && [...next].every(value => current.has(value)))
    return current; return next; }), []); if (!campaign)
    return <section className="admin-card"><div className="admin-empty">請先建立本期活動。</div></section>; const rows = purchases.filter(p => p.campaign_id === campaign.id); const total = rows.reduce((sum, row) => sum + Number(row.unit_price) * Number(row.final_quantity ?? row.suggested_quantity), 0); const remaining = Number(campaign.budget) - total; const locked = Boolean(campaign.purchase_plan_locked_at); const buyingRows = rows.filter(row => Number(row.final_quantity ?? row.suggested_quantity) > 0); const completed = locked && buyingRows.length > 0 && buyingRows.every(row => row.purchased); const hasPending = pendingRows.size > 0; return <><div className="purchase-summary"><div><span>本期可用預算 · {campaign.label}</span><strong>NT$ {Number(campaign.budget).toLocaleString()}</strong><small>基本 NT$ {Number(campaign.base_budget ?? campaign.budget).toLocaleString()}{campaign.carryover_enabled ? ` ＋ 使用上期保留 NT$ ${Number(campaign.carryover_amount).toLocaleString()}` : " · 未使用上期保留"}{campaign.retain_unused_budget ? " · 本期餘額將保留" : " · 本期餘額不保留"}</small></div><div><span>目前清單金額</span><strong>NT$ {total.toLocaleString()}</strong></div><div className={remaining < 0 ? "over-budget" : ""}><span>{remaining < 0 ? "超出預算" : "預算餘額"}</span><strong>NT$ {Math.abs(remaining).toLocaleString()}</strong></div></div><section className="admin-card"><div className="card-title purchase-title"><div><p className="section-kicker">PURCHASE PLAN</p><h2>{campaign.label} 採購清單</h2><span className={`purchase-plan-state ${completed ? "completed" : locked ? "locked" : "draft"}`}>{completed ? "✓ 本期採購完成" : locked ? "已鎖定 · 待採購" : "草稿 · 票數異動時自動更新"}</span></div><div className="purchase-plan-actions">{locked && <label className="arrival-editor"><span>預計到貨日期（選填）</span><input type="date" value={campaign.purchase_expected_arrival_date ?? ""} onChange={e => onUpdateArrival(e.target.value)}/></label>}<button className="recalculate-button" disabled={locked || hasPending || busy} onClick={onGenerate}>{rows.length ? "重新計算建議" : "產生採購建議"}</button>{rows.length && <button className={locked ? "unlock-button" : "lock-button"} disabled={hasPending || busy} onClick={() => onSetLocked(!locked)}>{locked ? "解鎖修改" : "儲存並鎖定清單"}</button>}</div></div>{hasPending && <div className="purchase-pending-note">尚有欄位未儲存；請按 Enter 或點到欄位外，完成儲存後即可鎖定。</div>}<div className="rule-note purchase-rule"><strong>{locked ? "清單已固定" : "分配規則"}</strong><span>{locked ? "單價、數量及排名已鎖定。請依實際採購進度逐項標記「已採購」；如需變更內容，請先解鎖。" : "未鎖定期間，票數變更會自動重算前 5 名及採購數量；既有商品人工調整的採購單價會保留，新入選商品採用參考價。"}</span></div>{rows.length ? <div className="table-wrap"><table><thead><tr><th>排名</th><th>商品</th><th>票數</th><th>採購單價</th><th>採購數量</th><th>小計</th><th>採購狀態</th></tr></thead><tbody>{rows.map(row => <PurchaseRow key={row.id} row={row} product={products.find(p => p.id === row.product_id)} locked={locked} onUpdate={onUpdate} onPendingChange={reportPending}/>)}</tbody></table></div> : <div className="admin-empty">投票結束後，按「產生採購建議」。請先在商品資料庫確認前五名商品的參考價格。</div>}</section></>; }
function BudgetReportPanel({ campaigns, locations, purchases, products, votes }: {
    campaigns: Campaign[];
    locations: WorkLocation[];
    purchases: PurchaseItem[];
    products: Product[];
    votes: Vote[];
}) {
    const [locationId, setLocationId] = useState("all");
    const [months, setMonths] = useState("12");
    const now = new Date();
    const cutoff = months === "all" ? null : new Date(now.getFullYear(), now.getMonth() - Number(months) + 1, 1);
    const rows = campaigns.filter(row => row.status !== "draft" && new Date(row.start_at) <= now && (locationId === "all" || row.work_location_id === locationId) && (!cutoff || new Date(row.start_at) >= cutoff)).sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at)).map(campaign => { const plan = purchases.filter(row => row.campaign_id === campaign.id && Number(row.final_quantity ?? row.suggested_quantity) > 0); const bought = plan.filter(row => row.purchased); const planned = plan.reduce((sum, row) => sum + Number(row.unit_price) * Number(row.final_quantity ?? row.suggested_quantity), 0); const spent = bought.reduce((sum, row) => sum + Number(row.unit_price) * Number(row.final_quantity ?? row.suggested_quantity), 0); const quantity = bought.reduce((sum, row) => sum + Number(row.final_quantity ?? row.suggested_quantity), 0); const participants = new Set(votes.filter(row => row.campaign_id === campaign.id).map(row => row.employee_id)).size; return { campaign, plan, bought, planned, spent, quantity, participants, utilization: Number(campaign.budget) > 0 ? spent / Number(campaign.budget) * 100 : 0, completion: plan.length ? bought.length / plan.length * 100 : 0, remaining: Number(campaign.budget) - spent }; });
    const totalBudget = rows.reduce((sum, row) => sum + Number(row.campaign.budget), 0);
    const totalSpent = rows.reduce((sum, row) => sum + row.spent, 0);
    const totalRemaining = totalBudget - totalSpent;
    const utilization = totalBudget ? totalSpent / totalBudget * 100 : 0;
    const retained = rows.reduce((sum, row) => sum + (row.campaign.retain_unused_budget ? Math.max(row.remaining, 0) : 0), 0);
    const totalParticipants = rows.reduce((sum, row) => sum + row.participants, 0);
    const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    const productSpend = new Map<string, number>();
    rows.forEach(({ bought }) => bought.forEach(row => productSpend.set(row.product_id, (productSpend.get(row.product_id) ?? 0) + Number(row.unit_price) * Number(row.final_quantity ?? row.suggested_quantity))));
    const topProduct = [...productSpend.entries()].sort((a, b) => b[1] - a[1])[0];
    const topProductName = topProduct ? (products.find(row => row.id === topProduct[0])?.name ?? "商品資料已移除") : "尚無資料";
    const maxBudget = Math.max(...rows.map(row => Number(row.campaign.budget)), 1);
    const money = (value: number) => `NT$ ${Math.round(value).toLocaleString()}`;
    const insights = [utilization < 70 ? `整體預算使用率為 ${utilization.toFixed(0)}%，可考慮下修固定預算或增加可購買品項。` : utilization > 95 ? `整體預算使用率達 ${utilization.toFixed(0)}%，預算配置緊密，建議保留少量價格波動空間。` : `整體預算使用率 ${utilization.toFixed(0)}%，落在 70% - 95% 的健康區間。`, retained > 0 ? `目前共有 ${money(retained)} 未用款設定保留，建立下一期時應確認是否實際使用。` : "目前篩選期間沒有保留未用預算。", topProduct ? `累計採購金額最高的商品是「${topProductName}」，共 ${money(topProduct[1])}。` : "尚無已標記採購的品項，暫時無法分析商品支出。"];
    function exportPdf() { const previous = document.title; document.title = `Snack Vote 預算使用報表 ${new Date().toISOString().slice(0, 10)}`; document.documentElement.classList.add("printing-budget-report"); const restore = () => { document.documentElement.classList.remove("printing-budget-report"); document.title = previous; window.removeEventListener("afterprint", restore); }; window.addEventListener("afterprint", restore); window.setTimeout(() => window.print(), 80); }
    return <section className="budget-report" id="budget-report"><div className="budget-report-toolbar no-print"><div><label>上班地點<select value={locationId} onChange={event => setLocationId(event.target.value)}><option value="all">全部地點</option>{locations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>統計期間<select value={months} onChange={event => setMonths(event.target.value)}><option value="3">最近 3 個月</option><option value="6">最近 6 個月</option><option value="12">最近 12 個月</option><option value="all">全部活動</option></select></label></div><button onClick={exportPdf}>↓ 匯出 PDF</button></div><header className="budget-report-heading"><div><p className="section-kicker">BUDGET INTELLIGENCE</p><h2>每月預算使用狀況</h2><p>{locationId === "all" ? "全部上班地點" : locations.find(row => row.id === locationId)?.name} · {months === "all" ? "全部活動" : `最近 ${months} 個月`} · 共 {rows.length} 期</p></div><div className="report-generated"><span>報表產生時間</span><strong>{new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(now)}</strong></div></header>{rows.length ? <><div className="budget-kpis"><article><span>累計預算</span><strong>{money(totalBudget)}</strong><small>{rows.length} 期活動</small></article><article className="primary"><span>實際支出</span><strong>{money(totalSpent)}</strong><small>使用率 {utilization.toFixed(1)}%</small></article><article><span>未用餘額</span><strong>{money(totalRemaining)}</strong><small>其中保留 {money(retained)}</small></article><article><span>平均參與成本</span><strong>{totalParticipants ? money(totalSpent / totalParticipants) : "—"}</strong><small>{totalParticipants} 人次參與</small></article></div><div className="budget-report-grid"><section className="admin-card budget-trend"><div className="card-title"><div><p className="section-kicker">MONTHLY TREND</p><h2>各期預算與支出</h2></div></div><div className="budget-bars">{rows.map(row => <div key={row.campaign.id}><span><strong>{row.campaign.label}</strong><small>{locations.find(item => item.id === row.campaign.work_location_id)?.name ?? "未設定地點"}</small></span><div className="budget-bar-track"><i style={{ width: `${Number(row.campaign.budget) / maxBudget * 100}%` }}/><b style={{ width: `${Math.min(row.spent / Math.max(Number(row.campaign.budget), 1) * 100, 100)}%` }}/></div><em>{money(row.spent)} / {money(Number(row.campaign.budget))}</em></div>)}</div><div className="budget-legend"><span><i />預算</span><span><i />實際支出</span></div></section><section className="admin-card budget-insights"><div className="card-title"><div><p className="section-kicker">ACTIONABLE NOTES</p><h2>管理建議</h2></div></div>{insights.map((text, index) => <article key={text}><b>{index + 1}</b><p>{text}</p></article>)}<div className="value-metrics"><span>平均每份成本<strong>{totalQuantity ? money(totalSpent / totalQuantity) : "—"}</strong></span><span>最高支出商品<strong>{topProductName}</strong></span></div></section></div><section className="admin-card budget-detail"><div className="card-title"><div><p className="section-kicker">PERIOD DETAIL</p><h2>各期明細</h2></div></div><div className="table-wrap"><table><thead><tr><th>活動</th><th>地點</th><th>預算</th><th>實際支出</th><th>使用率</th><th>採購完成度</th><th>未用款處理</th></tr></thead><tbody>{[...rows].reverse().map(row => <tr key={row.campaign.id}><td><strong>{row.campaign.label}</strong><small className="cell-sub">{shortDate(row.campaign.start_at)}</small></td><td>{locations.find(item => item.id === row.campaign.work_location_id)?.name ?? "未設定"}</td><td>{money(Number(row.campaign.budget))}</td><td>{money(row.spent)}</td><td><span className={`usage-pill ${row.utilization > 100 ? "over" : row.utilization < 70 ? "low" : ""}`}>{row.utilization.toFixed(1)}%</span></td><td>{row.completion.toFixed(0)}%<small className="cell-sub">{row.bought.length}/{row.plan.length} 項</small></td><td>{row.campaign.retain_unused_budget ? `保留 ${money(Math.max(row.remaining, 0))}` : "不保留"}</td></tr>)}</tbody></table></div></section></> : <div className="admin-card admin-empty">目前篩選條件沒有可分析的活動資料。</div>}<footer className="budget-report-footer">Snack Vote 內部管理報表 · 實際支出以後台標記「已採購」的品項計算。</footer></section>;
}
function FeedbackAdminPanel({ submissions, onRead, onReply }: {
    submissions: FeedbackSubmission[];
    onRead: (row: FeedbackSubmission) => Promise<void>;
    onReply: (row: FeedbackSubmission, reply: string, close?: boolean) => Promise<void>;
}) {
    const [filter, setFilter] = useState<"all" | FeedbackSubmission["status"]>("all");
    const [selectedId, setSelectedId] = useState(submissions[0]?.id ?? "");
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const filtered = filter === "all" ? submissions : submissions.filter(row => row.status === filter);
    const selected = filtered.find(row => row.id === selectedId) ?? filtered[0] ?? null;
    useEffect(() => { if (selected && selected.id !== selectedId)
        setSelectedId(selected.id); }, [selected?.id, selectedId]);
    useEffect(() => { setDraft(selected?.admin_reply ?? ""); if (selected?.status === "unread")
        void onRead(selected); }, [selected?.id]);
    const average = (key: "nomination_rating" | "voting_rating" | "results_rating") => submissions.length ? (submissions.reduce((sum, row) => sum + row[key], 0) / submissions.length).toFixed(1) : "—";
    return <section className="feedback-admin"><div className="feedback-admin-kpis"><article><span>尚未閱讀</span><strong>{submissions.filter(row => row.status === "unread").length}</strong><small>則待處理</small></article><article><span>提名階段</span><strong>{average("nomination_rating")}</strong><small>平均滿意度／5</small></article><article><span>投票階段</span><strong>{average("voting_rating")}</strong><small>平均滿意度／5</small></article><article><span>結果與採購</span><strong>{average("results_rating")}</strong><small>平均滿意度／5</small></article></div><div className="feedback-admin-toolbar"><div><p className="section-kicker">EMPLOYEE VOICE</p><h2>同仁意見與回覆</h2></div><div>{(["all", "unread", "read", "replied", "closed"] as const).map(value => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "全部" : feedbackStatusLabels[value]}<b>{value === "all" ? submissions.length : submissions.filter(row => row.status === value).length}</b></button>)}</div></div><div className="feedback-admin-layout"><section className="feedback-inbox">{filtered.length ? filtered.map(row => <button key={row.id} className={`${selected?.id === row.id ? "active" : ""} ${row.status}`} onClick={() => setSelectedId(row.id)}><span><strong>{row.author_name}</strong><small>{new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(row.created_at))}</small></span><em>{row.body}</em><i>{feedbackStatusLabels[row.status]}</i></button>) : <div className="admin-empty">此篩選條件目前沒有意見。</div>}</section><section className="feedback-detail">{selected ? <><header><div><p className="section-kicker">FEEDBACK DETAIL</p><h2>{selected.author_name} 的建議</h2><small>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "long", timeStyle: "short" }).format(new Date(selected.created_at))}</small></div><span className={`feedback-status ${selected.status}`}>{feedbackStatusLabels[selected.status]}</span></header><div className="admin-feedback-scores"><span>提名階段<strong>{selected.nomination_rating}<small>／5</small></strong></span><span>投票階段<strong>{selected.voting_rating}<small>／5</small></strong></span><span>結果／採購<strong>{selected.results_rating}<small>／5</small></strong></span></div><blockquote>{selected.body}</blockquote><label>回覆同仁<textarea value={draft} maxLength={2000} onChange={event => setDraft(event.target.value)} placeholder="說明已採取的調整、預計處理方式或需要進一步了解的內容…"/></label><div className="feedback-reply-actions"><small>回覆送出後，同仁會在自己的意見紀錄中看到。</small><button disabled={saving || !draft.trim()} onClick={async () => { setSaving(true); await onReply(selected, draft); setSaving(false); }}>{saving ? "儲存中…" : "儲存回覆"}</button><button className="close-feedback" disabled={saving || selected.status === "closed"} onClick={async () => { setSaving(true); await onReply(selected, draft, true); setSaving(false); }}>{selected.status === "closed" ? "已結案" : "標記結案"}</button></div></> : <div className="admin-empty">選擇左側意見查看內容。</div>}</section></div></section>;
}
function HistoryPanel({ campaigns, locations, products, nominations, votes, comments, purchases, onEdit, onDelete }: {
    campaigns: Campaign[];
    locations: WorkLocation[];
    products: Product[];
    nominations: Nomination[];
    votes: Vote[];
    comments: Comment[];
    purchases: PurchaseItem[];
    onEdit: (campaign: Campaign) => void;
    onDelete: (campaign: Campaign) => void;
}) { const [expanded, setExpanded] = useState<string | null>(null); return <section className="admin-card"><div className="card-title"><div><p className="section-kicker">CAMPAIGN HISTORY</p><h2>所有活動完整紀錄</h2></div><span className="count-tag">{campaigns.length} 期</span></div>{campaigns.length ? <div className="history-detail-list">{campaigns.map(c => { const cv = votes.filter(v => v.campaign_id === c.id); const cn = nominations.filter(n => n.campaign_id === c.id); const cc = comments.filter(x => x.campaign_id === c.id); const cp = purchases.filter(x => x.campaign_id === c.id); const productIds = [...new Set([...cn.map(n => n.product_id), ...cv.map(v => v.product_id), ...cp.map(p => p.product_id)])]; const ranking = productIds.map(id => ({ id, count: cv.filter(v => v.product_id === id).length })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)); const historyRankMap = competitionRankMap(ranking, r => r.id, r => r.count); const spent = cp.reduce((sum, x) => sum + Number(x.unit_price) * Number(x.final_quantity ?? x.suggested_quantity), 0); const open = expanded === c.id; return <article className={`history-detail ${open ? "open" : ""}`} key={c.id}><button className="history-summary" onClick={() => setExpanded(open ? null : c.id)}><span><em>{c.status === "archived" ? "已封存" : phaseLabel(phaseOf(c))}</em><strong>{c.label}</strong><small>{locations.find(x => x.id === c.work_location_id)?.name ?? "未設定地點"} · {shortDate(c.start_at)}－{shortDate(c.purchase_at)}</small></span><span><b>預算 NT$ {Number(c.budget).toLocaleString()}</b><small>{cv.length} 票 · {cn.length} 筆提名 · {cc.length} 則留言</small></span><i>{open ? "收合" : "查看完整紀錄"}</i></button>{open && <div className="history-body"><div className="history-maintain"><div><button onClick={() => onEdit(c)}>維護此活動設定</button><button className="history-delete" onClick={() => onDelete(c)}>強制刪除活動</button></div><span>修改預算、日期、地點或狀態；既有投票與採購紀錄會保留。</span></div><div className="history-metrics"><span>預算<strong>NT$ {Number(c.budget).toLocaleString()}</strong></span><span>採購清單金額<strong>NT$ {spent.toLocaleString()}</strong></span><span>已完成採購<strong>{cp.filter(x => x.purchased).length} 項</strong></span></div><div className="table-wrap"><table><thead><tr><th>排名</th><th>商品</th><th>提名者</th><th>票數與投票者</th><th>留言</th><th>採購結果</th></tr></thead><tbody>{ranking.map(r => { const product = products.find(p => p.id === r.id); const ns = cn.filter(n => n.product_id === r.id); const vs = cv.filter(v => v.product_id === r.id); const cs = cc.filter(x => x.product_id === r.id); const buy = cp.find(x => x.product_id === r.id); return <tr key={r.id}><td><strong>#{historyRankMap.get(r.id)}</strong></td><td>{product ? `${product.brand} ${product.name}` : "商品資料已停用"}</td><td>{ns.map(n => n.nominator_name).join("、") || "—"}</td><td><strong>{vs.length} 票</strong><small className="cell-sub">{vs.map(v => v.voter_name).join("、") || "—"}</small></td><td>{cs.length ? <details><summary>{cs.length} 則</summary>{cs.map(x => <p className="history-comment" key={x.id}><b>{x.author_name}</b>{x.body}</p>)}</details> : "—"}</td><td>{buy ? `${buy.final_quantity ?? buy.suggested_quantity} 份 · NT$ ${(Number(buy.unit_price) * Number(buy.final_quantity ?? buy.suggested_quantity)).toLocaleString()}${buy.purchased ? " · 已買" : ""}` : "未列入"}</td></tr>; })}</tbody></table></div></div>}</article>; })}</div> : <div className="admin-empty">尚無活動紀錄。</div>}</section>; }
