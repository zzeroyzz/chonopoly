/**
 * Which account a view is acting on: the user themselves, or a team they belong to.
 *
 * This lives on its own, away from any one product, because both the CRM and the
 * finance side scope their data by it. A tenancy type owned by one of them is a
 * type the other has to reach across a product boundary to get at — which is
 * exactly what it used to do, importing from `lib/goals/types`.
 *
 * Deliberately dependency-free. Client components import this, so anything with a
 * runtime import (a Supabase client, a service-role key) does not belong here.
 * `RequestContext` in `lib/context.ts` is the same shape for the server side; it
 * is left alone rather than merged, since that module is server-only by design.
 */
export interface ActiveContext {
  type: "personal" | "team";
  id: string;
}
