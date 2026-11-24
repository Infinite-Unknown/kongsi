// The bill on this page and every operation on it. The page's own buttons and forms
// and the assistant's website_* tools call these same methods, so both follow one set
// of rules. Operations refuse bad input by returning {ok: false, reason, field} and
// change nothing; they throw only on unexpected failures.
import {
  LIMITS,
  ROUNDING_MODES,
  billFromPlainInput,
  checkCharges,
  checkItem,
  computeSplit,
  formatRM,
  nameKey,
  tidyName,
  toSen,
} from "./split-core.js";

export const DEFAULT_CHARGES = Object.freeze({
  servicePct: 10,
  taxPct: 6,
  taxOnService: true,
  discountSen: 0,
  rounding: "nearest_5_sen",
});

const STORAGE_KEY = "kongsi.bill.v1";

export class BillStore {
  /**
   * :param options: {storage} — a Storage-like object to keep the bill across reloads, or null.
   */
  constructor({ storage = null } = {}) {
    this.storage = storage;
    this.listeners = new Set();
    this.reset();
    this.load();
  }

  reset() {
    this.people = [];
    this.items = [];
    this.charges = { ...DEFAULT_CHARGES };
    this.paidBy = null;
    this.version = 0;
    this.nextPerson = 1;
    this.nextItem = 1;
    this.lastCleared = null;
  }

  /** Call fn after every change. */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  changed() {
    this.version += 1;
    this.save();
    for (const fn of this.listeners) {
      try {
        fn(this);
      } catch (error) {
        console.error("Bill listener failed", error);
      }
    }
  }

