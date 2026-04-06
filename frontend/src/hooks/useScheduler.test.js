import { buildSummaryForSolvedRun } from "./useScheduler";
import { INITIAL_ROSTER } from "../config/schedule";
import { createDefaultConferenceBlocks } from "../utils/schedule";

describe("buildSummaryForSolvedRun", () => {
  test("uses the solved run inputs rather than any stale caller state", () => {
    const summary = buildSummaryForSolvedRun({
      start: "07/01/2026",
      roster: INITIAL_ROSTER,
      vacations: Object.fromEntries(INITIAL_ROSTER.map((fellow) => [fellow.id, []])),
      callAvoidRequests: {
        f1: [{ from: "07/13/2026", to: "07/13/2026" }],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
        f6: [],
      },
      boardExamIds: ["f1"],
      holidayPreferences: Object.fromEntries(
        INITIAL_ROSTER.map((fellow) => [
          fellow.id,
          {
            majorHolidays: ["Thanksgiving", "Christmas", "New Year's"],
            holidayWeekends: ["July 4", "Labor Day", "MLK Day", "Good Friday", "Memorial Day", "Juneteenth"],
          },
        ]),
      ),
      conferenceBlocks: createDefaultConferenceBlocks(),
      data: {
        schedule: [{ date: "07/13/2026", fellow: "Deepthi" }],
        rotations: [{ month: "2026-10", fellow: "Deepthi", rotation: "consult" }],
        holiday_weekends: [],
        major_holidays: [],
      },
    });

    const deepthi = summary.find((item) => item.fellow === "Deepthi");
    expect(deepthi).toBeDefined();
    expect(deepthi.unmet.some((item) => item.label.includes("Call-avoid request 1"))).toBe(true);
    expect(deepthi.unmet.some((item) => item.label.includes("October board-exam request"))).toBe(true);
  });
});
