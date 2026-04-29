import moment from "moment";

import {
  DEFAULT_CONFERENCE_BLOCKS,
  DATE_FMT,
  DEFAULT_MAJOR_HOLIDAY_BLOCKS,
  HOLIDAY_WEEKENDS,
  HOLIDAY_WEEKEND_OPTIONS,
  INITIAL_ROSTER,
  MAJOR_HOLIDAYS,
  MAX_VACATION_WEEKS,
  PALETTE,
  PGY_PREFERENCE_WEIGHTS,
  ROTATION_LABELS,
  STORAGE_KEY,
  STORAGE_VERSION,
} from "../config/schedule";

export function fellowColor(index) {
  return PALETTE[index % PALETTE.length];
}

export function colorWithAlpha(hex, alpha) {
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

export function tintHex(hex, ratio = 0.8) {
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

export function createDefaultMajorHolidayBlocks() {
  return JSON.parse(JSON.stringify(DEFAULT_MAJOR_HOLIDAY_BLOCKS));
}

export function createDefaultConferenceBlocks() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFERENCE_BLOCKS));
}

export function getCallType(dateStr, exceptionMonths, majorHolidayBlocks = DEFAULT_MAJOR_HOLIDAY_BLOCKS) {
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
  if (day === 1) return "Home Call";
  if (day === 2) return exceptionMonths.includes(month) ? "Home Call" : "In-House Call";
  if (day === 3 || day === 4) return "In-House Call";
  return "Home Call";
}

export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildVacationRows(roster, vacations) {
  const rows = [];
  roster.forEach((fellow) => {
    (vacations[fellow.id] || []).forEach((range, index) => {
      if (!range.from || !range.to) return;
      rows.push([fellow.name, `Week ${index + 1}`, range.from, range.to]);
    });
  });
  return rows;
}

