import React from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";

import { API_URL, MAX_VACATION_WEEKS } from "./config/schedule";
import {
  BackendStatusBadge,
  BoardExamEditor,
  CallAvoidRequestEditor,
  CollapsibleSection,
  ConferenceBlockEditor,
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
import { useScheduler } from "./hooks/useScheduler";
import { btnStyle, inputStyle, labelStyle } from "./styles/ui";

import moment from "moment";

const localizer = momentLocalizer(moment);

function currentMainBundlePath() {
  if (typeof document === "undefined") return "";
  const script = Array.from(document.scripts).find((item) => item.src && item.src.includes("/static/js/main."));
  if (!script) return "";
  try {
    return new URL(script.src).pathname;
  } catch {
    return script.src;
  }
}

export default function App() {
  const {
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
  } = useScheduler();

  const vacationWeeksFilled = roster.reduce(
    (total, fellow) => total + (vacations[fellow.id] || []).filter((range) => range.from && range.to).length,
    0,
  );
  const callAvoidRequestsFilled = roster.reduce(
    (total, fellow) => total + (callAvoidRequests[fellow.id] || []).filter((range) => range.from && range.to).length,
    0,
  );
  const totalVacationSlots = roster.length * MAX_VACATION_WEEKS;
  const boardExamCount = boardExamIds.length;
  const exceptionMonthSummary = `${pcicuExceptionMonths.length}/6 selected`;
  const holidayBlockSummary = `${Object.values(majorHolidayBlocks).flat().length} date ranges`;
  const conferenceSummary = `${Object.values(conferenceBlocks).filter((block) => block?.start && block?.end).length} ranges`;
  const holidayPreferenceSummary = `${roster.length} fellows ranked`;
  const inHouseCountSummary = `${roster.length} fellows`;
  const rotationSummary = `${months.length} months`;
  const holidayWeekendSummary = `${holidayWeekends.length} assigned`;
  const majorHolidaySummary = `${majorHolidays.length} half-blocks`;
  const [showScrollTop, setShowScrollTop] = React.useState(false);
  const [updateAvailable, setUpdateAvailable] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 260);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = React.useCallback(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (window.location.hostname === "localhost") return undefined;

    let cancelled = false;
    const manifestUrl = `${process.env.PUBLIC_URL || ""}/asset-manifest.json?ts=${Date.now()}`;

    const checkForNewBuild = async () => {
      try {
        const response = await fetch(manifestUrl, { cache: "no-store" });
        if (!response.ok) return;
        const manifest = await response.json();
        const latestMain = manifest?.files?.main;
        const currentMain = currentMainBundlePath();
        if (!cancelled && latestMain && currentMain && latestMain !== currentMain) {
          setUpdateAvailable(true);
        }
      } catch {
        // Ignore version-check failures; stale build detection is best-effort.
      }
    };

    checkForNewBuild();
    const intervalId = window.setInterval(checkForNewBuild, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const reloadForLatestBuild = React.useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.reload();
  }, []);

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
      <h1 style={{ marginBottom: 4 }}>Fellowship Scheduler</h1>
      <div style={{ marginBottom: 16, fontSize: 13, color: "#5b6470" }}>
        Created by Kilian Burke
      </div>
      {updateAvailable && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            background: "#fff3cd",
            border: "1px solid #ffe69c",
            borderRadius: 6,
            color: "#856404",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>A newer version of this site is available. Refresh to load the latest UI.</span>
          <button onClick={reloadForLatestBuild} style={{ ...btnStyle, background: "#856404" }}>
            Refresh now
          </button>
        </div>
      )}

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

      <LoadingPanel loading={loading} mode={loadingMode} onCancel={cancelInProgress} />

      {activeTab === "scheduler" ? (
        <>
          <BackendStatusBadge status={backendStatus} checking={backendChecking} apiUrl={API_URL} onRetry={checkBackend} />
          <TestResultPanel result={testResult} />
          <div style={{ background: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: 8, padding: 16, marginBottom: 20 }}>
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

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 16,
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
              <div style={{ marginLeft: "auto", fontSize: 13, color: "#5b6470" }}>
                Review details below, then generate the schedule.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div style={{ background: "#fff", border: "1px solid #d8dee6", borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Core Setup</div>
                <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
                  <div>
                    <label style={labelStyle}>Start date</label>
                    <input value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End date</label>
                    <input value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <RosterEditor
                  roster={roster}
                  onRename={(id, name) => setRoster((current) => current.map((fellow) => (
                    fellow.id === id ? { ...fellow, name } : fellow
                  )))}
                />
              </div>

              <div style={{ background: "#fff", border: "1px solid #d8dee6", borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Exams And Monthly Exceptions</div>
                <div style={{ fontSize: 12, color: "#667085", marginBottom: 10 }}>
                  Board exams: {boardExamCount}. PICU exception months: {exceptionMonthSummary}. Conference ranges: {conferenceSummary}.
                </div>
                <div style={{ maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
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

                  <ConferenceBlockEditor
                    blocks={conferenceBlocks}
                    onChange={setConferenceBlocks}
                  />
                </div>
              </div>
            </div>

            <CollapsibleSection title="Vacation Weeks" summary={`${vacationWeeksFilled}/${totalVacationSlots} weeks entered`}>
              <VacationEditor roster={roster} vacations={vacations} onChange={setVacations} />
            </CollapsibleSection>

            <CollapsibleSection title="Additional Call-Avoid Requests" summary={`${callAvoidRequestsFilled} request${callAvoidRequestsFilled === 1 ? "" : "s"}`}>
              <CallAvoidRequestEditor roster={roster} callAvoidRequests={callAvoidRequests} onChange={setCallAvoidRequests} />
            </CollapsibleSection>

            <CollapsibleSection title="Holiday Preferences" summary={holidayPreferenceSummary}>
              <HolidayPreferenceEditor
                roster={roster}
                preferences={holidayPreferences}
                onUpdate={(id, nextValue) => setHolidayPreferences((current) => ({ ...current, [id]: nextValue }))}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Major Holiday Coverage Dates" summary={holidayBlockSummary}>
              <MajorHolidayBlockEditor blocks={majorHolidayBlocks} onChange={setMajorHolidayBlocks} />
            </CollapsibleSection>

            <details
              style={{
                marginBottom: 16,
                background: "#fbfcfd",
                border: "1px solid #d8dee6",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  padding: "10px 12px",
                  fontWeight: 600,
                  color: "#51606f",
                  fontSize: 14,
                  background: "#f4f7fa",
                }}
              >
                Developer tools
              </summary>
              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 12, color: "#667085", marginBottom: 12 }}>
                  Test runs, retry behavior, and local-state reset live here so the main scheduler flow stays simpler for general users.
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
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
                  <button
                    onClick={resetSavedState}
                    disabled={loading}
                    style={{ ...btnStyle, background: "#c0392b", opacity: loading ? 0.6 : 1 }}
                  >
                    Reset saved state
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                    padding: 10,
                    background: "#fff",
                    border: "1px solid #e3e8ee",
                    borderRadius: 6,
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#445" }}>
                    <input
                      type="checkbox"
                      checked={retryUntilValid}
                      onChange={(e) => setRetryUntilValid(e.target.checked)}
                    />
                    <span>Retry until valid</span>
                  </label>
                  {retryUntilValid && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, color: "#445" }}>Attempts</span>
                      <input
                        type="number"
                        min="1"
                        max="25"
                        value={maxRetryAttempts}
                        onChange={(e) => setMaxRetryAttempts(Math.min(25, Math.max(1, Number(e.target.value) || 1)))}
                        style={{ ...inputStyle, width: 80 }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </details>

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
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: 12,
              }}
            >
              <button
                onClick={exportWorkbook}
                style={{ ...btnStyle, background: "#2ca02c" }}
              >
                Export calendar workbook
              </button>
            </div>

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

            <div style={{ marginTop: 16 }}>
              <CollapsibleSection title="In-House Call Totals" summary={inHouseCountSummary} defaultOpen={false}>
                <InHouseCallSummary roster={roster} schedule={schedule} exceptionMonths={pcicuExceptionMonths} majorHolidayBlocks={majorHolidayBlocks} />
              </CollapsibleSection>

              <CollapsibleSection title="Monthly Rotations" summary={rotationSummary} defaultOpen={false}>
                <RotationTable roster={roster} rotations={rotations} months={months} />
              </CollapsibleSection>

              <CollapsibleSection title="Holiday Weekends" summary={holidayWeekendSummary} defaultOpen={false}>
                <HolidayWeekendTable holidayWeekends={holidayWeekends} />
              </CollapsibleSection>

              <CollapsibleSection title="Major Holiday Halves" summary={majorHolidaySummary} defaultOpen={false}>
                <MajorHolidayTable majorHolidays={majorHolidays} />
              </CollapsibleSection>
            </div>
          </>
        )
      ) : (
        <RulesValidationTab checks={validation} error={error} requestSummary={requestSummary} />
      )}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          aria-label="Return to top"
          title="Return to top"
          style={{
            ...btnStyle,
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 20,
            borderRadius: 999,
            padding: "10px 14px",
            boxShadow: "0 8px 20px rgba(15, 23, 42, 0.18)",
            background: "#1f4f7a",
          }}
        >
          ↑ Top
        </button>
      )}
    </div>
  );
}
