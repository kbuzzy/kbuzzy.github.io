import React from "react";
import moment from "moment";

import { DATE_FMT, HOLIDAY_WEEKEND_OPTIONS, MAJOR_HOLIDAYS, MAX_CALL_AVOID_REQUESTS, MAX_VACATION_WEEKS } from "../config/schedule";
import { btnStyle, dangerButtonStyle, inputStyle, labelStyle } from "../styles/ui";
import {
  createDefaultMajorHolidayBlocks,
  fellowColor,
  moveItem,
  snapToFriday,
  snapToMonday,
} from "../utils/schedule";

export function BoardExamEditor({ roster, boardExamIds, onToggle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        October Board Exams
        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: "#777" }}>
          October exam takers cannot be assigned to consult, cath, or PCICU
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

export function PcicuExceptionMonthEditor({ months, selectedMonths, onToggle }) {
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

export function ConferenceBlockEditor({ blocks, onChange }) {
  const items = [
    {
      key: "heartCamp",
      title: "Heart Camp",
      detail: "Third-year fellows cannot be on call during this range and cannot take consult, cath, or PCICU in August.",
    },
    {
      key: "chopConference",
      title: "CHOP Conference",
      detail: "First-year fellows cannot be on call during this range and cannot take consult, cath, or PCICU in February.",
    },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        Conference Coverage Dates
        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: "#777" }}>
          These are hard scheduling blackout ranges for the affected PGY groups.
        </span>
      </label>
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((item) => {
          const block = blocks[item.key];
          return (
            <div
              key={item.key}
              style={{
                background: "#fff",
                border: "1px solid #e0e0e0",
                borderRadius: 6,
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: "#667085", marginBottom: 8 }}>{item.detail}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={block?.start ? moment(block.start, DATE_FMT).format("YYYY-MM-DD") : ""}
                  onChange={(e) => {
                    const raw = e.target.value ? moment(e.target.value, "YYYY-MM-DD").format(DATE_FMT) : "";
                    onChange({
                      ...blocks,
                      [item.key]: {
                        ...block,
                        start: raw,
                      },
                    });
                  }}
                  style={inputStyle}
                />
                <input
                  type="date"
                  value={block?.end ? moment(block.end, DATE_FMT).format("YYYY-MM-DD") : ""}
                  onChange={(e) => {
                    const raw = e.target.value ? moment(e.target.value, "YYYY-MM-DD").format(DATE_FMT) : "";
                    onChange({
                      ...blocks,
                      [item.key]: {
                        ...block,
                        end: raw,
                      },
                    });
                  }}
                  style={inputStyle}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BackendStatusBadge({ status, checking, apiUrl, onRetry }) {
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
      {apiUrl && <span style={{ marginLeft: 8, fontSize: 12 }}>{apiUrl}</span>}
      <div style={{ fontSize: 12, marginTop: 4, minHeight: 16 }}>{current.detail}</div>
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

export function CollapsibleSection({ title, summary, defaultOpen = false, children }) {
  return (
    <details
      open={defaultOpen}
      style={{
        marginBottom: 16,
        background: "#fff",
        border: "1px solid #d8dee6",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: "12px 14px",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 12,
          background: "#f8fafc",
          fontWeight: 700,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 26,
            height: 26,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            background: "#e8eef7",
            color: "#24415d",
            fontSize: 14,
            flex: "0 0 auto",
          }}
        >
          ▾
        </span>
        <span>
          <span style={{ display: "block" }}>{title}</span>
          <span style={{ display: "block", marginTop: 2, fontSize: 11, fontWeight: 500, color: "#667085" }}>
            Click to expand or collapse
          </span>
        </span>
        {summary && (
          <span style={{ fontSize: 12, fontWeight: 500, color: "#5b6470" }}>
            {summary}
          </span>
        )}
      </summary>
      <div style={{ padding: 14 }}>
        {children}
      </div>
    </details>
  );
}

function preferenceParts(preferenceSet, key, options) {
  const value = preferenceSet?.[key];
  if (Array.isArray(value)) {
    return {
      important: value.filter((item) => options.includes(item)),
      neutral: options.filter((item) => !value.includes(item)),
    };
  }
  const important = Array.isArray(value?.important)
    ? value.important.filter((item) => options.includes(item))
    : [];
  const neutral = Array.isArray(value?.neutral)
    ? value.neutral.filter((item) => options.includes(item) && !important.includes(item))
    : [];
  return {
    important,
    neutral: [
      ...neutral,
      ...options.filter((item) => !important.includes(item) && !neutral.includes(item)),
    ],
  };
}

function PreferenceRankingCard({ title, parts, onChange }) {
  const moveToImportant = (item) => {
    onChange({
      important: [...parts.important, item],
      neutral: parts.neutral.filter((entry) => entry !== item),
    });
  };
  const moveToNeutral = (item) => {
    onChange({
      important: parts.important.filter((entry) => entry !== item),
      neutral: [...parts.neutral, item],
    });
  };
  const moveImportant = (index, direction) => {
    onChange({
      ...parts,
      important: moveItem(parts.important, index, direction),
    });
  };

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
        Prioritized holidays keep this order. Neutral holidays are automatically ordered after priorities to reduce conflicts.
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#344054", marginBottom: 6 }}>Important</div>
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {parts.important.length === 0 && (
          <div style={{ color: "#667085", fontSize: 13, border: "1px dashed #d0d7de", borderRadius: 6, padding: "8px 10px" }}>
            No specific priority requests.
          </div>
        )}
        {parts.important.map((item, index) => (
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
                onClick={() => moveImportant(index, -1)}
                disabled={index === 0}
                style={{ ...btnStyle, padding: "4px 8px", opacity: index === 0 ? 0.45 : 1 }}
              >
                Up
              </button>
              <button
                onClick={() => moveImportant(index, 1)}
                disabled={index === parts.important.length - 1}
                style={{ ...btnStyle, padding: "4px 8px", opacity: index === parts.important.length - 1 ? 0.45 : 1 }}
              >
                Down
              </button>
              <button
                onClick={() => moveToNeutral(item)}
                style={{ ...btnStyle, background: "#6c757d", padding: "4px 8px" }}
              >
                Neutral
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#344054", marginBottom: 6 }}>Neutral</div>
      <div style={{ display: "grid", gap: 8 }}>
        {parts.neutral.map((item) => (
          <div
            key={item}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 10,
              alignItems: "center",
              border: "1px solid #ececec",
              borderRadius: 6,
              padding: "8px 10px",
              background: "#fafafa",
            }}
          >
            <span>{item}</span>
            <button
              onClick={() => moveToImportant(item)}
              style={{ ...btnStyle, padding: "4px 8px" }}
            >
              Prioritize
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HolidayPreferenceEditor({ roster, preferences, onUpdate }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        Holiday Work Preferences
        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: "#777" }}>
          Prioritize holidays that matter; neutral holidays are still ranked automatically
        </span>
      </label>
      <div style={{ display: "grid", gap: 12 }}>
        {roster.map((fellow) => {
          const preferenceSet = preferences[fellow.id];
          const majorParts = preferenceParts(preferenceSet, "majorHolidays", MAJOR_HOLIDAYS);
          const weekendParts = preferenceParts(preferenceSet, "holidayWeekends", HOLIDAY_WEEKEND_OPTIONS);
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
                  parts={majorParts}
                  onChange={(nextParts) =>
                    onUpdate(fellow.id, {
                      ...preferenceSet,
                      majorHolidays: nextParts,
                    })
                  }
                />
                <PreferenceRankingCard
                  title="Holiday Weekends"
                  parts={weekendParts}
                  onChange={(nextParts) =>
                    onUpdate(fellow.id, {
                      ...preferenceSet,
                      holidayWeekends: nextParts,
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

export function MajorHolidayBlockEditor({ blocks, onChange }) {
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
                      Object.keys(next).forEach((key) => {
                        next[key] = blocks[key].map((item) => ({ ...item }));
                      });
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
                      Object.keys(next).forEach((key) => {
                        next[key] = blocks[key].map((item) => ({ ...item }));
                      });
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

export function RosterEditor({ roster, onRename }) {
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

export function VacationEditor({ roster, vacations, onChange }) {
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

function FellowCallAvoidRows({ fellow, color, ranges, onChange }) {
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
            if (ranges.length >= MAX_CALL_AVOID_REQUESTS) return;
            onChange([...ranges, { from: "", to: "" }]);
          }}
          disabled={ranges.length >= MAX_CALL_AVOID_REQUESTS}
          style={{ ...btnStyle, marginLeft: "auto", opacity: ranges.length >= MAX_CALL_AVOID_REQUESTS ? 0.5 : 1 }}
        >
          Add request
        </button>
      </div>

      {ranges.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "#888", fontStyle: "italic" }}>
          No call-avoid requests entered.
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
              next[index] = { from: raw, to: next[index]?.to || raw };
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
              next[index] = { ...next[index], to: raw };
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

export function CallAvoidRequestEditor({ roster, callAvoidRequests, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        Additional Call-Avoid Requests
        <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: "#777" }}>
          Optional single-day or date-range requests. These are soft preferences with lower priority than vacations and holiday coverage rules.
        </span>
      </label>
      {roster.map((fellow, index) => (
        <FellowCallAvoidRows
          key={fellow.id}
          fellow={fellow}
          color={fellowColor(index)}
          ranges={callAvoidRequests[fellow.id] || []}
          onChange={(ranges) => onChange({ ...callAvoidRequests, [fellow.id]: ranges })}
        />
      ))}
    </div>
  );
}

export function TestResultPanel({ result }) {
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

export function LoadingPanel({ loading, mode, onCancel }) {
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
      ? "The app is building a realistic schedule request with October first-year fellow board exams, distinct vacations, and the default PICU exception months."
      : "The solver is assigning monthly rotations and then building the call schedule. This can take a little time.";

  return (
    <div
      style={{
        position: "fixed",
        top: 84,
        right: 20,
        width: "min(420px, calc(100vw - 40px))",
        zIndex: 30,
        padding: 16,
        background: "#eef6ff",
        border: "1px solid #b6d4fe",
        borderRadius: 8,
        boxShadow: "0 14px 28px rgba(29, 78, 216, 0.16)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "#0b5ed7" }}>{label}{attemptSuffix}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0b5ed7", letterSpacing: 0.4 }}>IN PROGRESS</div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              ...dangerButtonStyle,
              padding: "6px 10px",
              fontSize: 12,
              borderRadius: 999,
            }}
          >
            Stop
          </button>
        </div>
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
