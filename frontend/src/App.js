import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";

import {
  API_URL,
  DATE_FMT,
  DEFAULT_PCICU_EXCEPTION_MONTHS,
  DEFAULT_RETRY_MAX_ATTEMPTS,
  INITIAL_ROSTER,
  STORAGE_KEY,
} from "./config/schedule";
import {
  BackendStatusBadge,
  BoardExamEditor,
  HolidayPreferenceEditor,
  LoadingPanel,
  MajorHolidayBlockEditor,
  PcicuExceptionMonthEditor,
  RosterEditor,
  TestResultPanel,
  VacationEditor,
} from "./components/FormSections";
import {
  HolidayWeekendTable,
  InHouseCallSummary,
  MajorHolidayTable,
  RotationTable,
  RulesValidationTab,
  ValidationPanel,
} from "./components/ResultSections";
import { exportCalendarWorkbook } from "./utils/exportWorkbook";
import {
  buildCalendarEvents,
  createDefaultMajorHolidayBlocks,
  createDefaultPreferenceState,
  createDefaultVacations,
  createRandomPreferenceState,
  createTypicalVacations,
  expandWeekRanges,
  listMonths,
  randomVacationWeeks,
  readStoredState,
  sample,
  serializeMajorHolidayBlocks,
} from "./utils/schedule";
import { buildValidation } from "./utils/validation";
import { btnStyle, inputStyle, labelStyle } from "./styles/ui";

const localizer = momentLocalizer(moment);

function formatApiErrorDetail(detail, fallbackStatus) {
  if (!detail) return `Server error: ${fallbackStatus}`;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => {
      if (typeof item === "string") return item;
      if (item?.msg) {
        const location = Array.isArray(item.loc) ? item.loc.join(" -> ") : item.loc;
        return location ? `${location}: ${item.msg}` : item.msg;
      }
      return null;
    }).filter(Boolean);
    return messages.length ? messages.join(" | ") : JSON.stringify(detail);
  }
  return JSON.stringify(detail);
}

function getValidationForResult(data, start, end, exceptionMonths, roster) {
  if (Array.isArray(data.validation)) return data.validation;
  return buildValidation(
    data.schedule || [],
    data.rotations || [],
    data.holiday_weekends || [],
    data.major_holidays || [],
    start,
    end,
    exceptionMonths,
    roster,
  );
}

