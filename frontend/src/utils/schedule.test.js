import {
  academicYearWindow,
  DEFAULT_PCICU_EXCEPTION_MONTHS,
  DEFAULT_ACADEMIC_YEAR_START,
} from "../config/schedule";
import {
  buildCalendarEvents,
  createDefaultMajorHolidayBlocks,
  createTypicalVacations,
  createTestCallAvoidRequests,
  expandDateRanges,
  getCallType,
  listCandidateVacationWeeks,
} from "./schedule";
import { INITIAL_ROSTER } from "../config/schedule";

const DEFAULT_WINDOW = academicYearWindow(DEFAULT_ACADEMIC_YEAR_START);

describe("getCallType", () => {
  test("treats holiday weekends as holiday call", () => {
    expect(getCallType("07/04/2026", [])).toBe("Holiday Call");
  });

  test("treats exception-month Tuesday as home call", () => {
    expect(getCallType("08/04/2026", DEFAULT_PCICU_EXCEPTION_MONTHS)).toBe("Home Call");
  });

  test("treats regular Wednesday as in-house call", () => {
    expect(getCallType("07/08/2026", [])).toBe("In-House Call");
  });
});

describe("buildCalendarEvents", () => {
  test("prefers backend call metadata when present", () => {
    const events = buildCalendarEvents(
      [{ date: DEFAULT_WINDOW.start, fellow: "Deepthi", call_type: "Holiday Call" }],
      [{ id: "f1", name: "Deepthi" }],
      [],
      {},
    );

    expect(events[0].title).toContain("Holiday Call");
    expect(events[0].resource.callType).toBe("Holiday Call");
  });
});

describe("createTypicalVacations", () => {
  test("draws from a shuffled candidate pool rather than earliest chronological weeks", () => {
    const majorHolidayBlocks = createDefaultMajorHolidayBlocks();
    const candidateWeeks = listCandidateVacationWeeks(DEFAULT_WINDOW.start, DEFAULT_WINDOW.end, majorHolidayBlocks);
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);

    try {
      const vacations = createTypicalVacations(INITIAL_ROSTER, DEFAULT_WINDOW.start, DEFAULT_WINDOW.end, majorHolidayBlocks);
      const firstAssignedWeek = vacations[INITIAL_ROSTER[0].id][0];

      expect(firstAssignedWeek).not.toEqual(candidateWeeks[0]);
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("expandDateRanges", () => {
  test("expands inclusive single-day and multi-day call-avoid requests", () => {
    expect(expandDateRanges([
      { from: "07/03/2026", to: "07/03/2026" },
      { from: "07/10/2026", to: "07/12/2026" },
    ])).toEqual([
      "07/03/2026",
      "07/10/2026",
      "07/11/2026",
      "07/12/2026",
    ]);
  });
});

describe("createTestCallAvoidRequests", () => {
  test("creates between one and five requests for each fellow, with mixed weekday and weekend coverage", () => {
    const majorHolidayBlocks = createDefaultMajorHolidayBlocks();
    const randomSpy = jest.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValue(0.1);

    try {
      const requests = createTestCallAvoidRequests(INITIAL_ROSTER, DEFAULT_WINDOW.start, DEFAULT_WINDOW.end, majorHolidayBlocks);
      const flattened = Object.values(requests).flat();

      INITIAL_ROSTER.forEach((fellow) => {
        expect(requests[fellow.id].length).toBeGreaterThanOrEqual(1);
        expect(requests[fellow.id].length).toBeLessThanOrEqual(5);
      });
      expect(flattened.some((range) => range.from === range.to)).toBe(true);
      expect(flattened.some((range) => range.from !== range.to)).toBe(true);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
