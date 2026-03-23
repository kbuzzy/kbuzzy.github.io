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
    const isInHouse = typeof item.is_in_house === "boolean"
      ? item.is_in_house
      : getCallType(item.date, exceptionMonths, majorHolidayBlocks) === "In-House Call";
    if (isInHouse) {
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
  const failedChecks = checks.filter((check) => !check.ok);
  const passedChecks = checks.filter((check) => check.ok);
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
        <div>Schedule validation summary</div>
        <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600 }}>
          {failedChecks.length === 0
            ? `All ${checks.length} checks are passing.`
            : `${failedChecks.length} of ${checks.length} checks need attention.`}
        </div>
      </div>
      <div style={{ background: "#fff" }}>
        {failedChecks.map((check) => (
          <div
            key={check.label}
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid #f0f0f0",
              background: "#fde8e8",
              borderLeft: "4px solid #c0392b",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: "#c0392b" }}>
                Needs attention
              </span>
              <span style={{ fontWeight: 600 }}>{check.label}</span>
            </div>
            <div>{check.detail}</div>
            {check.suggestion && (
              <div style={{ marginTop: 6, fontSize: 13, color: "#7a1f1f" }}>
                Try: {check.suggestion}
              </div>
            )}
          </div>
        ))}
        {passedChecks.length > 0 && (
          <details style={{ padding: "10px 16px" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, color: "#155724" }}>
              View {passedChecks.length} passing check{passedChecks.length === 1 ? "" : "s"}
            </summary>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {passedChecks.map((check) => (
                <div
                  key={check.label}
                  style={{
                    padding: "8px 10px",
                    background: "#f7fbf8",
                    border: "1px solid #d7eadc",
                    borderRadius: 6,
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#155724" }}>{check.label}</div>
                  <div style={{ marginTop: 2, fontSize: 13, color: "#355070" }}>{check.detail}</div>
                </div>
              ))}
            </div>
          </details>
        )}
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
        "Fellow names can be edited, but each name must stay unique.",
      ],
    },
    {
      title: "Clinical Rotations",
      items: [
        "Each fellow is assigned exactly one monthly daytime rotation.",
        "The supported rotations are consult, imaging, research, cath, ACHD/EP, and PCICU.",
        "Consult, cath, PCICU, and ACHD/EP are single-slot monthly rotations.",
        "Imaging and research may have multiple fellows in the same month.",
        "Both first-year fellows (PGY-4) must be on imaging in the first month of the academic year.",
        "No fellow may repeat the same non-research rotation in back-to-back months.",
        "Research may repeat when needed, but no fellow may have more than two research months in a row.",
        "Long runs of consult, cath, and PCICU are discouraged; stretches longer than two months are treated as a soft penalty.",
        "October board-exam takers are steered toward imaging or research when feasible.",
      ],
    },
    {
      title: "Call Assignments",
      items: [
        "Monday call always goes to the monthly consult fellow.",
        "Tuesday call usually goes to the monthly PCICU fellow.",
        "In 6 selected exception months, PICU covers Tuesday nights, so Tuesday call goes to the consult fellow instead.",
        "The consult fellow cannot take other call days beyond the required Monday and eligible Tuesday assignments.",
        "The monthly PCICU fellow cannot take any weekend or holiday-weekend block in that same month.",
        "No fellow can work consecutive call days outside an allowed multi-day block.",
        "Consecutive days are allowed within the same weekend block, holiday weekend, or major holiday half.",
        "A fellow cannot take the day immediately before a holiday call block starts.",
        "The cath fellow is softly preferred for Thursday call when feasible.",
        "A fellow on a non-holiday Thursday call cannot also take the following weekend block, whether it is a standard weekend or a holiday weekend.",
        "No fellow can be assigned to two weekend blocks in a row.",
      ],
    },
    {
      title: "Weekends And Holidays",
      items: [
        "Standard weekends are Friday-Sunday blocks assigned to one fellow.",
        "Holiday weekends are special blocks, and each fellow receives exactly one per year.",
        "Each major holiday is split into two halves, with one fellow assigned to each half.",
        "Thanksgiving halves default to 11/25-11/26 and 11/27-11/29.",
        "Christmas halves default to 12/22-12/24 and 12/25-12/27.",
        "New Year's halves default to 12/28-12/30 and 12/31-01/03.",
        "Those major holiday date ranges can be edited in the Scheduler tab.",
        "Each fellow is assigned exactly one half of one major holiday per year.",
        "If the holiday falls on Friday, the block expands to Thursday-Sunday.",
        "If the holiday falls on Saturday, Sunday, or Monday, the block expands to Friday-Monday.",
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
        "Every day in the academic year is covered.",
        "Each fellow has exactly one rotation every month.",
        "Monthly consult, cath, PCICU, and ACHD/EP slot counts are correct.",
        "Annual rotation totals match the fellow's PGY year.",
        "Both first-year fellows (PGY-4) are on imaging in the first academic month.",
        "Non-research rotations do not repeat in back-to-back months.",
        "No fellow has more than two consecutive research months.",
        "Major holiday halves stay intact and are distributed correctly.",
        "Mondays go to the consult fellow.",
        "Tuesdays follow the PCICU versus consult exception-month rule.",
        "Weekend and holiday blocks stay intact.",
        "No one works consecutive call days outside allowed block exceptions.",
        "No one works the day immediately before a holiday block.",
        "No fellow is assigned back-to-back weekends.",
        "Consult fellows are excluded from weekend call in their consult month.",
        "PCICU fellows are excluded from weekend call in their PCICU month.",
        "Thursday-to-following-weekend conflicts are blocked.",
        "Thursday cath coverage is tracked.",
        "Holiday weekend coverage is summarized and checked.",
      ],
    },
    {
      title: "Holiday Preferences",
      items: [
        "Each fellow ranks Thanksgiving, Christmas, and New Year's from most preferred to work to least preferred to work.",
        "Each fellow also ranks the six holiday weekends from most preferred to work to least preferred to work.",
        "The solver uses those rankings as a soft preference objective.",
        "Preference satisfaction is weighted by seniority: PGY-6 over PGY-5 over PGY-4.",
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
