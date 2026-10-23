import { type RentCastFailure } from "../rentcast/client";

/**
 * What the Comps tab says when a refresh comes back without fresh comps.
 *
 * Each one is a 200 carrying a reason, not an error: the comps already held
 * stay on screen. Every message ends on what the user can still do, because
 * a lookup that failed is not the end of the work — comps can be entered by
 * hand. Lifted out of the refresh route so the wording is tested as a table
 * rather than by stubbing the route in a browser.
 */

/** What the user can actually do about each failure. */
export const DEGRADED_MESSAGES: Record<RentCastFailure, string> = {
  no_key: "RentCast isn't connected, so comps have to be entered by hand.",
  quota: "This month's RentCast requests are used up. Comps can still be entered by hand.",
  rate_limited: "RentCast is rate limiting requests. Try again in a minute.",
  not_found: "RentCast has no data for this address. Enter comps by hand.",
  http_error: "RentCast couldn't be reached. Comps can still be entered by hand.",
  network_error: "RentCast couldn't be reached. Comps can still be entered by hand.",
  bad_response: "RentCast returned something unreadable. Comps can still be entered by hand.",
};

/** Someone else is already calling for this address. */
export const IN_FLIGHT_MESSAGE =
  "A lookup for this address is already running. Give it a moment and reload.";

/** The lookup worked and found nothing worth comparing. */
export const NO_COMPS_MESSAGE =
  "No recorded sales of a similar house within a mile in the last year. Add a sold comp by hand from your agent's list.";
