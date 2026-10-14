import type { ReceiptPhotoKind } from "./receipt-photos";
import { purchaseTotals } from "./purchase-totals";

export type ReimbursementRow = { name: string; quantity: number; unitPrice: number; purchased: boolean; note: string | null };
export type ReimbursementPhoto = { blob: Blob; createdAt: string | null; kind: ReceiptPhotoKind };
export type ReimbursementData = {
    campaignId: string; label: string; budget: number; discount: number;
    arrivalStatus: "pending" | "partial" | "arrived"; actualArrival: string | null;
    expectedArrival: string | null; generatedAt: Date;
    rows: ReimbursementRow[]; photos: ReimbursementPhoto[];
};
const WIDTH = 794, HEIGHT = 1123, MARGIN = 48, BOTTOM = 1040;
const money = (n: number) => `NT$ ${n.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const dateTime = (date: Date) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
const ascii = (s: string) => new TextEncoder().encode(s);

// A4 pages are rendered at 192 dpi so Chinese uses the device's installed fonts.
// The PDF embeds the page images and evidence; opening it never needs a signed URL.
function imagePagesToPdf(images: Uint8Array[]): Blob {
    const chunks: Uint8Array[] = [], offsets = [0];
    let size = 0;
    const push = (bytes: Uint8Array) => { chunks.push(bytes); size += bytes.length; };
    const object = (id: number, content: Uint8Array[]) => {
        offsets[id] = size; push(ascii(`${id} 0 obj\n`)); content.forEach(push); push(ascii("\nendobj\n"));
    };
    push(ascii("%PDF-1.4\n%SnackVote\n"));
    object(1, [ascii("<< /Type /Catalog /Pages 2 0 R >>")]);
    object(2, [ascii(`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`)]);
    images.forEach((jpeg, i) => {
        const id = 3 + i * 3;
        object(id, [ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /P ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`)]);
        object(id + 1, [ascii(`<< /Type /XObject /Subtype /Image /Width ${WIDTH * 2} /Height ${HEIGHT * 2} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, ascii("\nendstream")]);
        const commands = ascii("q\n595.28 0 0 841.89 0 0 cm\n/P Do\nQ\n");
        object(id + 2, [ascii(`<< /Length ${commands.length} >>\nstream\n`), commands, ascii("endstream")]);
    });
    const start = size, count = 3 + images.length * 3;
    push(ascii(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`));
    return new Blob(chunks.map(chunk => new Uint8Array(chunk).buffer), { type: "application/pdf" });
}

