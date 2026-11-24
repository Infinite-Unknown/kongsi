// Kongsi bill maths. Pure functions, no DOM, so the page, the agent's actions, the
// action bridge (other agent sites) and the tests all use exactly the same rules.
//
// Money is kept in integer sen (1 RM = 100 sen). Every share is worked out from the
// exact fractions and then allocated with the largest-remainder method, so the shares
// always add up to the bill total, to the sen.

export const LIMITS = Object.freeze({
  maxPeople: 20,
  maxItems: 60,
  maxNameLength: 30,
  maxItemNameLength: 60,
  maxUnitPriceSen: 10000000, // RM 100,000.00
  maxQuantity: 99,
  maxPercent: 30,
});

export const ROUNDING_MODES = Object.freeze({
  none: "No rounding (exact to the sen)",
  nearest_5_sen: "Round the bill total to the nearest 5 sen (Malaysian cash rounding)",
});

/**
 * Format sen as a Ringgit amount, such as "RM 12.50" or "-RM 0.02".
 *
 * :param sen: An integer amount in sen.
 * :return: The amount as text.
 */
export function formatRM(sen) {
  const sign = sen < 0 ? "-" : "";
  const abs = Math.abs(Math.round(sen));
  const ringgit = Math.floor(abs / 100).toLocaleString("en-MY");
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}RM ${ringgit}.${cents}`;
}

/**
 * Convert a Ringgit number, such as 12.5, to integer sen, such as 1250.
 *
 * :param ringgit: The amount in Ringgit.
 * :return: The amount in sen, or NaN when it is not a finite number.
 */
export function toSen(ringgit) {
  const value = Number(ringgit);
  if (!Number.isFinite(value)) {
    return NaN;
  }
  // Round through a string so 0.29 * 100 = 28.999... still becomes 29.
  return Math.round(Number((value * 100).toFixed(6)));
}

/**
 * Round half up to whole sen.
 *
 * :param value: An amount in (possibly fractional) sen.
 * :return: Whole sen.
 */
function roundSen(value) {
  return Math.floor(value + 0.5 + 1e-9);
}

/**
 * Malaysian rounding mechanism: a total ending in 1-2 sen rounds down to 0, 3-4 up to 5,
 * 6-7 down to 5 and 8-9 up to the next 10.
 *
 * :param sen: The total in sen.
 * :return: The total rounded to the nearest 5 sen.
 */
export function roundToNearest5Sen(sen) {
  return Math.round(sen / 5) * 5;
}

/**
 * Normalise a person's name for matching: trimmed, inner spaces collapsed, case-folded.
 *
 * :param name: The name.
 * :return: The key used to compare names.
 */
export function nameKey(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Tidy a name for display: trimmed with inner spaces collapsed.
 *
 * :param name: The name.
 * :return: The tidy name.
 */
export function tidyName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Check charge settings without changing anything.
 *
 * :param charges: {servicePct, taxPct, taxOnService, discountSen, rounding}.
 * :return: {ok: true} or {ok: false, reason, field}.
 */
export function checkCharges(charges) {
  const { servicePct, taxPct, discountSen, rounding } = charges;
  for (const [field, value, label] of [["servicePct", servicePct, "Service charge"], ["taxPct", taxPct, "Tax"]]) {
    if (!Number.isFinite(value) || value < 0 || value > LIMITS.maxPercent) {
      return { ok: false, reason: `${label} must be between 0% and ${LIMITS.maxPercent}%.`, field };
    }
  }
  if (!Number.isInteger(discountSen) || discountSen < 0) {
    return { ok: false, reason: "The discount must be zero or more.", field: "discount" };
  }
  if (!Object.hasOwn(ROUNDING_MODES, rounding)) {
    return { ok: false, reason: `Rounding must be one of: ${Object.keys(ROUNDING_MODES).join(", ")}.`, field: "rounding" };
  }
  return { ok: true };
}

/**
 * Work out the bill: totals, each person's exact share and who owes the payer what.
 *
 * Each item's line total is split equally between the people who shared it (an empty
 * sharedBy list means everyone). Discount, service charge, tax and the rounding
 * adjustment are spread in proportion to what each person ate. The final shares are
 * allocated with the largest-remainder method, so they add up to the total exactly.
 *
 * :param bill: {people: [{id, name}], items: [{id, name, unitPriceSen, quantity, sharedBy: [personId]}],
 *   charges: {servicePct, taxPct, taxOnService, discountSen, rounding}, paidBy: personId|null}.
 * :return: The breakdown, with amounts in sen and as text.
 */
export function computeSplit(bill) {
  const people = bill.people || [];
  const items = bill.items || [];
  const charges = bill.charges;
  const exactFood = new Map(people.map((p) => [p.id, 0]));
  let subtotal = 0;
  const lines = [];
  for (const item of items) {
    const lineTotal = item.unitPriceSen * item.quantity;
    subtotal += lineTotal;
    const sharers = item.sharedBy && item.sharedBy.length ? item.sharedBy : people.map((p) => p.id);
    const each = sharers.length ? lineTotal / sharers.length : 0;
    for (const id of sharers) {
      exactFood.set(id, (exactFood.get(id) || 0) + each);
    }
    lines.push({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unitPrice: formatRM(item.unitPriceSen),
      lineTotal: formatRM(lineTotal),
      lineTotalSen: lineTotal,
      sharedBy: item.sharedBy && item.sharedBy.length
        ? item.sharedBy.map((id) => people.find((p) => p.id === id)?.name ?? id)
        : ["Everyone"],
      eachPays: sharers.length ? formatRM(roundSen(each)) : formatRM(0),
    });
  }

  const discount = Math.min(charges.discountSen || 0, subtotal);
  const afterDiscount = subtotal - discount;
  const service = roundSen(afterDiscount * charges.servicePct / 100);
  const taxBase = afterDiscount + (charges.taxOnService ? service : 0);
  const tax = roundSen(taxBase * charges.taxPct / 100);
  const beforeRounding = afterDiscount + service + tax;
  const total = charges.rounding === "nearest_5_sen" ? roundToNearest5Sen(beforeRounding) : beforeRounding;
  const roundingAdjustment = total - beforeRounding;

  // Largest remainder: floor every exact share, then hand the leftover sen to the
  // largest fractional parts (ties go to the person listed first).
  const exactShares = people.map((p) => ({
    id: p.id,
    exact: subtotal > 0 ? (exactFood.get(p.id) / subtotal) * total : 0,
  }));
  let allocated = 0;
  for (const s of exactShares) {
    s.sen = Math.floor(s.exact + 1e-9);
    s.remainder = s.exact - s.sen;
    allocated += s.sen;
  }
  let leftover = total - allocated;
  const order = exactShares
    .map((s, index) => ({ s, index }))
    .sort((a, b) => (b.s.remainder - a.s.remainder) || (a.index - b.index));
  for (let i = 0; leftover > 0 && order.length; i = (i + 1) % order.length) {
    order[i].s.sen += 1;
    leftover -= 1;
  }

  const payer = people.find((p) => p.id === bill.paidBy) || null;
  const shares = people.map((p, index) => {
    const share = exactShares[index].sen;
    const food = roundSen(exactFood.get(p.id) || 0);
    return {
      personId: p.id,
      name: p.name,
      foodSen: food,
      food: formatRM(food),
      chargesSen: share - food,
      charges: formatRM(share - food),
      shareSen: share,
      share: formatRM(share),
    };
  });
  const settlement = payer
    ? shares
      .filter((s) => s.personId !== payer.id && s.shareSen > 0)
      .map((s) => ({ from: s.name, to: payer.name, amountSen: s.shareSen, amount: formatRM(s.shareSen) }))
    : [];

  return {
    currency: "MYR",
    lines,
    subtotalSen: subtotal,
    subtotal: formatRM(subtotal),
    discountSen: discount,
    discount: formatRM(discount),
    serviceChargeSen: service,
    serviceCharge: formatRM(service),
    taxSen: tax,
    tax: formatRM(tax),
    roundingAdjustmentSen: roundingAdjustment,
    roundingAdjustment: formatRM(roundingAdjustment),
    totalSen: total,
    total: formatRM(total),
    shares,
    sharesAddUp: shares.reduce((sum, s) => sum + s.shareSen, 0) === total,
    paidBy: payer ? payer.name : null,
    settlement,
    rules: {
      servicePct: charges.servicePct,
      taxPct: charges.taxPct,
      taxOnService: !!charges.taxOnService,
      rounding: ROUNDING_MODES[charges.rounding],
      method: "Each item is split equally between the people who shared it. Discount, service charge, tax and rounding are spread in proportion to what each person had. Shares are allocated to the sen and always add up to the total.",
    },
  };
}

/**
 * Build a bill from plain names, as another site or the what-if calculator gives it,
 * and check it. Nothing is stored.
 *
 * :param input: {people: [name], items: [{name, unitPrice, quantity, sharedBy: [name]}],
 *   servicePct, taxPct, taxOnService, discount, rounding, paidBy}.
 * :return: {ok: true, bill} or {ok: false, reason, field}.
 */
export function billFromPlainInput(input) {
  const names = [];
  const seen = new Set();
  const addName = (raw) => {
    const name = tidyName(raw);
    const key = nameKey(name);
    if (!key) {
      return { ok: false, reason: "A person's name is empty.", field: "people" };
    }
    if (name.length > LIMITS.maxNameLength) {
      return { ok: false, reason: `"${name}" is longer than ${LIMITS.maxNameLength} characters.`, field: "people" };
    }
    if (!seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
    return { ok: true };
  };
  for (const raw of input.people || []) {
    const r = addName(raw);
    if (!r.ok) return r;
  }
  for (const item of input.items || []) {
    for (const raw of item.sharedBy || []) {
      const r = addName(raw);
      if (!r.ok) return r;
    }
  }
  if (names.length > LIMITS.maxPeople) {
    return { ok: false, reason: `A bill can have at most ${LIMITS.maxPeople} people.`, field: "people" };
  }
  if (!names.length) {
    return { ok: false, reason: "Name at least one person.", field: "people" };
  }
  const people = names.map((name, i) => ({ id: `p${i + 1}`, name }));
  const idOf = (raw) => people.find((p) => nameKey(p.name) === nameKey(raw)).id;
  const items = [];
  for (const [i, raw] of (input.items || []).entries()) {
    const checked = checkItem({ name: raw.name, unitPriceSen: toSen(raw.unitPrice), quantity: raw.quantity ?? 1 });
    if (!checked.ok) return checked;
    items.push({
      id: `i${i + 1}`,
      name: tidyName(raw.name),
      unitPriceSen: toSen(raw.unitPrice),
      quantity: raw.quantity ?? 1,
      sharedBy: [...new Set((raw.sharedBy || []).map(idOf))],
    });
  }
  if (items.length > LIMITS.maxItems) {
    return { ok: false, reason: `A bill can have at most ${LIMITS.maxItems} items.`, field: "items" };
  }
  const charges = {
    servicePct: input.servicePct ?? 0,
    taxPct: input.taxPct ?? 0,
    taxOnService: input.taxOnService ?? true,
    discountSen: toSen(input.discount ?? 0),
    rounding: input.rounding ?? "none",
  };
  const chargeCheck = checkCharges(charges);
  if (!chargeCheck.ok) return chargeCheck;
  let paidBy = null;
  if (input.paidBy) {
    const key = nameKey(input.paidBy);
    const payer = people.find((p) => nameKey(p.name) === key);
    if (!payer) {
      return { ok: false, reason: `The payer "${tidyName(input.paidBy)}" is not one of the people on the bill.`, field: "paidBy" };
    }
    paidBy = payer.id;
  }
  return { ok: true, bill: { people, items, charges, paidBy } };
}

/**
 * Check one item's fields.
 *
 * :param item: {name, unitPriceSen, quantity}.
 * :return: {ok: true} or {ok: false, reason, field}.
 */
export function checkItem(item) {
  const name = tidyName(item.name);
  if (!name) {
    return { ok: false, reason: "An item needs a name.", field: "itemName" };
  }
  if (name.length > LIMITS.maxItemNameLength) {
    return { ok: false, reason: `Item names can be at most ${LIMITS.maxItemNameLength} characters.`, field: "itemName" };
  }
  if (!Number.isInteger(item.unitPriceSen) || item.unitPriceSen <= 0 || item.unitPriceSen > LIMITS.maxUnitPriceSen) {
    return { ok: false, reason: `The price of "${name}" must be more than RM 0.00 and at most ${formatRM(LIMITS.maxUnitPriceSen)}.`, field: "itemPrice" };
  }
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > LIMITS.maxQuantity) {
    return { ok: false, reason: `The quantity of "${name}" must be a whole number from 1 to ${LIMITS.maxQuantity}.`, field: "itemQuantity" };
  }
  return { ok: true };
}
