const DEFAULT_LOCAL_API_URL = "http://127.0.0.1:8000";

export const API_URL = process.env.REACT_APP_API_URL
  || (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? DEFAULT_LOCAL_API_URL
    : "");

export const DATE_FMT = "MM/DD/YYYY";
export const MAX_VACATION_WEEKS = 4;
export const MAX_CALL_AVOID_REQUESTS = 8;
export const STORAGE_KEY = "fellowship-scheduler-state";
export const STORAGE_VERSION = 3;
export const DEFAULT_RETRY_MAX_ATTEMPTS = 8;
export const CURRENT_ACADEMIC_YEAR_CONFIG = {
  startYear: 2026,
  holidayWeekends: [
    { label: "July 4", start: "07/03/2026", end: "07/06/2026" },
    { label: "Labor Day", start: "09/04/2026", end: "09/07/2026" },
    { label: "MLK Day", start: "01/15/2027", end: "01/18/2027" },
    { label: "Good Friday", start: "03/25/2027", end: "03/28/2027" },
    { label: "Memorial Day", start: "05/28/2027", end: "05/31/2027" },
    { label: "Juneteenth", start: "06/18/2027", end: "06/21/2027" },
  ],
  majorHolidayBlocks: {
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
  },
  conferenceBlocks: {
    heartCamp: {
      label: "Heart Camp",
      start: "08/21/2026",
      end: "08/26/2026",
    },
    chopConference: {
      label: "CHOP Conference",
      start: "02/03/2027",
      end: "02/07/2027",
    },
  },
};

export const DEFAULT_ACADEMIC_YEAR_START = CURRENT_ACADEMIC_YEAR_CONFIG.startYear;

export function academicYearWindow(startYear = DEFAULT_ACADEMIC_YEAR_START) {
  return {
    start: `07/01/${startYear}`,
    end: `06/30/${startYear + 1}`,
  };
}

export function defaultPcicuExceptionMonths(startYear = DEFAULT_ACADEMIC_YEAR_START) {
  return [
    `${startYear}-08`,
    `${startYear}-11`,
    `${startYear + 1}-01`,
    `${startYear + 1}-02`,
    `${startYear + 1}-04`,
    `${startYear + 1}-05`,
  ];
}

export const DEFAULT_PCICU_EXCEPTION_MONTHS = defaultPcicuExceptionMonths();

export const PALETTE = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b"];

export const ROTATION_LABELS = {
  consult: "Consult",
  imaging: "Imaging",
  research: "Research",
  cath: "Cath",
  achd_ep: "ACHD/EP",
  pcicu: "PCICU",
};

export const PGY_ROTATION_TARGETS = {
  "PGY-4": { consult: 3, pcicu: 1, cath: 4, imaging: 3, research: 1, achd_ep: 0 },
  "PGY-5": { consult: 2, pcicu: 1, cath: 1, imaging: 3, research: 4, achd_ep: 1 },
  "PGY-6": { consult: 1, pcicu: 1, cath: 1, imaging: 1, research: 7, achd_ep: 1 },
};

export const HOLIDAY_WEEKENDS = CURRENT_ACADEMIC_YEAR_CONFIG.holidayWeekends;

export const MAJOR_HOLIDAYS = ["Thanksgiving", "Christmas", "New Year's"];

export const DEFAULT_MAJOR_HOLIDAY_BLOCKS = CURRENT_ACADEMIC_YEAR_CONFIG.majorHolidayBlocks;
export const DEFAULT_CONFERENCE_BLOCKS = CURRENT_ACADEMIC_YEAR_CONFIG.conferenceBlocks;

export const HOLIDAY_WEEKEND_OPTIONS = HOLIDAY_WEEKENDS.map((item) => item.label);

export const INITIAL_ROSTER = [
  { id: "f1", pgy: "PGY-4", name: "Deepthi" },
  { id: "f2", pgy: "PGY-4", name: "Amitie" },
  { id: "f3", pgy: "PGY-5", name: "Rijutha" },
  { id: "f4", pgy: "PGY-5", name: "Jeffery" },
  { id: "f5", pgy: "PGY-6", name: "Jordan" },
  { id: "f6", pgy: "PGY-6", name: "Kilian" },
];
