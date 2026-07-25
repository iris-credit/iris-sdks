import { fetchVenue } from "../modules/venue/fetch.js";
import { Venue } from "../modules/venue/Venue.js";

declare module "../modules/venue/Venue.js" {
  namespace Venue {
    // oxlint-disable-next-line no-unused-vars -- ambient declaration of the static assigned below
    let fetch: typeof fetchVenue;
  }
}

Venue.fetch = fetchVenue;

export { Venue };
