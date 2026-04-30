import { exportScheduleComparisonWorkbook } from "./exportWorkbook";

describe("exportScheduleComparisonWorkbook", () => {
  test("includes overview, unmet requests, and one sheet per valid version", async () => {
    const workbook = await exportScheduleComparisonWorkbook([
      {
        attempt: 1,
        requestScore: 4,
        validationScore: 20,
        vacationFallbacks: [],
        requestSummary: [
          {
            fellow: "Deepthi",
            pgy: "PGY-4",
            unmet: [{ label: "Vacation week 1", reason: "Alternative week needed." }],
          },
        ],
        data: {
          schedule: [{ date: "07/01/2026", fellow: "Deepthi", call_type: "In-House Call" }],
          rotations: [
            { month: "2026-07", fellow: "Deepthi", rotation: "imaging" },
            { month: "2026-07", fellow: "Amitie", rotation: "consult" },
          ],
        },
      },
      {
        attempt: 2,
        requestScore: 6,
        validationScore: 22,
        vacationFallbacks: [{ fellow: "Amitie" }],
        requestSummary: [],
        data: {
          schedule: [{ date: "07/01/2026", fellow: "Amitie", call_type: "Home Call" }],
          rotations: [
            { month: "2026-07", fellow: "Deepthi", rotation: "consult" },
            { month: "2026-07", fellow: "Amitie", rotation: "imaging" },
          ],
        },
      },
    ], { download: false });

    expect(workbook.getWorksheet("Comparison Overview")).toBeTruthy();
    expect(workbook.getWorksheet("Unfulfilled Requests")).toBeTruthy();
    expect(workbook.getWorksheet("Version 1")).toBeTruthy();
    expect(workbook.getWorksheet("Version 2")).toBeTruthy();
    expect(workbook.getWorksheet("Unfulfilled Requests").getRow(2).getCell(4).value).toBe("Vacation week 1");
    expect(workbook.getWorksheet("Version 1").getCell("A3").value).toBe("Rotation Blocks");
    expect(workbook.getWorksheet("Version 1").getCell("B4").value).toBe("2026-07");
    expect(workbook.getWorksheet("Version 1").getCell("A9").value).toBe("Call Calendar");
  });
});
