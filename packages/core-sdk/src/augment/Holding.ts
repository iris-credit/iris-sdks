import { fetchHolding } from "../modules/holding/fetch.js";
import { Holding } from "../modules/holding/Holding.js";

declare module "../modules/holding/Holding.js" {
  namespace Holding {
    // oxlint-disable-next-line no-unused-vars -- ambient declaration of the static assigned below
    let fetch: typeof fetchHolding;
  }
}

Holding.fetch = fetchHolding;

export { Holding };
