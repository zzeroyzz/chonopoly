import {
  CADENCE_STEPS,
  cadenceDueDate,
  endsCadence,
  isStalled,
  nextCadenceStep,
  startsCadence,
} from "@/lib/crm/cadence";
import {
  emailDisplay,
  isAttributedSuppression,
  isDialable,
  phoneDisplay,
  preferredPhone,
} from "@/lib/crm/suppression";
import { daysInStage, isBackwards, isTerminal, stageIndex } from "@/lib/crm/stages";
import { BUCKET_DUE_TODAY, BUCKET_OVERDUE, BUCKET_REST, nextTask, sortPipeline, urgencyBucket } from "@/lib/crm/sort";
import type { CadenceStep, ContactPhone, PipelineRow, Stage, Task } from "@/lib/crm/types";

const NOW = new Date("2026-09-15T12:00:00Z");

function phone(over: Partial<ContactPhone> = {}): ContactPhone {
  return {
    id: "p1",
    contact_id: "c1",
    number: "+14045551234",
    line_type: "mobile",
    status: "unknown",
    suppression_reason: null,
    suppressed_at: null,
    suppressed_by: null,
    confidence: null,
    source: "manual",
    is_primary: false,
    created_at: NOW.toISOString(),
    ...over,
  };
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    pipeline_entry_id: "e1",
    assigned_to: null,
    title: "Follow up",
    due_date: "2026-09-15",
    status: "open",
    auto_generated: true,
    cadence_step: 7,
    completed_at: null,
    completed_by: null,
    created_at: NOW.toISOString(),
    ...over,
  };
}

function row(id: string, stageSince: string, tasks: Task[], stage: Stage = "contacted"): PipelineRow {
  return {
    entry: {
      id,
      owner_type: "personal",
      owner_id: "u1",
      property_id: `prop-${id}`,
      stage,
      stage_since: stageSince,
      assigned_to: null,
      source: "manual",
      created_by: "u1",
      created_at: stageSince,
      updated_at: stageSince,
    },
    addressLine1: `${id} Main St`,
    city: "Atlanta",
    openTasks: tasks,
  };
}

describe("cadence", () => {
  it("walks 7 → 14 → 30 and then stops", () => {
    expect(nextCadenceStep(null)).toBe(7);
    expect(nextCadenceStep(7)).toBe(14);
    expect(nextCadenceStep(14)).toBe(30);
    expect(nextCadenceStep(30)).toBeNull();
  });

  it("treats an unknown step as the end, not as the first rung", () => {
    // A bad value must not silently restart the chase at 7 — that would loop a
    // lead forever with no way to notice.
    expect(nextCadenceStep(99 as CadenceStep)).toBeNull();
  });

  it("counts due dates forward from the given day", () => {
    expect(cadenceDueDate(7, NOW)).toBe("2026-09-22");
    expect(cadenceDueDate(14, NOW)).toBe("2026-09-29");
    expect(cadenceDueDate(30, NOW)).toBe("2026-10-15");
  });

  it("crosses month and year boundaries", () => {
    expect(cadenceDueDate(30, new Date("2026-12-20T12:00:00Z"))).toBe("2027-01-19");
    expect(cadenceDueDate(7, new Date("2028-02-26T12:00:00Z"))).toBe("2028-03-04"); // leap year
  });

  it("is not thrown off by a late-evening local time", () => {
    // Due dates are day-grained and computed in UTC. A 23:00 EDT timestamp is
    // already the next UTC day; the arithmetic must still land 7 days out from
    // that UTC day, not 6.
    expect(cadenceDueDate(7, new Date("2026-09-15T03:30:00Z"))).toBe("2026-09-22");
  });

  it("starts only on contacted and ends on anything past it", () => {
    expect(startsCadence("contacted")).toBe(true);
    expect(startsCadence("new_lead")).toBe(false);
    expect(startsCadence("qualified")).toBe(false);

    expect(endsCadence("qualified")).toBe(true);
    expect(endsCadence("offer")).toBe(true);
    expect(endsCadence("closed")).toBe(true);
    expect(endsCadence("dead")).toBe(true);
    expect(endsCadence("new_lead")).toBe(false);
    expect(endsCadence("contacted")).toBe(false);
  });

  it("flags an active lead with no open task, and leaves terminal ones alone", () => {
    expect(isStalled("contacted", 0)).toBe(true);
    expect(isStalled("offer", 0)).toBe(true);
    expect(isStalled("contacted", 1)).toBe(false);
    expect(isStalled("closed", 0)).toBe(false);
    expect(isStalled("dead", 0)).toBe(false);
  });

  it("exposes the rungs in order", () => {
    expect(CADENCE_STEPS).toEqual([7, 14, 30]);
  });
});

