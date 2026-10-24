import {
  changedLine,
  reviewTone,
  saveButtonLabel,
  saveHint,
  shouldRefuseSwipe,
  statusButtonText,
  type SwipeCheck,
} from "@/lib/comps/reviewAnswer";

describe("statusButtonText", () => {
  it("says Status before anything is picked", () => {
    expect(statusButtonText(null)).toEqual({ label: "Status", hint: null });
  });

  it("treats Needs review as nothing picked", () => {
    expect(statusButtonText("needs_review")).toEqual({ label: "Status", hint: null });
  });

  it("shows the picked answer, and that it can still change", () => {
    expect(statusButtonText("renovated_use")).toEqual({ label: "Renovated", hint: "Tap to change" });
    expect(statusButtonText("not_comparable_skip").label).toBe("Not comparable");
  });

  it("drops the label's own full stop on the button", () => {
    expect(statusButtonText("cant_tell_skip").label).toBe("Photos are gone, can't tell");
  });
});

describe("saveButtonLabel and saveHint", () => {
  it("moves on from any house but the last", () => {
    expect(saveButtonLabel({ index: 3, total: 7 })).toBe("Save and next");
    expect(saveHint({ index: 3, total: 7 })).toBe(
      "Pick an answer to save this house and move to the next."
    );
  });

  it("finishes on the last house", () => {
    expect(saveButtonLabel({ index: 7, total: 7 })).toBe("Save and finish");
    expect(saveHint({ index: 7, total: 7 })).toBe("Pick an answer to save this house and finish.");
  });

  it("finishes when there is only one house", () => {
    expect(saveButtonLabel({ index: 1, total: 1 })).toBe("Save and finish");
  });
});

describe("changedLine", () => {
  it("names the new answer", () => {
    expect(changedLine("not_renovated_skip")).toBe("Changed to Not renovated.");
  });

  it("does not double the full stop", () => {
    expect(changedLine("cant_tell_skip")).toBe("Changed to Photos are gone, can't tell.");
  });
});

describe("reviewTone", () => {
  it("is green for the one answer that counts", () => {
    expect(reviewTone("renovated_use")).toBe("good");
  });

  it("is amber for every answer that leaves the house out", () => {
    for (const review of [
      "not_renovated_skip",
      "took_off_market_skip",
      "not_comparable_skip",
      "cant_tell_skip",
    ] as const) {
      expect(reviewTone(review)).toBe("warn");
    }
  });

  it("is grey while undecided", () => {
    expect(reviewTone("needs_review")).toBe("neutral");
  });
});

describe("shouldRefuseSwipe", () => {
  function swipe(overrides: Partial<SwipeCheck>): SwipeCheck {
    return {
      insideScrollArea: true,
      scrollTop: 100,
      scrollHeight: 900,
      clientHeight: 500,
      fingerDeltaY: -10,
      ...overrides,
    };
  }

  it("refuses any swipe off the sheet's list, such as on the dimmed page", () => {
    expect(shouldRefuseSwipe(swipe({ insideScrollArea: false }))).toBe(true);
  });

  it("lets the list scroll either way from the middle", () => {
    expect(shouldRefuseSwipe(swipe({ fingerDeltaY: -10 }))).toBe(false);
    expect(shouldRefuseSwipe(swipe({ fingerDeltaY: 10 }))).toBe(false);
  });

  it("refuses pulling down at the top, which would move the page behind", () => {
    expect(shouldRefuseSwipe(swipe({ scrollTop: 0, fingerDeltaY: 10 }))).toBe(true);
    expect(shouldRefuseSwipe(swipe({ scrollTop: 0, fingerDeltaY: -10 }))).toBe(false);
  });

  it("refuses pushing up at the bottom", () => {
    expect(shouldRefuseSwipe(swipe({ scrollTop: 400, fingerDeltaY: -10 }))).toBe(true);
    expect(shouldRefuseSwipe(swipe({ scrollTop: 400, fingerDeltaY: 10 }))).toBe(false);
  });

  it("treats a sub-pixel remainder as the bottom", () => {
    expect(shouldRefuseSwipe(swipe({ scrollTop: 399.5, fingerDeltaY: -10 }))).toBe(true);
  });

  it("refuses both ways when the list is too short to scroll", () => {
    const short = { scrollTop: 0, scrollHeight: 400, clientHeight: 400 };
    expect(shouldRefuseSwipe(swipe({ ...short, fingerDeltaY: -10 }))).toBe(true);
    expect(shouldRefuseSwipe(swipe({ ...short, fingerDeltaY: 10 }))).toBe(true);
  });

  it("leaves a touch on the list that has not moved alone", () => {
    expect(shouldRefuseSwipe(swipe({ fingerDeltaY: 0 }))).toBe(false);
  });
});
