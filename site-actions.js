// Registers Kongsi's bill operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
// Each action wraps a BillStore method the page's own forms use; the money rules live
// in js/split-core.js, never here and never in the model.
import { App } from "./js/app.js";
import { NAME, PERCENT, PRICE, QUANTITY, ROUNDING, SHARED_BY, calculateSplitAction } from "./js/calculate-action.js";
import { LIMITS } from "./js/split-core.js";

class SiteActions {
  static registerActions(actions) {
    actions.register(SiteActions.getBill());
    actions.register(SiteActions.addPeople());
    actions.register(SiteActions.removePerson());
    actions.register(SiteActions.addItems());
    actions.register(SiteActions.updateItem());
    actions.register(SiteActions.removeItem());
    actions.register(SiteActions.setCharges());
    actions.register(SiteActions.setPayer());
    actions.register(SiteActions.calculateSplit());
    actions.register(SiteActions.clearBill());
  }

  static getBill() {
    return {
      name: "get_bill",
      description: "Read the bill on this page: people, items with ids, charges, totals, each person's share, who owes the payer, and the version. Call it before answering about the bill, and again in each turn that needs it: the visitor can also edit the page.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => App.page.getState(),
    };
  }

  static addPeople() {
    return {
      name: "add_people",
      description: "Call it only when the visitor asks or names people who were at the meal. Adds people to the bill by name; names already there are skipped. Returns the updated bill.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["names"],
        properties: {
          names: { type: "array", minItems: 1, maxItems: LIMITS.maxPeople, items: NAME, description: "First names as the visitor gave them. Use \"Me\" for the visitor if they gave no name." },
        },
      },
      execute: (args) => App.page.addPeople(args.names),
    };
  }

  static removePerson() {
    return {
      name: "remove_person",
      description: "Call it only when the visitor asks. Removes one person; the site refuses while they are the only person sharing an item. Returns the updated bill.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: { name: { ...NAME, description: "The person's name as on the bill." } },
      },
      execute: (args) => App.page.removePerson(args.name),
    };
  }

  static addItems() {
    return {
      name: "add_items",
      description: "Call it only when the visitor asks or describes what was ordered. Adds one or more items in one call. People named in sharedBy who are not on the bill yet are added. Never work out shares yourself: the site does. Returns the updated bill.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: LIMITS.maxItems,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "unitPrice"],
              properties: {
                name: { type: "string", minLength: 1, maxLength: 60, description: "Item name, e.g. Teh tarik." },
                unitPrice: PRICE,
                quantity: QUANTITY,
                sharedBy: SHARED_BY,
              },
            },
          },
        },
      },
      execute: (args) => App.page.addItems(args.items),
    };
  }

  static updateItem() {
    return {
      name: "update_item",
      description: "Call it only when the visitor asks to correct an item. Give the item id from website_get_bill and only the fields that change. Returns the updated bill.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 12, description: "Item id from website_get_bill, e.g. i3." },
          name: { type: "string", minLength: 1, maxLength: 60 },
          unitPrice: PRICE,
          quantity: QUANTITY,
          sharedBy: SHARED_BY,
        },
      },
      execute: (args) => {
        const { id, ...changes } = args;
        return App.page.updateItem(id, changes);
      },
    };
  }

  static removeItem() {
    return {
      name: "remove_item",
      description: "Call it only when the visitor asks. Removes one item by its id from website_get_bill. Returns the updated bill.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: { id: { type: "string", minLength: 1, maxLength: 12, description: "Item id from website_get_bill." } },
      },
      execute: (args) => App.page.removeItem(args.id),
    };
  }

  static setCharges() {
    return {
      name: "set_charges",
      description: "Call it only when the visitor asks or states the bill's charges. Sets service charge %, tax % (e.g. SST), whether tax also applies to the service charge, a discount in Ringgit and the rounding. Give only what changes. Returns the updated bill.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          servicePct: { ...PERCENT, description: "Service charge percent, e.g. 10." },
          taxPct: { ...PERCENT, description: "Tax percent, e.g. 6 or 8." },
          taxOnService: { type: "boolean", description: "True if tax is charged on food plus service charge." },
          discount: { type: "number", minimum: 0, maximum: 100000, description: "Discount off the food in Ringgit." },
          rounding: ROUNDING,
        },
      },
      execute: (args) => App.page.setCharges(args),
    };
  }

  static setPayer() {
    return {
      name: "set_payer",
      description: "Call it only when the visitor says who paid the whole bill. The page then shows who owes that person how much. Empty name clears it.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: { name: { type: "string", maxLength: 40, description: "Name of the person who paid, as on the bill." } },
      },
      execute: (args) => App.page.setPayer(args.name),
    };
  }

  /** Shared with the bridge under the same name and input (bridge/bridge-actions.js). */
  static calculateSplit() {
    return calculateSplitAction();
  }

  static clearBill() {
    return {
      name: "clear_bill",
      description: "Clear every person and item and reset the charges. Only when the visitor asks to start over. In the turn you call it, first call website_get_bill and wait for its result: pass its version. The browser asks the visitor to confirm.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["expectedVersion"],
        properties: {
          expectedVersion: { type: "integer", minimum: 0, description: "The version from website_get_bill in this turn." },
        },
      },
      execute: (args) => App.page.clearBill(args.expectedVersion),
    };
  }
}

export const registerActions = SiteActions.registerActions;
