// Boots the shared browser runtime for the example caller page. It has no irreversible
// actions, so it keeps the runtime's own dialogs and consent card.
const status = document.querySelector("#assistant-status");
const siteBase = new URL("./", import.meta.url).href;
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
} catch (error) {
  status.textContent = "The assistant could not load. The receipt above still works.";
  console.error("Assistant startup failed", error);
}
