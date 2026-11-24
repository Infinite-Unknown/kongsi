// The example caller's one action: read the receipt on this page.
import { receiptState } from "./js/receipt.js";

const KONGSI_LINK = "http://127.0.0.1:8471/";

export function registerActions(actions) {
  actions.register({
    name: "get_receipt",
    description: "Read the receipt on this page: each line with its seat, item, quantity and unit price, the charges, the number of diners, and the partner sites with their links. Call it before answering about the receipt.",
    effect: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: () => receiptState(KONGSI_LINK),
  });
}
