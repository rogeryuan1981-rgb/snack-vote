import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import "./purchase-receipt.css";

type Status = "pending" | "partial" | "arrived";
type Receipt = { purchase_arrival_status: Status; purchase_actual_arrival_date: string | null };
const labels: Record<Status, string> = { pending: "待到貨", partial: "部分到貨", arrived: "已到貨" };
const bucket = "purchase-receipts";
const formats: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export function PurchaseReceipt({ campaignId, expectedDate, editable = false }: { campaignId: string; expectedDate: string | null; editable?: boolean }) {
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const [status, setStatus] = useState<Status>("pending");
    const [date, setDate] = useState("");
    const [photos, setPhotos] = useState<{ name: string; url: string; created: string | null }[]>([]);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const guard = useRef(false);
    const mounted = useRef(true);
    const load = useCallback(async (syncDraft = true) => {
        const result = await supabase.from("campaigns").select("purchase_arrival_status,purchase_actual_arrival_date").eq("id", campaignId).single();
        if (result.error) throw new Error("無法讀取到貨紀錄，請確認已安裝到貨功能更新後重試。");
        if (!mounted.current) return;
        const value = result.data as Receipt;
        setReceipt(value); if (syncDraft) { setStatus(value.purchase_arrival_status); setDate(value.purchase_actual_arrival_date ?? ""); }
        const files = await supabase.storage.from(bucket).list(campaignId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
        if (files.error) throw new Error("無法讀取驗收照片，請重試。");
        const images = (files.data ?? []).filter(file => file.id);
        const signed = images.length ? await supabase.storage.from(bucket).createSignedUrls(images.map(file => `${campaignId}/${file.name}`), 3600) : null;
        if (signed?.error || signed?.data?.some(row => row.error || !row.signedUrl)) throw new Error("無法取得驗收照片，請重試。");
        if (mounted.current) setPhotos(images.map((file, i) => ({ name: file.name, url: signed?.data?.[i]?.signedUrl ?? "", created: file.created_at })));
    }, [campaignId]);
    useEffect(() => {
        mounted.current = true;
        void load().catch(e => { if (mounted.current) setError(e.message); });
        return () => { mounted.current = false; };
    }, [load]);
    useEffect(() => {
        if (editable) return;
        const refresh = () => { void load().then(() => { if (mounted.current) setError(""); }).catch(e => { if (mounted.current) setError(e.message); }); };
        const timer = window.setInterval(refresh, 60000);
        window.addEventListener("focus", refresh);
        return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
    }, [editable, load]);
    async function run(action: () => Promise<void>) {
        if (guard.current) return;
        guard.current = true; setBusy(true); setError(""); setNotice("");
        try { await action(); } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "操作失敗，請重試。"); }
        finally { guard.current = false; if (mounted.current) setBusy(false); }
    }
    async function save() {
        if (status !== "pending" && !date) throw new Error("請填寫實際到貨日期。");
        const today = new Date();
        const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        if (status !== "pending" && date > localToday) throw new Error("實際到貨日期不能晚於今天。");
        const next: Receipt = { purchase_arrival_status: status, purchase_actual_arrival_date: status === "pending" ? null : date };
        const saved = await supabase.from("campaigns").update(next).eq("id", campaignId).select("purchase_arrival_status,purchase_actual_arrival_date").single();
        if (saved.error) throw new Error("到貨狀態未儲存，請確認權限與日期後重試。");
        if (mounted.current) { setReceipt(saved.data as Receipt); setDate(saved.data.purchase_actual_arrival_date ?? ""); setNotice("到貨狀態已儲存"); }
    }
    async function upload(files: File[]) {
        if (!files.length) return;
        if (photos.length + files.length > 20) throw new Error("每期最多保留 20 張驗收照片。");
        for (const file of files) {
            if (!formats[file.type]) throw new Error(`${file.name}：僅支援 JPG、PNG、WebP。`);
            if (file.size > 10 * 1024 * 1024 || file.size === 0) throw new Error(`${file.name}：請上傳 10 MB 以下且非空白的圖片。`);
            const bitmap = await createImageBitmap(file).catch(() => { throw new Error(`${file.name}：圖檔無法讀取。`); });
            bitmap.close();
        }
        let uploaded = 0;
        let failure = "";
        for (const file of files) {
            const result = await supabase.storage.from(bucket).upload(`${campaignId}/${crypto.randomUUID()}.${formats[file.type]}`, file, { contentType: file.type, upsert: false });
            if (result.error) { failure = `${file.name} 上傳失敗；已成功 ${uploaded} 張，請重試未完成的圖片。`; break; }
            uploaded++;
        }
        await load(false);
        if (failure) throw new Error(failure);
        if (mounted.current) setNotice(`已上傳 ${uploaded} 張驗收照片`);
    }
    return <section className="purchase-receipt" aria-label="到貨與驗收紀錄">
        <div className="receipt-heading"><div className={`receipt-status receipt-${receipt?.purchase_arrival_status ?? "pending"}`}><strong>{receipt ? labels[receipt.purchase_arrival_status] : "到貨狀態讀取中"}</strong>{receipt?.purchase_actual_arrival_date && <span>{receipt.purchase_arrival_status === "partial" ? "最近一批到貨" : "實際到貨"}：{receipt.purchase_actual_arrival_date}</span>}{receipt && receipt.purchase_arrival_status !== "arrived" && <span>預計到貨：{expectedDate ?? "尚未填寫"}</span>}</div><button type="button" disabled={busy} onClick={() => void run(load)}>重新整理紀錄</button></div>
        {editable && receipt && <div className="receipt-editor"><label>到貨狀態<select aria-label="到貨狀態" value={status} disabled={busy} onChange={e => setStatus(e.target.value as Status)}><option value="pending">待到貨</option><option value="partial">部分到貨</option><option value="arrived">全部到貨</option></select></label><label>{status === "partial" ? "最近一批到貨日期" : "實際到貨日期"}<input type="date" value={date} disabled={busy || status === "pending"} onChange={e => setDate(e.target.value)}/></label><button type="button" disabled={busy} onClick={() => void run(save)}>{busy ? "處理中…" : "儲存到貨狀態"}</button></div>}
        <div className="receipt-evidence"><strong>驗收照片</strong>{editable && <label className="receipt-upload">上傳圖片（JPG／PNG／WebP，每張上限 10 MB）<input aria-label="上傳驗收圖片" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || !receipt} onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void run(() => upload(files)); }}/></label>}
        {photos.length ? <div className="receipt-photos">{photos.map((photo, index) => <figure key={photo.name}><a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={`驗收照片 ${index + 1}`} loading="lazy"/></a><figcaption>上傳：{photo.created ? new Date(photo.created).toLocaleDateString("zh-TW") : "日期未記錄"}</figcaption></figure>)}</div> : receipt && !error && <p>尚未上傳驗收照片。</p>}</div>
        {error && <p className="receipt-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    </section>;
}

