// Bill maths, checked against amounts worked out by hand.
// Run: node --test "tests/*.test.mjs"
import assert from "node:assert/strict";
import test from "node:test";
import { billFromPlainInput, computeSplit, formatRM, roundToNearest5Sen, toSen } from "../js/split-core.js";

const split = (input) => {
  const built = billFromPlainInput(input);
  assert.equal(built.ok, true, built.reason);
  return computeSplit(built.bill);
};

test("Malaysian 5-sen rounding: 1-2 down, 3-4 up to 5, 6-7 down to 5, 8-9 up", () => {
  const cases = { 100: 100, 101: 100, 102: 100, 103: 105, 104: 105, 105: 105, 106: 105, 107: 105, 108: 110, 109: 110 };
  for (const [from, to] of Object.entries(cases)) {
    assert.equal(roundToNearest5Sen(Number(from)), to, `${from} sen`);
  }
});

test("Ringgit to sen does not drift on floating point", () => {
  assert.equal(toSen(0.29), 29);
  assert.equal(toSen(12.9), 1290);
  assert.equal(toSen("1.005"), 101);
  assert.equal(formatRM(123456), "RM 1,234.56");
  assert.equal(formatRM(-2), "-RM 0.02");
});

test("RM 10.00 between three people adds up to the sen", () => {
  const r = split({ people: ["A", "B", "C"], items: [{ name: "Cake", unitPrice: 10 }] });
  assert.deepEqual(r.shares.map((s) => s.shareSen), [334, 333, 333]);
  assert.equal(r.sharesAddUp, true);
});

test("discount, service and tax follow what each person had", () => {
  // A: 30.00, B: 10.00; discount 4.00 -> 36.00; service 10% = 3.60; tax 6% on 39.60 = 2.376 -> 2.38;
  // total 41.98, rounded to 5 sen = 42.00 (+0.02). A gets 3/4 = 31.50, B 10.50.
  const r = split({
    people: ["A", "B"],
    items: [{ name: "Steak", unitPrice: 30, sharedBy: ["A"] }, { name: "Salad", unitPrice: 10, sharedBy: ["B"] }],
    servicePct: 10, taxPct: 6, discount: 4, rounding: "nearest_5_sen", paidBy: "B",
  });
  assert.equal(r.discount, "RM 4.00");
  assert.equal(r.serviceCharge, "RM 3.60");
  assert.equal(r.tax, "RM 2.38");
  assert.equal(r.roundingAdjustment, "RM 0.02");
  assert.equal(r.total, "RM 42.00");
  assert.deepEqual(r.shares.map((s) => s.share), ["RM 31.50", "RM 10.50"]);
  assert.deepEqual(r.settlement.map((s) => `${s.from}>${s.to} ${s.amount}`), ["A>B RM 31.50"]);
});

test("tax only on food when taxOnService is false", () => {
  // 100.00 + 10% service = 10.00; 6% tax on 100.00 = 6.00; total 116.00.
  const r = split({ people: ["A"], items: [{ name: "Set", unitPrice: 100 }], servicePct: 10, taxPct: 6, taxOnService: false });
  assert.equal(r.total, "RM 116.00");
});

test("someone who had nothing pays nothing", () => {
  const r = split({ people: ["A", "B"], items: [{ name: "Kopi", unitPrice: 2.2, sharedBy: ["A"] }], servicePct: 10 });
  assert.deepEqual(r.shares.map((s) => s.share), ["RM 2.42", "RM 0.00"]);
});

test("bad input is refused with a reason", () => {
  assert.match(billFromPlainInput({ people: [], items: [] }).reason, /at least one person/);
  assert.match(billFromPlainInput({ people: ["A"], items: [{ name: "X", unitPrice: 0 }] }).reason, /price/);
  assert.match(billFromPlainInput({ people: ["A"], items: [{ name: "X", unitPrice: 1, quantity: 100 }] }).reason, /quantity/);
  assert.match(billFromPlainInput({ people: ["A"], items: [], servicePct: 40 }).reason, /Service charge/);
  assert.match(billFromPlainInput({ people: ["A"], items: [], paidBy: "Z" }).reason, /payer/);
});

test("many random bills always add up exactly", () => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 500; n += 1) {
    const people = ["A", "B", "C", "D", "E", "F", "G"].slice(0, 1 + Math.floor(rand() * 7));
    const items = Array.from({ length: 1 + Math.floor(rand() * 8) }, (_, i) => ({
      name: `Item ${i}`,
      unitPrice: Math.round(rand() * 5000) / 100 + 0.01,
      quantity: 1 + Math.floor(rand() * 3),
      sharedBy: people.filter(() => rand() < 0.4),
    }));
    const r = split({
      people, items,
      servicePct: Math.round(rand() * 10), taxPct: [0, 6, 8][Math.floor(rand() * 3)],
      rounding: rand() < 0.5 ? "none" : "nearest_5_sen",
    });
    assert.equal(r.sharesAddUp, true);
    assert.ok(r.shares.every((s) => s.shareSen >= 0));
    if (r.rules.rounding.startsWith("Round")) assert.equal(r.totalSen % 5, 0);
  }
});
