import * as XLSX from "xlsx";
import moment from "moment";

import { DATE_FMT } from "../config/schedule";
import {
  buildMajorHolidayRows,
  buildVacationRows,
  buildWeekendAssignmentRows,
  getCallType,
} from "./schedule";

function buildMonthSheetData(schedule, startStr, endStr, roster, majorHolidayBlocks, exceptionMonths) {
  const byDate = {};
  const scheduleByDate = {};
  for (const item of schedule) {
    byDate[item.date] = item.fellow;
    scheduleByDate[item.date] = item;
  }

  const monthSheets = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let monthCursor = moment(startStr, DATE_FMT).startOf("month");
  const windowEnd = moment(endStr, DATE_FMT);

  while (monthCursor.isSameOrBefore(windowEnd, "month")) {
    const rows = [
      [monthCursor.format("MMMM YYYY")],
      dayNames,
    ];

    let currentWeek = new Array(7).fill("");
    let col = monthCursor.clone().startOf("month").day();

    for (let day = 1; day <= monthCursor.daysInMonth(); day += 1) {
      const date = monthCursor.clone().date(day);
      const dateStr = date.format(DATE_FMT);
      let label = String(day);
      if (byDate[dateStr]) {
        const callType = scheduleByDate[dateStr]?.call_type || getCallType(dateStr, exceptionMonths, majorHolidayBlocks);
        label += `\n${byDate[dateStr]}\n${callType}`;
      }
      currentWeek[col] = label;
      col += 1;

      if (col === 7) {
        rows.push(currentWeek);
        currentWeek = new Array(7).fill("");
        col = 0;
      }
    }

    if (col > 0) {
      rows.push(currentWeek);
    }

    monthSheets.push({
      name: monthCursor.format("MMM YYYY"),
      rows,
    });
    monthCursor.add(1, "month");
  }

  return monthSheets;
}

function applyWorksheetLayout(worksheet, columnCount) {
  worksheet["!cols"] = Array.from({ length: columnCount }, () => ({ wch: 18 }));
}

export function exportCalendarWorkbook(
  schedule,
  startStr,
  endStr,
  roster,
  vacations,
  holidayWeekends,
  majorHolidayAssignments,
  majorHolidayBlocks,
  exceptionMonths,
  options = {},
) {
  const { download = true } = options;
  const workbook = XLSX.utils.book_new();

  const monthSheets = buildMonthSheetData(
    schedule,
    startStr,
    endStr,
    roster,
    majorHolidayBlocks,
    exceptionMonths,
  );

  monthSheets.forEach(({ name, rows }) => {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    applyWorksheetLayout(worksheet, 7);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  });

  const vacationRows = buildVacationRows(roster, vacations);
  const majorHolidayRows = buildMajorHolidayRows(majorHolidayAssignments);
  const weekendRows = buildWeekendAssignmentRows(schedule, holidayWeekends, startStr, endStr, majorHolidayBlocks);

  const assignmentRows = [
    ["Vacation Assignments"],
    ["Fellow", "Vacation Slot", "From", "To"],
    ...(vacationRows.length ? vacationRows : [["None"]]),
    [],
    ["Major Holiday Assignments"],
    ["Holiday", "Half", "Start", "End", "Assigned Fellow", "Call Type"],
    ...(majorHolidayRows.length ? majorHolidayRows : [["None"]]),
    [],
    ["Three-Day And Holiday Weekend Assignments"],
    ["Assignment", "Start", "End", "Assigned Fellow", "Call Type"],
    ...(weekendRows.length ? weekendRows : [["None"]]),
  ];

  const assignmentsSheet = XLSX.utils.aoa_to_sheet(assignmentRows);
  applyWorksheetLayout(assignmentsSheet, 6);
  XLSX.utils.book_append_sheet(workbook, assignmentsSheet, "Assignments");

  if (download) {
    XLSX.writeFile(workbook, "fellowship_schedule_export.xlsx");
  }

  return workbook;
}
