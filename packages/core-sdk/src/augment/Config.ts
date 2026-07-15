import { Config } from "../modules/config/Config.js";
import { fetchConfig } from "../modules/config/fetch.js";

declare module "../modules/config/Config.js" {
  namespace Config {
    // oxlint-disable-next-line no-unused-vars -- ambient declaration of the static assigned below
    let fetch: typeof fetchConfig;
  }
}

Config.fetch = fetchConfig;

export { Config };
