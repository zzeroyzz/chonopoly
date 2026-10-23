/**
 * A stand-in for the Supabase query builder, for services that build their
 * own client.
 *
 * Every filter step chains; `single` / `maybeSingle` answer from a queue, in
 * the order the service asks. Inserts and updates are recorded so a test can
 * check what would have been written. Pair with
 * `jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }))`
 * and hand the result of `fakeClient` to `createClient.mockReturnValue`.
 */

export interface Answer {
  data: unknown;
  error: null | { message: string };
}

export interface Writes {
  insert: unknown[];
  update: unknown[];
}

const CHAIN_STEPS = ["select", "eq", "is", "ilike", "order", "in", "limit"];

export function fakeClient(answers: Answer[]): { client: { from: () => unknown }; writes: Writes } {
  const writes: Writes = { insert: [], update: [] };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const step of CHAIN_STEPS) builder[step] = chain;
  builder.insert = (row: unknown) => {
    writes.insert.push(row);
    return builder;
  };
  builder.update = (row: unknown) => {
    writes.update.push(row);
    return builder;
  };
  const answer = () => Promise.resolve(answers.shift() ?? { data: null, error: null });
  builder.single = answer;
  builder.maybeSingle = answer;

  return { client: { from: () => builder }, writes };
}
