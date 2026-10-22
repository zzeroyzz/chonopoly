import {
  arvTile,
  numbersTile,
  dealTile,
  workTile,
  activityTile,
  type TileCopy,
} from "@/components/crm/DetailsHub";
import { type ScreenRow } from "@/lib/screen/screenRow";
import { type Task } from "@/lib/crm/types";

/**
 * What each tile says.
 *
 * The hub is a reader — every figure is already on the page — so the only
 * thing here that can be wrong is the wording, and wording is a unit test
 * against the function rather than a browser test against the screen.
 */

function row(overrides: Partial<ScreenRow> = {}): ScreenRow {
  return {
    propertyId: "prop-1",
    entryId: "e1",
    address: "1653 Sylvan Rd SW",
    needsAddressReview: false,
    price: 149_900,
    piti: 1_247,
    backDti: 34,
    cashToClose: 12_000,
    arv: null,
    maxOffer: 104_930,
    walkAwayCash: null,
    trueProfit: null,
    marginPct: null,
    affordability: {
      verdict: "tight",
      reasons: [],
      summary: "$1,915 left after closing",
      ratiosApply: true,
      needsProfile: false,
    },
    deal: {
      verdict: "does_not_work",
      reasons: [],
      summary: "No resale price yet",
      provisional: false,
      hasArv: false,
    },
    checklist: { numbers: true, comps: false, estimate: false, visit: false, done: 1 },
    approvedComps: 0,
    compsToReview: 72,
    isFinalist: false,
    ...overrides,
  } as ScreenRow;
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    due_date: "2026-10-20",
    completed_at: null,
    ...overrides,
  } as Task;
}

/** Nothing on this screen may be blank, a dash, or a number with no meaning. */
function isSayable(copy: TileCopy) {
  return [copy.title, copy.state, copy.next].every(
    (line) => line.trim().length > 0 && line.trim() !== "—"
  );
}

describe("what each tile says", () => {
  it("says an unchecked house is unchecked, and how many are left", () => {
    const copy = arvTile(row());

    expect(copy.state).toBe("Not checked yet");
    expect(copy.next).toBe("72 houses to go through");
  });

  it("offers the first step when there is nothing to go through yet", () => {
    const copy = arvTile(row({ compsToReview: 0 }));

    expect(copy.next).toBe("Pull the houses nearby to get started");
  });

  it("says the resale price and how many houses it came from", () => {
    const copy = arvTile(row({ arv: 318_500, approvedComps: 4, compsToReview: 0 }));

    expect(copy.state).toBe("$318,500");
    expect(copy.next).toBe("From 4 houses you checked");
  });

  it("says what is left to check even once there is a figure", () => {
    const copy = arvTile(row({ arv: 318_500, approvedComps: 4, compsToReview: 2 }));

    expect(copy.next).toBe("From 4 houses · 2 still to check");
  });

  it("gives the monthly payment and the cash to close", () => {
    const copy = numbersTile(row());

    expect(copy.state).toBe("$1,247 a month");
    expect(copy.next).toBe("$12,000 to close");
  });

  it("will not judge a deal with no resale price behind it", () => {
    const copy = dealTile(row());

    expect(copy.state).toBe("No resale price yet");
    expect(copy.next).toBe("Check the houses nearby first");
  });

  /** "Margin" alone means nothing. Say what the percentage is a percentage of. */
  it("says what the percentage is a percentage of", () => {
    const copy = dealTile(
      row({
        arv: 318_500,
        trueProfit: 42_180,
        marginPct: 13.2,
        deal: { ...row().deal, hasArv: true },
      })
    );

    expect(copy.state).toBe("$42,180 profit");
    expect(copy.next).toBe("13% of the resale price");
  });

  /** A budget is a guess you set; an estimate is one made from the house. */
  it("does not let a default budget pass for an estimate", () => {
    const copy = workTile({
      total: 48_000,
      source: "budget",
      label: "Budget only",
      budgetOnly: true,
    });

    expect(copy.state).toBe("$48,000 to fix up");
    expect(copy.next).toBe("Your default — walk it to get a real figure");
  });

  /**
   * The tile read "$0 to fix up" on every house with no budget set, which
   * states that the house needs no work and means that nobody has costed it.
   */
  it("does not report an unset budget as a house that needs no work", () => {
    const copy = workTile({
      total: 0,
      source: "budget",
      label: "Budget only",
      budgetOnly: true,
    });

    expect(copy.state).toBe("Not set yet");
    expect(copy.next).toBe("Set a budget, or walk it for a real figure");
    expect(copy.state).not.toContain("$0");
  });

  it("says which kind of estimate it is once there is one", () => {
    const copy = workTile({
      total: 52_400,
      source: "estimate_visit",
      label: "Estimate · visit",
      budgetOnly: false,
    });

    expect(copy.next).toBe("Estimate · visit");
  });

  /** A lead nobody is chasing is a defect, and the tile says so. */
  it("says when nobody is chasing the house", () => {
    const copy = activityTile([]);

    expect(copy.state).toBe("Nothing scheduled");
    expect(copy.next).toBe("Nobody is chasing this one");
  });

  it("counts the open tasks and calls out the overdue ones", () => {
    const now = new Date("2026-10-22");
    const copy = activityTile(
      [
        task({ id: "t1", due_date: "2026-10-19" }),
        task({ id: "t2", due_date: "2026-10-30" }),
        task({ id: "t3", due_date: "2026-10-18", completed_at: "2026-10-18" }),
      ],
      now
    );

    expect(copy.state).toBe("2 tasks open");
    expect(copy.next).toBe("1 already overdue");
  });

  it("counts one task as one, not as ones", () => {
    const copy = activityTile([task({ due_date: "2099-01-01" })], new Date("2026-10-22"));

    expect(copy.state).toBe("1 task open");
    expect(copy.next).toBe("All of them still in hand");
  });

  /** No tile is ever blank and no tile shows a dash. */
  it("always has something to say", () => {
    const rehab = { total: 0, source: "budget" as const, label: "Budget only", budgetOnly: true };

    for (const copy of [
      arvTile(row()),
      arvTile(row({ arv: 318_500, approvedComps: 1 })),
      numbersTile(row()),
      dealTile(row()),
      workTile(rehab),
      activityTile([]),
    ]) {
      expect({ title: copy.title, sayable: isSayable(copy) }).toEqual({
        title: copy.title,
        sayable: true,
      });
    }
  });
});
