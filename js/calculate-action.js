// The calculate_split action, shared by this page (site-actions.js) and by the action
// bridge that other agent sites load (bridge/bridge-actions.js). It reads nothing from
// any page and stores nothing: it runs Kongsi's own bill maths on the input it is given.
import { BillStore } from "./bill-store.js";
import { LIMITS } from "./split-core.js";

export const NAME = { type: "string", minLength: 1, maxLength: 40 };
export const PRICE = {
  type: "number",
  minimum: 0.01,
  maximum: 100000,
  description: "Price of ONE unit in Ringgit, e.g. 12.9 for RM 12.90.",
};
export const QUANTITY = { type: "integer", minimum: 1, maximum: LIMITS.maxQuantity, description: "How many units. Default 1." };
export const SHARED_BY = {
  type: "array",
  maxItems: LIMITS.maxPeople,
  items: NAME,
  description: "Names of the people who shared it. Empty list = everyone on the bill.",
};
export const PERCENT = { type: "number", minimum: 0, maximum: LIMITS.maxPercent };
export const ROUNDING = {
  type: "string",
  enum: ["nearest_5_sen", "none"],
  description: "nearest_5_sen = Malaysian cash rounding of the total; none = exact.",
};

export const CALCULATE_DESCRIPTION = "Work out exact shares for a bill given in full, without changing anything: totals, each person's share (adds up to the total, to the sen) and who owes the payer. Use it for what-if questions, or when the bill is not on this page.";

export const CALCULATE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["people", "items"],
  properties: {
    people: { type: "array", minItems: 1, maxItems: LIMITS.maxPeople, items: NAME, description: "Everyone splitting the bill, e.g. [\"A\",\"B\"]." },
    items: {
      type: "array",
      minItems: 1,
      maxItems: LIMITS.maxItems,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "unitPrice"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 60 },
          unitPrice: PRICE,
          quantity: QUANTITY,
          sharedBy: SHARED_BY,
        },
      },
    },
    servicePct: { ...PERCENT, description: "Service charge percent. Default 0." },
    taxPct: { ...PERCENT, description: "Tax percent. Default 0." },
    taxOnService: { type: "boolean", description: "Tax on food plus service. Default true." },
    discount: { type: "number", minimum: 0, maximum: 100000, description: "Discount in Ringgit. Default 0." },
    rounding: { ...ROUNDING, description: "Default none." },
    paidBy: { type: "string", maxLength: 40, description: "Who paid, if known." },
  },
});

/**
 * The action definition. Extra fields, such as availability and callerOrigins for the
 * bridge, are merged in.
 */
export function calculateSplitAction(extra = {}) {
  return {
    name: "calculate_split",
    description: CALCULATE_DESCRIPTION,
    effect: "read",
    inputSchema: CALCULATE_SCHEMA,
    execute: (args) => BillStore.calculate(args),
    ...extra,
  };
}