  save() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({
        people: this.people,
        items: this.items,
        charges: this.charges,
        paidBy: this.paidBy,
        version: this.version,
        nextPerson: this.nextPerson,
        nextItem: this.nextItem,
      }));
    } catch {
      // Storage can be full or blocked; the page still works for this visit.
    }
  }

  load() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved.people) || !Array.isArray(saved.items)) return;
      this.people = saved.people;
      this.items = saved.items;
      this.charges = { ...DEFAULT_CHARGES, ...saved.charges };
      this.paidBy = saved.paidBy ?? null;
      this.version = Number.isInteger(saved.version) ? saved.version : 0;
      this.nextPerson = saved.nextPerson || this.people.length + 1;
      this.nextItem = saved.nextItem || this.items.length + 1;
    } catch {
      this.reset();
    }
  }

  // ---- reads ---------------------------------------------------------------------

  findPerson(name) {
    const key = nameKey(name);
    return this.people.find((p) => nameKey(p.name) === key) || null;
  }

  /**
   * The whole bill as plain JSON: people, items, charges, totals, each share, who owes
   * whom, and the version used by clearBill.
   */
  getState() {
    const split = computeSplit(this.bill());
    return {
      version: this.version,
      currency: "MYR (RM)",
      people: this.people.map((p) => p.name),
      items: split.lines.map((line) => ({
        id: line.id,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        sharedBy: line.sharedBy,
      })),
      charges: {
        servicePct: this.charges.servicePct,
        taxPct: this.charges.taxPct,
        taxOnService: this.charges.taxOnService,
        discount: formatRM(this.charges.discountSen),
        rounding: this.charges.rounding,
        roundingMeaning: ROUNDING_MODES[this.charges.rounding],
      },
      paidBy: split.paidBy,
      totals: {
        subtotal: split.subtotal,
        discount: split.discount,
        serviceCharge: split.serviceCharge,
        tax: split.tax,
        roundingAdjustment: split.roundingAdjustment,
        total: split.total,
      },
      shares: split.shares.map((s) => ({ name: s.name, food: s.food, charges: s.charges, share: s.share })),
      sharesAddUp: split.sharesAddUp,
      settlement: split.settlement.map((s) => `${s.from} pays ${s.to} ${s.amount}`),
      method: split.rules.method,
      limits: {
        maxPeople: LIMITS.maxPeople,
        maxItems: LIMITS.maxItems,
        maxPercent: LIMITS.maxPercent,
      },
    };
  }

  bill() {
    return {
      people: this.people,
      items: this.items,
      charges: this.charges,
      paidBy: this.paidBy,
    };
  }

  split() {
    return computeSplit(this.bill());
  }

  itemIds() {
    return this.items.map((i) => i.id);
  }

  // ---- people --------------------------------------------------------------------

  /**
   * Add people by name. Names already on the bill are skipped, not duplicated.
   *
   * :return: {ok, added, alreadyThere, state} or a refusal.
   */
  addPeople(names) {
    const list = Array.isArray(names) ? names : [names];
    const toAdd = [];
    const already = [];
    for (const raw of list) {
      const name = tidyName(raw);
      if (!name) {
        return { ok: false, reason: "A person's name is empty.", field: "personName" };
      }
      if (name.length > LIMITS.maxNameLength) {
        return { ok: false, reason: `"${name}" is longer than ${LIMITS.maxNameLength} characters.`, field: "personName" };
      }
      if (this.findPerson(name) || toAdd.some((n) => nameKey(n) === nameKey(name))) {
        already.push(name);
      } else {
        toAdd.push(name);
      }
    }
    if (this.people.length + toAdd.length > LIMITS.maxPeople) {
      return { ok: false, reason: `A bill can have at most ${LIMITS.maxPeople} people.`, field: "personName" };
    }
    for (const name of toAdd) {
      this.people.push({ id: `p${this.nextPerson++}`, name });
    }
    if (toAdd.length) this.changed();
    return { ok: true, added: toAdd, alreadyThere: already, state: this.getState() };
  }

  /**
   * Remove a person. Refuses while they are the only person sharing an item, so an
   * item never silently becomes "everyone's".
   */
  removePerson(name) {
    const person = this.findPerson(name);
    if (!person) {
      return { ok: false, reason: `No one called "${tidyName(name)}" is on the bill.`, field: "personName" };
    }
    const soleItems = this.items.filter((i) => i.sharedBy.length === 1 && i.sharedBy[0] === person.id);
    if (soleItems.length) {
      return {
        ok: false,
        reason: `${person.name} is the only person sharing ${soleItems.map((i) => `"${i.name}"`).join(", ")}. Give ${soleItems.length > 1 ? "those items" : "that item"} to someone else or remove ${soleItems.length > 1 ? "them" : "it"} first.`,
        field: "personName",
      };
    }
    this.people = this.people.filter((p) => p.id !== person.id);
    for (const item of this.items) {
      item.sharedBy = item.sharedBy.filter((id) => id !== person.id);
    }
    if (this.paidBy === person.id) this.paidBy = null;
    this.changed();
    return { ok: true, removed: person.name, state: this.getState() };
  }

  // ---- items ---------------------------------------------------------------------

  /**
   * Turn sharer names into ids. Unknown names are listed in `missing`.
   */
  resolveSharers(names) {
    const ids = [];
    const missing = [];
    for (const raw of names || []) {
      const key = nameKey(raw);
      if (!key || ["everyone", "all", "everybody", "semua"].includes(key)) {
        continue;
      }
      const person = this.findPerson(raw);
      if (person) {
        if (!ids.includes(person.id)) ids.push(person.id);
      } else if (!missing.some((m) => nameKey(m) === key)) {
        missing.push(tidyName(raw));
      }
    }
    return { ids, missing };
  }

  /**
   * Add several items at once. Prices are in Ringgit. sharedBy lists names; an empty
   * list means everyone. People named here who are not on the bill yet are added.
   * Every item is checked before any change.
   */
  addItems(items) {
    if (!Array.isArray(items) || !items.length) {
      return { ok: false, reason: "Give at least one item.", field: "itemName" };
    }
    if (this.items.length + items.length > LIMITS.maxItems) {
      return { ok: false, reason: `A bill can have at most ${LIMITS.maxItems} items.`, field: "itemName" };
    }
    const prepared = [];
    const newPeople = [];
    for (const raw of items) {
      const quantity = raw.quantity ?? 1;
      const unitPriceSen = toSen(raw.unitPrice);
      const check = checkItem({ name: raw.name, unitPriceSen, quantity });
      if (!check.ok) return check;
      const { missing } = this.resolveSharers(raw.sharedBy);
      for (const name of missing) {
        if (name.length > LIMITS.maxNameLength) {
          return { ok: false, reason: `"${name}" is longer than ${LIMITS.maxNameLength} characters.`, field: "personName" };
        }
        if (!newPeople.some((n) => nameKey(n) === nameKey(name))) newPeople.push(name);
      }
      prepared.push({ name: tidyName(raw.name), unitPriceSen, quantity, sharedBy: raw.sharedBy || [] });
    }
    if (this.people.length + newPeople.length > LIMITS.maxPeople) {
      return { ok: false, reason: `A bill can have at most ${LIMITS.maxPeople} people.`, field: "personName" };
    }
    if (!this.people.length && !newPeople.length) {
      return { ok: false, reason: "Add the people on the bill first, or say who shared each item.", field: "personName" };
    }
    for (const name of newPeople) {
      this.people.push({ id: `p${this.nextPerson++}`, name });
    }
    const added = [];
    for (const item of prepared) {
      const { ids } = this.resolveSharers(item.sharedBy);
      const record = { id: `i${this.nextItem++}`, name: item.name, unitPriceSen: item.unitPriceSen, quantity: item.quantity, sharedBy: ids };
      this.items.push(record);
      added.push(record.id);
    }
    this.changed();
    return { ok: true, addedItemIds: added, addedPeople: newPeople, state: this.getState() };
  }

  /**
   * Change one item. Only the fields given change.
   */
  updateItem(id, changes) {
    const item = this.items.find((i) => i.id === id);
    if (!item) {
      return { ok: false, reason: `There is no item with id "${id}".`, field: "itemId" };
    }
    const next = {
      name: changes.name !== undefined ? changes.name : item.name,
      unitPriceSen: changes.unitPrice !== undefined ? toSen(changes.unitPrice) : item.unitPriceSen,
      quantity: changes.quantity !== undefined ? changes.quantity : item.quantity,
    };
    const check = checkItem(next);
    if (!check.ok) return check;
    let sharedBy = item.sharedBy;
    if (changes.sharedBy !== undefined) {
      const { ids, missing } = this.resolveSharers(changes.sharedBy);
      if (missing.length) {
        return { ok: false, reason: `Not on the bill yet: ${missing.join(", ")}. Add them first.`, field: "sharedBy" };
      }
      sharedBy = ids;
    }
    item.name = tidyName(next.name);
    item.unitPriceSen = next.unitPriceSen;
    item.quantity = next.quantity;
    item.sharedBy = sharedBy;
    this.changed();
    return { ok: true, updated: item.id, state: this.getState() };
  }

  removeItem(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item) {
      return { ok: false, reason: `There is no item with id "${id}".`, field: "itemId" };
    }
    this.items = this.items.filter((i) => i.id !== id);
    this.changed();
    return { ok: true, removed: item.name, state: this.getState() };
  }

  // ---- charges and payer ---------------------------------------------------------

  /**
   * Set service charge, tax, discount (Ringgit) and rounding. Only the fields given change.
   */
  setCharges(changes) {
    const next = { ...this.charges };
    if (changes.servicePct !== undefined) next.servicePct = Number(changes.servicePct);
    if (changes.taxPct !== undefined) next.taxPct = Number(changes.taxPct);
    if (changes.taxOnService !== undefined) next.taxOnService = !!changes.taxOnService;
    if (changes.discount !== undefined) next.discountSen = toSen(changes.discount);
    if (changes.rounding !== undefined) next.rounding = changes.rounding;
    const check = checkCharges(next);
    if (!check.ok) return check;
    this.charges = next;
    this.changed();
    return { ok: true, state: this.getState() };
  }

  /** Set who paid the whole bill, or clear it with an empty name. */
  setPayer(name) {
    if (!tidyName(name)) {
      this.paidBy = null;
      this.changed();
      return { ok: true, paidBy: null, state: this.getState() };
    }
    const person = this.findPerson(name);
    if (!person) {
      return { ok: false, reason: `No one called "${tidyName(name)}" is on the bill. Add them first.`, field: "paidBy" };
    }
    this.paidBy = person.id;
    this.changed();
    return { ok: true, paidBy: person.name, state: this.getState() };
  }

  // ---- what-if and clear ---------------------------------------------------------

  /**
   * Work out a split from plain input without touching this page's bill.
   */
  static calculate(input) {
    const built = billFromPlainInput(input);
    if (!built.ok) return built;
    const split = computeSplit(built.bill);
    return {
      ok: true,
      subtotal: split.subtotal,
      discount: split.discount,
      serviceCharge: split.serviceCharge,
      tax: split.tax,
      roundingAdjustment: split.roundingAdjustment,
      total: split.total,
      shares: split.shares.map((s) => ({ name: s.name, food: s.food, charges: s.charges, share: s.share })),
      sharesAddUp: split.sharesAddUp,
      settlement: split.settlement.map((s) => `${s.from} pays ${s.to} ${s.amount}`),
      method: split.rules.method,
    };
  }

  /**
   * Read-only check for clearBill: what would be cleared, or why it would be refused.
   */
  checkClear(expectedVersion) {
    if (expectedVersion !== this.version) {
      return { ok: false, reason: `The bill changed since it was read (version ${this.version}, not ${expectedVersion}). Read it again before clearing.`, field: "expectedVersion" };
    }
    if (!this.people.length && !this.items.length) {
      return { ok: false, reason: "The bill is already empty.", field: "expectedVersion" };
    }
    const split = this.split();
    return {
      ok: true,
      people: this.people.map((p) => p.name),
      itemCount: this.items.length,
      total: split.total,
    };
  }

  /**
   * Clear every person, item and the payer, and put the charges back to the defaults.
   * The page has no undo for this.
   */
  clearBill(expectedVersion) {
    const check = this.checkClear(expectedVersion);
    if (!check.ok) return check;
    const version = this.version;
    this.reset();
    this.version = version;
    this.changed();
    return { ok: true, cleared: { people: check.people.length, items: check.itemCount, total: check.total }, state: this.getState() };
  }
}
