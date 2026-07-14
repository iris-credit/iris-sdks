import { fetchLoan } from "../modules/loan/fetch.js";
import { Loan } from "../modules/loan/Loan.js";

declare module "../modules/loan/Loan.js" {
  namespace Loan {
    // oxlint-disable-next-line no-unused-vars -- ambient declaration of the static assigned below
    let fetch: typeof fetchLoan;
  }
}

Loan.fetch = fetchLoan;

export { Loan };