describe("suppression", () => {
  it("leaves a clean number fully usable", () => {
    const d = phoneDisplay(phone());
    expect(d).toEqual({
      strikeThrough: false,
      allowTelLink: true,
      allowCopy: true,
      reasonLabel: null,
    });
  });

  it("strikes a suppressed number through and kills the tel link and copy", () => {
    for (const reason of ["federal_dnc", "seller_request", "wrong_number"] as const) {
      const d = phoneDisplay(phone({ suppression_reason: reason }));
      expect(d.strikeThrough).toBe(true);
      expect(d.allowTelLink).toBe(false);
      expect(d.allowCopy).toBe(false);
      expect(d.reasonLabel).toBeTruthy();
    }
  });

  it("names the reason so the two DNC kinds stay distinguishable", () => {
    expect(phoneDisplay(phone({ suppression_reason: "federal_dnc" })).reasonLabel).toBe("Federal DNC");
    expect(phoneDisplay(phone({ suppression_reason: "seller_request" })).reasonLabel).toBe(
      "Seller asked us to stop",
    );
    expect(phoneDisplay(phone({ suppression_reason: "wrong_number" })).reasonLabel).toBe("Wrong number");
  });

  it("does not suppress a merely disconnected line", () => {
    // Line status is frequently wrong. Nobody asked us to stop, so it stays
    // dialable — suppression is about consent, not connectivity.
    expect(isDialable(phone({ status: "disconnected" }))).toBe(true);
    expect(isDialable(phone({ suppression_reason: "seller_request" }))).toBe(false);
  });

  it("suppresses emails on the same terms", () => {
    expect(emailDisplay({ suppression_reason: null }).allowCopy).toBe(true);
    const d = emailDisplay({ suppression_reason: "unsubscribed" });
    expect(d.strikeThrough).toBe(true);
    expect(d.allowCopy).toBe(false);
    expect(d.reasonLabel).toBe("Unsubscribed");
  });

  it("prefers the primary number, and skips it when it is suppressed", () => {
    const primaryClean = phone({ id: "a", is_primary: true });
    const other = phone({ id: "b" });
    expect(preferredPhone([other, primaryClean])?.id).toBe("a");

    const primarySuppressed = phone({ id: "a", is_primary: true, suppression_reason: "federal_dnc" });
    expect(preferredPhone([primarySuppressed, other])?.id).toBe("b");
  });

  it("returns null when every number is suppressed", () => {
    // The caller has to say this out loud. Showing nothing looks like a contact
    // with no phone on file, which is a different problem with a different fix.
    const all = [
      phone({ id: "a", suppression_reason: "federal_dnc" }),
      phone({ id: "b", suppression_reason: "wrong_number" }),
    ];
    expect(preferredPhone(all)).toBeNull();
    expect(preferredPhone([])).toBeNull();
  });

  it("requires a suppression to carry who and when", () => {
    expect(isAttributedSuppression(phone())).toBe(true);
    expect(
      isAttributedSuppression(
        phone({ suppression_reason: "seller_request", suppressed_at: NOW.toISOString(), suppressed_by: "u1" }),
      ),
    ).toBe(true);
    expect(isAttributedSuppression(phone({ suppression_reason: "seller_request" }))).toBe(false);
    expect(
      isAttributedSuppression(phone({ suppression_reason: "seller_request", suppressed_at: NOW.toISOString() })),
    ).toBe(false);
  });
});

