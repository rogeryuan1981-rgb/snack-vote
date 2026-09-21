import { purchaseTotals } from "./purchase-totals";

export type ReimbursementRow = { name: string; quantity: number; unitPrice: number; purchased: boolean; note: string | null };
export type ReimbursementPhoto = { blob: Blob; createdAt: string | null };
export type ReimbursementData = {
    campaignId: string; label: string; budget: number; discount: number;
    arrivalStatus: "pending" | "partial" | "arrived"; actualArrival: string | null;
    expectedArrival: string | null; generatedAt: Date;
    rows: ReimbursementRow[]; photos: ReimbursementPhoto[];
};
const WIDTH = 794, HEIGHT = 1123, MARGIN = 48, BOTTOM = 1040;
const money = (n: number) => `NT$ ${n.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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
    if (!data.rows.length) throw new Error("目前沒有可匯出的採購品項。");
    if (![data.budget, data.discount, ...data.rows.flatMap(row => [row.quantity, row.unitPrice])].every(n => Number.isFinite(n) && n >= 0)) throw new Error("採購金額或數量有誤，請確認後重試。");
    await document.fonts.ready;
    const pages: Uint8Array[] = [];
    let canvas!: HTMLCanvasElement, ctx!: CanvasRenderingContext2D, y = 0, pageNumber = 0;
    const font = (size = 14, bold = false) => { ctx.font = `${bold ? "600" : "400"} ${size}px "Microsoft JhengHei", "PingFang TC", "Noto Sans CJK TC", sans-serif`; };
    const text = (value: string, x: number, top: number, size = 14, bold = false, color = "#173f32") => { font(size, bold); ctx.fillStyle = color; ctx.fillText(value, x, top); };
    const lines = (value: string, width: number, size = 14) => {
        font(size); const result: string[] = [];
        for (const paragraph of value.replace(/\r/g, "").split("\n")) {
            let line = "";
            for (const char of paragraph) { if (line && ctx.measureText(line + char).width > width) { result.push(line); line = ""; } line += char; }
            result.push(line);
        }
        return result;
    };
    const finish = () => {
        text("零食共構網站 · 採購及驗收紀錄", MARGIN, 1074, 11, false, "#627369");
        text(`第 ${pageNumber} 頁`, WIDTH - 100, 1074, 11, false, "#627369");
        text(`活動編號：${data.campaignId}`, MARGIN, 1092, 9, false, "#627369");
        const encoded = atob(canvas.toDataURL("image/jpeg", 0.94).split(",")[1]);
        pages.push(Uint8Array.from(encoded, char => char.charCodeAt(0)));
        canvas.width = 0; canvas.height = 0;
    };
    const newPage = () => {
        if (pageNumber) finish();
        canvas = document.createElement("canvas"); canvas.width = WIDTH * 2; canvas.height = HEIGHT * 2;
        const context = canvas.getContext("2d"); if (!context) throw new Error("瀏覽器無法產生 PDF，請改用最新版 Chrome 或 Edge。");
        ctx = context; ctx.scale(2, 2); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.textBaseline = "top";
        pageNumber++; text("SNACK VOTE / 採購核銷附件", MARGIN, 36, 12, true);
        ctx.fillStyle = "#173f32"; ctx.fillRect(MARGIN, 61, WIDTH - MARGIN * 2, 2); y = 82;
        if (pageNumber > 1) { text("採購及驗收紀錄（續）", MARGIN, y, 20, true); y += 38; }
    };
    const ensure = (height: number) => { if (y + height > BOTTOM) newPage(); };
    const paragraph = (value: string, size = 14, bold = false) => {
        for (const line of lines(value, WIDTH - MARGIN * 2, size)) { ensure(size + 10); text(line, MARGIN, y, size, bold); y += size + 8; }
    };
    newPage(); paragraph("零食採購暨到貨驗收紀錄", 27, true); y += 12;
    paragraph(data.label, 20, true); y += 10;
    paragraph(`文件產生時間：${dateTime(data.generatedAt)}（臺北時間）`, 12);
    paragraph(`活動編號：${data.campaignId}`, 12);
    const complete = data.rows.every(row => row.purchased);
    const statuses = { pending: "待到貨", partial: "部分到貨", arrived: "全部到貨" };
    paragraph(`採購進度：${complete ? "已完成採購" : `尚未完成（${data.rows.filter(row => row.purchased).length}／${data.rows.length} 項已採購）`}　到貨狀態：${statuses[data.arrivalStatus]}`);
    paragraph(`預計到貨：${data.expectedArrival ?? "未填寫"}　${data.arrivalStatus === "partial" ? "最近一批到貨" : "實際到貨"}：${data.actualArrival ?? "未登記"}`);
    y += 15;
    const widths = [34, 370, 83, 55, 88, 68];
    const headings = ["項次", "商品／備註", "採購單價", "數量", "小計", "狀態"];
    const tableHeader = () => {
        ctx.fillStyle = "#e9efe9"; ctx.fillRect(MARGIN, y, WIDTH - MARGIN * 2, 31);
        let x = MARGIN; headings.forEach((value, i) => { text(value, x + 5, y + 8, 12, true); x += widths[i]; }); y += 31;
    };
    ensure(80); tableHeader();
    data.rows.forEach((row, index) => {
        const content = `${row.name}${row.note ? `\n備註：${row.note}` : ""}`;
        const wrapped = lines(content, widths[1] - 12, 12);
        const fullHeight = Math.max(38, wrapped.length * 18 + 16);
        if (y + fullHeight > BOTTOM && fullHeight <= BOTTOM - 151) { newPage(); tableHeader(); }
        let lineIndex = 0;
        do {
            if (y + 38 > BOTTOM) { newPage(); tableHeader(); }
            const count = Math.min(wrapped.length - lineIndex, Math.max(1, Math.floor((BOTTOM - y - 16) / 18)));
            const height = Math.max(38, count * 18 + 16);
            const values = lineIndex === 0 ? [String(index + 1), "", row.unitPrice.toLocaleString("zh-TW", { maximumFractionDigits: 2 }), String(row.quantity), purchaseTotals(row.unitPrice * row.quantity).gross.toLocaleString("zh-TW", { maximumFractionDigits: 2 }), row.purchased ? "已採購" : "待採購"] : ["", "", "", "", "", "續"];
            let x = MARGIN;
            values.forEach((value, col) => {
                if (col === 1) wrapped.slice(lineIndex, lineIndex + count).forEach((line, j) => text(line, x + 5, y + 8 + j * 18, 12));
                else { font(12); const fitted = Math.min(12, (widths[col] - 10) / Math.max(ctx.measureText(value).width, 1) * 12); text(value, x + 5, y + 8, fitted); }
                x += widths[col];
            });
            y += height; ctx.strokeStyle = "#dce3dd"; ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(WIDTH - MARGIN, y); ctx.stroke();
            lineIndex += count;
        } while (lineIndex < wrapped.length);
    });
    const gross = data.rows.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0);
    if (data.discount > purchaseTotals(gross).gross) throw new Error("折扣超過清單金額，請確認後再下載。");
    const totals = purchaseTotals(gross, data.discount);
    y += 20; ensure(210);
    paragraph(`本期預算：${money(data.budget)}`);
    paragraph(`清單金額（折扣前）：${money(totals.gross)}`);
    paragraph(`折扣總額：${money(totals.discount)}`);
    paragraph(`${complete ? "實際採購金額" : "清單金額"}（折扣後）：${money(totals.net)}`, 18, true);
    const remaining = Math.round((data.budget - totals.net) * 100) / 100;
    paragraph(`${remaining < 0 ? "超出預算" : "預算餘額"}：${money(Math.abs(remaining))}`);
    if (!complete) paragraph("採購尚未完成，折扣後金額為整份清單金額。", 12);
    paragraph(`驗收照片：${data.photos.length} 張${data.photos.length ? "（附於後頁）" : "，尚未上傳"}`, 12);
    paragraph("本文件為系統採購及驗收紀錄，核銷時併附發票或收據。", 12);
    for (let i = 0; i < data.photos.length; i++) {
        if (i % 2 === 0) { newPage(); paragraph("驗收照片附件", 20, true); y += 14; }
        const photo = data.photos[i];
        const bitmap = await createImageBitmap(photo.blob).catch(() => { throw new Error(`第 ${i + 1} 張驗收照片無法讀取，PDF 未產生。`); });
        const maxWidth = WIDTH - MARGIN * 2, maxHeight = 330;
        const ratio = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height);
        text(`照片 ${i + 1}　上傳時間：${photo.createdAt ? dateTime(new Date(photo.createdAt)) : "未記錄"}`, MARGIN, y, 12, true); y += 27;
        ctx.drawImage(bitmap, MARGIN + (maxWidth - bitmap.width * ratio) / 2, y, bitmap.width * ratio, bitmap.height * ratio);
        bitmap.close(); y += maxHeight + 40;
    }
    finish();
    return imagePagesToPdf(pages);
}

export function reimbursementFilename(label: string, generatedAt: Date): string {
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(generatedAt);
    return `${label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 70) || "零食採購"}-核銷附件-${day}.pdf`;
}

