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

// One colour per person, in order (DESIGN.md).
const PERSON_COLORS = ["#0d5b48", "#e3a422", "#c0623b", "#2f8f9d", "#7d4e7a", "#7a8b3a"];
const REDUCED_MOTION = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const EXAMPLE_MEAL = "Ali had nasi lemak RM 12.90, Mei had char kuey teow RM 11.50 and we all shared satay RM 18. 10% service charge, 6% SST. Ali paid.";

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
function iconButton(label, onclick) {
  const button = el("button", { type: "button", class: "icon-btn", "aria-label": label, title: label, onclick });
  button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  return button;
}

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

    $("try-example").addEventListener("click", () => {
      const input = document.getElementById("ns-input");
      if (!input) {
        $("item-name").focus();
        return;
      }
      input.value = EXAMPLE_MEAL;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus({ preventScroll: true });
      const box = input.getBoundingClientRect();
      if (box.bottom > window.innerHeight || box.top < 0) {
        input.scrollIntoView({ block: "nearest", behavior: REDUCED_MOTION() ? "auto" : "smooth" });
      }
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
    const animate = this.rendered && !REDUCED_MOTION();
    const colorOf = new Map(store.people.map((p, i) => [p.id, PERSON_COLORS[i % PERSON_COLORS.length]]));

    // Receipt lines: reuse rows by item id so only new lines "print" in.
    const body = $("lines-body");
    const known = new Set([...body.children].map((row) => row.dataset.id));
    let fresh = 0;
    body.replaceChildren(...split.lines.map((line) => {
      const row = el("tr", { "data-id": line.id },
        el("td", {}, el("span", { class: "line-name", text: line.name }), line.quantity > 1 ? el("span", { class: "qty", text: ` × ${line.quantity}` }) : null),
        el("td", { class: "who", text: line.sharedBy.join(", ") }),
        el("td", { class: "num", text: line.lineTotal.replace("RM ", "") }),
      );
      if (animate && !known.has(line.id)) {
        row.classList.add("print");
        row.style.setProperty("--d", `${fresh++ * 50}ms`);
      }
      return row;
    }));
    $("receipt-empty").hidden = split.lines.length > 0;
    $("receipt").classList.toggle("is-empty", split.shares.length === 0 || split.lines.length === 0);
    $("lines").hidden = split.lines.length === 0;

    // Totals roll from their old value to the new one.
    this.roll($("t-subtotal"), split.subtotalSen, animate);
    this.roll($("t-discount"), -split.discountSen, animate);
    $("row-discount").hidden = split.discountSen === 0;
    $("t-service-label").textContent = `Service charge ${split.rules.servicePct}%`;
    this.roll($("t-service"), split.serviceChargeSen, animate);
    $("t-tax-label").textContent = `Tax ${split.rules.taxPct}%${split.rules.taxOnService ? " (incl. on service)" : ""}`;
    this.roll($("t-tax"), split.taxSen, animate);
    this.roll($("t-rounding"), split.roundingAdjustmentSen, animate);
    $("row-rounding").hidden = split.roundingAdjustmentSen === 0;
    this.roll($("t-total"), split.totalSen, animate);

    // Signature: one segment per person slides to its share of the total.
    const track = $("splitbar-track");
    const segs = new Map([...track.children].map((seg) => [seg.dataset.id, seg]));
    let offset = 0;
    const nextSegs = split.shares.map((s) => {
      const fraction = split.totalSen > 0 ? s.shareSen / split.totalSen : 0;
      let seg = segs.get(s.personId);
      if (!seg) {
        seg = el("div", { class: "seg", "data-id": s.personId });
        // New segments grow from where they will sit.
        seg.style.setProperty("--x", `${offset * 100}%`);
        seg.style.setProperty("--w", "0");
      }
      seg.style.background = colorOf.get(s.personId);
      seg.dataset.next = JSON.stringify([offset * 100, fraction]);
      offset += fraction;
      return seg;
    });
    track.replaceChildren(...nextSegs);
    const place = () => {
      for (const seg of nextSegs) {
        const [x, w] = JSON.parse(seg.dataset.next);
        seg.style.setProperty("--x", `${x}%`);
        seg.style.setProperty("--w", String(w));
      }
    };
    if (animate) requestAnimationFrame(() => requestAnimationFrame(place));
    else place();

    // The check: shares meet the total exactly.
    const sum = split.shares.reduce((acc, s) => acc + s.shareSen, 0);
    const check = $("shares-check");
    const hasShares = split.shares.length > 0 && split.totalSen > 0;
    $("shares-check-text").textContent = hasShares
      ? `${split.shares.length} shares add up to ${formatRM(sum)} ${split.sharesAddUp ? "= the total" : "≠ the total"}`
      : "Add people and items to see each share.";
    check.className = `check ${hasShares ? (split.sharesAddUp ? "ok" : "bad") : ""}`;
    if (hasShares && split.sharesAddUp) {
      if (animate) {
        void check.offsetWidth;
        requestAnimationFrame(() => check.classList.add("drawn"));
      } else {
        check.classList.add("drawn");
      }
    }

    // Shares: reuse rows by person so amounts roll and only new people rise in.
    const shareList = $("shares");
    const oldRows = new Map([...shareList.children].map((li) => [li.dataset.id, li]));
    const payerName = split.paidBy;
    let entering = 0;
    shareList.replaceChildren(...split.shares.map((s) => {
      let li = oldRows.get(s.personId);
      if (!li) {
        li = el("li", { "data-id": s.personId },
          el("span", { class: "dot" }),
          el("span", { class: "who-name" }),
          el("span", { class: "detail" }),
          el("strong", { class: "amount" }),
        );
        if (animate) {
          li.classList.add("enter");
          li.style.setProperty("--d", `${entering++ * 40}ms`);
        }
      }
      li.style.setProperty("--c", colorOf.get(s.personId));
      li.classList.toggle("payer", s.name === payerName);
      li.querySelector(".who-name").textContent = s.name;
      li.querySelector(".detail").textContent = `${s.food} food + ${s.charges} charges`;
      this.roll(li.querySelector(".amount"), s.shareSen, animate);
      li.querySelector(".badge")?.remove();
      if (s.name === payerName) li.append(el("span", { class: "badge", text: "paid" }));
      return li;
    }));

    const settlementBox = $("settlement-box");
    settlementBox.hidden = split.settlement.length === 0;
    $("settlement").replaceChildren(...split.settlement.map((s) => el("li", {},
      el("span", { text: `${s.from} → ${s.to}` }), el("strong", { text: s.amount }),
    )));

    // People chips + payer select + sharer boxes
    $("people-list").replaceChildren(...store.people.map((p) => {
      const chip = el("li", {},
        el("span", { class: "dot" }),
        el("span", { text: p.name }),
        iconButton(`Remove ${p.name}`, () => this.showError("person-error", store.removePerson(p.name))),
      );
      chip.style.setProperty("--c", colorOf.get(p.id));
      return chip;
    }));
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
      el("span", { text: `${line.name}${line.quantity > 1 ? ` × ${line.quantity}` : ""} · ${line.lineTotal}` }),
      iconButton(`Remove ${line.name}`, () => store.removeItem(line.id)),
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
    this.rendered = true;
  }

  /**
   * Show an amount, rolling from the value on screen to the new one. Interruptible:
   * a new value starts from whatever is showing.
   */
  roll(node, toSen, animate) {
    cancelAnimationFrame(Number(node.dataset.raf || 0));
    const from = node.dataset.cur === undefined ? toSen : Number(node.dataset.cur);
    if (!animate || from === toSen) {
      node.dataset.cur = String(toSen);
      node.textContent = formatRM(toSen);
      return;
    }
    const start = performance.now();
    const duration = 450;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const value = Math.round(from + (toSen - from) * eased);
      node.dataset.cur = String(value);
      node.textContent = formatRM(value);
      if (t < 1) node.dataset.raf = String(requestAnimationFrame(step));
    };
    node.dataset.raf = String(requestAnimationFrame(step));
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("receipt")) {
  const view = new BillView(App.page);
  view.start();
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove("is-loading")));
  const networkUrl = document.getElementById("network-url");
  if (networkUrl) {
    networkUrl.textContent = new URL("kongsi_bill_splitter", document.baseURI).href;
  }
}
