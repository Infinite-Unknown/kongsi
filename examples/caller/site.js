// Boots the shared browser runtime for the example caller page. It has no irreversible
// actions, so it keeps the runtime's own dialogs and consent card.
const status = document.querySelector("#assistant-status");
const siteBase = new URL("./", import.meta.url).href;

// The runtime labels some controls with glyphs (a gear, a link). The stylesheet draws
// this page's icons, so take the glyphs out of the visible labels.
const GLYPH = /^\s*[⚙\u{1F517}]️?\s*/u;
function stripGlyph(node) {
  if (node && node.firstChild && node.firstChild.nodeType === 3) {
    node.firstChild.nodeValue = node.firstChild.nodeValue.replace(GLYPH, "");
  }
}

try {
  const { boot } = await import("./runtime/index.js");
  const booted = await boot("#agent-app", {
    originUrl: siteBase,
    sandboxWorkerUrl: new URL("runtime/sandbox-worker.js", siteBase).href,
  });
  const needsKey = !booted.engine.mockLLM && (!booted.engine.byokKey || booted.engine.byokKey === "demo");
  status.textContent = needsKey
    ? "Assistant needs your AI provider key. Add it in AI model settings below."
    : "Assistant connected to this page.";
  status.dataset.state = needsKey ? "setup" : "ready";
  stripGlyph(document.querySelector("#agent-app details.ns-settings > summary"));
  stripGlyph(document.querySelector("#ns-devtoggle"));
  const greeting = document.querySelector("#ns-msgs .ns-msg.bot");
  if (greeting) {
    greeting.textContent = greeting.textContent.replace(/⚙️?\s*/gu, "");
  }
  // The consent card is the runtime's; only its title loses the link glyph.
  const askConsent = booted.engine.onConsent;
  booted.engine.onConsent = (info) => {
    const answer = askConsent(info);
    const cards = document.querySelectorAll("#ns-msgs .ns-consent");
    stripGlyph(cards[cards.length - 1]?.querySelector(".ns-consent-title"));
    return answer;
  };
} catch (error) {
  status.textContent = "The assistant could not load. The receipt above still works.";
  status.dataset.state = "error";
  console.error("Assistant startup failed", error);
}