describe("stages", () => {
  it("knows the terminal pair", () => {
    expect(isTerminal("closed")).toBe(true);
    expect(isTerminal("dead")).toBe(true);
    expect(isTerminal("under_contract")).toBe(false);
  });

  it("orders the funnel", () => {
    expect(stageIndex("new_lead")).toBe(0);
    expect(stageIndex("under_contract")).toBeGreaterThan(stageIndex("offer"));
  });

  it("calls a revival backwards and a kill forwards", () => {
    expect(isBackwards("dead", "contacted")).toBe(true);
    expect(isBackwards("offer", "contacted")).toBe(true);
    expect(isBackwards("contacted", "offer")).toBe(false);
    expect(isBackwards("new_lead", "dead")).toBe(false);
  });

  it("floors days in stage and never goes negative", () => {
    expect(daysInStage("2026-09-08T12:00:00Z", NOW)).toBe(7);
    expect(daysInStage("2026-09-15T11:00:00Z", NOW)).toBe(0);
    expect(daysInStage("2026-09-20T12:00:00Z", NOW)).toBe(0);
    expect(daysInStage("not a date", NOW)).toBe(0);
  });
});

describe("pipeline sort", () => {
  const LOCAL_TODAY = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  it("buckets by overdue, due today, then the rest", () => {
    const now = new Date();
    const overdue = row("a", "2026-09-01T00:00:00Z", [task({ due_date: "2020-01-01" })]);
    const today = row("b", "2026-09-01T00:00:00Z", [task({ due_date: LOCAL_TODAY })]);
    const later = row("c", "2026-09-01T00:00:00Z", [task({ due_date: "2099-01-01" })]);
    const none = row("d", "2026-09-01T00:00:00Z", []);

    expect(urgencyBucket(overdue, now)).toBe(BUCKET_OVERDUE);
    expect(urgencyBucket(today, now)).toBe(BUCKET_DUE_TODAY);
    expect(urgencyBucket(later, now)).toBe(BUCKET_REST);
    expect(urgencyBucket(none, now)).toBe(BUCKET_REST);

    const sorted = sortPipeline([none, later, today, overdue], now);
    expect(sorted.map((r) => r.entry.id).slice(0, 2)).toEqual(["a", "b"]);
  });

  it("puts the most overdue first", () => {
    const now = new Date();
    const veryLate = row("a", "2026-09-14T00:00:00Z", [task({ due_date: "2020-01-01" })]);
    const late = row("b", "2026-09-01T00:00:00Z", [task({ due_date: "2024-01-01" })]);
    expect(sortPipeline([late, veryLate], now).map((r) => r.entry.id)).toEqual(["a", "b"]);
  });

  it("breaks ties by longest in stage", () => {
    const now = new Date("2026-09-15T12:00:00Z");
    const fresh = row("a", "2026-09-14T12:00:00Z", []);
    const stale = row("b", "2026-06-01T12:00:00Z", []);
    expect(sortPipeline([fresh, stale], now).map((r) => r.entry.id)).toEqual(["b", "a"]);
  });

  it("does not mutate the caller's array", () => {
    const rows = [row("b", "2026-09-14T12:00:00Z", []), row("a", "2026-06-01T12:00:00Z", [])];
    const before = rows.map((r) => r.entry.id);
    sortPipeline(rows, NOW);
    expect(rows.map((r) => r.entry.id)).toEqual(before);
  });

  it("picks the soonest open task for the row", () => {
    const r = row("a", "2026-09-01T00:00:00Z", [
      task({ id: "t2", due_date: "2026-10-01" }),
      task({ id: "t1", due_date: "2026-09-20" }),
    ]);
    expect(nextTask(r)?.id).toBe("t1");
    expect(nextTask(row("b", "2026-09-01T00:00:00Z", []))).toBeNull();
  });
});
