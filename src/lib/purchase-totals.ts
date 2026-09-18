/** Monetary totals are rounded to cents; a discount can never create negative spending. */
export function purchaseTotals(gross: number, discount = 0) {
    const grossCents = Math.max(0, Math.round(gross * 100));
    const discountCents = Math.max(0, Math.round(discount * 100));
    return { gross: grossCents / 100, discount: discountCents / 100, net: Math.max(0, grossCents - discountCents) / 100 };
}

export function validPurchaseDiscount(value: string, gross: number) {
    return /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && Number.isFinite(Number(value))
        && Number(value) >= 0 && Number(value) <= gross && Number(value) < 10000000000;
}
