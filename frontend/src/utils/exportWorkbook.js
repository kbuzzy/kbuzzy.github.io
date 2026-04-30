import ExcelJS from "exceljs";
import moment from "moment";

import { DATE_FMT } from "../config/schedule";
import {
  buildMajorHolidayRows,
  buildVacationRows,
  buildWeekendAssignmentRows,
  exportScheduleRequestsCsv,
  fellowColor,
  getCallType,
} from "./schedule";

function toArgb(hex) {
  const normalized = hex?.startsWith("#") ? hex.slice(1) : hex;
  return normalized?.length === 6 ? `FF${normalized.toUpperCase()}` : "FF1F77B4";
}

function styleCalendarCell(cell) {
  cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  cell.border = {
    top: { style: "thin", color: { argb: "FFD0D7DE" } },
    left: { style: "thin", color: { argb: "FFD0D7DE" } },
    bottom: { style: "thin", color: { argb: "FFD0D7DE" } },
    right: { style: "thin", color: { argb: "FFD0D7DE" } },
  };
}

function buildMonthSheet(workbook, monthDate, scheduleMap, roster, majorHolidayBlocks, exceptionMonths) {
  const sheet = workbook.addWorksheet(monthDate.format("MMM YYYY"));
  sheet.columns = Array.from({ length: 7 }, () => ({ width: 18 }));

  sheet.mergeCells("A1:G1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = monthDate.format("MMMM YYYY");
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9EEF5" } };
  sheet.getRow(1).height = 24;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const headerRow = sheet.getRow(2);
  dayNames.forEach((name, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = name;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD0D7DE" } },
      left: { style: "thin", color: { argb: "FFD0D7DE" } },
      bottom: { style: "thin", color: { argb: "FFD0D7DE" } },
      right: { style: "thin", color: { argb: "FFD0D7DE" } },
    };
  });

  let current = monthDate.clone().startOf("month").startOf("week");
  const monthEnd = monthDate.clone().endOf("month");
  let rowIndex = 3;

  while (current.isSameOrBefore(monthEnd, "day") || current.weekday() !== 0) {
    const row = sheet.getRow(rowIndex);
    row.height = 58;

    for (let col = 1; col <= 7; col += 1) {
      const cell = row.getCell(col);
      styleCalendarCell(cell);
      const dateStr = current.format(DATE_FMT);
      const scheduleItem = scheduleMap.get(dateStr);
      const inMonth = current.month() === monthDate.month();

      if (!inMonth) {
        cell.value = "";
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      } else if (scheduleItem) {
        const fellowIndex = roster.findIndex((fellow) => fellow.name.trim() === scheduleItem.fellow);
        const callType = scheduleItem.call_type || getCallType(dateStr, exceptionMonths, majorHolidayBlocks);
        cell.value = `${current.date()}\n${scheduleItem.fellow}\n${callType}`;
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: toArgb(fellowColor(Math.max(fellowIndex, 0))) },
        };
        cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      } else {
        cell.value = `${current.date()}`;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      }

      current.add(1, "day");
    }

    rowIndex += 1;
    if (current.isAfter(monthEnd, "day") && current.weekday() === 0) {
      break;
    }
  }
}

