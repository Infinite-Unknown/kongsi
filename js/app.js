// Page script: one bill store for this tab, and the view that draws it.
// site-actions.js and site.js import this module by the same URL the page loads it
// from, so the assistant and the page share one bill.
import { BillStore } from "./bill-store.js";
import { formatRM } from "./split-core.js";

function browserStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Blocked storage (private mode, sandboxed frame): keep the bill in memory only.
  }
  return null;
}

export class App {
  static page = new BillStore({ storage: browserStorage() });
}

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child !== null && child !== undefined) node.append(child);
  }
  return node;
}

/**
 * Draws the bill and wires the page's own forms to the same store methods the
 * assistant uses.
 */
class BillView {
  constructor(store) {
    this.store = store;
    this.flashIds = new Set();
  }

  start() {
    this.store.subscribe(() => this.render());
    this.bindForms();
    this.render();
  }

  showError(id, result) {
    const box = $(id);
    box.textContent = result && result.ok === false ? result.reason : "";
  }

  bindForms() {
    const store = this.store;

    $("person-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = $("person-name");
      const result = store.addPeople([input.value]);
      this.showError("person-error", result);
      if (result.ok) {
        input.value = "";
        input.focus();
      }
    });

    $("paid-by").addEventListener("change", (event) => {
      const option = event.target.selectedOptions[0];
      store.setPayer(option && option.value ? option.textContent : "");
    });