export async function createReimbursementPdf(data: ReimbursementData): Promise<Blob> {
    const overview = data.photos.filter(photo => photo.kind === "overview");
    const items = data.photos.filter(photo => photo.kind === "item");
    if (overview.length + items.length !== data.photos.length) throw new Error("驗收照片分類不完整，請重新整理後重試。");
    if (overview.length > 1 || items.length > 5) throw new Error("全部商品最多 1 張、個別商品最多 5 張，請先確認照片數量再下載。");
    if (!data.rows.length) throw new Error("目前沒有可匯出的採購品項。");
    if (![data.budget, data.discount, ...data.rows.flatMap(row => [row.quantity, row.unitPrice])].every(n => Number.isFinite(n) && n >= 0)) throw new Error("採購金額或數量有誤，請確認後重試。");
    const gross = data.rows.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0);
    if (data.discount > purchaseTotals(gross).gross) throw new Error("折扣超過清單金額，請確認後再下載。");
    const totals = purchaseTotals(gross, data.discount);
    const complete = data.rows.every(row => row.purchased);
    const remaining = Math.round((data.budget - totals.net) * 100) / 100;
    await document.fonts.ready;
    const canvas = document.createElement("canvas"); canvas.width = WIDTH * 2; canvas.height = HEIGHT * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("瀏覽器無法產生 PDF，請改用最新版 Chrome 或 Edge。");
    ctx.scale(2, 2); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.textBaseline = "top";
    const contentWidth = WIDTH - MARGIN * 2;
    const font = (size = 12, bold = false) => { ctx.font = `${bold ? "600" : "400"} ${size}px "Microsoft JhengHei", "PingFang TC", "Noto Sans CJK TC", sans-serif`; };
    const text = (value: string, x: number, y: number, size = 12, bold = false, color = "#173f32") => { font(size, bold); ctx.fillStyle = color; ctx.fillText(value, x, y); };
    const lines = (value: string, width: number, size = 12) => {
        font(size); const result: string[] = [];
        for (const paragraph of value.replace(/\r/g, "").split("\n")) {
            let line = "";
            for (const char of paragraph) { if (line && ctx.measureText(line + char).width > width) { result.push(line); line = ""; } line += char; }
            result.push(line);
        }
        return result;
    };
    const widths = [34, 370, 83, 55, 88, 68];
    const wrappedRows = data.rows.map(row => lines(`${row.name}${row.note ? `\n備註：${row.note}` : ""}`, widths[1] - 12));
    // Overview evidence shares page one; individual evidence alone triggers page two.
    function body(draw: boolean) {
        let y = 0;
        const paragraph = (value: string, size = 12, bold = false) => {
            for (const line of lines(value, contentWidth, size)) { if (draw) text(line, MARGIN, y, size, bold); y += size + 6; }
        };
        paragraph("零食採購暨到貨驗收紀錄", 24, true); y += 6;
        paragraph(data.label, 18, true); y += 5;
        paragraph(`文件產生時間：${dateTime(data.generatedAt)}（臺北時間）`, 11);
        paragraph(`活動編號：${data.campaignId}`, 10);
        const statuses = { pending: "待到貨", partial: "部分到貨", arrived: "全部到貨" };
        paragraph(`採購進度：${complete ? "已完成採購" : `尚未完成（${data.rows.filter(row => row.purchased).length}／${data.rows.length} 項已採購）`}　到貨狀態：${statuses[data.arrivalStatus]}`);
        paragraph(`預計到貨：${data.expectedArrival ?? "未填寫"}　${data.arrivalStatus === "partial" ? "最近一批到貨" : "實際到貨"}：${data.actualArrival ?? "未登記"}`); y += 12;
        if (draw) {
            ctx!.fillStyle = "#e9efe9"; ctx!.fillRect(MARGIN, y, contentWidth, 28);
            let x = MARGIN; ["項次", "商品／備註", "採購單價", "數量", "小計", "狀態"].forEach((label, i) => { text(label, x + 5, y + 7, 12, true); x += widths[i]; });
        }
        y += 28;
        data.rows.forEach((row, i) => {
            const height = Math.max(30, wrappedRows[i].length * 17 + 12);
            if (draw) {
                let x = MARGIN;
                const values = [String(i + 1), "", row.unitPrice.toLocaleString("zh-TW", { maximumFractionDigits: 0 }), String(row.quantity), purchaseTotals(row.unitPrice * row.quantity).gross.toLocaleString("zh-TW", { maximumFractionDigits: 0 }), row.purchased ? "已採購" : "待採購"];
                values.forEach((value, col) => {
                    if (col === 1) wrappedRows[i].forEach((line, j) => text(line, x + 5, y + 6 + j * 17));
                    else { font(12); const fitted = Math.min(12, (widths[col] - 10) / Math.max(ctx!.measureText(value).width, 1) * 12); text(value, x + 5, y + 6, fitted); }
                    x += widths[col];
                });
                ctx!.strokeStyle = "#dce3dd"; ctx!.beginPath(); ctx!.moveTo(MARGIN, y + height); ctx!.lineTo(WIDTH - MARGIN, y + height); ctx!.stroke();
            }
            y += height;
        });
        y += 12;
        const summary = [
            [`本期預算：${money(data.budget)}`, `清單金額（折扣前）：${money(totals.gross)}`],
            [`折扣總額：${money(totals.discount)}`, `${remaining < 0 ? "超出預算" : "預算餘額"}：${money(Math.abs(remaining))}`],
        ];
        summary.forEach(pair => {
            const columns = pair.map(value => lines(value, contentWidth / 2 - 14, 12));
            if (draw) columns.forEach((column, i) => column.forEach((line, j) => text(line, MARGIN + i * contentWidth / 2, y + j * 18)));
            y += Math.max(...columns.map(column => column.length)) * 18 + 4;
        });
        paragraph(`${complete ? "實際採購金額" : "清單金額"}（折扣後）：${money(totals.net)}`, 17, true);
        if (!complete) paragraph("採購尚未完成，折扣後金額為整份清單金額。", 11);
        paragraph("本文件為系統採購及驗收紀錄，核銷時併附發票或收據。", 10);
        if (!data.photos.length) paragraph("驗收照片：尚未上傳", 11);
        if (items.length) paragraph(`個別商品驗收照片：共 ${items.length} 張，附於第 2 頁。`, 11);
        return y;
    }
    text("SNACK VOTE / 採購核銷附件", MARGIN, 36, 12, true);
    ctx.fillStyle = "#173f32"; ctx.fillRect(MARGIN, 61, contentWidth, 2);
    const naturalHeight = body(false);
    const photoReserve = overview.length ? 300 : 0;
    const scale = Math.min(1, (BOTTOM - 82 - photoReserve) / naturalHeight);
    ctx.save(); ctx.translate(MARGIN + (contentWidth - contentWidth * scale) / 2, 82); ctx.scale(scale, scale); ctx.translate(-MARGIN, 0); body(true); ctx.restore();
    const pages: Uint8Array[] = [];
    const pageCount = items.length ? 2 : 1;
    const capturePage = (page: number) => {
        text("零食共構網站 · 採購及驗收紀錄", MARGIN, 1074, 10, false, "#627369");
        text(`第 ${page}／${pageCount} 頁`, WIDTH - 110, 1074, 10, false, "#627369");
        const encoded = atob(canvas.toDataURL("image/jpeg", 0.94).split(",")[1]);
        pages.push(Uint8Array.from(encoded, char => char.charCodeAt(0)));
    };
    async function drawPhotos(photos: ReimbursementPhoto[], top: number, label: string) {
        if (!photos.length) return;
        text(label + "驗收照片（共 " + photos.length + " 張）", MARGIN, top, 14, true); top += 25;
        const areaHeight = BOTTOM - top;
        // Choose the grid whose cells offer the largest average image area.
        const bitmaps: ImageBitmap[] = [];
        try {
            for (let i = 0; i < photos.length; i++) bitmaps.push(await createImageBitmap(photos[i].blob).catch(() => { throw new Error(`第 ${i + 1} 張驗收照片無法讀取，PDF 未產生。`); }));
            const gap = 12; let columns = 1, bestArea = -1;
            for (let candidate = 1; candidate <= Math.min(photos.length, 5); candidate++) {
                const rows = Math.ceil(photos.length / candidate);
                const w = (contentWidth - (candidate - 1) * gap) / candidate, h = (areaHeight - (rows - 1) * gap) / rows - 24;
                if (h <= 0) continue;
                const area = bitmaps.reduce((sum, bitmap) => { const ratio = Math.min(w / bitmap.width, h / bitmap.height); return sum + bitmap.width * bitmap.height * ratio * ratio; }, 0);
                if (area > bestArea) { bestArea = area; columns = candidate; }
            }
            const rows = Math.ceil(bitmaps.length / columns), cellWidth = (contentWidth - (columns - 1) * gap) / columns, cellHeight = (areaHeight - (rows - 1) * gap) / rows;
            bitmaps.forEach((bitmap, i) => {
                const x = MARGIN + (i % columns) * (cellWidth + gap), y = top + Math.floor(i / columns) * (cellHeight + gap);
                const stamp = photos[i].createdAt ? dateTime(new Date(photos[i].createdAt)).split(" ")[0] : "未記錄";
                const caption = `照片 ${i + 1} · ${stamp}`; font(10); const captionSize = Math.min(10, cellWidth / Math.max(ctx!.measureText(caption).width, 1) * 10);
                text(caption, x, y, captionSize, true);
                const imageHeight = Math.max(1, cellHeight - 24), ratio = Math.min(cellWidth / bitmap.width, imageHeight / bitmap.height);
                ctx!.drawImage(bitmap, x + (cellWidth - bitmap.width * ratio) / 2, y + 20 + (imageHeight - bitmap.height * ratio) / 2, bitmap.width * ratio, bitmap.height * ratio);
            });
        } finally { bitmaps.forEach(bitmap => bitmap.close()); }
    }
    await drawPhotos(overview, 82 + naturalHeight * scale + 18, "全部商品");
    capturePage(1);
    if (items.length) {
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
        text("SNACK VOTE / 個別商品驗收照片附件", MARGIN, 36, 12, true);
        ctx.fillStyle = "#173f32"; ctx.fillRect(MARGIN, 61, contentWidth, 2);
        let top = 82;
        for (const line of lines(data.label, contentWidth, 18)) { text(line, MARGIN, top, 18, true); top += 24; }
        text("活動編號：" + data.campaignId, MARGIN, top + 4, 10); top += 30;
        await drawPhotos(items, top, "個別商品");
        capturePage(2);
    }
    canvas.width = 0; canvas.height = 0;
    return imagePagesToPdf(pages);
}

export function reimbursementFilename(label: string, generatedAt: Date): string {
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(generatedAt);
    return `${label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 70) || "零食採購"}-核銷附件-${day}.pdf`;
}


