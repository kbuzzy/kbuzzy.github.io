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
import { exportCalendarWorkbook, exportScheduleComparisonWorkbook } from "../utils/exportWorkbook";
import {
  buildCalendarEvents,
  buildRequestSummary,
  completeHolidayPreferenceRankings,
  createDefaultCallAvoidRequests,
  createDefaultConferenceBlocks,
  createDefaultMajorHolidayBlocks,
  createDefaultPreferenceState,
  createDefaultVacations,
  createRandomPreferenceState,
  createTestCallAvoidRequests,
  createTypicalVacations,
  exportScheduleRequestsCsv,
  expandDateRanges,
  expandWeekRanges,
  findAlternativeVacationWeek,
  importScheduleRequestsCsv,
  listMonths,
  randomVacationWeeks,
  readStoredState,
  replaceVacationWeek,
  sample,
  serializeConferenceBlocks,
  serializeMajorHolidayBlocks,
  vacationWeekHasHolidayConflict,
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

function safeBuildRequestSummary(input) {
  try {
    return buildRequestSummary(input);
  } catch {
    return [];
  }
}

export function buildSummaryForSolvedRun({
  start,
  roster,
  vacations,
  callAvoidRequests,
  boardExamIds,
  holidayPreferences,
  conferenceBlocks,
  data,
}) {
  const completedPreferences = completeHolidayPreferenceRankings(roster, holidayPreferences);
  return safeBuildRequestSummary({
    start,
    roster,
    vacations,
    callAvoidRequests,
    boardExamIds,
    holidayPreferences: completedPreferences,
    conferenceBlocks,
    schedule: data.schedule || [],
    rotations: data.rotations || [],
    holidayWeekends: data.holiday_weekends || [],
    majorHolidays: data.major_holidays || [],
  });
}

export function requestSummaryScore(summary) {
  return (summary || []).reduce((total, item) => {
    const satisfied = Array.isArray(item?.satisfied) ? item.satisfied.length : 0;
    const unmet = Array.isArray(item?.unmet) ? item.unmet.length : 0;
    return total + satisfied - unmet;
  }, 0);
}

function parseVacationWeekNumber(label) {
  const match = String(label || "").match(/Vacation week (\d+)/);
  return match ? Number(match[1]) - 1 : null;
}

function replaceUnworkableVacationWeeks({
  vacationsById,
  roster,
  requestSummary,
  start,
  end,
  majorHolidayBlocks,
}) {
  let nextVacations = vacationsById;
  const replacements = [];

  (requestSummary || []).forEach((item) => {
    const fellow = roster.find((candidate) => candidate.name.trim() === item?.fellow);
    if (!fellow) return;
    (item.unmet || []).forEach((unmetItem) => {
      if (!vacationWeekHasHolidayConflict(unmetItem)) return;
      const rangeIndex = parseVacationWeekNumber(unmetItem.label);
      if (rangeIndex === null) return;
      const replacement = findAlternativeVacationWeek(fellow.id, nextVacations, start, end, majorHolidayBlocks);
      if (!replacement) return;
      const prior = nextVacations?.[fellow.id]?.[rangeIndex];
      nextVacations = replaceVacationWeek(nextVacations, fellow.id, rangeIndex, replacement);
      replacements.push({
        fellow: fellow.name.trim(),
        from: prior?.from,
        to: prior?.to,
        replacement,
      });
    });
  });

  return { vacationsById: nextVacations, replacements };
}

function rangeIncludesDate(range, date) {
  if (!range?.from || !range?.to) return false;
  return moment(date, DATE_FMT).isBetween(moment(range.from, DATE_FMT), moment(range.to, DATE_FMT), "day", "[]");
}

function vacationDateCountsByFellow(vacationsById) {
  const counts = {};
  Object.entries(vacationsById || {}).forEach(([fellowId, ranges]) => {
    (ranges || []).forEach((range, rangeIndex) => {
      const cur = moment(range.from, DATE_FMT);
      const last = moment(range.to, DATE_FMT);
      while (cur.isSameOrBefore(last)) {
        const date = cur.format(DATE_FMT);
        counts[date] = counts[date] || [];
        counts[date].push({ fellowId, rangeIndex });
        cur.add(1, "day");
      }
    });
  });
  return counts;
}

function replaceOverlappingVacationWeeks({ vacationsById, start, end, majorHolidayBlocks }) {
  let nextVacations = vacationsById;
  const replacements = [];

  for (let iteration = 0; iteration < 20; iteration += 1) {
    const conflict = Object.entries(vacationDateCountsByFellow(nextVacations))
      .find(([, entries]) => entries.length > 2);
    if (!conflict) break;
    const [date, entries] = conflict;
    const replacementTarget = entries[entries.length - 1];
    const replacement = findAlternativeVacationWeek(replacementTarget.fellowId, nextVacations, start, end, majorHolidayBlocks);
    if (!replacement) break;
    const prior = nextVacations?.[replacementTarget.fellowId]?.[replacementTarget.rangeIndex];
    if (!rangeIncludesDate(prior, date)) break;
    nextVacations = replaceVacationWeek(nextVacations, replacementTarget.fellowId, replacementTarget.rangeIndex, replacement);
    replacements.push({ fellowId: replacementTarget.fellowId, from: prior?.from, to: prior?.to, replacement });
  }

  return { vacationsById: nextVacations, replacements };
}

function replaceNextVacationWeek({ vacationsById, roster, start, end, majorHolidayBlocks, offset = 0 }) {
  const indexedRanges = roster.flatMap((fellow) => (
    (vacationsById?.[fellow.id] || []).map((range, rangeIndex) => ({ fellow, range, rangeIndex }))
  ));
  if (!indexedRanges.length) return { vacationsById, replacement: null };

  for (let step = 0; step < indexedRanges.length; step += 1) {
    const target = indexedRanges[(offset + step) % indexedRanges.length];
    const replacement = findAlternativeVacationWeek(target.fellow.id, vacationsById, start, end, majorHolidayBlocks);
    if (!replacement) continue;
    return {
      vacationsById: replaceVacationWeek(vacationsById, target.fellow.id, target.rangeIndex, replacement),
      replacement: {
        fellow: target.fellow.name.trim(),
        from: target.range?.from,
        to: target.range?.to,
        replacement,
      },
    };
  }

  return { vacationsById, replacement: null };
}

function validationScore(checks) {
  return (checks || []).filter((check) => check.ok).length;
}

function downloadTextFile(filename, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
  const [validGeneratedVersions, setValidGeneratedVersions] = useState([]);
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
    () => safeBuildRequestSummary({
      start,
      roster,
      vacations,
      callAvoidRequests,
      boardExamIds,
      holidayPreferences: completeHolidayPreferenceRankings(roster, holidayPreferences),
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
    } = options;

    const totalAttempts = Math.max(3, Number(maxRetryAttempts) || 3);
    const attempts = [];
    const validAttempts = [];
    const signal = activeRequestControllerRef.current?.signal;

    let activeVacationsById = replaceOverlappingVacationWeeks({
      vacationsById,
      start,
      end,
      majorHolidayBlocks,
    }).vacationsById;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      if (signal?.aborted) {
        throw new DOMException("Scheduling request canceled.", "AbortError");
      }
      setLoadingMode({ kind, attempt, totalAttempts });
      let data = null;
      let vacationsForAttempt = activeVacationsById;
      let vacationFallbacks = [];

      for (let vacationRetry = 0; vacationRetry < 3; vacationRetry += 1) {
        const payload = buildSchedulePayload({
          vacationsById: vacationsForAttempt,
          callAvoidRequestsById,
          selectedBoardExamIds,
          selectedPreferences,
          selectedExceptionMonths,
          solverSeed: Math.floor(Math.random() * 1_000_000_000),
        });
        try {
          data = await requestSchedule(payload, signal);
        } catch (err) {
          if (!String(err?.message || "").includes("No feasible schedule found") || vacationRetry >= 2) {
            throw err;
          }
          const fallback = replaceNextVacationWeek({
            vacationsById: vacationsForAttempt,
            roster,
            start,
            end,
            majorHolidayBlocks,
            offset: attempt + vacationRetry,
          });
          if (!fallback.replacement) throw err;
          vacationsForAttempt = fallback.vacationsById;
          vacationFallbacks.push(fallback.replacement);
          continue;
        }
        const preliminarySummary = buildSummaryForSolvedRun({
          start,
          roster,
          vacations: vacationsForAttempt,
          callAvoidRequests: callAvoidRequestsById,
          boardExamIds: selectedBoardExamIds,
          holidayPreferences: selectedPreferences,
          conferenceBlocks,
          data,
        });
        const fallback = replaceUnworkableVacationWeeks({
          vacationsById: vacationsForAttempt,
          roster,
          requestSummary: preliminarySummary,
          start,
          end,
          majorHolidayBlocks,
        });
        if (!fallback.replacements.length || vacationRetry >= 2) break;
        vacationsForAttempt = fallback.vacationsById;
        vacationFallbacks = vacationFallbacks.concat(fallback.replacements);
      }

      activeVacationsById = vacationsForAttempt;
      const nextValidation = getValidationForResult(data, start, end, selectedExceptionMonths, roster);
      const validationPassed = nextValidation.every((check) => check.ok);
      const requestSummaryForAttempt = buildSummaryForSolvedRun({
        start,
        roster,
        vacations: vacationsForAttempt,
        callAvoidRequests: callAvoidRequestsById,
        boardExamIds: selectedBoardExamIds,
        holidayPreferences: selectedPreferences,
        conferenceBlocks,
        data,
      });
      const attemptResult = {
        data,
        nextValidation,
        validationPassed,
        requestSummary: requestSummaryForAttempt,
        requestScore: requestSummaryScore(requestSummaryForAttempt),
        validationScore: validationScore(nextValidation),
        attempt,
        totalAttempts,
        validAttempts: 0,
        vacationsById: vacationsForAttempt,
        vacationFallbacks,
      };
      attempts.push(attemptResult);
      if (validationPassed) {
        validAttempts.push(attemptResult);
        if (validAttempts.length >= 3) break;
      }
    }

    const candidates = validAttempts.length ? validAttempts : attempts;
    const bestAttempt = [...candidates].sort((left, right) => (
      Number(right.validationPassed) - Number(left.validationPassed)
        || right.requestScore - left.requestScore
        || right.validationScore - left.validationScore
        || left.attempt - right.attempt
    ))[0];
    return {
      ...bestAttempt,
      vacationsById: bestAttempt.vacationsById || activeVacationsById,
      totalAttempts,
      attemptsUsed: attempts.length,
      validAttempts: validAttempts.length,
      validGeneratedVersions: validAttempts,
      generatedTargetMet: validAttempts.length >= 3,
    };
  }, [buildSchedulePayload, conferenceBlocks, end, majorHolidayBlocks, maxRetryAttempts, requestSchedule, roster, start]);

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
    setLoadingMode({ kind: "generate", attempt: 1, totalAttempts: Math.max(3, Number(maxRetryAttempts) || 3) });
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
      });
      if (activeRunIdRef.current !== runId) {
        return;
      }
      setValidGeneratedVersions(result.validGeneratedVersions || []);
      setVacations(result.vacationsById || vacations);
      applySolvedResult(result.data, result.nextValidation);
      if (!result.validationPassed) {
        setError(`No fully valid schedule was found after ${result.attemptsUsed} attempt${result.attemptsUsed === 1 ? "" : "s"}. The closest attempt is shown so you can review the remaining conflicts.`);
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
    roster,
    vacations,
    solveWithRetries,
  ]);

  const finalizeTestResult = useCallback(async (
    title,
    data,
    nextValidation,
    result,
    exceptionMonthsForRun,
    vacationsForRun,
    callAvoidRequestsForRun,
    boardExamIdsForRun,
    holidayPreferencesForRun,
    conferenceBlocksForRun,
    successMessage,
    failureMessage,
    runId,
  ) => {
    const nextRequestSummary = buildSummaryForSolvedRun({
      start,
      roster,
      vacations: vacationsForRun,
      callAvoidRequests: callAvoidRequestsForRun,
      boardExamIds: boardExamIdsForRun,
      holidayPreferences: holidayPreferencesForRun,
      conferenceBlocks: conferenceBlocksForRun,
      data,
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
      {
        download: false,
        rotations: data.rotations || [],
        requestInputs: {
          roster,
          vacations: vacationsForRun,
          callAvoidRequests: callAvoidRequestsForRun,
          boardExamIds: boardExamIdsForRun,
          holidayPreferences: holidayPreferencesForRun,
          pcicuExceptionMonths: exceptionMonthsForRun,
          majorHolidayBlocks,
          conferenceBlocks: conferenceBlocksForRun,
        },
      },
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
        : `${failureMessage} after ${result.attemptsUsed} attempt${result.attemptsUsed === 1 ? "" : "s"}, but one or more checks still failed.`,
      details: [
        `Best schedule selected from attempt ${result.attempt}`,
        `Solver attempts used: ${result.attemptsUsed}/${result.totalAttempts}`,
        `Valid schedules generated: ${result.validAttempts}`,
        `Vacation alternatives selected: ${(result.vacationFallbacks || []).length}`,
        `Request satisfaction score: ${result.requestScore}`,
        `Schedule days returned: ${(data.schedule || []).length}`,
        `Rotation assignments returned: ${(data.rotations || []).length}`,
        `Validation checks: ${nextValidation.length}`,
        `Workbook export generation: ${exportWorked ? "ok" : "failed"}`,
        `Validation result: ${validationPassed ? "all checks passed" : "one or more checks failed"}`,
      ],
    };
  }, [applySolvedResult, end, majorHolidayBlocks, roster, start]);

  const runRandomTest = useCallback(async () => {
    if (!apiConfigured) return;

    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    activeRequestControllerRef.current = new AbortController();
    setLoadingMode({ kind: "randomTest", attempt: 1, totalAttempts: Math.max(3, Number(maxRetryAttempts) || 3) });
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
      });
      setBackendStatus("connected");
      setValidGeneratedVersions(result.validGeneratedVersions || []);
      setVacations(result.vacationsById || randomVacations);
      setTestResult(await finalizeTestResult(
        "Run Random Test",
        result.data,
        result.nextValidation,
        result,
        randomExceptionMonths,
        result.vacationsById || randomVacations,
        randomCallAvoidRequests,
        randomBoardExamIds,
        randomPreferences,
        conferenceBlocks,
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
  }, [apiConfigured, conferenceBlocks, end, finalizeTestResult, majorHolidayBlocks, maxRetryAttempts, months, roster, solveWithRetries, start]);

  const runTypicalTest = useCallback(async () => {
    if (!apiConfigured) return;

    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    activeRequestControllerRef.current = new AbortController();
    setLoadingMode({ kind: "typicalTest", attempt: 1, totalAttempts: Math.max(3, Number(maxRetryAttempts) || 3) });
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
      });
      setValidGeneratedVersions(result.validGeneratedVersions || []);
      setVacations(result.vacationsById || typicalVacations);
      const nextResult = await finalizeTestResult(
        "Run Typical Schedule Test",
        result.data,
        result.nextValidation,
        result,
        typicalExceptionMonths,
        result.vacationsById || typicalVacations,
        typicalCallAvoidRequests,
        typicalBoardExamIds,
        typicalPreferences,
        conferenceBlocks,
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
  }, [apiConfigured, conferenceBlocks, end, finalizeTestResult, majorHolidayBlocks, roster, solveWithRetries, start, maxRetryAttempts]);

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
    {
      rotations,
      requestInputs: {
        roster,
        vacations,
        callAvoidRequests,
        boardExamIds,
        holidayPreferences,
        pcicuExceptionMonths,
        majorHolidayBlocks,
        conferenceBlocks,
      },
    },
  ), [boardExamIds, callAvoidRequests, conferenceBlocks, end, holidayPreferences, holidayWeekends, majorHolidayBlocks, majorHolidays, pcicuExceptionMonths, requestSummary, roster, rotations, schedule, start, vacations]);

  const exportValidGeneratedVersions = useCallback(() => (
    exportScheduleComparisonWorkbook(validGeneratedVersions)
  ), [validGeneratedVersions]);

  const exportSchedulingRequests = useCallback(() => {
    const csv = exportScheduleRequestsCsv({
      roster,
      vacations,
      callAvoidRequests,
      boardExamIds,
      holidayPreferences,
      pcicuExceptionMonths,
      majorHolidayBlocks,
      conferenceBlocks,
    });
    downloadTextFile("fellowship_scheduling_requests.csv", csv);
  }, [boardExamIds, callAvoidRequests, conferenceBlocks, holidayPreferences, majorHolidayBlocks, pcicuExceptionMonths, roster, vacations]);

  const importSchedulingRequests = useCallback(async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const imported = importScheduleRequestsCsv(text, roster);
      setVacations(imported.vacations);
      setCallAvoidRequests(imported.callAvoidRequests);
      setBoardExamIds(imported.boardExamIds);
      setHolidayPreferences(imported.holidayPreferences);
      setPcicuExceptionMonths(imported.pcicuExceptionMonths);
      setMajorHolidayBlocks(imported.majorHolidayBlocks);
      setConferenceBlocks(imported.conferenceBlocks);
      setSchedule([]);
      setRotations([]);
      setHolidayWeekends([]);
      setMajorHolidays([]);
      setValidation([]);
      setValidGeneratedVersions([]);
      setTestResult(null);
      setError(null);
    } catch (err) {
      setError(err.message || "Could not import scheduling requests.");
    }
  }, [roster]);

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
    setValidGeneratedVersions([]);
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
    exportValidGeneratedVersions,
    exportSchedulingRequests,
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
    requestSummary,
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
    importSchedulingRequests,
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
    validGeneratedVersions,
    vacations,
  };
}
