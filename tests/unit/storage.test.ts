import { loadInputs, saveInputs, clearInputs, hasDraft } from "@/lib/mortgage/storage";
import { defaultInputs } from "@/lib/mortgage/defaults";

/**
 * The calculator's working draft, and which house it belongs to.
 *
 * One global key meant the draft left on one house came back on the next: a
 * price typed for 1653 Sylvan reappeared under 1900 Windsor. Jest runs in the
 * node environment, so localStorage is stubbed rather than borrowed from jsdom.
 */

function stubLocalStorage() {
  const store = new Map<string, string>();
  return {
    store,
    api: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
}

let stub: ReturnType<typeof stubLocalStorage>;

beforeEach(() => {
  stub = stubLocalStorage();
  (globalThis as { window?: unknown }).window = { localStorage: stub.api };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const HOUSE_A = "prop-a";
const HOUSE_B = "prop-b";

describe("per-house drafts", () => {
  it("keeps each house's draft under its own key", () => {
    saveInputs({ ...defaultInputs(), homeValue: 250_000 }, HOUSE_A);
    saveInputs({ ...defaultInputs(), homeValue: 410_000 }, HOUSE_B);

    expect(loadInputs(HOUSE_A).homeValue).toBe(250_000);
    expect(loadInputs(HOUSE_B).homeValue).toBe(410_000);
  });

  it("does not leak a house's draft into the standalone calculator", () => {
    saveInputs({ ...defaultInputs(), homeValue: 250_000 }, HOUSE_A);
    expect(loadInputs().homeValue).toBe(defaultInputs().homeValue);
  });

  it("leaves the standalone key bare, so drafts written before this still load", () => {
    // The pre-existing key is the standalone one, which is why there is nothing
    // to migrate.
    saveInputs({ ...defaultInputs(), homeValue: 199_000 });
    expect([...stub.store.keys()]).toEqual(["mortgageCalculatorInputs"]);
    expect(loadInputs().homeValue).toBe(199_000);
  });

  it("namespaces a bound draft by property id", () => {
    saveInputs(defaultInputs(), HOUSE_A);
    expect([...stub.store.keys()]).toEqual([`mortgageCalculatorInputs:${HOUSE_A}`]);
  });

  it("clears only the house it was asked to clear", () => {
    saveInputs({ ...defaultInputs(), homeValue: 250_000 }, HOUSE_A);
    saveInputs({ ...defaultInputs(), homeValue: 410_000 }, HOUSE_B);

    clearInputs(HOUSE_A);

    expect(hasDraft(HOUSE_A)).toBe(false);
    expect(loadInputs(HOUSE_B).homeValue).toBe(410_000);
  });
});

describe("hasDraft", () => {
  it("tells an absent draft from one that matches the defaults", () => {
    // loadInputs cannot: both come back as the defaults. The bound calculator
    // needs the difference, because it seeds from the house only when there is
    // no work in progress to overwrite.
    expect(hasDraft(HOUSE_A)).toBe(false);
    saveInputs(defaultInputs(), HOUSE_A);
    expect(hasDraft(HOUSE_A)).toBe(true);
  });

  it("is false with no window, rather than throwing", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(hasDraft(HOUSE_A)).toBe(false);
  });
});

describe("income never reaches the draft", () => {
  it("strips profile fields on write, per house", () => {
    saveInputs({ ...defaultInputs(), grossMonthlyIncome: 12_000, otherMonthlyDebt: 700 }, HOUSE_A);

    const raw = stub.store.get(`mortgageCalculatorInputs:${HOUSE_A}`) ?? "";
    expect(raw).not.toContain("grossMonthlyIncome");
    expect(raw).not.toContain("otherMonthlyDebt");
  });
});
