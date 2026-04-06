import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import moment from "moment";

import {
  academicYearWindow,
  API_URL,
  DATE_FMT,
  DEFAULT_PCICU_EXCEPTION_MONTHS,
  DEFAULT_RETRY_MAX_ATTEMPTS,
  INITIAL_ROSTER,
  STORAGE_KEY,
  STORAGE_VERSION,
} from "../config/schedule";
import { exportCalendarWorkbook } from "../utils/exportWorkbook";
import {
  buildCalendarEvents,
  buildRequestSummary,
  createDefaultCallAvoidRequests,
  createDefaultConferenceBlocks,
  createDefaultMajorHolidayBlocks,
  createDefaultPreferenceState,
  createDefaultVacations,
  createRandomPreferenceState,
  createTestCallAvoidRequests,
  createTypicalVacations,
  expandDateRanges,
  expandWeekRanges,
  listMonths,
  randomVacationWeeks,
  readStoredState,
  sample,
  serializeConferenceBlocks,
  serializeMajorHolidayBlocks,
} from "../utils/schedule";
import { buildValidation } from "../utils/validation";

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

export function useScheduler() {
  const defaultWindow = academicYearWindow();
  const storedState = useMemo(() => readStoredState(), []);
  const [roster, setRoster] = useState(storedState?.roster || INITIAL_ROSTER);
  const [start, setStart] = useState(storedState?.start || defaultWindow.start);
  const [end, setEnd] = useState(storedState?.end || defaultWindow.end);
  const [vacations, setVacations] = useState(storedState?.vacations || createDefaultVacations);
  const [callAvoidRequests, setCallAvoidRequests] = useState(storedState?.callAvoidRequests || createDefaultCallAvoidRequests);
  const [boardExamIds, setBoardExamIds] = useState(storedState?.boardExamIds || []);
  const [holidayPreferences, setHolidayPreferences] = useState(
    storedState?.holidayPreferences || createDefaultPreferenceState,
  );
  const [conferenceBlocks, setConferenceBlocks] = useState(
    storedState?.conferenceBlocks || createDefaultConferenceBlocks,
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
  const [calendarDate, setCalendarDate] = useState(() => moment(defaultWindow.start, DATE_FMT).toDate());
  const [activeTab, setActiveTab] = useState("scheduler");
  const [backendStatus, setBackendStatus] = useState(storedState?.backendStatus || (API_URL ? "error" : "unconfigured"));
  const [backendChecking, setBackendChecking] = useState(Boolean(API_URL));
  const [retryUntilValid, setRetryUntilValid] = useState(storedState?.retryUntilValid || false);
  const [maxRetryAttempts, setMaxRetryAttempts] = useState(storedState?.maxRetryAttempts || DEFAULT_RETRY_MAX_ATTEMPTS);
  const activeRequestControllerRef = useRef(null);
  const activeRunIdRef = useRef(0);

  const months = useMemo(() => listMonths(start, end), [start, end]);
  const apiConfigured = Boolean(API_URL);
  const events = useMemo(
    () => buildCalendarEvents(schedule, roster, pcicuExceptionMonths, majorHolidayBlocks),
    [schedule, roster, pcicuExceptionMonths, majorHolidayBlocks],
  );
  const requestSummary = useMemo(
    () => buildRequestSummary({
      start,
      roster,
      vacations,
      callAvoidRequests,
      boardExamIds,
      holidayPreferences,
      conferenceBlocks,
      schedule,
      rotations,
      holidayWeekends,
      majorHolidays,
    }),
    [
      start,
      roster,
      vacations,
      callAvoidRequests,
      boardExamIds,
      holidayPreferences,
      conferenceBlocks,
      schedule,
      rotations,
      holidayWeekends,
      majorHolidays,
    ],
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
        storageVersion: STORAGE_VERSION,
        roster,
        start,
        end,
        vacations,
        callAvoidRequests,
        boardExamIds,
        holidayPreferences,
        conferenceBlocks,
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
    callAvoidRequests,
    end,
    holidayPreferences,
    holidayWeekends,
    conferenceBlocks,
    majorHolidayBlocks,
    majorHolidays,
    maxRetryAttempts,
    pcicuExceptionMonths,
    requestSummary,
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
  }, [schedule]);

  const buildSchedulePayload = useCallback((options) => {
    const {
      vacationsById,
      callAvoidRequestsById,
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
      call_avoid_requests: Object.fromEntries(
        roster.map((fellow) => [fellow.name.trim(), expandDateRanges(callAvoidRequestsById[fellow.id] || [])]),
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
      conference_blocks: serializeConferenceBlocks(conferenceBlocks),
      pcicu_exception_months: selectedExceptionMonths,
      solver_seed: solverSeed,
    };
  }, [conferenceBlocks, end, majorHolidayBlocks, roster, start]);

  const requestSchedule = useCallback(async (payload, signal) => {
    const response = await fetch(`${API_URL}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
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
      callAvoidRequestsById,
      selectedBoardExamIds,
      selectedPreferences,
      selectedExceptionMonths,
      allowRetryUntilValid,
    } = options;

    const totalAttempts = allowRetryUntilValid ? Math.max(1, Number(maxRetryAttempts) || 1) : 1;
    let lastAttempt = null;
    const signal = activeRequestControllerRef.current?.signal;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      if (signal?.aborted) {
        throw new DOMException("Scheduling request canceled.", "AbortError");
      }
      setLoadingMode({ kind, attempt, totalAttempts });
      const payload = buildSchedulePayload({
        vacationsById,
        callAvoidRequestsById,
        selectedBoardExamIds,
        selectedPreferences,
        selectedExceptionMonths,
        solverSeed: Math.floor(Math.random() * 1_000_000_000),
      });
      const data = await requestSchedule(payload, signal);
      const nextValidation = getValidationForResult(data, start, end, selectedExceptionMonths, roster);
      const validationPassed = nextValidation.every((check) => check.ok);
      lastAttempt = { data, nextValidation, validationPassed, attempt, totalAttempts };
      if (validationPassed || !allowRetryUntilValid) break;
    }

    return lastAttempt;
  }, [buildSchedulePayload, end, maxRetryAttempts, requestSchedule, roster, start]);

  const applySolvedResult = useCallback((data, nextValidation) => {
    setSchedule(data.schedule || []);
    setRotations(data.rotations || []);
    setHolidayWeekends(data.holiday_weekends || []);
    setMajorHolidays(data.major_holidays || []);
    setCalendarDate(moment(start, DATE_FMT).toDate());
    setValidation(nextValidation);
  }, [start]);

  const cancelInProgress = useCallback(() => {
    activeRunIdRef.current += 1;
    activeRequestControllerRef.current?.abort();
    activeRequestControllerRef.current = null;
    setLoading(false);
    setLoadingMode({ kind: "generate", attempt: 1, totalAttempts: 1 });
    setError("Scheduling request canceled.");
  }, []);

  const generateSchedule = useCallback(async () => {
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    activeRequestControllerRef.current = new AbortController();
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
        callAvoidRequestsById: callAvoidRequests,
        selectedBoardExamIds: boardExamIds,
        selectedPreferences: holidayPreferences,
        selectedExceptionMonths: pcicuExceptionMonths,
        allowRetryUntilValid: retryUntilValid,
      });
      if (activeRunIdRef.current !== runId) {
        return;
      }
      applySolvedResult(result.data, result.nextValidation);
      if (retryUntilValid && !result.validationPassed) {
        setError(`No fully valid schedule was found after ${result.totalAttempts} attempt${result.totalAttempts === 1 ? "" : "s"}. The closest attempt is shown so you can review the remaining conflicts.`);
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        return;
      }
      if (err instanceof TypeError) {
        setBackendStatus("error");
      }
      setError(err.message || "Unknown error");
    } finally {
      if (activeRunIdRef.current === runId) {
        activeRequestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [
    applySolvedResult,
    boardExamIds,
    callAvoidRequests,
    holidayPreferences,
    maxRetryAttempts,
    pcicuExceptionMonths,
    retryUntilValid,
    roster,
    vacations,
    solveWithRetries,
  ]);

  const finalizeTestResult = useCallback(async (title, data, nextValidation, result, exceptionMonthsForRun, vacationsForRun, successMessage, failureMessage, runId) => {
    const nextRequestSummary = buildRequestSummary({
      start,
      roster,
      vacations: vacationsForRun,
      callAvoidRequests,
      boardExamIds,
      holidayPreferences,
      conferenceBlocks,
      schedule: data.schedule || [],
      rotations: data.rotations || [],
      holidayWeekends: data.holiday_weekends || [],
      majorHolidays: data.major_holidays || [],
    });
    const workbook = await exportCalendarWorkbook(
      data.schedule || [],
      start,
      end,
      roster,
      vacationsForRun,
      data.holiday_weekends || [],
      data.major_holidays || [],
      majorHolidayBlocks,
      exceptionMonthsForRun,
      nextRequestSummary,
      { download: false },
    );
    const hasValidation = nextValidation.length > 0;
    const hasEvents = (data.schedule || []).length > 0;
    const exportWorked = Array.isArray(workbook?.worksheets) && workbook.worksheets.some((sheet) => sheet.name === "Assignments");
    const validationPassed = result.validationPassed;

    if (activeRunIdRef.current !== runId) {
      throw new DOMException("Scheduling request canceled.", "AbortError");
    }

    applySolvedResult(data, nextValidation);
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
  }, [applySolvedResult, boardExamIds, callAvoidRequests, conferenceBlocks, end, holidayPreferences, majorHolidayBlocks, retryUntilValid, roster, start]);

  const runRandomTest = useCallback(async () => {
    if (!apiConfigured) return;

    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    activeRequestControllerRef.current = new AbortController();
    setLoadingMode({ kind: "randomTest", attempt: 1, totalAttempts: retryUntilValid ? Math.max(1, Number(maxRetryAttempts) || 1) : 1 });
    setLoading(true);
    setError(null);
    setTestResult(null);

    const randomVacations = Object.fromEntries(roster.map((fellow) => [fellow.id, randomVacationWeeks(months)]));
    const randomCallAvoidRequests = createTestCallAvoidRequests(roster, start, end, majorHolidayBlocks);
    const randomBoardExamIds = sample(roster.map((fellow) => fellow.id), Math.floor(Math.random() * (roster.length + 1)));
    const randomExceptionMonths = sample(months.map((month) => month.key), 6).sort();
    const randomPreferences = createRandomPreferenceState(roster);

    setVacations(randomVacations);
    setCallAvoidRequests(randomCallAvoidRequests);
    setBoardExamIds(randomBoardExamIds);
    setPcicuExceptionMonths(randomExceptionMonths);
    setHolidayPreferences(randomPreferences);

    try {
      const result = await solveWithRetries({
        kind: "randomTest",
        vacationsById: randomVacations,
        callAvoidRequestsById: randomCallAvoidRequests,
        selectedBoardExamIds: randomBoardExamIds,
        selectedPreferences: randomPreferences,
        selectedExceptionMonths: randomExceptionMonths,
        allowRetryUntilValid: retryUntilValid,
      });
      setBackendStatus("connected");
      setTestResult(await finalizeTestResult(
        "Run Random Test",
        result.data,
        result.nextValidation,
        result,
        randomExceptionMonths,
        randomVacations,
        "Random scheduling request succeeded, validation checks passed, calendar data rendered, and workbook export generation worked.",
        "Random scheduling request completed",
        runId,
      ));
    } catch (err) {
      if (err?.name === "AbortError") {
        setTestResult({
          ok: false,
          title: "Run Random Test",
          message: "Random test was canceled.",
          details: [],
        });
        return;
      }
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
      if (activeRunIdRef.current === runId) {
        activeRequestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [apiConfigured, end, finalizeTestResult, majorHolidayBlocks, maxRetryAttempts, months, retryUntilValid, roster, solveWithRetries, start]);

  const runTypicalTest = useCallback(async () => {
    if (!apiConfigured) return;

    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    activeRequestControllerRef.current = new AbortController();
    setLoadingMode({ kind: "typicalTest", attempt: 1, totalAttempts: retryUntilValid ? Math.max(1, Number(maxRetryAttempts) || 1) : 1 });
    setLoading(true);
    setError(null);
    setTestResult(null);

    try {
      const typicalVacations = createTypicalVacations(roster, start, end, majorHolidayBlocks);
      const typicalCallAvoidRequests = createTestCallAvoidRequests(roster, start, end, majorHolidayBlocks);
      const typicalBoardExamIds = roster.filter((fellow) => fellow.pgy === "PGY-4").map((fellow) => fellow.id);
      const typicalExceptionMonths = [...DEFAULT_PCICU_EXCEPTION_MONTHS];
      const typicalPreferences = createRandomPreferenceState(roster);

      setVacations(typicalVacations);
      setCallAvoidRequests(typicalCallAvoidRequests);
      setBoardExamIds(typicalBoardExamIds);
      setPcicuExceptionMonths(typicalExceptionMonths);
      setHolidayPreferences(typicalPreferences);

      const result = await solveWithRetries({
        kind: "typicalTest",
        vacationsById: typicalVacations,
        callAvoidRequestsById: typicalCallAvoidRequests,
        selectedBoardExamIds: typicalBoardExamIds,
        selectedPreferences: typicalPreferences,
        selectedExceptionMonths: typicalExceptionMonths,
        allowRetryUntilValid: retryUntilValid,
      });
      const nextResult = await finalizeTestResult(
        "Run Typical Schedule Test",
        result.data,
        result.nextValidation,
        result,
        typicalExceptionMonths,
        typicalVacations,
        "Typical scheduling request succeeded, validation checks passed, calendar data rendered, and workbook export generation worked.",
        "Typical scheduling request completed",
        runId,
      );
      nextResult.details.splice(
        1,
        0,
        "Board exams: both first-year fellows (PGY-4) only",
        "Vacation weeks: all fellows assigned distinct non-holiday weeks",
        `Additional call-avoid requests: ${Object.values(typicalCallAvoidRequests).reduce((total, ranges) => total + ranges.length, 0)}`,
        `PICU exception months: ${typicalExceptionMonths.join(", ")}`,
      );
      setTestResult(nextResult);
    } catch (err) {
      if (err?.name === "AbortError") {
        setTestResult({
          ok: false,
          title: "Run Typical Schedule Test",
          message: "Typical test was canceled.",
          details: [],
        });
        return;
      }
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
      if (activeRunIdRef.current === runId) {
        activeRequestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [apiConfigured, end, finalizeTestResult, majorHolidayBlocks, retryUntilValid, roster, solveWithRetries, start, maxRetryAttempts]);

  const exportWorkbook = useCallback(() => exportCalendarWorkbook(
    schedule,
    start,
    end,
    roster,
    vacations,
    holidayWeekends,
    majorHolidays,
    majorHolidayBlocks,
    pcicuExceptionMonths,
    requestSummary,
  ), [end, holidayWeekends, majorHolidayBlocks, majorHolidays, pcicuExceptionMonths, requestSummary, roster, schedule, start, vacations]);

  const resetSavedState = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    setRoster(INITIAL_ROSTER);
    setStart(defaultWindow.start);
    setEnd(defaultWindow.end);
    setVacations(createDefaultVacations());
    setCallAvoidRequests(createDefaultCallAvoidRequests());
    setBoardExamIds([]);
    setHolidayPreferences(createDefaultPreferenceState());
    setConferenceBlocks(createDefaultConferenceBlocks());
    setMajorHolidayBlocks(createDefaultMajorHolidayBlocks());
    setPcicuExceptionMonths(DEFAULT_PCICU_EXCEPTION_MONTHS);
    setSchedule([]);
    setRotations([]);
    setHolidayWeekends([]);
    setMajorHolidays([]);
    setValidation([]);
    setLoading(false);
    setLoadingMode({ kind: "generate", attempt: 1, totalAttempts: 1 });
    setError(null);
    setTestResult(null);
    setCalendarDate(moment(defaultWindow.start, DATE_FMT).toDate());
    setActiveTab("scheduler");
    setRetryUntilValid(false);
    setMaxRetryAttempts(DEFAULT_RETRY_MAX_ATTEMPTS);
  }, [defaultWindow.end, defaultWindow.start]);

  return {
    activeTab,
    apiConfigured,
    backendChecking,
    backendStatus,
    boardExamIds,
    calendarDate,
    cancelInProgress,
    callAvoidRequests,
    checkBackend,
    conferenceBlocks,
    end,
    error,
    events,
    exportWorkbook,
    generateSchedule,
    holidayPreferences,
    holidayWeekends,
    loading,
    loadingMode,
    majorHolidayBlocks,
    majorHolidays,
    maxRetryAttempts,
    months,
    pcicuExceptionMonths,
    retryUntilValid,
    roster,
    resetSavedState,
    rotations,
    runRandomTest,
    runTypicalTest,
    schedule,
    setActiveTab,
    setBoardExamIds,
    setCalendarDate,
    setCallAvoidRequests,
    setConferenceBlocks,
    setEnd,
    setHolidayPreferences,
    setMajorHolidayBlocks,
    setMaxRetryAttempts,
    setPcicuExceptionMonths,
    setRetryUntilValid,
    setRoster,
    setStart,
    setVacations,
    start,
    testResult,
    validation,
    vacations,
  };
}
