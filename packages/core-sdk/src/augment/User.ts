import { fetchUser } from "../modules/user/fetch.js";
import { User } from "../modules/user/User.js";

declare module "../modules/user/User.js" {
  namespace User {
    // oxlint-disable-next-line no-unused-vars -- ambient declaration of the static assigned below
    let fetch: typeof fetchUser;
  }
}

User.fetch = fetchUser;

export { User };