function buildAssignmentsSheet(workbook, roster, vacations, schedule, holidayWeekends, startStr, endStr, majorHolidayAssignments, majorHolidayBlocks) {
  const sheet = workbook.addWorksheet("Assignments");
  sheet.columns = [
    { width: 24 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 22 },
    { width: 18 },
  ];

  const vacationRows = buildVacationRows(roster, vacations);
  const majorHolidayRows = buildMajorHolidayRows(majorHolidayAssignments);
  const weekendRows = buildWeekendAssignmentRows(schedule, holidayWeekends, startStr, endStr, majorHolidayBlocks);

  const sections = [
    {
      title: "Vacation Assignments",
      headers: ["Fellow", "Vacation Slot", "From", "To"],
      rows: vacationRows,
    },
    {
      title: "Major Holiday Assignments",
      headers: ["Holiday", "Half", "Start", "End", "Assigned Fellow", "Call Type"],
      rows: majorHolidayRows,
    },
    {
      title: "Three-Day And Holiday Weekend Assignments",
      headers: ["Assignment", "Start", "End", "Assigned Fellow", "Call Type"],
      rows: weekendRows,
    },
  ];

  let rowIndex = 1;
  sections.forEach((section) => {
    const titleRow = sheet.getRow(rowIndex);
    titleRow.getCell(1).value = section.title;
    titleRow.getCell(1).font = { bold: true, size: 12 };
    titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE7F3" } };
    rowIndex += 1;

    const headerRow = sheet.getRow(rowIndex);
    section.headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
      styleCalendarCell(cell);
    });
    rowIndex += 1;

    const rows = section.rows.length ? section.rows : [["None"]];
    rows.forEach((rowValues) => {
      const row = sheet.getRow(rowIndex);
      rowValues.forEach((value, index) => {
        const cell = row.getCell(index + 1);
        cell.value = value;
        styleCalendarCell(cell);
      });
      rowIndex += 1;
    });

    rowIndex += 1;
  });
}

function buildRequestSummarySheet(workbook, summary) {
  const sheet = workbook.addWorksheet("Request Summary");
  sheet.columns = [
    { width: 22 },
    { width: 12 },
    { width: 14 },
    { width: 80 },
  ];

  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = "Per-Fellow Request Summary";
  titleRow.getCell(1).font = { bold: true, size: 12 };
  titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE7F3" } };

  const headerRow = sheet.getRow(3);
  ["Fellow", "PGY", "Status", "Request"].forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
    styleCalendarCell(cell);
  });

  let rowIndex = 4;
  (summary?.length ? summary : [{ fellow: "None", pgy: "", satisfied: [], unmet: [] }]).forEach((item) => {
    const satisfied = Array.isArray(item?.satisfied) ? item.satisfied : [];
    const unmet = Array.isArray(item?.unmet) ? item.unmet : [];
    const rows = [
      ...satisfied.map((entry) => ({ status: "Satisfied", text: entry })),
      ...unmet.map((entry) => ({
        status: "Not satisfied",
        text: `${entry?.label || "Request"}. ${entry?.reason || "No explanation was provided."}`,
      })),
    ];
    const effectiveRows = rows.length ? rows : [{ status: "None", text: "No specific requests were entered for this fellow." }];

    effectiveRows.forEach((entry) => {
      const row = sheet.getRow(rowIndex);
      row.getCell(1).value = item?.fellow || "Unknown fellow";
      row.getCell(2).value = item?.pgy || "";
      row.getCell(3).value = entry.status;
      row.getCell(4).value = entry.text;
      for (let col = 1; col <= 4; col += 1) {
        styleCalendarCell(row.getCell(col));
      }
      rowIndex += 1;
    });
  });
}

function buildSchedulingRequestsSheet(workbook, requestInputs) {
  if (!requestInputs) return;
  const sheet = workbook.addWorksheet("Scheduling Requests");
  const rows = exportScheduleRequestsCsv(requestInputs).split("\n").map((line) => line.split(","));
  sheet.columns = Array.from({ length: rows[0]?.length || 8 }, () => ({ width: 22 }));
  rows.forEach((rowValues, rowIndex) => {
    const row = sheet.getRow(rowIndex + 1);
    rowValues.forEach((value, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      cell.value = value.replace(/^"|"$/g, "").replace(/""/g, '"');
      styleCalendarCell(cell);
      if (rowIndex === 0) {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
      }
    });
  });
}

