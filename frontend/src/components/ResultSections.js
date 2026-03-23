import React from "react";

import { ROTATION_LABELS } from "../config/schedule";
import { tableCellStyle, tableHeaderStyle } from "../styles/ui";
import { colorWithAlpha, fellowColor, getCallType } from "../utils/schedule";

export function RotationTable({ roster, rotations, months }) {
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

export function HolidayWeekendTable({ holidayWeekends }) {
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

export function MajorHolidayTable({ majorHolidays }) {
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

export function InHouseCallSummary({ roster, schedule, exceptionMonths, majorHolidayBlocks }) {
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

export function ValidationPanel({ checks }) {
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

export function RulesValidationTab({ checks, error }) {
  const sections = [
    {
      title: "Roster Rules",
      items: [
        "The schedule assumes 6 fellows: 2 first-year fellows (PGY-4), 2 second-year fellows (PGY-5), and 2 third-year fellows (PGY-6).",
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
        "Both first-year fellows (PGY-4) must be on imaging in July 2026.",
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
        "No fellow can work in-house call on two consecutive days.",
        "A fellow may stay on consecutive days within a major holiday block or holiday weekend block.",
        "No fellow can be on call the day immediately before a holiday call block starts.",
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
        "Both first-year fellows (PGY-4) on imaging in July 2026",
        "No repeated non-research rotations in back-to-back months",
        "No fellow has more than two consecutive research months",
        "Major holiday half-block integrity and one-half-per-fellow coverage",
        "Monday consult assignments",
        "Tuesday PCICU/consult exception-month rule using the selected 6 PICU-covered months",
        "Weekend and holiday block integrity",
        "No back-to-back in-house call days",
        "No day-before-holiday-call conflicts",
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
        "Preference approval is seniority-weighted, with third-year fellows (PGY-6) favored over second-year fellows (PGY-5) and second-year fellows favored over first-year fellows (PGY-4).",
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
