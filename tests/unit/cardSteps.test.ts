import { cardSteps, missingPriceLabel, resaleUncheckedLine } from "@/lib/screen/cardSteps";
import { NO_LISTING_PRICE_LABEL } from "@/lib/property/types";

function row(overrides: { arv?: number | null; numbers?: boolean; walkAwayCash?: number | null } = {}) {
  return {
    arv: overrides.arv === undefined ? 359_375 : overrides.arv,
    checklist: { numbers: overrides.numbers ?? true, comps: true, estimate: false, visit: false, done: 2 },
    walkAwayCash: overrides.walkAwayCash === undefined ? 41_000 : overrides.walkAwayCash,
  };
}

describe("cardSteps", () => {
  it("counts the steps done and opens the first one still to do", () => {
    // Details is always done and Numbers is done; the resale price and the
    // deal are not.
    const steps = cardSteps(row({ arv: null, walkAwayCash: null }));
    expect(steps.label).toBe("2 of 4 steps");
    expect(steps.nextTab).toBe("arv");
  });

  it("opens the deal once every step is done", () => {
    const steps = cardSteps(row());
    expect(steps.label).toBe("4 of 4 steps");
    expect(steps.nextTab).toBe("deal");
  });

  it("skips past done steps to the first gap, not the last", () => {
    expect(cardSteps(row({ numbers: false })).nextTab).toBe("numbers");
  });

  it("never counts below one, because a house that exists has its details", () => {
    expect(cardSteps(row({ arv: null, numbers: false, walkAwayCash: null })).done).toBe(1);
  });
});

describe("resaleUncheckedLine", () => {
  it("asks for a review when there is no resale price", () => {
    expect(resaleUncheckedLine({ arv: null })).toBe("Resale price not checked yet →");
  });

  it("says nothing once the price rests on checked comps", () => {
    expect(resaleUncheckedLine({ arv: 320_000 })).toBeNull();
  });
});

describe("missingPriceLabel", () => {
  it("says there is no listing price rather than showing a default", () => {
    expect(missingPriceLabel(null)).toBe(NO_LISTING_PRICE_LABEL);
  });

  it("leaves a real price to be shown as a figure", () => {
    expect(missingPriceLabel(250_000)).toBeNull();
  });
});
