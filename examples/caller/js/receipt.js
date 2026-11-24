// The receipt this example page shows. Seats, not names: the page never holds
// anyone's personal details, so nothing personal can reach a partner site.
export const RECEIPT = Object.freeze({
  venue: "Makan Night (example caller site)",
  date: "Example receipt",
  lines: Object.freeze([
    { seat: "Seat 1", item: "Nasi lemak ayam", qty: 1, unitPrice: 14.9 },
    { seat: "Seat 2", item: "Mee goreng mamak", qty: 1, unitPrice: 10.5 },
    { seat: "Seat 3", item: "Char kuey teow", qty: 1, unitPrice: 11.5 },
    { seat: "Shared", item: "Satay (10 sticks)", qty: 1, unitPrice: 18 },
    { seat: "Shared", item: "Teh tarik", qty: 4, unitPrice: 3.2 },
  ]),
  charges: Object.freeze({ servicePct: 10, taxPct: 6, taxOnService: true, rounding: "nearest 5 sen" }),
  diners: 3,
});

export function receiptState(kongsiLink) {
  return {
    venue: RECEIPT.venue,
    diners: RECEIPT.diners,
    lines: RECEIPT.lines.map((l) => ({ seat: l.seat, item: l.item, quantity: l.qty, unitPrice: `RM ${l.unitPrice.toFixed(2)}` })),
    charges: RECEIPT.charges,
    note: "Shared lines are for all seats. This page does not total or split the bill.",
    partners: [{ name: "Kongsi", what: "splits a bill to the sen", link: kongsiLink }],
  };
}
