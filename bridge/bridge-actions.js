// The actions Kongsi shares with other agent sites, through its action bridge.
// The build names this file in bridge/agent-manifest.json. When another site's assistant
// calls Kongsi's network, the bridge loads this module in a hidden frame on Kongsi's
// origin. Nothing here reads a page or a visitor's saved bill.
import { calculateSplitAction } from "../js/calculate-action.js";

/**
 * Shares the bill calculator with every agent site.
 *
 * calculate_split is a pure calculator: it returns only figures worked out from the
 * input the calling agent sends, reads no page and stores nothing. So it is shared with
 * "*" (any site), like a public price list would be.
 */
class BridgeActions {
  static CALLERS = ["*"];

  static registerActions(actions) {
    actions.register(calculateSplitAction({
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
    }));
  }
}

export const registerActions = BridgeActions.registerActions;
