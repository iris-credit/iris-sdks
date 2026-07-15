import { Blm } from "../modules/blm/Blm.js";
import { fetchBlm } from "../modules/blm/fetch.js";

declare module "../modules/blm/Blm.js" {
  namespace Blm {
    // oxlint-disable-next-line no-unused-vars -- ambient declaration of the static assigned below
    let fetch: typeof fetchBlm;
  }
}

Blm.fetch = fetchBlm;

export { Blm };
