import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = momentLocalizer(moment);
const DEFAULT_LOCAL_API_URL = "http://127.0.0.1:8000";
const API_URL = process.env.REACT_APP_API_URL
  || (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? DEFAULT_LOCAL_API_URL
    : "");
const DATE_FMT = "MM/DD/YYYY";
const MAX_VACATION_WEEKS = 4;
const STORAGE_KEY = "fellowship-scheduler-state-v1";
const DEFAULT_PCICU_EXCEPTION_MONTHS = ["2026-08", "2026-11", "2027-01", "2027-02", "2027-04", "2027-05"];
const DEFAULT_RETRY_MAX_ATTEMPTS = 8;

const PALETTE = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b"];
// These labels mirror the backend rotation ids so solved results can be
// rendered directly without an extra translation step.
const ROTATION_LABELS = {
  consult: "Consult",
  imaging: "Imaging",
  research: "Research",
  cath: "Cath",
  achd_ep: "ACHD/EP",
  pcicu: "PCICU",
};
const PGY_ROTATION_TARGETS = {
  "PGY-1": { consult: 3, pcicu: 1, cath: 4, imaging: 3, research: 1, achd_ep: 0 },
  "PGY-2": { consult: 2, pcicu: 1, cath: 1, imaging: 3, research: 4, achd_ep: 1 },
  "PGY-3": { consult: 1, pcicu: 1, cath: 1, imaging: 1, research: 7, achd_ep: 1 },
};
const HOLIDAY_WEEKENDS = [
  { label: "July 4", start: "07/03/2026", end: "07/06/2026" },
  { label: "Labor Day", start: "09/04/2026", end: "09/07/2026" },
  { label: "MLK Day", start: "01/15/2027", end: "01/18/2027" },
  { label: "Good Friday", start: "03/25/2027", end: "03/28/2027" },
  { label: "Memorial Day", start: "05/28/2027", end: "05/31/2027" },
  { label: "Juneteenth", start: "06/18/2027", end: "06/21/2027" },
];
const MAJOR_HOLIDAYS = ["Thanksgiving", "Christmas", "New Year's"];
// The holiday-half editor starts from these defaults, but users can shift the
// date ranges for a future academic year without changing code.
const DEFAULT_MAJOR_HOLIDAY_BLOCKS = {
  Thanksgiving: [
    { label: "Thanksgiving A", start: "11/25/2026", end: "11/26/2026" },
    { label: "Thanksgiving B", start: "11/27/2026", end: "11/29/2026" },
  ],
  Christmas: [
    { label: "Christmas A", start: "12/22/2026", end: "12/24/2026" },
    { label: "Christmas B", start: "12/25/2026", end: "12/27/2026" },
  ],
  "New Year's": [
    { label: "New Year's A", start: "12/28/2026", end: "12/30/2026" },
    { label: "New Year's B", start: "12/31/2026", end: "01/03/2027" },
  ],
};
const HOLIDAY_WEEKEND_OPTIONS = HOLIDAY_WEEKENDS.map((item) => item.label);

const INITIAL_ROSTER = [
  { id: "f1", pgy: "PGY-1", name: "Deepthi" },
  { id: "f2", pgy: "PGY-1", name: "Amitie" },
  { id: "f3", pgy: "PGY-2", name: "Rijutha" },
  { id: "f4", pgy: "PGY-2", name: "Jeffery" },
  { id: "f5", pgy: "PGY-3", name: "Jordan" },
  { id: "f6", pgy: "PGY-3", name: "Kilian" },
];

function fellowColor(index) {
  return PALETTE[index % PALETTE.length];
}