    $("item-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const sharedBy = [...document.querySelectorAll("#item-sharers input:checked")].map((box) => box.value);
      const result = store.addItems([{
        name: $("item-name").value,
        unitPrice: $("item-price").value.replace(/^RM\s*/i, ""),
        quantity: Number($("item-qty").value || 1),
        sharedBy,
      }]);
      this.showError("item-error", result);
      if (result.ok) {
        $("item-name").value = "";
        $("item-price").value = "";
        $("item-qty").value = "1";
        $("item-name").focus();
      }
    });

    $("charges-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const result = store.setCharges({
        servicePct: Number($("service-pct").value || 0),
        taxPct: Number($("tax-pct").value || 0),
        taxOnService: $("tax-on-service").checked,
        discount: Number(($("discount").value || "0").replace(/^RM\s*/i, "")),
        rounding: $("rounding").value,
      });
      this.showError("charges-error", result);
    });

    $("clear-bill").addEventListener("click", () => {
      const check = store.checkClear(store.version);
      if (!check.ok) {
        this.showError("charges-error", check);
        return;
      }
      const sure = window.confirm(`Clear the whole bill? ${check.people.length} people, ${check.itemCount} items, total ${check.total}. This cannot be undone.`);
      if (sure) store.clearBill(store.version);
    });

    $("copy-summary").addEventListener("click", async () => {
      const status = $("copy-status");
      try {
        await navigator.clipboard.writeText(this.summaryText());
        status.textContent = "Copied.";
      } catch {
        status.textContent = "Could not copy. Select the bill instead.";
      }
      setTimeout(() => { status.textContent = ""; }, 2500);
    });
  }

  summaryText() {
    const split = this.store.split();
    const lines = [`Bill total ${split.total}`];
    for (const s of split.shares) lines.push(`${s.name}: ${s.share}`);
    if (split.settlement.length) {
      lines.push("");
      for (const s of split.settlement) lines.push(`${s.from} pays ${s.to} ${s.amount}`);
    }
    lines.push("", "Split with Kongsi");
    return lines.join("\n");
  }

  render() {
    const store = this.store;
    const split = store.split();
    $("bill-version").textContent = `v${store.version}`;

    // Receipt lines
    const body = $("lines-body");
    body.replaceChildren(...split.lines.map((line) => el("tr", { "data-id": line.id },
      el("td", {}, el("span", { class: "line-name", text: line.name }), line.quantity > 1 ? el("span", { class: "qty", text: ` × ${line.quantity}` }) : null),
      el("td", { class: "who", text: line.sharedBy.join(", ") }),
      el("td", { class: "num", text: line.lineTotal.replace("RM ", "") }),
    )));
    $("receipt-empty").hidden = split.lines.length > 0;
    $("lines").hidden = split.lines.length === 0;

    $("t-subtotal").textContent = split.subtotal;
    $("t-discount").textContent = `-${split.discount}`;
    $("row-discount").hidden = split.discountSen === 0;
    $("t-service-label").textContent = `Service charge ${split.rules.servicePct}%`;
    $("t-service").textContent = split.serviceCharge;
    $("t-tax-label").textContent = `Tax ${split.rules.taxPct}%${split.rules.taxOnService ? " (incl. on service)" : ""}`;
    $("t-tax").textContent = split.tax;
    $("t-rounding").textContent = split.roundingAdjustment;
    $("row-rounding").hidden = split.roundingAdjustmentSen === 0;
    $("t-total").textContent = split.total;

    // Shares
    const payerName = split.paidBy;
    $("shares").replaceChildren(...split.shares.map((s) => el("li", { class: s.name === payerName ? "payer" : "" },
      el("span", { class: "who-name", text: s.name }),
      el("span", { class: "detail", text: `${s.food} food + ${s.charges} charges` }),
      el("strong", { class: "amount", text: s.share }),
      s.name === payerName ? el("span", { class: "badge", text: "paid" }) : null,
    )));
    const sum = split.shares.reduce((acc, s) => acc + s.shareSen, 0);
    $("shares-check").textContent = split.shares.length
      ? `${split.shares.length} shares add up to ${formatRM(sum)} ${split.sharesAddUp ? "= total" : "≠ total"}`
      : "Add people to see each share.";
    $("shares-check").className = `check ${split.sharesAddUp ? "ok" : "bad"}`;

    const settlementBox = $("settlement-box");
    settlementBox.hidden = split.settlement.length === 0;
    $("settlement").replaceChildren(...split.settlement.map((s) => el("li", {},
      el("span", { text: `${s.from} → ${s.to}` }), el("strong", { text: s.amount }),
    )));

    // People chips + payer select + sharer boxes
    $("people-list").replaceChildren(...store.people.map((p) => el("li", {},
      el("span", { text: p.name }),
      el("button", {
        type: "button",
        class: "chip-x",
        "aria-label": `Remove ${p.name}`,
        onclick: () => this.showError("person-error", store.removePerson(p.name)),
      }, "×"),
    )));
    const payer = $("paid-by");
    payer.replaceChildren(el("option", { value: "", text: "Nobody yet" }),
      ...store.people.map((p) => {
        const option = el("option", { value: p.id, text: p.name });
        if (p.id === store.paidBy) option.selected = true;
        return option;
      }));
    const ticked = new Set([...document.querySelectorAll("#item-sharers input:checked")].map((b) => b.value));
    $("item-sharers").replaceChildren(...store.people.map((p) => el("label", { class: "sharer" },
      (() => {
        const box = el("input", { type: "checkbox", value: p.name });
        box.checked = ticked.has(p.name);
        return box;
      })(),
      ` ${p.name}`,
    )));
    if (!store.people.length) {
      $("item-sharers").append(el("span", { class: "hint", text: "Add people first, or name them in the assistant." }));
    }

    // Item list with remove buttons
    $("item-list").replaceChildren(...split.lines.map((line) => el("li", {},
      el("span", { text: `${line.name}${line.quantity > 1 ? ` × ${line.quantity}` : ""} — ${line.lineTotal}` }),
      el("button", {
        type: "button",
        class: "chip-x",
        "aria-label": `Remove ${line.name}`,
        onclick: () => store.removeItem(line.id),
      }, "×"),
    )));

    // Charges form mirrors the store unless the visitor is editing it.
    const form = $("charges-form");
    if (!form.contains(document.activeElement)) {
      $("service-pct").value = String(store.charges.servicePct);
      $("tax-pct").value = String(store.charges.taxPct);
      $("discount").value = (store.charges.discountSen / 100).toFixed(2);
      $("rounding").value = store.charges.rounding;
      $("tax-on-service").checked = !!store.charges.taxOnService;
    }

    // Flash the receipt so a change made by the assistant is easy to see.
    const receipt = $("receipt");
    receipt.classList.remove("pulse");
    void receipt.offsetWidth;
    receipt.classList.add("pulse");
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("receipt")) {
  const view = new BillView(App.page);
  view.start();
  const networkUrl = document.getElementById("network-url");
  if (networkUrl) {
    networkUrl.textContent = new URL("kongsi_bill_splitter", document.baseURI).href;
  }
}
