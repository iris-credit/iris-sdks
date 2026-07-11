import { fetchToken } from "../modules/token/fetch.js";
import { Token } from "../modules/token/Token.js";

declare module "../modules/token/Token.js" {
  namespace Token {
    // oxlint-disable-next-line no-unused-vars -- ambient declaration of the static assigned below
    let fetch: typeof fetchToken;
  }
}

Token.fetch = fetchToken;

export { Token };
