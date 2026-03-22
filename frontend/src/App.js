import React, { useCallback, useMemo, useState } from "react";
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

const PALETTE = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b"];
const CONSULT_COLOR = "#d8dde6";

const ROTATION_LABELS = {
  consult: "Consult",
  imaging: "Imaging",
  research: "Research",
  cath: "Cath",
  achd_ep: "ACHD/EP",
  pcicu: "PCICU",
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

function exportMonthlyCSV(schedule, startStr, endStr) {
  const byDate = {};
  for (const item of schedule) byDate[item.date] = item.fellow;

  const rows = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let monthCursor = moment(startStr, DATE_FMT).startOf("month");
  const windowEnd = moment(endStr, DATE_FMT);

  while (monthCursor.isSameOrBefore(windowEnd, "month")) {
    rows.push([monthCursor.format("MMMM YYYY"), "", "", "", "", "", ""]);
    rows.push(dayNames);

    let currentWeek = new Array(7).fill("");
    let col = monthCursor.clone().startOf("month").day();

    for (let day = 1; day <= monthCursor.daysInMonth(); day += 1) {
      const date = monthCursor.clone().date(day);
      const dateStr = date.format(DATE_FMT);
      let label = String(day);
      if (byDate[dateStr]) {
        label += ` (${byDate[dateStr]})`;
      }
      currentWeek[col] = label;
      col += 1;
      if (col === 7) {
        rows.push(currentWeek);
        currentWeek = new Array(7).fill("");
        col = 0;
      }
    }

    if (col > 0) rows.push(currentWeek);
    rows.push([]);
    monthCursor.add(1, "month");
  }

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "call_schedule_monthly.csv";
  a.click();
  URL.revokeObjectURL(url);
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
            {roster.map((fellow) => (
              <th key={fellow.id} style={tableHeaderStyle}>{fellow.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.key}>
              <td style={tableCellStyle}><strong>{month.label}</strong></td>
              {roster.map((fellow) => (
                <td key={`${month.key}-${fellow.id}`} style={tableCellStyle}>
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
          <div key={check.label} style={{ padding: "8px 16px", borderBottom: "1px solid #f0f0f0" }}>
            <span style={{ fontWeight: 600 }}>{check.label}: </span>
            <span>{check.detail}</span>
          </div>
        ))}
      </div>
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
        "Research may repeat in consecutive months when needed.",
        "October board-exam takers are preferentially placed on imaging or research when feasible.",
      ],
    },
    {
      title: "Call Assignments",
      items: [
        "Monday call always goes to the monthly consult fellow.",
        "Tuesday call usually goes to the monthly PCICU fellow.",
        "In August, November, January, February, April, and May, Tuesday call goes to the consult fellow instead.",
        "The consult fellow cannot take other call days outside the required Monday and eligible Tuesday assignments.",
        "The cath fellow is softly preferred for Thursday call when feasible.",
        "A fellow on Thursday call cannot also take the following non-holiday weekend.",
      ],
    },
    {
      title: "Weekends And Holidays",
      items: [
        "Standard weekends are Friday through Sunday blocks assigned to one fellow.",
        "Holiday weekends are treated as special blocks and each fellow gets exactly one per year.",
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
        "Monday consult assignments",
        "Tuesday PCICU/consult exception-month rule",
        "Weekend and holiday block integrity",
        "Consult-fellow exclusion from weekend call",
        "Thursday-to-following-weekend conflict check",
        "Cath-fellow Thursday match count",
        "Holiday weekend distribution summary",
      ],
    },
    {
      title: "Upcoming Holiday Preferences",
      items: [
        "A future version will rank fellow preferences for Christmas, Thanksgiving, and New Year's, plus holiday weekends.",
        "Preferences will be ordered from most preferred to work to least preferred to work.",
        "Preference approval will be seniority-weighted, with PGY-3 favored over PGY-2 and PGY-2 favored over PGY-1.",
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

function buildValidation(schedule, rotations, holidayWeekends, start, end) {
  if (!schedule.length) return [];

  const byDate = {};
  schedule.forEach((item) => { byDate[item.date] = item.fellow; });
  const consultByMonth = {};
  const pcicuByMonth = {};
  const cathByMonth = {};
  rotations.forEach((item) => {
    if (item.rotation === "consult") consultByMonth[item.month] = item.fellow;
    if (item.rotation === "pcicu") pcicuByMonth[item.month] = item.fellow;
    if (item.rotation === "cath") cathByMonth[item.month] = item.fellow;
  });

  const checks = [];
  const missing = [];
  const mondayErrors = [];
  const tuesdayErrors = [];
  const weekendErrors = [];
  const consultWeekendErrors = [];
  const thursdayWeekendErrors = [];
  const cathThursdayMatches = [];
  const holidayCounts = {};

  const exceptionMonths = new Set(["2026-08", "2026-11", "2027-01", "2027-02", "2027-04", "2027-05"]);
  const holidayStartMap = Object.fromEntries(HOLIDAY_WEEKENDS.map((item) => [item.start, item]));
  const holidayCoveredDates = new Set();
  HOLIDAY_WEEKENDS.forEach((item) => {
    const curHoliday = moment(item.start, DATE_FMT);
    const endHoliday = moment(item.end, DATE_FMT);
    while (curHoliday.isSameOrBefore(endHoliday)) {
      holidayCoveredDates.add(curHoliday.format(DATE_FMT));
      curHoliday.add(1, "day");
    }
  });

  const cur = moment(start, DATE_FMT);
  const endDate = moment(end, DATE_FMT);
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
      const expected = exceptionMonths.has(month) ? consultByMonth[month] : pcicuByMonth[month];
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
      if (dates[0] === consultByMonth[month]) {
        consultWeekendErrors.push(`${holiday.label}: consult fellow ${dates[0]} was assigned the holiday weekend`);
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
      if (fri === consultByMonth[month]) {
        consultWeekendErrors.push(`${dateStr}: consult fellow ${fri} was assigned a weekend`);
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

  checks.push({
    ok: missing.length === 0,
    label: "Coverage",
    detail: missing.length === 0 ? "Every day has an assignment." : `Missing dates: ${missing.slice(0, 5).join(", ")}`,
  });
  checks.push({
    ok: mondayErrors.length === 0,
    label: "Consult Mondays",
    detail: mondayErrors.length === 0 ? "All Mondays go to the consult fellow." : mondayErrors.slice(0, 3).join(" | "),
  });
  checks.push({
    ok: tuesdayErrors.length === 0,
    label: "Tuesday rule",
    detail: tuesdayErrors.length === 0 ? "All Tuesdays follow the PCICU/consult rule." : tuesdayErrors.slice(0, 3).join(" | "),
  });
  checks.push({
    ok: weekendErrors.length === 0,
    label: "Weekend blocks",
    detail: weekendErrors.length === 0 ? "All Friday-Sunday blocks stay together." : weekendErrors.slice(0, 3).join(" | "),
  });
  checks.push({
    ok: consultWeekendErrors.length === 0,
    label: "Consult weekends",
    detail: consultWeekendErrors.length === 0 ? "Consult fellows are excluded from weekend call." : consultWeekendErrors.slice(0, 3).join(" | "),
  });
  checks.push({
    ok: thursdayWeekendErrors.length === 0,
    label: "Thursday to weekend",
    detail: thursdayWeekendErrors.length === 0 ? "No Thursday call fellow also takes the following non-holiday weekend." : thursdayWeekendErrors.slice(0, 3).join(" | "),
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
  const [roster, setRoster] = useState(INITIAL_ROSTER);
  const [start, setStart] = useState("07/01/2026");
  const [end, setEnd] = useState("06/30/2027");
  const [vacations, setVacations] = useState(createDefaultVacations);
  const [boardExamIds, setBoardExamIds] = useState([]);
  const [holidayPreferences, setHolidayPreferences] = useState(createDefaultPreferenceState);
  const [schedule, setSchedule] = useState([]);
  const [rotations, setRotations] = useState([]);
  const [holidayWeekends, setHolidayWeekends] = useState([]);
  const [validation, setValidation] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [calendarDate, setCalendarDate] = useState(() => moment("07/01/2026", DATE_FMT).toDate());
  const [activeTab, setActiveTab] = useState("scheduler");

  const months = useMemo(() => listMonths(start, end), [start, end]);
  const apiConfigured = Boolean(API_URL);

  const generateSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    setValidation([]);

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

    const response = await fetch(`${API_URL}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fellows: names,
        start,
        end,
        vacations: Object.fromEntries(
          roster.map((fellow) => [fellow.name.trim(), expandWeekRanges(vacations[fellow.id] || [])]),
        ),
        holidays: {},
        pgy_years: Object.fromEntries(roster.map((fellow) => [fellow.name.trim(), fellow.pgy])),
        board_exam_fellows: roster
          .filter((fellow) => boardExamIds.includes(fellow.id))
          .map((fellow) => fellow.name.trim()),
      }),
    }).catch((err) => {
      throw err;
    });

    try {
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Server error: ${response.status}`);
      }
      const data = await response.json();
      setSchedule(data.schedule || []);
      setRotations(data.rotations || []);
      setHolidayWeekends(data.holiday_weekends || []);
      setCalendarDate(moment(start, DATE_FMT).toDate());
      setValidation(buildValidation(data.schedule || [], data.rotations || [], data.holiday_weekends || [], start, end));
    } catch (err) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [boardExamIds, roster, start, end, vacations]);

  const events = schedule.map((item) => {
    const date = moment(item.date, DATE_FMT);
    const fellowIndex = roster.findIndex((fellow) => fellow.name.trim() === item.fellow);
    const isMonday = date.day() === 1;
    return {
      title: item.fellow,
      start: date.toDate(),
      end: date.toDate(),
      allDay: true,
      resource: {
        color: isMonday ? CONSULT_COLOR : fellowColor(fellowIndex),
        textColor: isMonday ? "#2f3b4a" : "#fff",
      },
    };
  });

  return (
    <div style={{ padding: 24, maxWidth: 1150, margin: "0 auto", fontFamily: "sans-serif" }}>
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

            <BoardExamEditor
              roster={roster}
              boardExamIds={boardExamIds}
              onToggle={(id) => setBoardExamIds((current) => (
                current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
              ))}
            />

            <HolidayPreferenceEditor
              roster={roster}
              preferences={holidayPreferences}
              onUpdate={(id, nextValue) =>
                setHolidayPreferences((current) => ({ ...current, [id]: nextValue }))
              }
            />

            <VacationEditor roster={roster} vacations={vacations} onChange={setVacations} />

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={generateSchedule} disabled={loading || !apiConfigured} style={{ ...btnStyle, opacity: loading || !apiConfigured ? 0.6 : 1 }}>
                {loading ? "Generating..." : "Generate schedule"}
              </button>
              {schedule.length > 0 && (
                <button onClick={() => exportMonthlyCSV(schedule, start, end)} style={{ ...btnStyle, background: "#2ca02c" }}>
                  Export monthly CSV
                </button>
              )}
            </div>

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
            Generate a schedule from the Scheduler tab to view the finalized calendar, monthly rotations, holiday weekends, and validation results here.
          </div>
        ) : (
          <>
            <ValidationPanel checks={validation} />
            <RotationTable roster={roster} rotations={rotations} months={months} />
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