export default function App() {
  const storedState = useMemo(() => readStoredState(), []);
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
  const events = useMemo(
    () => buildCalendarEvents(schedule, roster, pcicuExceptionMonths, majorHolidayBlocks),
    [schedule, roster, pcicuExceptionMonths, majorHolidayBlocks],
  );

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
    backendStatus,
    boardExamIds,
    end,
    holidayPreferences,
    holidayWeekends,
    majorHolidayBlocks,
    majorHolidays,
    maxRetryAttempts,
    pcicuExceptionMonths,
    retryUntilValid,
    roster,
    rotations,
    schedule,
    start,
    testResult,
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
    }
  }, [end, holidayWeekends, majorHolidays, pcicuExceptionMonths, roster, rotations, schedule, start]);

  const buildSchedulePayload = useCallback((options) => {
    const {
      vacationsById,
      selectedBoardExamIds,
      selectedPreferences,
      selectedExceptionMonths,
      solverSeed,
    } = options;

    return {
      fellows: roster.map((fellow) => fellow.name.trim()),
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
      throw new Error(formatApiErrorDetail(body.detail, response.status));
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
      const nextValidation = getValidationForResult(data, start, end, selectedExceptionMonths, roster);
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

  const finalizeTestResult = useCallback((title, data, nextValidation, result, exceptionMonthsForRun, vacationsForRun, successMessage, failureMessage) => {
    const workbook = exportCalendarWorkbook(
      data.schedule || [],
      start,
      end,
      roster,
      vacationsForRun,
      data.holiday_weekends || [],
      data.major_holidays || [],
      majorHolidayBlocks,
      exceptionMonthsForRun,
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
    return {
      ok,
      title,
      message: ok
        ? successMessage
        : retryUntilValid
          ? `${failureMessage} after ${result.totalAttempts} attempt${result.totalAttempts === 1 ? "" : "s"}, but one or more checks still failed.`
          : `${failureMessage}, but one or more checks still failed.`,
      details: [
        `Attempts used: ${result.attempt}/${result.totalAttempts}`,
        `Schedule days returned: ${(data.schedule || []).length}`,
        `Rotation assignments returned: ${(data.rotations || []).length}`,
        `Validation checks: ${nextValidation.length}`,
        `Workbook export generation: ${exportWorked ? "ok" : "failed"}`,
        `Validation result: ${validationPassed ? "all checks passed" : "one or more checks failed"}`,
      ],
    };
  }, [end, majorHolidayBlocks, retryUntilValid, roster, start]);

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
      setBackendStatus("connected");
      setTestResult(finalizeTestResult(
        "Run Random Test",
        result.data,
        result.nextValidation,
        result,
        randomExceptionMonths,
        randomVacations,
        "Random scheduling request succeeded, validation checks passed, calendar data rendered, and workbook export generation worked.",
        "Random scheduling request completed",
      ));
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
  }, [apiConfigured, finalizeTestResult, maxRetryAttempts, months, retryUntilValid, roster, solveWithRetries]);

  const runTypicalTest = useCallback(async () => {
    if (!apiConfigured) return;

    setLoadingMode({ kind: "typicalTest", attempt: 1, totalAttempts: retryUntilValid ? Math.max(1, Number(maxRetryAttempts) || 1) : 1 });
    setLoading(true);
    setError(null);
    setTestResult(null);

    try {
      const typicalVacations = createTypicalVacations(roster, start, end, majorHolidayBlocks);
      const typicalBoardExamIds = roster.filter((fellow) => fellow.pgy === "PGY-4").map((fellow) => fellow.id);
      const typicalExceptionMonths = [...DEFAULT_PCICU_EXCEPTION_MONTHS];
      const typicalPreferences = createRandomPreferenceState(roster);

      setVacations(typicalVacations);
      setBoardExamIds(typicalBoardExamIds);
      setPcicuExceptionMonths(typicalExceptionMonths);
      setHolidayPreferences(typicalPreferences);

      const result = await solveWithRetries({
        kind: "typicalTest",
        vacationsById: typicalVacations,
        selectedBoardExamIds: typicalBoardExamIds,
        selectedPreferences: typicalPreferences,
        selectedExceptionMonths: typicalExceptionMonths,
        allowRetryUntilValid: retryUntilValid,
      });
      const nextResult = finalizeTestResult(
        "Run Typical Schedule Test",
        result.data,
        result.nextValidation,
        result,
        typicalExceptionMonths,
        typicalVacations,
        "Typical scheduling request succeeded, validation checks passed, calendar data rendered, and workbook export generation worked.",
        "Typical scheduling request completed",
      );
      nextResult.details.splice(1, 0,
        "Board exams: both first-year fellows (PGY-4) only",
        "Vacation weeks: all fellows assigned distinct non-holiday weeks",
        `PICU exception months: ${typicalExceptionMonths.join(", ")}`,
      );
      setTestResult(nextResult);
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
  }, [apiConfigured, end, finalizeTestResult, majorHolidayBlocks, retryUntilValid, roster, solveWithRetries, start, maxRetryAttempts]);

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
        {["scheduler", "calendar", "rules"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...btnStyle,
              background: activeTab === tab ? "#1f77b4" : "#6c7a89",
            }}
          >
            {tab === "scheduler" ? "Scheduler" : tab === "calendar" ? "Final Calendar" : "Rules & Validation"}
          </button>
        ))}
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

            <MajorHolidayBlockEditor blocks={majorHolidayBlocks} onChange={setMajorHolidayBlocks} />
            <HolidayPreferenceEditor
              roster={roster}
              preferences={holidayPreferences}
              onUpdate={(id, nextValue) => setHolidayPreferences((current) => ({ ...current, [id]: nextValue }))}
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