function buildComparisonOverviewSheet(workbook, versions) {
  const sheet = workbook.addWorksheet("Comparison Overview");
  sheet.columns = [
    { width: 14 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
  ];
  const headers = ["Version", "Attempt", "Request Score", "Validation Score", "Vacation Alternatives"];
  headers.forEach((header, index) => {
    const cell = sheet.getRow(1).getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
    styleCalendarCell(cell);
  });
  versions.forEach((version, index) => {
    const row = sheet.getRow(index + 2);
    row.getCell(1).value = `Version ${index + 1}`;
    row.getCell(2).value = version.attempt;
    row.getCell(3).value = version.requestScore;
    row.getCell(4).value = version.validationScore;
    row.getCell(5).value = version.vacationFallbacks?.length || 0;
    for (let col = 1; col <= 5; col += 1) styleCalendarCell(row.getCell(col));
  });
}

function buildUnfulfilledRequestsSheet(workbook, versions) {
  const sheet = workbook.addWorksheet("Unfulfilled Requests");
  sheet.columns = [
    { width: 14 },
    { width: 22 },
    { width: 12 },
    { width: 36 },
    { width: 90 },
  ];
  const headers = ["Version", "Fellow", "PGY", "Request", "Reason"];
  headers.forEach((header, index) => {
    const cell = sheet.getRow(1).getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
    styleCalendarCell(cell);
  });

  let rowIndex = 2;
  versions.forEach((version, versionIndex) => {
    (version.requestSummary || []).forEach((item) => {
      (item.unmet || []).forEach((entry) => {
        const row = sheet.getRow(rowIndex);
        row.getCell(1).value = `Version ${versionIndex + 1}`;
        row.getCell(2).value = item.fellow;
        row.getCell(3).value = item.pgy;
        row.getCell(4).value = entry?.label || "Request";
        row.getCell(5).value = entry?.reason || "No explanation was provided.";
        for (let col = 1; col <= 5; col += 1) styleCalendarCell(row.getCell(col));
        rowIndex += 1;
      });
    });
  });

  if (rowIndex === 2) {
    const row = sheet.getRow(rowIndex);
    row.getCell(1).value = "All valid generated versions fulfilled every tracked request.";
    styleCalendarCell(row.getCell(1));
  }
}

function buildVersionScheduleSheet(workbook, version, versionIndex) {
  const sheet = workbook.addWorksheet(`Version ${versionIndex + 1}`);
  sheet.columns = [
    { width: 16 },
    { width: 22 },
    { width: 22 },
  ];
  ["Date", "Fellow", "Call Type"].forEach((header, index) => {
    const cell = sheet.getRow(1).getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
    styleCalendarCell(cell);
  });
  (version.data?.schedule || []).forEach((item, index) => {
    const row = sheet.getRow(index + 2);
    row.getCell(1).value = item.date;
    row.getCell(2).value = item.fellow;
    row.getCell(3).value = item.call_type || "";
    for (let col = 1; col <= 3; col += 1) styleCalendarCell(row.getCell(col));
  });
}

export async function exportScheduleComparisonWorkbook(versions, options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kilian Burke";
  workbook.created = new Date();
  const safeVersions = versions || [];

  buildComparisonOverviewSheet(workbook, safeVersions);
  buildUnfulfilledRequestsSheet(workbook, safeVersions);
  safeVersions.forEach((version, index) => buildVersionScheduleSheet(workbook, version, index));

  if (options.download !== false) {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob(
      [buffer],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fellowship_schedule_valid_versions.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return workbook;
}

export async function exportCalendarWorkbook(
  schedule,
  startStr,
  endStr,
  roster,
  vacations,
  holidayWeekends,
  majorHolidayAssignments,
  majorHolidayBlocks,
  exceptionMonths,
  requestSummary,
  options = {},
) {
  const { download = true } = options;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kilian Burke";
  workbook.created = new Date();

  const scheduleMap = new Map(schedule.map((item) => [item.date, item]));
  let monthCursor = moment(startStr, DATE_FMT).startOf("month");
  const windowEnd = moment(endStr, DATE_FMT);

  while (monthCursor.isSameOrBefore(windowEnd, "month")) {
    buildMonthSheet(workbook, monthCursor, scheduleMap, roster, majorHolidayBlocks, exceptionMonths);
    monthCursor = monthCursor.clone().add(1, "month");
  }

  buildAssignmentsSheet(
    workbook,
    roster,
    vacations,
    schedule,
    holidayWeekends,
    startStr,
    endStr,
    majorHolidayAssignments,
    majorHolidayBlocks,
  );
  buildRequestSummarySheet(workbook, requestSummary);
  buildSchedulingRequestsSheet(workbook, options.requestInputs);

  if (download) {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob(
      [buffer],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fellowship_schedule_export.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return workbook;
}
