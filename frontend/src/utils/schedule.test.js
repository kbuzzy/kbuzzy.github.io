import {
  academicYearWindow,
  DEFAULT_PCICU_EXCEPTION_MONTHS,
  DEFAULT_ACADEMIC_YEAR_START,
} from "../config/schedule";
import {
  buildRequestSummary,
  buildCalendarEvents,
  createDefaultMajorHolidayBlocks,
  createDefaultConferenceBlocks,
  createTypicalVacations,
  createTestCallAvoidRequests,
  completeHolidayPreferenceRankings,
  createRandomPreferenceState,
  expandDateRanges,
  exportScheduleRequestsCsv,
  getCallType,
  importScheduleRequestsCsv,
  listCandidateVacationWeeks,
  serializeConferenceBlocks,
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

describe("completeHolidayPreferenceRankings", () => {
  test("moves neutral holidays with external priority demand later in the completed ranking", () => {
    const preferences = Object.fromEntries(
      INITIAL_ROSTER.map((fellow) => [
        fellow.id,
        {
          majorHolidays: {
            important: [],
            neutral: ["Thanksgiving", "Christmas", "New Year's"],
          },
          holidayWeekends: {
            important: [],
            neutral: ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"],
          },
        },
      ]),
    );
    preferences.f1.holidayWeekends = {
      important: ["July 4"],
      neutral: ["Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"],
    };

    const completed = completeHolidayPreferenceRankings(INITIAL_ROSTER, preferences);

    expect(completed.f1.holidayWeekends[0]).toBe("July 4");
    expect(completed.f2.holidayWeekends[completed.f2.holidayWeekends.length - 1]).toBe("July 4");
  });
});

describe("createRandomPreferenceState", () => {
  test("creates important and neutral preferences for every fellow in built-in tests", () => {
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.5);

    try {
      const preferences = createRandomPreferenceState(INITIAL_ROSTER);

      INITIAL_ROSTER.forEach((fellow) => {
        expect(preferences[fellow.id].majorHolidays.important.length).toBeGreaterThan(0);
        expect(preferences[fellow.id].majorHolidays.neutral.length).toBeGreaterThan(0);
        expect(preferences[fellow.id].holidayWeekends.important.length).toBeGreaterThan(0);
        expect(preferences[fellow.id].holidayWeekends.neutral.length).toBeGreaterThan(0);
      });
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("scheduling request CSV import/export", () => {
  test("round-trips vacation, call-avoid, board, holiday preference, and exception-month inputs", () => {
    const preferences = createRandomPreferenceState(INITIAL_ROSTER);
    const csv = exportScheduleRequestsCsv({
      roster: INITIAL_ROSTER,
      vacations: { f1: [{ from: "07/06/2026", to: "07/10/2026" }] },
      callAvoidRequests: { f1: [{ from: "07/13/2026", to: "07/13/2026" }] },
      boardExamIds: ["f1"],
      holidayPreferences: preferences,
      pcicuExceptionMonths: ["2026-08", "2026-11", "2027-01", "2027-02", "2027-04", "2027-05"],
      majorHolidayBlocks: createDefaultMajorHolidayBlocks(),
      conferenceBlocks: createDefaultConferenceBlocks(),
    });

    const imported = importScheduleRequestsCsv(csv, INITIAL_ROSTER);

    expect(imported.vacations.f1[0]).toEqual({ from: "07/06/2026", to: "07/10/2026" });
    expect(imported.callAvoidRequests.f1[0]).toEqual({ from: "07/13/2026", to: "07/13/2026" });
    expect(imported.boardExamIds).toContain("f1");
    expect(imported.pcicuExceptionMonths).toHaveLength(6);
    expect(imported.holidayPreferences.f1.majorHolidays.important.length).toBeGreaterThan(0);
    expect(imported.holidayPreferences.f1.majorHolidays.neutral.length).toBeGreaterThan(0);
  });
});

describe("buildRequestSummary", () => {
  test("reports satisfied and unmet requests with explanations", () => {
    const summary = buildRequestSummary({
      start: DEFAULT_WINDOW.start,
      roster: INITIAL_ROSTER,
      vacations: {
        f1: [{ from: "07/06/2026", to: "07/10/2026" }],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
        f6: [],
      },
      callAvoidRequests: {
        f1: [{ from: "07/13/2026", to: "07/13/2026" }],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
        f6: [],
      },
      boardExamIds: ["f1"],
      holidayPreferences: {
        f1: {
          majorHolidays: ["Thanksgiving", "Christmas", "New Year's"],
          holidayWeekends: ["Labor Day", "July 4", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"],
        },
        f2: { majorHolidays: ["Thanksgiving", "Christmas", "New Year's"], holidayWeekends: ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"] },
        f3: { majorHolidays: ["Thanksgiving", "Christmas", "New Year's"], holidayWeekends: ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"] },
        f4: { majorHolidays: ["Thanksgiving", "Christmas", "New Year's"], holidayWeekends: ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"] },
        f5: { majorHolidays: ["Thanksgiving", "Christmas", "New Year's"], holidayWeekends: ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"] },
        f6: { majorHolidays: ["Thanksgiving", "Christmas", "New Year's"], holidayWeekends: ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"] },
      },
      conferenceBlocks: createDefaultConferenceBlocks(),
      schedule: [
        { date: "07/13/2026", fellow: "Deepthi" },
      ],
      rotations: [
        { month: "2026-10", fellow: "Deepthi", rotation: "consult" },
        { month: "2026-08", fellow: "Jordan", rotation: "research" },
        { month: "2027-02", fellow: "Deepthi", rotation: "imaging" },
      ],
      holidayWeekends: [
        { label: "July 4", fellow: "Deepthi" },
      ],
      majorHolidays: [
        { holiday: "Christmas", fellow: "Deepthi" },
      ],
    });

    const deepthi = summary.find((item) => item.fellow === "Deepthi");
    expect(deepthi.satisfied.some((item) => item.includes("Vacation week 1"))).toBe(true);
    expect(deepthi.unmet.some((item) => item.label.includes("Call-avoid request 1"))).toBe(true);
    expect(deepthi.unmet.some((item) => item.label.includes("October board-exam rotation protection"))).toBe(true);
    expect(deepthi.unmet.some((item) => item.label.includes("Holiday weekend preference"))).toBe(true);
  });
});

describe("serializeConferenceBlocks", () => {
  test("converts frontend conference keys to backend payload keys", () => {
    expect(serializeConferenceBlocks(createDefaultConferenceBlocks())).toEqual({
      heart_camp: { start: "2026-08-21", end: "2026-08-26" },
      chop_conference: { start: "2027-02-03", end: "2027-02-07" },
    });
  });
});
