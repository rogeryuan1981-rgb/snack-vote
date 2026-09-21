import { useRef, useState } from "react";
import { supabase } from "./lib/supabase";
import type { ReimbursementData, ReimbursementPhoto } from "./lib/reimbursement-pdf";
import "./purchase-pdf.css";

export async function loadReimbursementData(campaignId: string): Promise<ReimbursementData> {
    const [campaignResult, purchaseResult] = await Promise.all([
        supabase.from("campaigns").select("id,label,budget,purchase_discount_total,purchase_plan_locked_at,purchase_arrival_status,purchase_actual_arrival_date,purchase_expected_arrival_date").eq("id", campaignId).single(),
        supabase.from("purchase_items").select("id,product_id,rank,unit_price,final_quantity,suggested_quantity,purchased,note").eq("campaign_id", campaignId).order("rank").order("product_id"),
    ]);
    if (campaignResult.error || purchaseResult.error) throw new Error("無法讀取核銷資料，請確認已安裝到貨功能更新，並重新整理後重試。");
    const campaign = campaignResult.data;
    if (!campaign.purchase_plan_locked_at) throw new Error("請先儲存並鎖定採購清單，再下載核銷 PDF。");
    if (!["pending", "partial", "arrived"].includes(campaign.purchase_arrival_status)) throw new Error("到貨狀態不完整，請重新整理後重試。");
    const purchases = purchaseResult.data.filter(row => Number(row.final_quantity ?? row.suggested_quantity) > 0);
    if (!purchases.length) throw new Error("目前沒有可匯出的採購品項。");
    const productsResult = await supabase.from("products").select("id,brand,name").in("id", [...new Set(purchases.map(row => row.product_id))]);
    if (productsResult.error) throw new Error("無法讀取商品明細，請稍後重試。");
    const photos: ReimbursementPhoto[] = [];
    const storage = supabase.storage.from("purchase-receipts");
    for (let offset = 0; ; offset += 100) {
        const files = await storage.list(campaignId, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
        if (files.error) throw new Error("無法取得驗收照片清單，PDF 未產生，請稍後重試。");
        for (const file of files.data.filter(file => file.id)) {
            const downloaded = await storage.download(`${campaignId}/${file.name}`);
            if (downloaded.error || !downloaded.data) throw new Error("驗收照片下載失敗，PDF 未產生，請稍後重試。");
            photos.push({ blob: downloaded.data, createdAt: file.created_at });
        }
        if (files.data.length < 100) break;
    }
    photos.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    return {
        campaignId: campaign.id, label: campaign.label, budget: Number(campaign.budget), discount: Number(campaign.purchase_discount_total ?? 0),
        arrivalStatus: campaign.purchase_arrival_status, actualArrival: campaign.purchase_actual_arrival_date,
        expectedArrival: campaign.purchase_expected_arrival_date, generatedAt: new Date(), photos,
        rows: purchases.map(row => {
            const product = productsResult.data.find(product => product.id === row.product_id);
            return { name: product ? `${product.brand ?? ""} ${product.name}`.trim() : `商品資料已移除（${row.product_id}）`, quantity: Number(row.final_quantity ?? row.suggested_quantity), unitPrice: Number(row.unit_price), purchased: row.purchased, note: row.note };
        }),
    };
}

export function PurchasePdfDownload({ campaignId, disabled, disabledReason }: { campaignId: string; disabled: boolean; disabledReason: string }) {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [failed, setFailed] = useState(false);
    const guard = useRef(false);
    async function download() {
        if (disabled || guard.current) return;
        guard.current = true; setLoading(true); setFailed(false); setMessage("正在整理採購明細與驗收照片…");
        try {
            const { createReimbursementPdf, reimbursementFilename } = await import("./lib/reimbursement-pdf");
            const data = await loadReimbursementData(campaignId);
            const pdf = await createReimbursementPdf(data);
            const url = URL.createObjectURL(pdf);
            const anchor = document.createElement("a"); anchor.href = url; anchor.download = reimbursementFilename(data.label, data.generatedAt);
            document.body.appendChild(anchor); anchor.click(); anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            setMessage("PDF 已產生，請查看瀏覽器下載項目。");
        } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "PDF 產生失敗，請稍後重試。"); }
        finally { guard.current = false; setLoading(false); }
    }
    return <div className="purchase-pdf-toolbar"><div><strong>核銷附件</strong><p>下載本期採購明細、金額、到貨紀錄與驗收照片。</p>{disabled && <small>{disabledReason}</small>}{message && <p role={failed ? "alert" : "status"} className={failed ? "purchase-pdf-error" : ""}>{message}</p>}</div><button type="button" disabled={disabled || loading} onClick={() => void download()}>{loading ? "PDF 產生中…" : "下載核銷 PDF"}</button></div>;
}