function colorWithAlpha(hex, alpha) {
  if (!hex?.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) return hex;
  let normalized = hex;
  if (hex.length === 4) {
    normalized = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function tintHex(hex, ratio = 0.8) {
  if (!hex?.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) return hex;
  let normalized = hex;
  if (hex.length === 4) {
    normalized = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  const blend = (channel) => {
    const base = parseInt(normalized.slice(channel, channel + 2), 16);
    const mixed = Math.round(base + (255 - base) * ratio);
    return mixed.toString(16).padStart(2, "0");
  };
  return `#${blend(1)}${blend(3)}${blend(5)}`;
}

function createDefaultMajorHolidayBlocks() {
  return JSON.parse(JSON.stringify(DEFAULT_MAJOR_HOLIDAY_BLOCKS));
}

function getCallType(dateStr, exceptionMonths, majorHolidayBlocks = DEFAULT_MAJOR_HOLIDAY_BLOCKS) {
  // Call labels drive the calendar, in-house totals, validation messaging, and
  // workbook export, so this helper is the single source of truth.
  const date = moment(dateStr, DATE_FMT);
  const month = date.format("YYYY-MM");

  const inMajorHoliday = Object.values(majorHolidayBlocks).some((halves) => halves.some((item) => (
    date.isBetween(moment(item.start, DATE_FMT), moment(item.end, DATE_FMT), "day", "[]")
  )));
  if (inMajorHoliday) {
    return "Holiday Call";
  }

  const inHolidayWeekend = HOLIDAY_WEEKENDS.some((item) => (
    date.isBetween(moment(item.start, DATE_FMT), moment(item.end, DATE_FMT), "day", "[]")
  ));
  if (inHolidayWeekend) {
    return "Holiday Call";
  }

  const day = date.day();
  if (day === 1) {
    return "Home Call";
  }
  if (day === 2) {
    return exceptionMonths.includes(month) ? "Home Call" : "In-House Call";
  }
  if (day === 3 || day === 4) {
    return "In-House Call";
  }
  return "Home Call";
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildVacationRows(roster, vacations) {
  const rows = [];
  roster.forEach((fellow) => {
    (vacations[fellow.id] || []).forEach((range, index) => {
      if (!range.from || !range.to) return;
      rows.push([fellow.name, `Week ${index + 1}`, range.from, range.to]);
    });
  });
  return rows;
}

function buildWeekendAssignmentRows(schedule, holidayWeekends, startStr, endStr) {
  const byDate = {};
  schedule.forEach((item) => { byDate[item.date] = item.fellow; });

  const rows = [];
  const holidayCoveredDates = new Set();
  HOLIDAY_WEEKENDS.forEach((item) => {
    const cur = moment(item.start, DATE_FMT);
    const end = moment(item.end, DATE_FMT);
    while (cur.isSameOrBefore(end)) {
      holidayCoveredDates.add(cur.format(DATE_FMT));
      cur.add(1, "day");
    }
  });

  holidayWeekends.forEach((item) => {
    rows.push([item.label, item.start, item.end, item.fellow || "-", "Holiday Call"]);
  });

  const cur = moment(startStr, DATE_FMT);
  const end = moment(endStr, DATE_FMT);
  while (cur.isSameOrBefore(end)) {
    const dateStr = cur.format(DATE_FMT);
    if (cur.day() === 5 && !holidayCoveredDates.has(dateStr) && cur.clone().add(2, "days").isSameOrBefore(end)) {
      rows.push([
        `Weekend ${dateStr}`,
        dateStr,
        cur.clone().add(2, "days").format(DATE_FMT),
        byDate[dateStr] || "-",
        "Home Call",
      ]);
    }
    cur.add(1, "day");
  }

  return rows;
}

function buildMajorHolidayRows(majorHolidayAssignments) {
  return (majorHolidayAssignments || []).map((item) => [
    item.holiday,
    item.label,
    item.start,
    item.end,
    item.fellow || "-",
    "Holiday Call",
  ]);
}

function serializeMajorHolidayBlocks(blocks) {
  return Object.fromEntries(
    Object.entries(blocks).map(([holiday, halves]) => [
      holiday,
      halves.map((half) => ({
        start: moment(half.start, DATE_FMT).format("YYYY-MM-DD"),
        end: moment(half.end, DATE_FMT).format("YYYY-MM-DD"),
      })),
    ]),
  );
}

function expandWeekRanges(ranges) {
  const dates = [];
  for (const { from, to } of ranges) {
    if (!from || !to) continue;
    const start = moment(from, DATE_FMT);
    const end = moment(to, DATE_FMT);
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) continue;
    const cur = start.clone();
    while (cur.isSameOrBefore(end)) {
      if (cur.day() >= 1 && cur.day() <= 5) dates.push(cur.format(DATE_FMT));
      cur.add(1, "day");
    }
  }
  return dates;
}

function snapToMonday(dateStr) {
  const m = moment(dateStr, DATE_FMT);
  return m.isValid() ? m.startOf("isoWeek").format(DATE_FMT) : dateStr;
}

function snapToFriday(dateStr) {
  const m = moment(dateStr, DATE_FMT);
  return m.isValid() ? m.startOf("isoWeek").add(4, "days").format(DATE_FMT) : dateStr;
}

function listMonths(start, end) {
  const startDate = moment(start, DATE_FMT);
  const endDate = moment(end, DATE_FMT);
  if (!startDate.isValid() || !endDate.isValid() || endDate.isBefore(startDate)) return [];

  const months = [];
  const cur = startDate.clone().startOf("month");
  while (cur.isSameOrBefore(endDate, "month")) {
    months.push({ key: cur.format("YYYY-MM"), label: cur.format("MMM YYYY") });
    cur.add(1, "month");
  }
  return months;
}

function createDefaultVacations() {
  return Object.fromEntries(
    INITIAL_ROSTER.map((fellow) => [
      fellow.id,
      Array.from({ length: MAX_VACATION_WEEKS }, () => ({ from: "", to: "" })),
    ]),
  );
}

function createDefaultPreferenceState() {
  return Object.fromEntries(
    INITIAL_ROSTER.map((fellow) => [
      fellow.id,
      {
        majorHolidays: [...MAJOR_HOLIDAYS],
        holidayWeekends: [...HOLIDAY_WEEKEND_OPTIONS],
      },
    ]),
  );
}

function readStoredState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function exportCalendarWorkbook(
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
  // This uses Excel XML rather than plain CSV so the export can include tabs,
  // per-fellow colors, and richer calendar cell labels without a spreadsheet dependency.
  const byDate = {};
  for (const item of schedule) byDate[item.date] = item.fellow;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const styles = [
    '<Style ss:ID="default"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>',
    '<Style ss:ID="monthHeader"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:Bold="1" ss:Size="14"/><Interior ss:Color="#e9ecef" ss:Pattern="Solid"/></Style>',
    '<Style ss:ID="dayHeader"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:Bold="1"/><Interior ss:Color="#f1f3f5" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>',
    '<Style ss:ID="sectionHeader"><Font ss:Bold="1" ss:Size="12"/><Interior ss:Color="#dbe4f0" ss:Pattern="Solid"/></Style>',
    '<Style ss:ID="tableHeader"><Font ss:Bold="1"/><Interior ss:Color="#eef2f7" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>',
  ];
  roster.forEach((fellow, index) => {
    const color = fellowColor(index);
    styles.push(
      `<Style ss:ID="fellow_${index}"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="${color}" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>`,
    );
    styles.push(
      `<Style ss:ID="fellow_tint_${index}"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Interior ss:Color="${tintHex(color, 0.8)}" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>`,
    );
  });

  const monthSheets = [];
  let monthCursor = moment(startStr, DATE_FMT).startOf("month");
  const windowEnd = moment(endStr, DATE_FMT);

  while (monthCursor.isSameOrBefore(windowEnd, "month")) {
    const rows = [];
    rows.push('<Row><Cell ss:MergeAcross="6" ss:StyleID="monthHeader"><Data ss:Type="String">' + escapeXml(monthCursor.format("MMMM YYYY")) + "</Data></Cell></Row>");
    rows.push("<Row>" + dayNames.map((dayName) => (
      `<Cell ss:StyleID="dayHeader"><Data ss:Type="String">${escapeXml(dayName)}</Data></Cell>`
    )).join("") + "</Row>");

    let currentWeek = new Array(7).fill(null);
    let col = monthCursor.clone().startOf("month").day();

    for (let day = 1; day <= monthCursor.daysInMonth(); day += 1) {
      const date = monthCursor.clone().date(day);
      const dateStr = date.format(DATE_FMT);
      let label = String(day);
      let styleId = "default";
      if (byDate[dateStr]) {
        const fellowIndex = roster.findIndex((fellow) => fellow.name.trim() === byDate[dateStr]);
        const callType = getCallType(dateStr, exceptionMonths, majorHolidayBlocks);
        label += `\n${byDate[dateStr]}\n${callType}`;
        styleId = fellowIndex >= 0 ? `fellow_${fellowIndex}` : "default";
      }
      currentWeek[col] = { value: label, styleId };
      col += 1;
      if (col === 7) {
        rows.push("<Row ss:AutoFitHeight=\"0\" ss:Height=\"54\">" + currentWeek.map((cell) => {
          if (!cell) {
            return '<Cell ss:StyleID="default"><Data ss:Type="String"></Data></Cell>';
          }
          return `<Cell ss:StyleID="${cell.styleId}"><Data ss:Type="String">${escapeXml(cell.value)}</Data></Cell>`;
        }).join("") + "</Row>");
        currentWeek = new Array(7).fill(null);
        col = 0;
      }
    }

    if (col > 0) {
      rows.push("<Row ss:AutoFitHeight=\"0\" ss:Height=\"54\">" + currentWeek.map((cell) => {
        if (!cell) {
          return '<Cell ss:StyleID="default"><Data ss:Type="String"></Data></Cell>';
        }
        return `<Cell ss:StyleID="${cell.styleId}"><Data ss:Type="String">${escapeXml(cell.value)}</Data></Cell>`;
      }).join("") + "</Row>");
    }
    monthSheets.push(
      `<Worksheet ss:Name="${escapeXml(monthCursor.format("MMM YYYY"))}"><Table>` +
      '<Column ss:Width="115"/><Column ss:Width="140"/><Column ss:Width="140"/><Column ss:Width="140"/><Column ss:Width="140"/><Column ss:Width="140"/><Column ss:Width="140"/>' +
      rows.join("") +
      "</Table></Worksheet>",
    );
    monthCursor.add(1, "month");
  }

  const vacationRows = buildVacationRows(roster, vacations);
  const majorHolidayRows = buildMajorHolidayRows(majorHolidayAssignments);
  const weekendRows = buildWeekendAssignmentRows(schedule, holidayWeekends, startStr, endStr);

  const assignmentsRows = [];
  const pushSection = (title, headers, rows) => {
    assignmentsRows.push(`<Row><Cell ss:MergeAcross="${headers.length - 1}" ss:StyleID="sectionHeader"><Data ss:Type="String">${escapeXml(title)}</Data></Cell></Row>`);
    assignmentsRows.push("<Row>" + headers.map((header) => (
      `<Cell ss:StyleID="tableHeader"><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`
    )).join("") + "</Row>");
    if (rows.length === 0) {
      assignmentsRows.push(`<Row><Cell ss:MergeAcross="${headers.length - 1}" ss:StyleID="default"><Data ss:Type="String">None</Data></Cell></Row>`);
    } else {
      rows.forEach((row) => {
        assignmentsRows.push("<Row>" + row.map((cell) => (
          `<Cell ss:StyleID="default"><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`
        )).join("") + "</Row>");
      });
    }
    assignmentsRows.push("<Row></Row>");
  };

  pushSection("Vacation Assignments", ["Fellow", "Vacation Slot", "From", "To"], vacationRows);
  pushSection("Major Holiday Assignments", ["Holiday", "Half", "Start", "End", "Assigned Fellow", "Call Type"], majorHolidayRows);
  pushSection("Three-Day And Holiday Weekend Assignments", ["Assignment", "Start", "End", "Assigned Fellow", "Call Type"], weekendRows);

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
<Styles>${styles.join("")}</Styles>
${monthSheets.join("")}
<Worksheet ss:Name="Assignments"><Table>
<Column ss:Width="160"/><Column ss:Width="120"/><Column ss:Width="120"/><Column ss:Width="120"/><Column ss:Width="160"/><Column ss:Width="120"/>
${assignmentsRows.join("")}
</Table></Worksheet>
</Workbook>`;
  if (!download) {
    return workbook;
  }
  const blob = new Blob([workbook], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fellowship_schedule_export.xls";
  a.click();
  URL.revokeObjectURL(url);
  return workbook;
}

function shuffle(list) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function sample(list, count) {
  return shuffle(list).slice(0, count);
}

function randomVacationWeeks(months) {
  const selectedMonths = sample(months, MAX_VACATION_WEEKS);
  return selectedMonths.map((month) => {
    const monthStart = moment(`${month.key}-01`, "YYYY-MM-DD").startOf("month");
    let monday = monthStart.clone().startOf("isoWeek");
    if (monday.month() !== monthStart.month()) {
      monday = monday.add(1, "week");
    }
    const possible = [];
    while (monday.month() === monthStart.month()) {
      possible.push(monday.clone());
      monday = monday.add(1, "week");
    }
    const chosen = possible[Math.floor(Math.random() * possible.length)];
    return {
      from: chosen.format(DATE_FMT),
      to: chosen.clone().add(4, "days").format(DATE_FMT),
    };
  });
}

function weekOverlapsProtectedDates(weekStart, protectedDates) {
  for (let offset = 0; offset < 5; offset += 1) {
    if (protectedDates.has(weekStart.clone().add(offset, "days").format(DATE_FMT))) {
      return true;
    }
  }
  return false;
}

function listCandidateVacationWeeks(start, end, majorHolidayBlocks) {
  const protectedDates = new Set();
  HOLIDAY_WEEKENDS.forEach((item) => {
    const cur = moment(item.start, DATE_FMT);
    const last = moment(item.end, DATE_FMT);
    while (cur.isSameOrBefore(last)) {
      protectedDates.add(cur.format(DATE_FMT));
      cur.add(1, "day");
    }
  });
  Object.values(majorHolidayBlocks).forEach((halves) => {
    halves.forEach((item) => {
      const cur = moment(item.start, DATE_FMT);
      const last = moment(item.end, DATE_FMT);
      while (cur.isSameOrBefore(last)) {
        protectedDates.add(cur.format(DATE_FMT));
        cur.add(1, "day");
      }
    });
  });

  const candidates = [];
  let cursor = moment(start, DATE_FMT).startOf("isoWeek");
  const lastDate = moment(end, DATE_FMT);
  while (cursor.clone().add(4, "days").isSameOrBefore(lastDate)) {
    if (!weekOverlapsProtectedDates(cursor, protectedDates)) {
      candidates.push({
        from: cursor.format(DATE_FMT),
        to: cursor.clone().add(4, "days").format(DATE_FMT),
      });
    }
    cursor.add(1, "week");
  }
  return candidates;
}

function createTypicalVacations(roster, start, end, majorHolidayBlocks) {
  const candidates = listCandidateVacationWeeks(start, end, majorHolidayBlocks);
  const needed = roster.length * MAX_VACATION_WEEKS;
  if (candidates.length < needed) {
    throw new Error("Not enough non-overlapping vacation weeks are available for the typical test.");
  }

  return Object.fromEntries(
    roster.map((fellow, fellowIndex) => [
      fellow.id,
      Array.from({ length: MAX_VACATION_WEEKS }, (_, slotIndex) => {
        const candidate = candidates[fellowIndex + (slotIndex * roster.length)];
        return { from: candidate.from, to: candidate.to };
      }),
    ]),
  );
}

function createRandomPreferenceState(roster) {
  return Object.fromEntries(
    roster.map((fellow) => [
      fellow.id,
      {
        majorHolidays: shuffle(MAJOR_HOLIDAYS),
        holidayWeekends: shuffle(HOLIDAY_WEEKEND_OPTIONS),
      },
    ]),
  );
}

function BoardExamEditor({ roster, boardExamIds, onToggle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        October Board Exams
        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: "#777" }}>
          Soft preference: October exam takers are prioritized for imaging or research when possible
        </span>
      </label>
      <div style={{ display: "grid", gap: 8 }}>
        {roster.map((fellow) => (
          <label
            key={fellow.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              padding: "8px 10px",
            }}
          >
            <input
              type="checkbox"
              checked={boardExamIds.includes(fellow.id)}
              onChange={() => onToggle(fellow.id)}
            />
            <span>{fellow.name}</span>
            <span style={{ color: "#777", fontSize: 12 }}>{fellow.pgy}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function PcicuExceptionMonthEditor({ months, selectedMonths, onToggle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        PICU Tuesday Coverage Exception Months
        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: "#777" }}>
          Select exactly 6 months when PICU covers Tuesday nights instead of the PCICU fellow
        </span>
      </label>
      <div style={{ display: "grid", gap: 8 }}>
        {months.map((month) => (
          <label
            key={month.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              padding: "8px 10px",
            }}
          >
            <input
              type="checkbox"
              checked={selectedMonths.includes(month.key)}
              onChange={() => onToggle(month.key)}
            />
            <span>{month.label}</span>
          </label>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: selectedMonths.length === 6 ? "#155724" : "#c0392b" }}>
        {selectedMonths.length}/6 months selected
      </div>
    </div>
  );
}

function BackendStatusBadge({ status, checking, apiUrl, onRetry }) {
  const statusStyles = {
    connected: {
      bg: "#d4edda",
      color: "#155724",
      label: "Connected to backend",
      detail: "The live site can reach the scheduling API.",
    },
    error: {
      bg: "#fde8e8",
      color: "#c0392b",
      label: "Backend unavailable",
      detail: "If Render was sleeping, this should recover automatically after a short retry window.",
    },
    unconfigured: {
      bg: "#fff3cd",
      color: "#856404",
      label: "Backend not configured",
      detail: "Set REACT_APP_API_URL in the Pages workflow variables.",
    },
  };
  const current = statusStyles[status] || statusStyles.error;

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "10px 12px",
        background: current.bg,
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 6,
        color: current.color,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 22 }}>
        <strong>{current.label}</strong>
        {checking && status !== "unconfigured" && (
          <span
            aria-label="Checking backend connection"
            title="Checking backend connection"
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: `2px solid ${current.color}33`,
              borderTopColor: current.color,
              display: "inline-block",
              animation: "backend-status-spin 0.9s linear infinite",
              flex: "0 0 auto",
            }}
          />
        )}
      </div>
      {apiUrl && (
        <span style={{ marginLeft: 8, fontSize: 12 }}>
          {apiUrl}
        </span>
      )}
      <div style={{ fontSize: 12, marginTop: 4, minHeight: 16 }}>
        {current.detail}
      </div>
      {onRetry && status !== "connected" && status !== "unconfigured" && (
        <button
          onClick={onRetry}
          style={{ ...btnStyle, marginTop: 8, padding: "4px 10px" }}
        >
          Retry connection
        </button>
      )}
    </div>
  );
}

function moveItem(list, index, direction) {
  const next = [...list];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function PreferenceRankingCard({ title, items, onMove }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: 6,
        padding: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>
        Top = most preferred to work, bottom = least preferred to work
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item, index) => (
          <div
            key={item}
            style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr auto",
              gap: 10,
              alignItems: "center",
              border: "1px solid #ececec",
              borderRadius: 6,
              padding: "8px 10px",
            }}
          >
            <span style={{ fontWeight: 700, color: "#666" }}>{index + 1}</span>
            <span>{item}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => onMove(index, -1)}
                disabled={index === 0}
                style={{ ...btnStyle, padding: "4px 8px", opacity: index === 0 ? 0.45 : 1 }}
              >
                Up
              </button>
              <button
                onClick={() => onMove(index, 1)}
                disabled={index === items.length - 1}
                style={{ ...btnStyle, padding: "4px 8px", opacity: index === items.length - 1 ? 0.45 : 1 }}
              >
                Down
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HolidayPreferenceEditor({ roster, preferences, onUpdate }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        Holiday Work Preferences
        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: "#777" }}>
          Rank from most preferred to work to least preferred to work
        </span>
      </label>
      <div style={{ display: "grid", gap: 12 }}>
        {roster.map((fellow) => {
          const preferenceSet = preferences[fellow.id];
          return (
            <div
              key={fellow.id}
              style={{
                background: "#fdfdfd",
                border: "1px solid #dee2e6",
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontWeight: 700 }}>{fellow.name}</span>
                <span style={{ fontSize: 12, color: "#777" }}>{fellow.pgy}</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 12,
                }}
              >
                <PreferenceRankingCard
                  title="Major Holidays"
                  items={preferenceSet.majorHolidays}
                  onMove={(index, direction) =>
                    onUpdate(fellow.id, {
                      ...preferenceSet,
                      majorHolidays: moveItem(preferenceSet.majorHolidays, index, direction),
                    })
                  }
                />
                <PreferenceRankingCard
                  title="Holiday Weekends"
                  items={preferenceSet.holidayWeekends}
                  onMove={(index, direction) =>
                    onUpdate(fellow.id, {
                      ...preferenceSet,
                      holidayWeekends: moveItem(preferenceSet.holidayWeekends, index, direction),
                    })
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MajorHolidayBlockEditor({ blocks, onChange }) {
  // Major-holiday windows vary year to year, so the scheduler exposes these
  // ranges directly instead of hard-coding them in the UI.
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        Major Holiday Coverage Dates
        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: "#777" }}>
          Choose the two date ranges used for each major holiday
        </span>
      </label>
      <div style={{ display: "grid", gap: 12 }}>
        {Object.entries(blocks).map(([holiday, halves]) => (
          <div
            key={holiday}
            style={{
              background: "#fff",
              border: "1px solid #dee2e6",
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{holiday}</div>
            <div style={{ display: "grid", gap: 10 }}>
              {halves.map((half, index) => (
                <div key={half.label} style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr", gap: 10, alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#555" }}>{half.label}</span>
                  <input
                    type="date"
                    value={moment(half.start, DATE_FMT).format("YYYY-MM-DD")}
                    onChange={(e) => {
                      const next = createDefaultMajorHolidayBlocks();
                      Object.keys(next).forEach((key) => { next[key] = blocks[key].map((item) => ({ ...item })); });
                      next[holiday][index].start = moment(e.target.value, "YYYY-MM-DD").format(DATE_FMT);
                      onChange(next);
                    }}
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    value={moment(half.end, DATE_FMT).format("YYYY-MM-DD")}
                    onChange={(e) => {
                      const next = createDefaultMajorHolidayBlocks();
                      Object.keys(next).forEach((key) => { next[key] = blocks[key].map((item) => ({ ...item })); });
                      next[holiday][index].end = moment(e.target.value, "YYYY-MM-DD").format(DATE_FMT);
                      onChange(next);
                    }}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RosterEditor({ roster, onRename }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>Fellow Roster</label>
      <div style={{ display: "grid", gap: 8 }}>
        {roster.map((fellow, index) => (
          <div
            key={fellow.id}
            style={{
              display: "grid",
              gridTemplateColumns: "16px 1fr 90px",
              gap: 10,
              alignItems: "center",
              background: "#fff",
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              padding: "8px 10px",
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: fellowColor(index),
                display: "inline-block",
              }}
            />
            <input
              value={fellow.name}
              onChange={(e) => onRename(fellow.id, e.target.value)}
              style={inputStyle}
            />
            <span style={{ fontWeight: 600, color: "#666" }}>{fellow.pgy}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FellowVacationRows({ fellow, color, ranges, onChange }) {
  return (
    <div
      style={{
        marginBottom: 12,
        padding: "10px 12px",
        border: "1px solid #e0e0e0",
        borderRadius: 6,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, color }}>{fellow.name}</span>
        <span style={{ fontSize: 12, color: "#777" }}>{fellow.pgy}</span>
        <button
          onClick={() => {
            if (ranges.length >= MAX_VACATION_WEEKS) return;
            onChange([...ranges, { from: "", to: "" }]);
          }}
          disabled={ranges.length >= MAX_VACATION_WEEKS}
          style={{ ...btnStyle, marginLeft: "auto", opacity: ranges.length >= MAX_VACATION_WEEKS ? 0.5 : 1 }}
        >
          Add week
        </button>
      </div>

      {ranges.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "#888", fontStyle: "italic" }}>
          No vacations entered.
        </p>
      )}

      {ranges.map((range, index) => (
        <div key={`${fellow.id}-${index}`} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <input
            type="date"
            value={range.from ? moment(range.from, DATE_FMT).format("YYYY-MM-DD") : ""}
            onChange={(e) => {
              const raw = e.target.value ? moment(e.target.value, "YYYY-MM-DD").format(DATE_FMT) : "";
              const next = [...ranges];
              next[index] = { from: snapToMonday(raw), to: raw ? snapToFriday(raw) : "" };
              onChange(next);
            }}
            style={inputStyle}
          />
          <input
            type="date"
            value={range.to ? moment(range.to, DATE_FMT).format("YYYY-MM-DD") : ""}
            onChange={(e) => {
              const raw = e.target.value ? moment(e.target.value, "YYYY-MM-DD").format(DATE_FMT) : "";
              const next = [...ranges];
              next[index] = { ...next[index], to: snapToFriday(raw) };
              onChange(next);
            }}
            style={inputStyle}
          />
          <button onClick={() => onChange(ranges.filter((_, idx) => idx !== index))} style={dangerButtonStyle}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function VacationEditor({ roster, vacations, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        Vacation Weeks
        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: "#777" }}>
          Monday-Friday only, up to {MAX_VACATION_WEEKS} weeks per fellow
        </span>
      </label>
      {roster.map((fellow, index) => (
        <FellowVacationRows
          key={fellow.id}
          fellow={fellow}
          color={fellowColor(index)}
          ranges={vacations[fellow.id] || []}
          onChange={(ranges) => onChange({ ...vacations, [fellow.id]: ranges })}
        />
      ))}
    </div>
  );
}

function RotationTable({ roster, rotations, months }) {
  if (!rotations.length) return null;

  const byMonth = {};
  rotations.forEach((item) => {
    if (!byMonth[item.month]) byMonth[item.month] = {};
    byMonth[item.month][item.fellow] = item.rotation;
  });

  return (
    <div style={{ marginBottom: 20, overflowX: "auto" }}>
      <h2 style={{ marginBottom: 10, fontSize: 18 }}>Monthly Rotations</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", background: "#fff" }}>
        <thead>
          <tr>
            <th style={tableHeaderStyle}>Month</th>
            {roster.map((fellow, index) => (
              <th
                key={fellow.id}
                style={{
                  ...tableHeaderStyle,
                  background: colorWithAlpha(fellowColor(index), 0.2),
                  color: "#1f2933",
                }}
              >
                {fellow.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.key}>
              <td style={tableCellStyle}><strong>{month.label}</strong></td>
              {roster.map((fellow, index) => (
                <td
                  key={`${month.key}-${fellow.id}`}
                  style={{
                    ...tableCellStyle,
                    background: colorWithAlpha(fellowColor(index), 0.12),
                  }}
                >
                  {ROTATION_LABELS[byMonth[month.key]?.[fellow.name]] || "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HolidayWeekendTable({ holidayWeekends }) {
  if (!holidayWeekends?.length) return null;
  return (
    <div style={{ marginBottom: 20, overflowX: "auto" }}>
      <h2 style={{ marginBottom: 10, fontSize: 18 }}>Holiday Weekends</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", background: "#fff" }}>
        <thead>
          <tr>
            <th style={tableHeaderStyle}>Holiday</th>
            <th style={tableHeaderStyle}>Coverage Window</th>
            <th style={tableHeaderStyle}>Assigned Fellow</th>
          </tr>
        </thead>
        <tbody>
          {holidayWeekends.map((item) => (
            <tr key={item.label}>
              <td style={tableCellStyle}>{item.label}</td>
              <td style={tableCellStyle}>{item.start} to {item.end}</td>
              <td style={tableCellStyle}>{item.fellow || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MajorHolidayTable({ majorHolidays }) {
  if (!majorHolidays?.length) return null;
  return (
    <div style={{ marginBottom: 20, overflowX: "auto" }}>
      <h2 style={{ marginBottom: 10, fontSize: 18 }}>Major Holiday Halves</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", background: "#fff" }}>
        <thead>
          <tr>
            <th style={tableHeaderStyle}>Holiday</th>
            <th style={tableHeaderStyle}>Half</th>
            <th style={tableHeaderStyle}>Coverage Window</th>
            <th style={tableHeaderStyle}>Assigned Fellow</th>
          </tr>
        </thead>
        <tbody>
          {majorHolidays.map((item) => (
            <tr key={item.label}>
              <td style={tableCellStyle}>{item.holiday}</td>
              <td style={tableCellStyle}>{item.label}</td>
              <td style={tableCellStyle}>{item.start} to {item.end}</td>
              <td style={tableCellStyle}>{item.fellow || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InHouseCallSummary({ roster, schedule, exceptionMonths, majorHolidayBlocks }) {
  if (!schedule?.length) return null;

  const counts = Object.fromEntries(roster.map((fellow) => [fellow.name.trim(), 0]));
  schedule.forEach((item) => {
    if (getCallType(item.date, exceptionMonths, majorHolidayBlocks) === "In-House Call") {
      counts[item.fellow] = (counts[item.fellow] || 0) + 1;
    }
  });

  return (
    <div style={{ marginBottom: 20, overflowX: "auto" }}>
      <h2 style={{ marginBottom: 10, fontSize: 18 }}>In-House Call Totals</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", background: "#fff" }}>
        <thead>
          <tr>
            <th style={tableHeaderStyle}>Fellow</th>
            <th style={tableHeaderStyle}>PGY</th>
            <th style={tableHeaderStyle}>In-House Calls</th>
            <th style={tableHeaderStyle}>Target Range</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((fellow, index) => {
            const total = counts[fellow.name.trim()] || 0;
            const inRange = total >= 19 && total <= 22;
            return (
              <tr key={fellow.id}>
                <td style={{ ...tableCellStyle, background: colorWithAlpha(fellowColor(index), 0.12) }}>
                  {fellow.name}
                </td>
                <td style={tableCellStyle}>{fellow.pgy}</td>
                <td
                  style={{
                    ...tableCellStyle,
                    fontWeight: 700,
                    color: inRange ? "#155724" : "#856404",
                  }}
                >
                  {total}
                </td>
                <td style={tableCellStyle}>19-22</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ValidationPanel({ checks }) {
  if (!checks?.length) return null;
  const allOk = checks.every((check) => check.ok);
  return (
    <div style={{ marginBottom: 20, border: "1px solid #dee2e6", borderRadius: 8, overflow: "hidden" }}>
      <div
        style={{
          padding: "10px 16px",
          background: allOk ? "#d4edda" : "#fff3cd",
          color: allOk ? "#155724" : "#856404",
          fontWeight: 700,
          borderBottom: "1px solid #dee2e6",
        }}
      >
        Schedule validation
      </div>
      <div style={{ background: "#fff" }}>
        {checks.map((check) => (
          <div
            key={check.label}
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid #f0f0f0",
              background: check.ok ? "#fff" : "#fde8e8",
              borderLeft: check.ok ? "4px solid transparent" : "4px solid #c0392b",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: check.ok ? "#155724" : "#c0392b" }}>
                {check.ok ? "Pass" : "Failed"}
              </span>
              <span style={{ fontWeight: 600 }}>{check.label}</span>
            </div>
            <div>{check.detail}</div>
            {!check.ok && check.suggestion && (
              <div style={{ marginTop: 6, fontSize: 13, color: "#7a1f1f" }}>
                Try: {check.suggestion}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TestResultPanel({ result }) {
  if (!result) return null;
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        borderRadius: 8,
        border: "1px solid #dee2e6",
        background: result.ok ? "#d4edda" : "#fde8e8",
        color: result.ok ? "#155724" : "#c0392b",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        {result.title || "Test Result"}: {result.ok ? "Passed" : "Failed"}
      </div>
      <div style={{ fontSize: 14 }}>{result.message}</div>
      {result.details?.length > 0 && (
        <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
          {result.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LoadingPanel({ loading, mode }) {
  if (!loading) return null;

  const attemptSuffix = mode.attempt && mode.totalAttempts > 1
    ? ` (attempt ${mode.attempt} of ${mode.totalAttempts})`
    : "";
  const label = mode.kind === "randomTest"
    ? "Running random test"
    : mode.kind === "typicalTest"
      ? "Running typical schedule test"
      : "Generating schedule";
  const detail = mode.kind === "randomTest"
    ? "The app is creating a randomized request, solving it, validating the result, and checking the export flow."
    : mode.kind === "typicalTest"
      ? "The app is building a realistic schedule request with October PGY-1 board exams, distinct vacations, and the default PICU exception months."
      : "The solver is assigning monthly rotations and then building the call schedule. This can take a little time.";

  return (
    <div
      style={{
        marginBottom: 20,
        padding: 16,
        background: "#eef6ff",
        border: "1px solid #b6d4fe",
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "#0b5ed7" }}>{label}{attemptSuffix}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0b5ed7", letterSpacing: 0.4 }}>IN PROGRESS</div>
      </div>
      <div
        style={{
          position: "relative",
          height: 12,
          borderRadius: 999,
          overflow: "hidden",
          background: "#dbeafe",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: "40%",
            borderRadius: 999,
            background: "linear-gradient(90deg, #1d4ed8 0%, #60a5fa 100%)",
            animation: "scheduler-loading-slide 1.4s ease-in-out infinite",
          }}
        />
      </div>
      <div style={{ fontSize: 13, color: "#355070" }}>{detail}</div>
    </div>
  );
}

function RulesValidationTab({ checks, error }) {
  const sections = [
    {
      title: "Roster Rules",
      items: [
        "The schedule assumes 6 fellows: 2 PGY-1, 2 PGY-2, and 2 PGY-3.",
        "Fellow names must be unique and can be edited for future academic years.",
      ],
    },
    {
      title: "Clinical Rotations",
      items: [
        "Each fellow is assigned exactly one monthly daytime rotation.",
        "Supported rotations are consult, imaging, research, cath, ACHD/EP, and PCICU.",
        "Consult, cath, PCICU, and ACHD/EP are single-slot monthly rotations.",
        "Imaging and research may have multiple fellows in the same month.",
        "Both PGY-1 fellows must be on imaging in July 2026.",
        "No fellow may repeat the same non-research rotation in back-to-back months.",
        "Research may repeat in consecutive months when needed, but no fellow may have more than two research months in a row.",
        "Long runs of the harder rotations consult, cath, and PCICU are discouraged; more than two of those in a row is treated as a soft penalty.",
        "October board-exam takers are preferentially placed on imaging or research when feasible.",
      ],
    },
    {
      title: "Call Assignments",
      items: [
        "Monday call always goes to the monthly consult fellow.",
        "Tuesday call usually goes to the monthly PCICU fellow.",
        "In 6 selected exception months, PICU covers Tuesday nights so Tuesday call goes to the consult fellow instead.",
        "The consult fellow cannot take other call days outside the required Monday and eligible Tuesday assignments.",
        "The monthly PCICU fellow cannot take any weekend or holiday-weekend block during that same calendar month.",
        "No fellow can work call on two consecutive days outside a single weekend or holiday-weekend block.",
        "The only weekday consecutive-call exception is consult covering Monday and Tuesday in selected PCICU exception months.",
        "The cath fellow is softly preferred for Thursday call when feasible.",
        "A fellow on a non-holiday Thursday call cannot also take the following weekend block, whether that next weekend is a normal weekend or a holiday weekend.",
        "No fellow can be assigned to two weekend blocks in a row.",
      ],
    },
    {
      title: "Weekends And Holidays",
      items: [
        "Standard weekends are Friday through Sunday blocks assigned to one fellow.",
        "Holiday weekends are treated as special blocks and each fellow gets exactly one per year.",
        "Each major holiday is split into two halves, with one fellow assigned to each half.",
        "Thanksgiving halves default to 11/25-11/26 and 11/27-11/29.",
        "Christmas halves default to 12/22-12/24 and 12/25-12/27.",
        "New Year's halves default to 12/28-12/30 and 12/31-01/03.",
        "Those major holiday date ranges can be edited in the Scheduler tab.",
        "Each fellow is assigned exactly one half of one major holiday per year.",
        "If the holiday falls on Friday, the block expands to Thursday through Sunday.",
        "If the holiday falls on Saturday, Sunday, or Monday, the block expands to Friday through Monday.",
        "The six tracked holiday weekends are July 4, Labor Day, MLK Day, Good Friday, Memorial Day, and Juneteenth.",
      ],
    },
    {
      title: "Vacation Defaults",
      items: [
        "Each fellow starts with four vacation-week slots by default.",
        "Vacation weeks are entered as Monday-Friday ranges.",
        "Fellows cannot be assigned call on vacation dates.",
      ],
    },
    {
      title: "Current Validation Checks",
      items: [
        "Daily coverage across the full academic year",
        "Exactly one monthly rotation per fellow",
        "Monthly consult/cath/PCICU/ACHD-EP slot counts",
        "PGY-based annual rotation quota checks",
        "Both PGY-1 fellows on imaging in July 2026",
        "No repeated non-research rotations in back-to-back months",
        "No fellow has more than two consecutive research months",
        "Major holiday half-block integrity and one-half-per-fellow coverage",
        "Monday consult assignments",
        "Tuesday PCICU/consult exception-month rule using the selected 6 PICU-covered months",
        "Weekend and holiday block integrity",
        "No back-to-back call days outside weekend blocks and the consult Monday-Tuesday exception",
        "No consecutive weekend assignments for any fellow",
        "Consult-fellow exclusion from weekend call",
        "PCICU-fellow exclusion from weekend call",
        "Thursday-to-following-weekend conflict check",
        "Cath-fellow Thursday match count",
        "Holiday weekend distribution summary",
      ],
    },
    {
      title: "Holiday Preferences",
      items: [
        "Each fellow ranks Thanksgiving, Christmas, and New Year's from most preferred to work to least preferred to work.",
        "Each fellow also ranks the six holiday weekends from most preferred to work to least preferred to work.",
        "The solver uses those rankings as a soft preference objective.",
        "Preference approval is seniority-weighted, with PGY-3 favored over PGY-2 and PGY-2 favored over PGY-1.",
      ],
    },
  ];

  return (
    <div>
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            background: "#fde8e8",
            border: "1px solid #f5c2c2",
            borderRadius: 6,
            color: "#c0392b",
          }}
        >
          <strong>Scheduling error:</strong> {error}
        </div>
      )}

      <div style={{ display: "grid", gap: 16, marginBottom: 20 }}>
        {sections.map((section) => (
          <div
            key={section.title}
            style={{
              background: "#fff",
              border: "1px solid #dee2e6",
              borderRadius: 8,
              padding: 16,
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: 18 }}>{section.title}</h2>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <ValidationPanel checks={checks} />
    </div>
  );
}

function buildValidation(schedule, rotations, holidayWeekends, majorHolidays, start, end, exceptionMonths, roster) {
  if (!schedule.length) return [];

  // Validation is derived from the solved output so the Final Calendar tab can
  // explain exactly which rule was satisfied or violated by a generated schedule.
  const byDate = {};
  schedule.forEach((item) => { byDate[item.date] = item.fellow; });
  const consultByMonth = {};
  const pcicuByMonth = {};
  const cathByMonth = {};
  const rotationByFellowMonth = {};
  const rotationCountByFellowMonth = {};
  const rotationCountByMonthType = {};
  rotations.forEach((item) => {
    if (item.rotation === "consult") consultByMonth[item.month] = item.fellow;
    if (item.rotation === "pcicu") pcicuByMonth[item.month] = item.fellow;
    if (item.rotation === "cath") cathByMonth[item.month] = item.fellow;
    rotationByFellowMonth[`${item.fellow}::${item.month}`] = item.rotation;
    rotationCountByFellowMonth[`${item.fellow}::${item.month}`] = (rotationCountByFellowMonth[`${item.fellow}::${item.month}`] || 0) + 1;
    rotationCountByMonthType[`${item.month}::${item.rotation}`] = (rotationCountByMonthType[`${item.month}::${item.rotation}`] || 0) + 1;
  });

  const checks = [];
  const missing = [];
  const rotationCoverageErrors = [];
  const slotCountErrors = [];
  const julyImagingErrors = [];
  const rotationQuotaErrors = [];
  const consecutiveRotationErrors = [];
  const researchRunErrors = [];
  const mondayErrors = [];
  const tuesdayErrors = [];
  const weekendErrors = [];
  const majorHolidayErrors = [];
  const consultWeekendErrors = [];
  const pcicuWeekendErrors = [];
  const consecutiveWeekendErrors = [];
  const consecutiveCallErrors = [];
  const thursdayWeekendErrors = [];
  const cathThursdayMatches = [];
  const holidayCounts = {};
  const majorHolidayCounts = {};

  const exceptionMonthSet = new Set(exceptionMonths);
  const holidayStartMap = Object.fromEntries(HOLIDAY_WEEKENDS.map((item) => [item.start, item]));
  const holidayCoveredDates = new Set();
  const majorHolidayStartMap = Object.fromEntries(
    (majorHolidays || []).map((item) => [item.start, item]),
  );
  const blockStartByDate = {};
  const weekendAssignments = [];
  HOLIDAY_WEEKENDS.forEach((item) => {
    const curHoliday = moment(item.start, DATE_FMT);
    const endHoliday = moment(item.end, DATE_FMT);
    while (curHoliday.isSameOrBefore(endHoliday)) {
      const dateKey = curHoliday.format(DATE_FMT);
      holidayCoveredDates.add(dateKey);
      blockStartByDate[dateKey] = item.start;
      curHoliday.add(1, "day");
    }
  });
  (majorHolidays || []).forEach((item) => {
    const curHoliday = moment(item.start, DATE_FMT);
    const endHoliday = moment(item.end, DATE_FMT);
    while (curHoliday.isSameOrBefore(endHoliday)) {
      blockStartByDate[curHoliday.format(DATE_FMT)] = item.start;
      curHoliday.add(1, "day");
    }
  });

  const cur = moment(start, DATE_FMT);
  const endDate = moment(end, DATE_FMT);
  const monthKeys = [];
  const monthCursor = moment(start, DATE_FMT).startOf("month");
  while (monthCursor.isSameOrBefore(endDate, "month")) {
    monthKeys.push(monthCursor.format("YYYY-MM"));
    monthCursor.add(1, "month");
  }

  const fellows = roster?.map((item) => item.name.trim()).filter(Boolean)
    || Object.keys(rotationByFellowMonth)
      .map((key) => key.split("::")[0])
      .filter((fellow, index, list) => list.indexOf(fellow) === index);

  fellows.forEach((fellow) => {
    const counts = {};
    monthKeys.forEach((month) => {
      const key = `${fellow}::${month}`;
      const rotationName = rotationByFellowMonth[key];
      const monthCount = rotationCountByFellowMonth[key] || 0;
      if (monthCount !== 1) {
        rotationCoverageErrors.push(`${fellow} has ${monthCount} rotations in ${month}`);
      }
      if (rotationName) {
        counts[rotationName] = (counts[rotationName] || 0) + 1;
      }
      if (month === "2026-07") {
        const fellowRecord = roster?.find((item) => item.name.trim() === fellow);
        if (fellowRecord?.pgy === "PGY-1" && rotationName !== "imaging") {
          julyImagingErrors.push(`${fellow} should be on imaging in 2026-07, got ${rotationName || "none"}`);
        }
      }
    });

    const fellowRecord = roster?.find((item) => item.name.trim() === fellow);
    if (fellowRecord?.pgy && PGY_ROTATION_TARGETS[fellowRecord.pgy]) {
      Object.entries(PGY_ROTATION_TARGETS[fellowRecord.pgy]).forEach(([rotationName, expected]) => {
        const actual = counts[rotationName] || 0;
        if (actual !== expected) {
          rotationQuotaErrors.push(`${fellow} has ${actual} ${rotationName} months, expected ${expected}`);
        }
      });
    }

    monthKeys.forEach((month, index) => {
      if (index === 0) return;
      const currentRotation = rotationByFellowMonth[`${fellow}::${month}`];
      const previousRotation = rotationByFellowMonth[`${fellow}::${monthKeys[index - 1]}`];
      if (currentRotation && currentRotation === previousRotation && currentRotation !== "research") {
        consecutiveRotationErrors.push(`${fellow} repeated ${currentRotation} in ${monthKeys[index - 1]} and ${month}`);
      }
    });

    let runLength = 0;
    monthKeys.forEach((month) => {
      if (rotationByFellowMonth[`${fellow}::${month}`] === "research") {
        runLength += 1;
        if (runLength > 2) {
          researchRunErrors.push(`${fellow} has more than two consecutive research months ending in ${month}`);
        }
      } else {
        runLength = 0;
      }
    });
  });

  monthKeys.forEach((month) => {
    const consultCount = rotationCountByMonthType[`${month}::consult`] || 0;
    const cathCount = rotationCountByMonthType[`${month}::cath`] || 0;
    const pcicuCount = rotationCountByMonthType[`${month}::pcicu`] || 0;
    const achdCount = rotationCountByMonthType[`${month}::achd_ep`] || 0;
    const expectedPcicu = exceptionMonthSet.has(month) ? 0 : 1;

    if (consultCount !== 1) slotCountErrors.push(`${month} has ${consultCount} consult fellows`);
    if (cathCount !== 1) slotCountErrors.push(`${month} has ${cathCount} cath fellows`);
    if (pcicuCount !== expectedPcicu) slotCountErrors.push(`${month} has ${pcicuCount} PCICU fellows, expected ${expectedPcicu}`);
    if (achdCount > 1) slotCountErrors.push(`${month} has ${achdCount} ACHD/EP fellows`);
  });

  const uniqueSlotErrors = slotCountErrors.filter((item, index, list) => list.indexOf(item) === index);

  checks.push({
    ok: rotationCoverageErrors.length === 0,
    label: "Monthly rotation coverage",
    detail: rotationCoverageErrors.length === 0
      ? "Every fellow has exactly one rotation in each month."
      : rotationCoverageErrors.slice(0, 3).join(" | "),
  });
  checks.push({
    ok: uniqueSlotErrors.length === 0,
    label: "Rotation slot counts",
    detail: uniqueSlotErrors.length === 0
      ? "Monthly consult, cath, PCICU, and ACHD/EP slot counts are valid."
      : uniqueSlotErrors.slice(0, 3).join(" | "),
  });
  checks.push({
    ok: julyImagingErrors.length === 0,
    label: "July PGY-1 imaging",
    detail: julyImagingErrors.length === 0
      ? "Both first-year fellows are on imaging in July 2026."
      : julyImagingErrors.slice(0, 3).join(" | "),
  });
  checks.push({
    ok: rotationQuotaErrors.length === 0,
    label: "Rotation quotas",
    detail: rotationQuotaErrors.length === 0
      ? "Each fellow matches the required PGY rotation totals."
      : rotationQuotaErrors.slice(0, 3).join(" | "),
  });
  checks.push({
    ok: consecutiveRotationErrors.length === 0,
    label: "Consecutive non-research rotations",
    detail: consecutiveRotationErrors.length === 0
      ? "No fellow repeats a non-research rotation in back-to-back months."
      : consecutiveRotationErrors.slice(0, 3).join(" | "),
  });

  while (cur.isSameOrBefore(endDate)) {
    const dateStr = cur.format(DATE_FMT);
    const month = cur.format("YYYY-MM");
    const assigned = byDate[dateStr];
    if (!assigned) missing.push(dateStr);

    const dateStrHoliday = cur.format(DATE_FMT);
    const holidayBlock = HOLIDAY_WEEKENDS.find(
      (item) => moment(dateStrHoliday, DATE_FMT).isBetween(
        moment(item.start, DATE_FMT),
        moment(item.end, DATE_FMT),
        "day",
        "[]",
      ),
    );

    if (cur.day() === 1 && !holidayBlock && assigned !== consultByMonth[month]) {
      mondayErrors.push(`${dateStr}: expected ${consultByMonth[month]}, got ${assigned}`);
    }

    if (cur.day() === 2) {
      const expected = exceptionMonthSet.has(month) ? consultByMonth[month] : pcicuByMonth[month];
      if (assigned !== expected) {
        tuesdayErrors.push(`${dateStr}: expected ${expected}, got ${assigned}`);
      }
    }

    if (holidayStartMap[dateStr]) {
      const holiday = holidayStartMap[dateStr];
      const endMoment = moment(holiday.end, DATE_FMT);
      const dates = [];
      const tmp = cur.clone();
      while (tmp.isSameOrBefore(endMoment)) {
        dates.push(byDate[tmp.format(DATE_FMT)]);
        tmp.add(1, "day");
      }
      if (new Set(dates).size !== 1) {
        weekendErrors.push(`${holiday.label}: holiday block does not stay with one fellow`);
      }
      if (dates[0]) {
        weekendAssignments.push({ start: dateStr, fellow: dates[0], label: holiday.label });
      }
      if (dates[0] === consultByMonth[month]) {
        consultWeekendErrors.push(`${holiday.label}: consult fellow ${dates[0]} was assigned the holiday weekend`);
      }
      if (dates[0] === pcicuByMonth[month]) {
        pcicuWeekendErrors.push(`${holiday.label}: PCICU fellow ${dates[0]} was assigned the holiday weekend`);
      }
    } else if (majorHolidayStartMap[dateStr]) {
      const majorHoliday = majorHolidayStartMap[dateStr];
      const endMoment = moment(majorHoliday.end, DATE_FMT);
      const dates = [];
      const tmp = cur.clone();
      while (tmp.isSameOrBefore(endMoment)) {
        dates.push(byDate[tmp.format(DATE_FMT)]);
        tmp.add(1, "day");
      }
      if (new Set(dates).size !== 1) {
        majorHolidayErrors.push(`${majorHoliday.label}: holiday half does not stay with one fellow`);
      }
    } else if (
      cur.day() === 5 &&
      !holidayCoveredDates.has(dateStr) &&
      cur.clone().add(2, "days").isSameOrBefore(endDate)
    ) {
      const fri = assigned;
      const sat = byDate[cur.clone().add(1, "day").format(DATE_FMT)];
      const sun = byDate[cur.clone().add(2, "day").format(DATE_FMT)];
      if (fri !== sat || fri !== sun) {
        weekendErrors.push(`${dateStr}: Fri=${fri}, Sat=${sat}, Sun=${sun}`);
      }
      if (fri) {
        weekendAssignments.push({ start: dateStr, fellow: fri, label: dateStr });
      }
      blockStartByDate[dateStr] = dateStr;
      blockStartByDate[cur.clone().add(1, "day").format(DATE_FMT)] = dateStr;
      blockStartByDate[cur.clone().add(2, "day").format(DATE_FMT)] = dateStr;
      if (fri === consultByMonth[month]) {
        consultWeekendErrors.push(`${dateStr}: consult fellow ${fri} was assigned a weekend`);
      }
      if (fri === pcicuByMonth[month]) {
        pcicuWeekendErrors.push(`${dateStr}: PCICU fellow ${fri} was assigned a weekend`);
      }
    }

    if (cur.day() === 4 && cathByMonth[month] && assigned === cathByMonth[month]) {
      cathThursdayMatches.push(dateStr);
    }

    if (cur.day() === 4 && !holidayCoveredDates.has(dateStr)) {
      const thursdayFellow = assigned;
      const nextFriday = cur.clone().add(1, "day").format(DATE_FMT);
      if (thursdayFellow && byDate[nextFriday] === thursdayFellow) {
        thursdayWeekendErrors.push(`${dateStr}: ${thursdayFellow} also took the following weekend`);
      }
    }

    cur.add(1, "day");
  }

  (holidayWeekends || []).forEach((item) => {
    holidayCounts[item.fellow] = (holidayCounts[item.fellow] || 0) + 1;
  });
  (majorHolidays || []).forEach((item) => {
    majorHolidayCounts[item.fellow] = (majorHolidayCounts[item.fellow] || 0) + 1;
  });
  const majorHolidayCoverageCounts = Object.fromEntries(
    Object.keys(DEFAULT_MAJOR_HOLIDAY_BLOCKS).map((holiday) => [holiday, 0]),
  );
  (majorHolidays || []).forEach((item) => {
    majorHolidayCoverageCounts[item.holiday] = (majorHolidayCoverageCounts[item.holiday] || 0) + 1;
  });

  weekendAssignments
    .sort((a, b) => moment(a.start, DATE_FMT).valueOf() - moment(b.start, DATE_FMT).valueOf())
    .forEach((assignment, index, list) => {
      if (index === 0) return;
      const previous = list[index - 1];
      if (previous.fellow === assignment.fellow) {
        consecutiveWeekendErrors.push(
          `${assignment.fellow} worked consecutive weekends starting ${previous.start} and ${assignment.start}`,
        );
      }
    });

  const scheduleByDate = [...schedule].sort(
    (a, b) => moment(a.date, DATE_FMT).valueOf() - moment(b.date, DATE_FMT).valueOf(),
  );
  for (let i = 0; i < scheduleByDate.length - 1; i += 1) {
    const current = scheduleByDate[i];
    const next = scheduleByDate[i + 1];
    const currentMoment = moment(current.date, DATE_FMT);
    const nextMoment = moment(next.date, DATE_FMT);
    if (nextMoment.diff(currentMoment, "days") !== 1) continue;
    if (current.fellow !== next.fellow) continue;

    const currentBlock = blockStartByDate[current.date];
    const nextBlock = blockStartByDate[next.date];
    if (currentBlock && currentBlock === nextBlock) continue;

    const month = currentMoment.format("YYYY-MM");
    const isAllowedConsultException =
      currentMoment.day() === 1
      && nextMoment.day() === 2
      && exceptionMonthSet.has(month)
      && current.fellow === consultByMonth[month];

    if (!isAllowedConsultException) {
      consecutiveCallErrors.push(
        `${current.fellow} worked consecutive call days on ${current.date} and ${next.date}`,
      );
    }
  }

  checks.push({
    ok: missing.length === 0,
    label: "Coverage",
    detail: missing.length === 0 ? "Every day has an assignment." : `Missing dates: ${missing.slice(0, 5).join(", ")}`,
    suggestion: missing.length === 0 ? "" : "Adjust vacations, holiday-half dates, or exception months so every day has an assigned fellow.",
  });
  checks.push({
    ok: researchRunErrors.length === 0,
    label: "Research streaks",
    detail: researchRunErrors.length === 0
      ? "No fellow has more than two consecutive research months."
      : researchRunErrors.slice(0, 3).join(" | "),
    suggestion: researchRunErrors.length === 0 ? "" : "Swap one of the research months with imaging, cath, ACHD/EP, consult, or PCICU to break the streak.",
  });
  checks.push({
    ok: majorHolidayErrors.length === 0,
    label: "Major holiday blocks",
    detail: majorHolidayErrors.length === 0 ? "All major holiday halves stay together." : majorHolidayErrors.slice(0, 3).join(" | "),
    suggestion: majorHolidayErrors.length === 0 ? "" : "Adjust the major holiday half dates or regenerate so each half stays with one fellow.",
  });
  checks.push({
    ok: mondayErrors.length === 0,
    label: "Consult Mondays",
    detail: mondayErrors.length === 0 ? "All Mondays go to the consult fellow." : mondayErrors.slice(0, 3).join(" | "),
    suggestion: mondayErrors.length === 0 ? "" : "Change the monthly consult assignments or regenerate with fewer conflicting vacations.",
  });
  checks.push({
    ok: tuesdayErrors.length === 0,
    label: "Tuesday rule",
    detail: tuesdayErrors.length === 0 ? "All Tuesdays follow the PCICU/consult rule." : tuesdayErrors.slice(0, 3).join(" | "),
    suggestion: tuesdayErrors.length === 0 ? "" : "Revisit the selected PCICU exception months or monthly PCICU/consult assignments.",
  });
  checks.push({
    ok: weekendErrors.length === 0,
    label: "Weekend blocks",
    detail: weekendErrors.length === 0 ? "All Friday-Sunday blocks stay together." : weekendErrors.slice(0, 3).join(" | "),
    suggestion: weekendErrors.length === 0 ? "" : "Regenerate so each weekend or holiday block stays with a single fellow.",
  });
  checks.push({
    ok: consecutiveWeekendErrors.length === 0,
    label: "Consecutive weekends",
    detail: consecutiveWeekendErrors.length === 0
      ? "No fellow is assigned to back-to-back weekends."
      : consecutiveWeekendErrors.slice(0, 3).join(" | "),
    suggestion: consecutiveWeekendErrors.length === 0 ? "" : "Try different vacations or holiday-half dates so weekend coverage can be redistributed.",
  });
  checks.push({
    ok: consecutiveCallErrors.length === 0,
    label: "Consecutive call days",
    detail: consecutiveCallErrors.length === 0
      ? "No fellow is assigned to back-to-back call days outside allowed blocks."
      : consecutiveCallErrors.slice(0, 3).join(" | "),
    suggestion: consecutiveCallErrors.length === 0 ? "" : "Reduce conflicting vacations or adjust exception months so consecutive weekday call can be reassigned.",
  });
  checks.push({
    ok: consultWeekendErrors.length === 0,
    label: "Consult weekends",
    detail: consultWeekendErrors.length === 0 ? "Consult fellows are excluded from weekend call." : consultWeekendErrors.slice(0, 3).join(" | "),
    suggestion: consultWeekendErrors.length === 0 ? "" : "Move that fellow off consult in the affected month or relax other schedule pressure by adjusting vacations.",
  });
  checks.push({
    ok: pcicuWeekendErrors.length === 0,
    label: "PCICU weekends",
    detail: pcicuWeekendErrors.length === 0 ? "PCICU fellows are excluded from weekend call in their PCICU month." : pcicuWeekendErrors.slice(0, 3).join(" | "),
    suggestion: pcicuWeekendErrors.length === 0 ? "" : "Adjust monthly PCICU assignments or vacation timing so weekends can be covered by a different fellow.",
  });
  checks.push({
    ok: thursdayWeekendErrors.length === 0,
    label: "Thursday to weekend",
    detail: thursdayWeekendErrors.length === 0 ? "No Thursday call fellow also takes the following weekend block, including holiday weekends." : thursdayWeekendErrors.slice(0, 3).join(" | "),
    suggestion: thursdayWeekendErrors.length === 0 ? "" : "Reassign the Thursday call or the following weekend block to a different fellow.",
  });
  checks.push({
    ok: true,
    label: "Cath Thursdays",
    detail: `${cathThursdayMatches.length} Thursday(s) matched the monthly cath fellow.`,
  });
  checks.push({
    ok: Object.values(holidayCounts).every((count) => count === 1),
    label: "Holiday weekends",
    detail: (holidayWeekends || []).map((item) => `${item.label}: ${item.fellow}`).join(", "),
    suggestion: Object.values(holidayCounts).every((count) => count === 1) ? "" : "Regenerate so each fellow receives exactly one holiday weekend assignment.",
  });
  checks.push({
    ok: fellows.every((fellow) => majorHolidayCounts[fellow] === 1) && Object.values(majorHolidayCoverageCounts).every((count) => count === 2),
    label: "Major holidays",
    detail: (majorHolidays || []).map((item) => `${item.label}: ${item.fellow}`).join(", "),
    suggestion: fellows.every((fellow) => majorHolidayCounts[fellow] === 1) && Object.values(majorHolidayCoverageCounts).every((count) => count === 2)
      ? ""
      : "Adjust the major holiday half dates or regenerate so each fellow receives exactly one major-holiday half and each holiday has two halves covered.",
  });

  return checks;
}

const btnStyle = {
  padding: "6px 14px",
  borderRadius: 4,
  border: "none",
  background: "#1f77b4",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};

const dangerButtonStyle = {
  ...btnStyle,
  background: "#c0392b",
};

const inputStyle = {
  padding: "4px 8px",
  borderRadius: 4,
  border: "1px solid #ccc",
};

const labelStyle = {
  fontWeight: 600,
  display: "block",
  marginBottom: 6,
};

const tableHeaderStyle = {
  border: "1px solid #dee2e6",
  padding: 8,
  textAlign: "left",
  background: "#f1f3f5",
};

const tableCellStyle = {
  border: "1px solid #dee2e6",
  padding: 8,
};

export default function App() {
  const storedState = useMemo(() => readStoredState(), []);
  // Persisting most inputs locally makes long scheduling sessions less fragile
  // when the page refreshes or the user switches between tabs.
  const [roster, setRoster] = useState(storedState?.roster || INITIAL_ROSTER);
  const [start, setStart] = useState(storedState?.start || "07/01/2026");
  const [end, setEnd] = useState(storedState?.end || "06/30/2027");
  const [vacations, setVacations] = useState(storedState?.vacations || createDefaultVacations);
  const [boardExamIds, setBoardExamIds] = useState(storedState?.boardExamIds || []);
  const [holidayPreferences, setHolidayPreferences] = useState(
    storedState?.holidayPreferences || createDefaultPreferenceState,
  );
  const [majorHolidayBlocks, setMajorHolidayBlocks] = useState(
    storedState?.majorHolidayBlocks || createDefaultMajorHolidayBlocks,
  );
  const [pcicuExceptionMonths, setPcicuExceptionMonths] = useState(
    storedState?.pcicuExceptionMonths || DEFAULT_PCICU_EXCEPTION_MONTHS,
  );
  const [schedule, setSchedule] = useState(storedState?.schedule || []);
  const [rotations, setRotations] = useState(storedState?.rotations || []);
  const [holidayWeekends, setHolidayWeekends] = useState(storedState?.holidayWeekends || []);
  const [majorHolidays, setMajorHolidays] = useState(storedState?.majorHolidays || []);
  const [validation, setValidation] = useState(storedState?.validation || []);
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState({ kind: "generate", attempt: 1, totalAttempts: 1 });
  const [error, setError] = useState(null);
  const [testResult, setTestResult] = useState(storedState?.testResult || null);
  const [calendarDate, setCalendarDate] = useState(() => moment("07/01/2026", DATE_FMT).toDate());
  const [activeTab, setActiveTab] = useState("scheduler");
  const [backendStatus, setBackendStatus] = useState(storedState?.backendStatus || (API_URL ? "error" : "unconfigured"));
  const [backendChecking, setBackendChecking] = useState(Boolean(API_URL));
  const [retryUntilValid, setRetryUntilValid] = useState(storedState?.retryUntilValid || false);
  const [maxRetryAttempts, setMaxRetryAttempts] = useState(storedState?.maxRetryAttempts || DEFAULT_RETRY_MAX_ATTEMPTS);

  const months = useMemo(() => listMonths(start, end), [start, end]);
  const apiConfigured = Boolean(API_URL);

  const checkBackend = useCallback(async () => {
    if (!apiConfigured) {
      setBackendStatus("unconfigured");
      setBackendChecking(false);
      return;
    }
    setBackendChecking(true);
    try {
      const response = await fetch(`${API_URL}/`, { method: "GET" });
      const nextStatus = response.ok ? "connected" : "error";
      setBackendStatus((current) => (current === nextStatus ? current : nextStatus));
    } catch {
      setBackendStatus((current) => (current === "error" ? current : "error"));
    } finally {
      setBackendChecking(false);
    }
  }, [apiConfigured]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        roster,
        start,
        end,
        vacations,
        boardExamIds,
        holidayPreferences,
        majorHolidayBlocks,
        pcicuExceptionMonths,
        schedule,
        rotations,
        holidayWeekends,
        majorHolidays,
        backendStatus,
        validation,
        testResult,
        retryUntilValid,
        maxRetryAttempts,
      }),
    );
  }, [
    boardExamIds,
    end,
    holidayPreferences,
    majorHolidayBlocks,
    pcicuExceptionMonths,
    holidayWeekends,
    majorHolidays,
    backendStatus,
    roster,
    rotations,
    schedule,
    start,
    testResult,
    retryUntilValid,
    maxRetryAttempts,
    vacations,
    validation,
  ]);

  useEffect(() => {
    if (!apiConfigured) {
      setBackendStatus("unconfigured");
      setBackendChecking(false);
      return;
    }

    let cancelled = false;
    const wrappedCheck = async () => {
      if (cancelled) return;
      try {
        await checkBackend();
      } catch {
        if (!cancelled) {
          setBackendStatus("error");
          setBackendChecking(false);
        }
      }
    };

    wrappedCheck();
    const intervalId = window.setInterval(wrappedCheck, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiConfigured, checkBackend]);

  useEffect(() => {
    if (!schedule.length) {
      setValidation([]);
      return;
    }
    setValidation(
      buildValidation(
        schedule,
        rotations,
        holidayWeekends,
        majorHolidays,
        start,
        end,
        pcicuExceptionMonths,
        roster,
      ),
    );
  }, [end, holidayWeekends, majorHolidays, pcicuExceptionMonths, roster, rotations, schedule, start]);

  const buildSchedulePayload = useCallback((options) => {
    const {
      vacationsById,
      selectedBoardExamIds,
      selectedPreferences,
      selectedExceptionMonths,
      solverSeed,
    } = options;
    const names = roster.map((fellow) => fellow.name.trim());
    return {
      fellows: names,
      start,
      end,
      vacations: Object.fromEntries(
        roster.map((fellow) => [fellow.name.trim(), expandWeekRanges(vacationsById[fellow.id] || [])]),
      ),
      holidays: {},
      pgy_years: Object.fromEntries(roster.map((fellow) => [fellow.name.trim(), fellow.pgy])),
      board_exam_fellows: roster
        .filter((fellow) => selectedBoardExamIds.includes(fellow.id))
        .map((fellow) => fellow.name.trim()),
      holiday_preferences: Object.fromEntries(
        roster.map((fellow) => [fellow.name.trim(), selectedPreferences[fellow.id]]),
      ),
      major_holiday_blocks: serializeMajorHolidayBlocks(majorHolidayBlocks),
      pcicu_exception_months: selectedExceptionMonths,
      solver_seed: solverSeed,
    };
  }, [end, majorHolidayBlocks, roster, start]);

  const requestSchedule = useCallback(async (payload) => {
    const response = await fetch(`${API_URL}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBackendStatus("connected");

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || `Server error: ${response.status}`);
    }
    return response.json();
  }, []);

  const solveWithRetries = useCallback(async (options) => {
    const {
      kind,
      vacationsById,
      selectedBoardExamIds,
      selectedPreferences,
      selectedExceptionMonths,
      allowRetryUntilValid,
    } = options;
    const totalAttempts = allowRetryUntilValid ? Math.max(1, Number(maxRetryAttempts) || 1) : 1;
    let lastAttempt = null;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      setLoadingMode({ kind, attempt, totalAttempts });
      const payload = buildSchedulePayload({
        vacationsById,
        selectedBoardExamIds,
        selectedPreferences,
        selectedExceptionMonths,
        solverSeed: Math.floor(Math.random() * 1_000_000_000),
      });
      const data = await requestSchedule(payload);
      const nextValidation = buildValidation(
        data.schedule || [],
        data.rotations || [],
        data.holiday_weekends || [],
        data.major_holidays || [],
        start,
        end,
        selectedExceptionMonths,
        roster,
      );
      const validationPassed = nextValidation.every((check) => check.ok);
      lastAttempt = { data, nextValidation, validationPassed, attempt, totalAttempts };
      if (validationPassed || !allowRetryUntilValid) {
        break;
      }
    }

    return lastAttempt;
  }, [buildSchedulePayload, end, maxRetryAttempts, requestSchedule, roster, start]);

  const generateSchedule = useCallback(async () => {
    setLoadingMode({ kind: "generate", attempt: 1, totalAttempts: retryUntilValid ? Math.max(1, Number(maxRetryAttempts) || 1) : 1 });
    setLoading(true);
    setError(null);
    setValidation([]);
    setTestResult(null);

    const names = roster.map((fellow) => fellow.name.trim());
    if (names.some((name) => !name)) {
      setError("All fellow names must be filled in.");
      setLoading(false);
      return;
    }
    if (new Set(names).size !== names.length) {
      setError("Fellow names must be unique.");
      setLoading(false);
      return;
    }
    if (pcicuExceptionMonths.length !== 6) {
      setError("Please select exactly 6 PICU Tuesday exception months.");
      setLoading(false);
      return;
    }

    try {
      const result = await solveWithRetries({
        kind: "generate",
        vacationsById: vacations,
        selectedBoardExamIds: boardExamIds,
        selectedPreferences: holidayPreferences,
        selectedExceptionMonths: pcicuExceptionMonths,
        allowRetryUntilValid: retryUntilValid,
      });
      const data = result.data;
      setSchedule(data.schedule || []);
      setRotations(data.rotations || []);
      setHolidayWeekends(data.holiday_weekends || []);
      setMajorHolidays(data.major_holidays || []);
      setCalendarDate(moment(start, DATE_FMT).toDate());
      setValidation(result.nextValidation);
      if (retryUntilValid && !result.validationPassed) {
        setError(`No fully valid schedule was found after ${result.totalAttempts} attempt${result.totalAttempts === 1 ? "" : "s"}. The closest attempt is shown so you can review the remaining conflicts.`);
      }
    } catch (err) {
      if (err instanceof TypeError) {
        setBackendStatus("error");
      }
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [boardExamIds, holidayPreferences, maxRetryAttempts, pcicuExceptionMonths, retryUntilValid, roster, start, vacations, solveWithRetries]);

  const runRandomTest = useCallback(async () => {
    if (!apiConfigured) return;

    setLoadingMode({ kind: "randomTest", attempt: 1, totalAttempts: retryUntilValid ? Math.max(1, Number(maxRetryAttempts) || 1) : 1 });
    setLoading(true);
    setError(null);
    setTestResult(null);

    const randomVacations = Object.fromEntries(
      roster.map((fellow) => [fellow.id, randomVacationWeeks(months)]),
    );
    const randomBoardExamIds = sample(
      roster.map((fellow) => fellow.id),
      Math.floor(Math.random() * (roster.length + 1)),
    );
    const randomExceptionMonths = sample(months.map((month) => month.key), 6).sort();
    const randomPreferences = createRandomPreferenceState(roster);

    setVacations(randomVacations);
    setBoardExamIds(randomBoardExamIds);
    setPcicuExceptionMonths(randomExceptionMonths);
    setHolidayPreferences(randomPreferences);

    try {
      const result = await solveWithRetries({
        kind: "randomTest",
        vacationsById: randomVacations,
        selectedBoardExamIds: randomBoardExamIds,
        selectedPreferences: randomPreferences,
        selectedExceptionMonths: randomExceptionMonths,
        allowRetryUntilValid: retryUntilValid,
      });
      const data = result.data;
      const nextValidation = result.nextValidation;
      const workbook = exportCalendarWorkbook(
        data.schedule || [],
        start,
        end,
        roster,
        randomVacations,
        data.holiday_weekends || [],
        data.major_holidays || [],
        majorHolidayBlocks,
        randomExceptionMonths,
        { download: false },
      );
      const hasValidation = nextValidation.length > 0;
      const hasEvents = (data.schedule || []).length > 0;
      const exportWorked = typeof workbook === "string" && workbook.includes('Worksheet ss:Name="Assignments"');
      const validationPassed = result.validationPassed;

      setBackendStatus("connected");
      setSchedule(data.schedule || []);
      setRotations(data.rotations || []);
      setHolidayWeekends(data.holiday_weekends || []);
      setMajorHolidays(data.major_holidays || []);
      setCalendarDate(moment(start, DATE_FMT).toDate());
      setValidation(nextValidation);
      setActiveTab("calendar");

      const ok = hasValidation && hasEvents && exportWorked && validationPassed;
      setTestResult({
        ok,
        title: "Run Random Test",
        message: ok
          ? "Random scheduling request succeeded, validation checks passed, calendar data rendered, and workbook export generation worked."
          : retryUntilValid
            ? `Random scheduling request completed after ${result.totalAttempts} attempt${result.totalAttempts === 1 ? "" : "s"}, but one or more smoke-test checks still failed.`
            : "Random scheduling request completed, but one or more smoke-test checks failed.",
        details: [
          `Attempts used: ${result.attempt}/${result.totalAttempts}`,
          `Schedule days returned: ${(data.schedule || []).length}`,
          `Rotation assignments returned: ${(data.rotations || []).length}`,
          `Validation checks: ${nextValidation.length}`,
          `Workbook export generation: ${exportWorked ? "ok" : "failed"}`,
          `Validation result: ${validationPassed ? "all checks passed" : "one or more checks failed"}`,
        ],
      });
    } catch (err) {
      if (err instanceof TypeError) {
        setBackendStatus("error");
      }
      setError(err.message || "Unknown error");
      setTestResult({
        ok: false,
        title: "Run Random Test",
        message: "Random test could not complete.",
        details: [err.message || "Unknown error"],
      });
    } finally {
      setLoading(false);
    }
  }, [apiConfigured, end, maxRetryAttempts, months, retryUntilValid, roster, start, majorHolidayBlocks, solveWithRetries]);

  const runTypicalTest = useCallback(async () => {
    if (!apiConfigured) return;

    setLoadingMode({ kind: "typicalTest", attempt: 1, totalAttempts: retryUntilValid ? Math.max(1, Number(maxRetryAttempts) || 1) : 1 });
    setLoading(true);
    setError(null);
    setTestResult(null);

    const typicalVacations = createTypicalVacations(roster, start, end, majorHolidayBlocks);
    const typicalBoardExamIds = roster.filter((fellow) => fellow.pgy === "PGY-1").map((fellow) => fellow.id);
    const typicalExceptionMonths = [...DEFAULT_PCICU_EXCEPTION_MONTHS];
    const typicalPreferences = createRandomPreferenceState(roster);

    setVacations(typicalVacations);
    setBoardExamIds(typicalBoardExamIds);
    setPcicuExceptionMonths(typicalExceptionMonths);
    setHolidayPreferences(typicalPreferences);

    try {
      const result = await solveWithRetries({
        kind: "typicalTest",
        vacationsById: typicalVacations,
        selectedBoardExamIds: typicalBoardExamIds,
        selectedPreferences: typicalPreferences,
        selectedExceptionMonths: typicalExceptionMonths,
        allowRetryUntilValid: retryUntilValid,
      });
      const data = result.data;
      const nextValidation = result.nextValidation;
      const workbook = exportCalendarWorkbook(
        data.schedule || [],
        start,
        end,
        roster,
        typicalVacations,
        data.holiday_weekends || [],
        data.major_holidays || [],
        majorHolidayBlocks,
        typicalExceptionMonths,
        { download: false },
      );
      const hasValidation = nextValidation.length > 0;
      const hasEvents = (data.schedule || []).length > 0;
      const exportWorked = typeof workbook === "string" && workbook.includes('Worksheet ss:Name="Assignments"');
      const validationPassed = result.validationPassed;

      setSchedule(data.schedule || []);
      setRotations(data.rotations || []);
      setHolidayWeekends(data.holiday_weekends || []);
      setMajorHolidays(data.major_holidays || []);
      setCalendarDate(moment(start, DATE_FMT).toDate());
      setValidation(nextValidation);
      setActiveTab("calendar");

      const ok = hasValidation && hasEvents && exportWorked && validationPassed;
      setTestResult({
        ok,
        title: "Run Typical Schedule Test",
        message: ok
          ? "Typical scheduling request succeeded, validation checks passed, calendar data rendered, and workbook export generation worked."
          : retryUntilValid
            ? `Typical scheduling request completed after ${result.totalAttempts} attempt${result.totalAttempts === 1 ? "" : "s"}, but one or more test checks still failed.`
            : "Typical scheduling request completed, but one or more test checks failed.",
        details: [
          `Attempts used: ${result.attempt}/${result.totalAttempts}`,
          "Board exams: both PGY-1 fellows only",
          "Vacation weeks: all fellows assigned distinct non-holiday weeks",
          `PICU exception months: ${typicalExceptionMonths.join(", ")}`,
          `Schedule days returned: ${(data.schedule || []).length}`,
          `Rotation assignments returned: ${(data.rotations || []).length}`,
          `Validation checks: ${nextValidation.length}`,
          `Workbook export generation: ${exportWorked ? "ok" : "failed"}`,
          `Validation result: ${validationPassed ? "all checks passed" : "one or more checks failed"}`,
        ],
      });
    } catch (err) {
      if (err instanceof TypeError) {
        setBackendStatus("error");
      }
      setError(err.message || "Unknown error");
      setTestResult({
        ok: false,
        title: "Run Typical Schedule Test",
        message: "Typical test could not complete.",
        details: [err.message || "Unknown error"],
      });
    } finally {
      setLoading(false);
    }
  }, [apiConfigured, maxRetryAttempts, retryUntilValid, roster, start, end, majorHolidayBlocks, solveWithRetries]);

  const events = schedule.map((item) => {
    const date = moment(item.date, DATE_FMT);
    const fellowIndex = roster.findIndex((fellow) => fellow.name.trim() === item.fellow);
    const callType = getCallType(item.date, pcicuExceptionMonths, majorHolidayBlocks);
    return {
      title: `${item.fellow} - ${callType}`,
      start: date.toDate(),
      end: date.toDate(),
      allDay: true,
      resource: {
        color: fellowColor(fellowIndex),
        textColor: "#fff",
        callType,
      },
    };
  });

  return (
    <div style={{ padding: 24, maxWidth: 1150, margin: "0 auto", fontFamily: "sans-serif" }}>
      <style>{`
        @keyframes scheduler-loading-slide {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        @keyframes backend-status-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <h1 style={{ marginBottom: 20 }}>Fellowship Scheduler</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setActiveTab("scheduler")}
          style={{
            ...btnStyle,
            background: activeTab === "scheduler" ? "#1f77b4" : "#6c7a89",
          }}
        >
          Scheduler
        </button>
        <button
          onClick={() => setActiveTab("calendar")}
          style={{
            ...btnStyle,
            background: activeTab === "calendar" ? "#1f77b4" : "#6c7a89",
          }}
        >
          Final Calendar
        </button>
        <button
          onClick={() => setActiveTab("rules")}
          style={{
            ...btnStyle,
            background: activeTab === "rules" ? "#1f77b4" : "#6c7a89",
          }}
        >
          Rules & Validation
        </button>
      </div>

      {activeTab === "scheduler" ? (
        <>
          <BackendStatusBadge status={backendStatus} checking={backendChecking} apiUrl={API_URL} onRetry={checkBackend} />
          <LoadingPanel loading={loading} mode={loadingMode} />
          <TestResultPanel result={testResult} />
          <div style={{ background: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <RosterEditor
              roster={roster}
              onRename={(id, name) => setRoster((current) => current.map((fellow) => (
                fellow.id === id ? { ...fellow, name } : fellow
              )))}
            />

            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Start date</label>
                <input value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>End date</label>
                <input value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 16, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Rotation rules now included</div>
              <div style={{ fontSize: 13, color: "#555" }}>The solver assigns monthly consult, imaging, research, cath, ACHD/EP, and PCICU rotations and then builds call assignments from those rotations.</div>
              <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>Each fellow is assumed to have four vacation weeks available by default, and the holiday weekends are distributed one per fellow across the year.</div>
            </div>

            {!apiConfigured && (
              <div style={{ marginBottom: 16, padding: "10px 12px", background: "#fff3cd", border: "1px solid #ffe69c", borderRadius: 6, color: "#856404" }}>
                Backend API not configured for this deployment. On GitHub Pages, set `REACT_APP_API_URL` in the Pages workflow to a hosted backend before generating schedules.
              </div>
            )}

            <div style={{ marginBottom: 16, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: retryUntilValid ? 10 : 0 }}>
                <input
                  type="checkbox"
                  checked={retryUntilValid}
                  onChange={(e) => setRetryUntilValid(e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Keep retrying until a valid schedule is found</span>
              </label>
              <div style={{ fontSize: 12, color: "#666" }}>
                When enabled, the app will retry the same request with different solver seeds until validation passes or the attempt limit is reached.
              </div>
              {retryUntilValid && (
                <div style={{ marginTop: 10 }}>
                  <label style={labelStyle}>Maximum attempts</label>
                  <input
                    type="number"
                    min="1"
                    max="25"
                    value={maxRetryAttempts}
                    onChange={(e) => setMaxRetryAttempts(Math.min(25, Math.max(1, Number(e.target.value) || 1)))}
                    style={{ ...inputStyle, width: 100 }}
                  />
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 18,
                padding: 12,
                background: "#ffffff",
                border: "1px solid #d8dee6",
                borderRadius: 8,
                position: "sticky",
                top: 12,
                zIndex: 2,
              }}
            >
              <button onClick={generateSchedule} disabled={loading || !apiConfigured} style={{ ...btnStyle, opacity: loading || !apiConfigured ? 0.6 : 1 }}>
                {loading ? "Generating..." : "Generate schedule"}
              </button>
              <button
                onClick={runRandomTest}
                disabled={loading || !apiConfigured}
                style={{ ...btnStyle, background: "#6f42c1", opacity: loading || !apiConfigured ? 0.6 : 1 }}
              >
                Run Random Test
              </button>
              <button
                onClick={runTypicalTest}
                disabled={loading || !apiConfigured}
                style={{ ...btnStyle, background: "#1d6f42", opacity: loading || !apiConfigured ? 0.6 : 1 }}
              >
                Run Typical Schedule Test
              </button>
              {schedule.length > 0 && (
                <button
                  onClick={() => exportCalendarWorkbook(
                    schedule,
                    start,
                    end,
                    roster,
                    vacations,
                    holidayWeekends,
                    majorHolidays,
                    majorHolidayBlocks,
                    pcicuExceptionMonths,
                  )}
                  style={{ ...btnStyle, background: "#2ca02c" }}
                >
                  Export calendar workbook
                </button>
              )}
            </div>

            <BoardExamEditor
              roster={roster}
              boardExamIds={boardExamIds}
              onToggle={(id) => setBoardExamIds((current) => (
                current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
              ))}
            />

            <PcicuExceptionMonthEditor
              months={months}
              selectedMonths={pcicuExceptionMonths}
              onToggle={(monthKey) =>
                setPcicuExceptionMonths((current) => (
                  current.includes(monthKey)
                    ? current.filter((item) => item !== monthKey)
                    : [...current, monthKey].sort()
                ))
              }
            />

            <MajorHolidayBlockEditor
              blocks={majorHolidayBlocks}
              onChange={setMajorHolidayBlocks}
            />

            <HolidayPreferenceEditor
              roster={roster}
              preferences={holidayPreferences}
              onUpdate={(id, nextValue) =>
                setHolidayPreferences((current) => ({ ...current, [id]: nextValue }))
              }
            />

            <VacationEditor roster={roster} vacations={vacations} onChange={setVacations} />

            {error && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "#fde8e8", border: "1px solid #f5c2c2", borderRadius: 4, color: "#c0392b" }}>
                {error}
              </div>
            )}
          </div>
        </>
      ) : activeTab === "calendar" ? (
        schedule.length === 0 ? (
          <div
            style={{
              background: "#fff",
              border: "1px solid #dee2e6",
              borderRadius: 8,
              padding: 20,
              color: "#555",
            }}
          >
            <BackendStatusBadge status={backendStatus} checking={backendChecking} apiUrl={API_URL} onRetry={checkBackend} />
            Generate a schedule from the Scheduler tab to view the finalized calendar, monthly rotations, holiday weekends, and validation results here.
          </div>
        ) : (
          <>
            <BackendStatusBadge status={backendStatus} checking={backendChecking} apiUrl={API_URL} onRetry={checkBackend} />
            <TestResultPanel result={testResult} />
            <ValidationPanel checks={validation} />
            <RotationTable roster={roster} rotations={rotations} months={months} />
            <InHouseCallSummary roster={roster} schedule={schedule} exceptionMonths={pcicuExceptionMonths} majorHolidayBlocks={majorHolidayBlocks} />
            <MajorHolidayTable majorHolidays={majorHolidays} />
            <HolidayWeekendTable holidayWeekends={holidayWeekends} />

            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: 620 }}
              eventPropGetter={(event) => ({
                style: {
                  backgroundColor: event.resource?.color || "#888",
                  color: event.resource?.textColor || "#fff",
                  border: "none",
                  borderRadius: 3,
                },
              })}
              date={calendarDate}
              onNavigate={setCalendarDate}
            />
          </>
        )
      ) : (
        <RulesValidationTab checks={validation} error={error} />
      )}
    </div>
  );
}
