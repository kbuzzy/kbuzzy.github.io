import { buildCalendarEvents, getCallType } from "./schedule";

describe("getCallType", () => {
  test("treats holiday weekends as holiday call", () => {
    expect(getCallType("07/04/2026", [])).toBe("Holiday Call");
  });

  test("treats exception-month Tuesday as home call", () => {
    expect(getCallType("08/04/2026", ["2026-08"])).toBe("Home Call");
  });

  test("treats regular Wednesday as in-house call", () => {
    expect(getCallType("07/08/2026", [])).toBe("In-House Call");
  });
});

describe("buildCalendarEvents", () => {
  test("prefers backend call metadata when present", () => {
    const events = buildCalendarEvents(
      [{ date: "07/01/2026", fellow: "Deepthi", call_type: "Holiday Call" }],
      [{ id: "f1", name: "Deepthi" }],
      [],
      {},
    );

    expect(events[0].title).toContain("Holiday Call");
    expect(events[0].resource.callType).toBe("Holiday Call");
  });
});
