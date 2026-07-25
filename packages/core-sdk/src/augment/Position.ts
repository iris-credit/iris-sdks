import { fetchAccrualPosition, fetchPosition } from "../modules/position/fetch.js";
import { AccrualPosition, Position } from "../modules/position/Position.js";

declare module "../modules/position/Position.js" {
  namespace Position {
    // oxlint-disable-next-line no-unused-vars -- ambient declaration of the static assigned below
    let fetch: typeof fetchPosition;
  }

  namespace AccrualPosition {
    // oxlint-disable-next-line no-unused-vars -- ambient declaration of the static assigned below
    let fetch: typeof fetchAccrualPosition;
  }
}

Position.fetch = fetchPosition;
AccrualPosition.fetch = fetchAccrualPosition;

export { AccrualPosition, Position };
