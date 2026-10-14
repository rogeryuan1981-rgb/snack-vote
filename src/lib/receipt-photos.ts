export type ReceiptPhotoKind = "overview" | "item";
export const receiptPhotoLimits = { overview: 1, item: 5 } as const;
export const receiptPhotoLabels = { overview: "全部商品", item: "個別商品" } as const;
// Preserve older evidence: the earliest unclassified photo is the overview;
// remaining legacy photos are individual photos. Never discard stored evidence.
export function classifyReceiptPhotos<T extends { name: string; created_at?: string | null }>(files: T[]): (T & { kind: ReceiptPhotoKind })[] {
    const sorted = [...files].sort((a,b) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.name.localeCompare(b.name));
    let hasOverview = sorted.some(file => file.name.startsWith("overview-"));
    return sorted.map(file => {
        let kind: ReceiptPhotoKind;
        if (file.name.startsWith("overview-")) kind = "overview";
        else if (file.name.startsWith("item-")) kind = "item";
        else if (!hasOverview) { kind = "overview"; hasOverview = true; }
        else kind = "item";
        return { ...file, kind };
    });
}