export function buildWeekendAssignmentRows(schedule, holidayWeekends, startStr, endStr, majorHolidayBlocks) {
  const byDate = {};
  schedule.forEach((item) => {
    byDate[item.date] = item.fellow;
  });

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

  Object.values(majorHolidayBlocks || DEFAULT_MAJOR_HOLIDAY_BLOCKS).forEach((halves) => {
    halves.forEach((half) => {
      const cur = moment(half.start, DATE_FMT);
      const end = moment(half.end, DATE_FMT);
      while (cur.isSameOrBefore(end)) {
        holidayCoveredDates.add(cur.format(DATE_FMT));
        cur.add(1, "day");
      }
    });
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

export function buildMajorHolidayRows(majorHolidayAssignments) {
  return (majorHolidayAssignments || []).map((item) => [
    item.holiday,
    item.label,
    item.start,
    item.end,
    item.fellow || "-",
    "Holiday Call",
  ]);
}

export function serializeMajorHolidayBlocks(blocks) {
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

export function serializeConferenceBlocks(blocks) {
  const keyMap = {
    heartCamp: "heart_camp",
    chopConference: "chop_conference",
  };
  return Object.fromEntries(
    Object.entries(blocks).map(([key, block]) => [
      keyMap[key] || key,
      {
        start: moment(block.start, DATE_FMT).format("YYYY-MM-DD"),
        end: moment(block.end, DATE_FMT).format("YYYY-MM-DD"),
      },
    ]),
  );
}

export function expandWeekRanges(ranges) {
  const dates = [];
  for (const { from, to } of ranges) {
    if (!from || !to) continue;
    const start = moment(from, DATE_FMT);
    const end = moment(to, DATE_FMT);
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) continue;
    const cur = start.clone();
    while (cur.isSameOrBefore(end)) {
      if (cur.day() >= 1 && cur.day() <= 5) {
        dates.push(cur.format(DATE_FMT));
      }
      cur.add(1, "day");
    }
  }
  return dates;
}

export function snapToMonday(dateStr) {
  const m = moment(dateStr, DATE_FMT);
  return m.isValid() ? m.startOf("isoWeek").format(DATE_FMT) : dateStr;
}

export function snapToFriday(dateStr) {
  const m = moment(dateStr, DATE_FMT);
  return m.isValid() ? m.startOf("isoWeek").add(4, "days").format(DATE_FMT) : dateStr;
}

export function listMonths(start, end) {
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

export function createDefaultVacations() {
  return Object.fromEntries(
    INITIAL_ROSTER.map((fellow) => [
      fellow.id,
      Array.from({ length: MAX_VACATION_WEEKS }, () => ({ from: "", to: "" })),
    ]),
  );
}

export function createDefaultCallAvoidRequests() {
  return Object.fromEntries(
    INITIAL_ROSTER.map((fellow) => [
      fellow.id,
      [],
    ]),
  );
}

export function expandDateRanges(ranges) {
  const dates = [];
  for (const { from, to } of ranges) {
    if (!from || !to) continue;
    const start = moment(from, DATE_FMT);
    const end = moment(to, DATE_FMT);
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) continue;
    const cur = start.clone();
    while (cur.isSameOrBefore(end)) {
      dates.push(cur.format(DATE_FMT));
      cur.add(1, "day");
    }
  }
  return Array.from(new Set(dates));
}

export function createDefaultPreferenceState() {
  return Object.fromEntries(
    INITIAL_ROSTER.map((fellow) => [
      fellow.id,
      {
        majorHolidays: {
          important: [],
          neutral: [...MAJOR_HOLIDAYS],
        },
        holidayWeekends: {
          important: [],
          neutral: [...HOLIDAY_WEEKEND_OPTIONS],
        },
      },
    ]),
  );
}

function preferenceParts(preferenceValue, options) {
  if (Array.isArray(preferenceValue)) {
    return {
      important: preferenceValue.filter((item) => options.includes(item)),
      neutral: options.filter((item) => !preferenceValue.includes(item)),
    };
  }
  const important = Array.isArray(preferenceValue?.important)
    ? preferenceValue.important.filter((item) => options.includes(item))
    : [];
  const neutral = Array.isArray(preferenceValue?.neutral)
    ? preferenceValue.neutral.filter((item) => options.includes(item) && !important.includes(item))
    : [];
  return {
    important,
    neutral: [
      ...neutral,
      ...options.filter((item) => !important.includes(item) && !neutral.includes(item)),
    ],
  };
}

function optimizedPreferenceList(fellow, roster, preferences, key, options) {
  const partsByFellow = Object.fromEntries(
    roster.map((item) => [item.id, preferenceParts(preferences?.[item.id]?.[key], options)]),
  );
  const currentParts = partsByFellow[fellow.id];
  const demand = {};
  roster.forEach((other) => {
    if (other.id === fellow.id) return;
    const weight = PGY_PREFERENCE_WEIGHTS[other.pgy] || 1;
    partsByFellow[other.id].important.forEach((option, index) => {
      demand[option] = (demand[option] || 0) + weight * (options.length - index);
    });
  });
  const neutralOrder = Object.fromEntries(currentParts.neutral.map((option, index) => [option, index]));
  const optimizedNeutral = [...currentParts.neutral].sort((left, right) => (
    (demand[left] || 0) - (demand[right] || 0)
      || neutralOrder[left] - neutralOrder[right]
  ));
  return [...currentParts.important, ...optimizedNeutral];
}

export function completeHolidayPreferenceRankings(roster, preferences) {
  return Object.fromEntries(
    roster.map((fellow) => [
      fellow.id,
      {
        majorHolidays: optimizedPreferenceList(fellow, roster, preferences, "majorHolidays", MAJOR_HOLIDAYS),
        holidayWeekends: optimizedPreferenceList(fellow, roster, preferences, "holidayWeekends", HOLIDAY_WEEKEND_OPTIONS),
      },
    ]),
  );
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);
  return rows.filter((item) => item.some((value) => value.trim()));
}

export function exportScheduleRequestsCsv({
  roster,
  vacations,
  callAvoidRequests,
  boardExamIds,
  holidayPreferences,
  pcicuExceptionMonths,
  majorHolidayBlocks,
  conferenceBlocks,
}) {
  const rows = [["section", "fellow", "key", "group", "rank", "start", "end", "value"]];
  roster.forEach((fellow) => {
    (vacations?.[fellow.id] || []).forEach((range, index) => {
      if (range.from || range.to) rows.push(["vacation", fellow.name, "", "", index + 1, range.from || "", range.to || "", ""]);
    });
    (callAvoidRequests?.[fellow.id] || []).forEach((range, index) => {
      if (range.from || range.to) rows.push(["call_avoid", fellow.name, "", "", index + 1, range.from || "", range.to || "", ""]);
    });
    if (boardExamIds.includes(fellow.id)) {
      rows.push(["board_exam", fellow.name, "", "", "", "", "", "true"]);
    }
    ["majorHolidays", "holidayWeekends"].forEach((key) => {
      const section = key === "majorHolidays" ? "major_holiday_preference" : "holiday_weekend_preference";
      const parts = preferenceParts(holidayPreferences?.[fellow.id]?.[key], key === "majorHolidays" ? MAJOR_HOLIDAYS : HOLIDAY_WEEKEND_OPTIONS);
      ["important", "neutral"].forEach((group) => {
        parts[group].forEach((value, index) => {
          rows.push([section, fellow.name, key, group, index + 1, "", "", value]);
        });
      });
    });
  });
  (pcicuExceptionMonths || []).forEach((month, index) => {
    rows.push(["pcicu_exception_month", "", "", "", index + 1, "", "", month]);
  });
  Object.entries(majorHolidayBlocks || {}).forEach(([holiday, halves]) => {
    halves.forEach((half, index) => {
      rows.push(["major_holiday_block", "", holiday, half.label || `${holiday} ${index + 1}`, index + 1, half.start || "", half.end || "", ""]);
    });
  });
  Object.entries(conferenceBlocks || {}).forEach(([key, block]) => {
    rows.push(["conference_block", "", key, block.label || key, "", block.start || "", block.end || "", ""]);
  });
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function importScheduleRequestsCsv(text, roster) {
  const parsedRows = parseCsv(text);
  const [header, ...rows] = parsedRows;
  if (!header || header.map((item) => item.trim()).join(",") !== "section,fellow,key,group,rank,start,end,value") {
    throw new Error("Request import must use the exported scheduling request CSV format.");
  }
  const fellowByName = Object.fromEntries(roster.map((fellow) => [fellow.name.trim(), fellow]));
  const vacations = Object.fromEntries(roster.map((fellow) => [fellow.id, []]));
  const callAvoidRequests = Object.fromEntries(roster.map((fellow) => [fellow.id, []]));
  const boardExamIds = [];
  const holidayPreferences = createDefaultPreferenceState();
  const pcicuExceptionMonths = [];
  const majorHolidayBlocks = createDefaultMajorHolidayBlocks();
  const conferenceBlocks = createDefaultConferenceBlocks();

  roster.forEach((fellow) => {
    holidayPreferences[fellow.id] = {
      majorHolidays: { important: [], neutral: [] },
      holidayWeekends: { important: [], neutral: [] },
    };
  });

  rows.forEach((row) => {
    const [section, fellowName, key, group, , start, end, value] = row.map((item) => item.trim());
    const fellow = fellowName ? fellowByName[fellowName] : null;
    if (fellowName && !fellow) {
      throw new Error(`Request import references unknown fellow: ${fellowName}`);
    }
    if (section === "vacation" && fellow) {
      vacations[fellow.id].push({ from: start, to: end });
    } else if (section === "call_avoid" && fellow) {
      callAvoidRequests[fellow.id].push({ from: start, to: end });
    } else if (section === "board_exam" && fellow && value.toLowerCase() === "true") {
      boardExamIds.push(fellow.id);
    } else if ((section === "major_holiday_preference" || section === "holiday_weekend_preference") && fellow) {
      const preferenceKey = section === "major_holiday_preference" ? "majorHolidays" : "holidayWeekends";
      const targetGroup = group === "important" ? "important" : "neutral";
      holidayPreferences[fellow.id][preferenceKey][targetGroup].push(value);
    } else if (section === "pcicu_exception_month") {
      pcicuExceptionMonths.push(value);
    } else if (section === "major_holiday_block" && majorHolidayBlocks[key]) {
      const index = Math.max(0, Math.min(1, Number(row[4]) - 1 || 0));
      majorHolidayBlocks[key][index] = { ...majorHolidayBlocks[key][index], label: group || majorHolidayBlocks[key][index].label, start, end };
    } else if (section === "conference_block" && conferenceBlocks[key]) {
      conferenceBlocks[key] = { ...conferenceBlocks[key], label: group || conferenceBlocks[key].label, start, end };
    }
  });

  roster.forEach((fellow) => {
    holidayPreferences[fellow.id].majorHolidays = preferenceParts(holidayPreferences[fellow.id].majorHolidays, MAJOR_HOLIDAYS);
    holidayPreferences[fellow.id].holidayWeekends = preferenceParts(holidayPreferences[fellow.id].holidayWeekends, HOLIDAY_WEEKEND_OPTIONS);
  });

  return {
    vacations,
    callAvoidRequests,
    boardExamIds: Array.from(new Set(boardExamIds)),
    holidayPreferences,
    pcicuExceptionMonths: Array.from(new Set(pcicuExceptionMonths)).sort(),
    majorHolidayBlocks,
    conferenceBlocks,
  };
}

export function readStoredState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.storageVersion !== STORAGE_VERSION) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function shuffle(list) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function sample(list, count) {
  return shuffle(list).slice(0, count);
}

export function randomVacationWeeks(months) {
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

export function weekOverlapsProtectedDates(weekStart, protectedDates) {
  for (let offset = 0; offset < 5; offset += 1) {
    if (protectedDates.has(weekStart.clone().add(offset, "days").format(DATE_FMT))) {
      return true;
    }
  }
  return false;
}

export function listCandidateVacationWeeks(start, end, majorHolidayBlocks) {
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

export function createTypicalVacations(roster, start, end, majorHolidayBlocks) {
  const candidates = shuffle(listCandidateVacationWeeks(start, end, majorHolidayBlocks));
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

function randomImportantSubset(options) {
  if (options.length <= 1) return [...options];
  const count = 1 + Math.floor(Math.random() * (options.length - 1));
  return sample(options, count);
}

export function createRandomPreferenceState(roster) {
  return Object.fromEntries(
    roster.map((fellow) => {
      const majorImportant = randomImportantSubset(MAJOR_HOLIDAYS);
      const weekendImportant = randomImportantSubset(HOLIDAY_WEEKEND_OPTIONS);
      return [
        fellow.id,
        {
          majorHolidays: {
            important: majorImportant,
            neutral: MAJOR_HOLIDAYS.filter((item) => !majorImportant.includes(item)),
          },
          holidayWeekends: {
            important: weekendImportant,
            neutral: HOLIDAY_WEEKEND_OPTIONS.filter((item) => !weekendImportant.includes(item)),
          },
        },
      ];
    }),
  );
}

function buildProtectedDateSet(majorHolidayBlocks) {
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

  return protectedDates;
}

function listCandidateWeekdayCallAvoidDates(start, end, majorHolidayBlocks) {
  const protectedDates = buildProtectedDateSet(majorHolidayBlocks);
  const dates = [];
  const cursor = moment(start, DATE_FMT);
  const lastDate = moment(end, DATE_FMT);

  while (cursor.isSameOrBefore(lastDate)) {
    const dateStr = cursor.format(DATE_FMT);
    if (cursor.day() >= 1 && cursor.day() <= 4 && !protectedDates.has(dateStr)) {
      dates.push({ from: dateStr, to: dateStr, type: "weekday" });
    }
    cursor.add(1, "day");
  }

  return dates;
}

function listCandidateWeekendCallAvoidDates(start, end, majorHolidayBlocks) {
  const protectedDates = buildProtectedDateSet(majorHolidayBlocks);
  const weekends = [];
  let cursor = moment(start, DATE_FMT).day(5);
  const startDate = moment(start, DATE_FMT);
  const lastDate = moment(end, DATE_FMT);

  if (cursor.isBefore(startDate)) {
    cursor.add(7, "days");
  }

  while (cursor.clone().add(2, "days").isSameOrBefore(lastDate)) {
    const friday = cursor.format(DATE_FMT);
    const saturday = cursor.clone().add(1, "day").format(DATE_FMT);
    const sunday = cursor.clone().add(2, "day").format(DATE_FMT);
    if (!protectedDates.has(friday) && !protectedDates.has(saturday) && !protectedDates.has(sunday)) {
      weekends.push({ from: friday, to: sunday, type: "weekend" });
    }
    cursor.add(7, "days");
  }

  return weekends;
}

export function createTestCallAvoidRequests(roster, start, end, majorHolidayBlocks) {
  const requests = createDefaultCallAvoidRequests();
  const allWeekdayCandidates = listCandidateWeekdayCallAvoidDates(start, end, majorHolidayBlocks);
  const allWeekendCandidates = listCandidateWeekendCallAvoidDates(start, end, majorHolidayBlocks);

  roster.forEach((fellow) => {
    const requestCount = Math.floor(Math.random() * 5) + 1;
    const weekdayCandidates = shuffle(allWeekdayCandidates);
    const weekendCandidates = shuffle(allWeekendCandidates);
    const selected = [];

    if (weekdayCandidates.length > 0) {
      selected.push(weekdayCandidates.shift());
    }
    if (weekendCandidates.length > 0 && selected.length < requestCount) {
      selected.push(weekendCandidates.shift());
    }

    const combinedCandidates = shuffle([
      ...weekdayCandidates,
      ...weekendCandidates,
    ]);
    while (selected.length < requestCount && combinedCandidates.length > 0) {
      const next = combinedCandidates.shift();
      if (!selected.some((item) => item.from === next.from && item.to === next.to)) {
        selected.push(next);
      }
    }

    requests[fellow.id] = selected.map((request) => ({ from: request.from, to: request.to }));
  });

  const hasWeekendRequest = Object.values(requests).some((ranges) => ranges.some((range) => range.from !== range.to));
  if (!hasWeekendRequest && roster.length > 0 && allWeekendCandidates.length > 0) {
    const fallbackWeekend = allWeekendCandidates[0];
    const firstFellowId = roster[0].id;
    const existing = requests[firstFellowId] || [];
    requests[firstFellowId] = existing.length >= 5
      ? [{ from: fallbackWeekend.from, to: fallbackWeekend.to }, ...existing.slice(1)]
      : [...existing, { from: fallbackWeekend.from, to: fallbackWeekend.to }];
  }

  return requests;
}

export function moveItem(list, index, direction) {
  const next = [...list];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function buildCalendarEvents(schedule, roster, exceptionMonths, majorHolidayBlocks) {
  return schedule.map((item) => {
    const date = moment(item.date, DATE_FMT);
    const fellowIndex = roster.findIndex((fellow) => fellow.name.trim() === item.fellow);
    const callType = item.call_type || getCallType(item.date, exceptionMonths, majorHolidayBlocks);
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
}

function dateRangeLabel(from, to) {
  return from === to ? from : `${from} to ${to}`;
}

function expandDisplayDateRange(from, to, weekdaysOnly = false) {
  const dates = [];
  if (!from || !to) return dates;
  const start = moment(from, DATE_FMT);
  const end = moment(to, DATE_FMT);
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) return dates;
  const cur = start.clone();
  while (cur.isSameOrBefore(end)) {
    if (!weekdaysOnly || (cur.day() >= 1 && cur.day() <= 5)) {
      dates.push(cur.format(DATE_FMT));
    }
    cur.add(1, "day");
  }
  return dates;
}

function rankLabel(rank, total) {
  return `choice #${rank} of ${total}`;
}

export function buildRequestSummary({
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
}) {
  if (!schedule?.length) return [];
  const startYear = moment(start, DATE_FMT).year();

  const scheduleByDate = Object.fromEntries(schedule.map((item) => [item.date, item]));
  const rotationsByFellowMonth = Object.fromEntries(
    rotations.map((item) => [`${item.fellow}::${item.month}`, item.rotation]),
  );
  const assignedHolidayWeekendByFellow = Object.fromEntries(
    (holidayWeekends || []).filter((item) => item.fellow).map((item) => [item.fellow, item.label]),
  );
  const assignedMajorHolidayByFellow = Object.fromEntries(
    (majorHolidays || []).filter((item) => item.fellow).map((item) => [item.fellow, item.holiday]),
  );
  const holidayCoverageDates = new Set();
  [...(holidayWeekends || []), ...(majorHolidays || [])].forEach((item) => {
    if (!item.start || !item.end) return;
    const cur = moment(item.start, DATE_FMT);
    const last = moment(item.end, DATE_FMT);
    while (cur.isSameOrBefore(last)) {
      holidayCoverageDates.add(cur.format(DATE_FMT));
      cur.add(1, "day");
    }
  });

  return roster.map((fellow) => {
    const fellowName = fellow.name.trim();
    const satisfied = [];
    const unmet = [];

    (vacations?.[fellow.id] || []).forEach((range, index) => {
      if (!range.from || !range.to) return;
      const requestedDates = expandDisplayDateRange(range.from, range.to, true);
      const conflictingDates = requestedDates.filter((date) => scheduleByDate[date]?.fellow === fellowName);
      const label = `Vacation week ${index + 1} (${dateRangeLabel(range.from, range.to)})`;
      if (conflictingDates.length === 0) {
        satisfied.push(label);
      } else {
        const holidayConflicts = conflictingDates.filter((date) => holidayCoverageDates.has(date));
        unmet.push({
          label,
          reason: holidayConflicts.length
            ? `Call was assigned on ${conflictingDates.join(", ")}. Vacation dates that overlap holiday coverage can only be honored when the fellow also has the corresponding holiday break; otherwise an alternative vacation week is needed.`
            : `Call was still assigned on ${conflictingDates.join(", ")}, which indicates the schedule conflicts with a hard vacation blackout.`,
        });
      }
    });

    (callAvoidRequests?.[fellow.id] || []).forEach((range, index) => {
      if (!range.from || !range.to) return;
      const requestedDates = expandDisplayDateRange(range.from, range.to, false);
      const conflictingDates = requestedDates.filter((date) => scheduleByDate[date]?.fellow === fellowName);
      const label = `Call-avoid request ${index + 1} (${dateRangeLabel(range.from, range.to)})`;
      if (conflictingDates.length === 0) {
        satisfied.push(label);
      } else {
        unmet.push({
          label,
          reason: `Call remained assigned on ${conflictingDates.join(", ")} because higher-priority coverage, holiday, conference, and rotation constraints took precedence.`,
        });
      }
    });

    if (boardExamIds?.includes(fellow.id)) {
      const octoberRotation = rotationsByFellowMonth[`${fellowName}::${startYear}-10`];
      const label = "October board-exam rotation protection";
      if (!["consult", "cath", "pcicu"].includes(octoberRotation)) {
        satisfied.push(`${label} (${ROTATION_LABELS[octoberRotation] || octoberRotation || "unassigned"})`);
      } else {
        unmet.push({
          label,
          reason: `October rotation is ${ROTATION_LABELS[octoberRotation] || octoberRotation || "unassigned"}, which conflicts with the hard board-exam rotation rule.`,
        });
      }
    }

    const holidayPref = holidayPreferences?.[fellow.id];
    if (holidayPref?.holidayWeekends?.length) {
      const assignedWeekend = assignedHolidayWeekendByFellow[fellowName];
      const rank = holidayPref.holidayWeekends.indexOf(assignedWeekend) + 1;
      if (rank === 1) {
        satisfied.push(`Holiday weekend preference (${assignedWeekend}, ${rankLabel(rank, holidayPref.holidayWeekends.length)})`);
      } else {
        unmet.push({
          label: `Holiday weekend preference (${assignedWeekend || "none assigned"})`,
          reason: assignedWeekend
            ? `Received ${rankLabel(rank, holidayPref.holidayWeekends.length)} instead of the top-ranked weekend because each fellow must cover one unique holiday weekend.`
            : "No holiday weekend assignment was found in the solved schedule.",
        });
      }
    }

    if (holidayPref?.majorHolidays?.length) {
      const assignedMajor = assignedMajorHolidayByFellow[fellowName];
      const rank = holidayPref.majorHolidays.indexOf(assignedMajor) + 1;
      if (rank === 1) {
        satisfied.push(`Major holiday preference (${assignedMajor}, ${rankLabel(rank, holidayPref.majorHolidays.length)})`);
      } else {
        unmet.push({
          label: `Major holiday preference (${assignedMajor || "none assigned"})`,
          reason: assignedMajor
            ? `Received ${rankLabel(rank, holidayPref.majorHolidays.length)} instead of the top-ranked major holiday because both halves of each major holiday must be distributed across the roster.`
            : "No major holiday assignment was found in the solved schedule.",
        });
      }
    }

    if (fellow.pgy === "PGY-6" && conferenceBlocks?.heartCamp?.start && conferenceBlocks?.heartCamp?.end) {
      const callDates = expandDisplayDateRange(conferenceBlocks.heartCamp.start, conferenceBlocks.heartCamp.end, false)
        .filter((date) => scheduleByDate[date]?.fellow === fellowName);
      const augustRotation = rotationsByFellowMonth[`${fellowName}::${startYear}-08`];
      const blockedRotation = ["consult", "cath", "pcicu"].includes(augustRotation);
      if (callDates.length === 0 && !blockedRotation) {
        satisfied.push(`Heart Camp protections (${dateRangeLabel(conferenceBlocks.heartCamp.start, conferenceBlocks.heartCamp.end)} and no August consult/cath/PCICU rotation)`);
      } else {
        unmet.push({
          label: "Heart Camp protections",
          reason: [
            callDates.length ? `call assigned on ${callDates.join(", ")}` : null,
            blockedRotation ? `August rotation is ${ROTATION_LABELS[augustRotation] || augustRotation}` : null,
          ].filter(Boolean).join("; ") || "The schedule conflicts with Heart Camp protections.",
        });
      }
    }

    if (fellow.pgy === "PGY-4" && conferenceBlocks?.chopConference?.start && conferenceBlocks?.chopConference?.end) {
      const callDates = expandDisplayDateRange(conferenceBlocks.chopConference.start, conferenceBlocks.chopConference.end, false)
        .filter((date) => scheduleByDate[date]?.fellow === fellowName);
      const februaryRotation = rotationsByFellowMonth[`${fellowName}::${startYear + 1}-02`];
      const blockedRotation = ["consult", "cath", "pcicu"].includes(februaryRotation);
      if (callDates.length === 0 && !blockedRotation) {
        satisfied.push(`CHOP Conference protections (${dateRangeLabel(conferenceBlocks.chopConference.start, conferenceBlocks.chopConference.end)} and no February consult/cath/PCICU rotation)`);
      } else {
        unmet.push({
          label: "CHOP Conference protections",
          reason: [
            callDates.length ? `call assigned on ${callDates.join(", ")}` : null,
            blockedRotation ? `February rotation is ${ROTATION_LABELS[februaryRotation] || februaryRotation}` : null,
          ].filter(Boolean).join("; ") || "The schedule conflicts with CHOP Conference protections.",
        });
      }
    }

    return {
      fellowId: fellow.id,
      fellow: fellowName,
      pgy: fellow.pgy,
      satisfied,
      unmet,
    };
  });
}
