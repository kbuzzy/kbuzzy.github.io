import moment from "moment";

import {
  DATE_FMT,
  DEFAULT_MAJOR_HOLIDAY_BLOCKS,
  HOLIDAY_WEEKENDS,
  HOLIDAY_WEEKEND_OPTIONS,
  INITIAL_ROSTER,
  MAJOR_HOLIDAYS,
  MAX_VACATION_WEEKS,
  PALETTE,
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
        majorHolidays: [...MAJOR_HOLIDAYS],
        holidayWeekends: [...HOLIDAY_WEEKEND_OPTIONS],
      },
    ]),
  );
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

export function createRandomPreferenceState(roster) {
  return Object.fromEntries(
    roster.map((fellow) => [
      fellow.id,
      {
        majorHolidays: shuffle(MAJOR_HOLIDAYS),
        holidayWeekends: shuffle(HOLIDAY_WEEKEND_OPTIONS),
      },
    ]),
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
