import moment from "moment";

import {
  DATE_FMT,
  DEFAULT_MAJOR_HOLIDAY_BLOCKS,
  HOLIDAY_WEEKENDS,
  PGY_ROTATION_TARGETS,
} from "../config/schedule";

export function buildValidation(schedule, rotations, holidayWeekends, majorHolidays, start, end, exceptionMonths, roster) {
  if (!schedule.length) return [];

  const byDate = {};
  schedule.forEach((item) => {
    byDate[item.date] = item.fellow;
  });
  const consultByMonth = {};
  const pcicuByMonth = {};
  const cathByMonth = {};
  const rotationByFellowMonth = {};
  const rotationCountByFellowMonth = {};
  const rotationCountByMonthType = {};

  rotations.forEach((item) => {
    if (item.rotation === "consult") consultByMonth[item.month] = item.fellow;
    if (item.rotation === "pcicu") pcicuByMonth[item.month] = item.fellow;
    if (item.rotation === "cath") cathByMonth[item.month] = item.fellow;
    rotationByFellowMonth[`${item.fellow}::${item.month}`] = item.rotation;
    rotationCountByFellowMonth[`${item.fellow}::${item.month}`] = (rotationCountByFellowMonth[`${item.fellow}::${item.month}`] || 0) + 1;
    rotationCountByMonthType[`${item.month}::${item.rotation}`] = (rotationCountByMonthType[`${item.month}::${item.rotation}`] || 0) + 1;
  });

  const checks = [];
  const missing = [];
  const rotationCoverageErrors = [];
  const slotCountErrors = [];
  const julyImagingErrors = [];
  const rotationQuotaErrors = [];
  const consecutiveRotationErrors = [];
  const researchRunErrors = [];
  const mondayErrors = [];
  const tuesdayErrors = [];
  const weekendErrors = [];
  const majorHolidayErrors = [];
  const consultWeekendErrors = [];
  const pcicuWeekendErrors = [];
  const consecutiveWeekendErrors = [];
  const consecutiveCallErrors = [];
  const thursdayWeekendErrors = [];
  const cathThursdayMatches = [];
  const holidayCounts = {};
  const majorHolidayCounts = {};

  const exceptionMonthSet = new Set(exceptionMonths);
  const holidayStartMap = Object.fromEntries(HOLIDAY_WEEKENDS.map((item) => [item.start, item]));
  const holidayCoveredDates = new Set();
  const majorHolidayStartMap = Object.fromEntries((majorHolidays || []).map((item) => [item.start, item]));
  const blockStartByDate = {};
  const weekendAssignments = [];

  HOLIDAY_WEEKENDS.forEach((item) => {
    const curHoliday = moment(item.start, DATE_FMT);
    const endHoliday = moment(item.end, DATE_FMT);
    while (curHoliday.isSameOrBefore(endHoliday)) {
      const dateKey = curHoliday.format(DATE_FMT);
      holidayCoveredDates.add(dateKey);
      blockStartByDate[dateKey] = item.start;
      curHoliday.add(1, "day");
    }
  });

  (majorHolidays || []).forEach((item) => {
    const curHoliday = moment(item.start, DATE_FMT);
    const endHoliday = moment(item.end, DATE_FMT);
    while (curHoliday.isSameOrBefore(endHoliday)) {
      holidayCoveredDates.add(curHoliday.format(DATE_FMT));
      blockStartByDate[curHoliday.format(DATE_FMT)] = item.start;
      curHoliday.add(1, "day");
    }
  });

  const cur = moment(start, DATE_FMT);
  const endDate = moment(end, DATE_FMT);
  const monthKeys = [];
  const monthCursor = moment(start, DATE_FMT).startOf("month");
  while (monthCursor.isSameOrBefore(endDate, "month")) {
    monthKeys.push(monthCursor.format("YYYY-MM"));
    monthCursor.add(1, "month");
  }
  const firstMonthKey = monthKeys[0];
  const firstMonthLabel = firstMonthKey
    ? moment(`${firstMonthKey}-01`, "YYYY-MM-DD").format("MMMM YYYY")
    : "the first academic month";

  const fellows = roster?.map((item) => item.name.trim()).filter(Boolean)
    || Object.keys(rotationByFellowMonth)
      .map((key) => key.split("::")[0])
      .filter((fellow, index, list) => list.indexOf(fellow) === index);

  fellows.forEach((fellow) => {
    const counts = {};
    monthKeys.forEach((month) => {
      const key = `${fellow}::${month}`;
      const rotationName = rotationByFellowMonth[key];
      const monthCount = rotationCountByFellowMonth[key] || 0;
      if (monthCount !== 1) {
        rotationCoverageErrors.push(`${fellow} has ${monthCount} rotations in ${month}`);
      }
      if (rotationName) {
        counts[rotationName] = (counts[rotationName] || 0) + 1;
      }
      if (month === firstMonthKey) {
        const fellowRecord = roster?.find((item) => item.name.trim() === fellow);
        if (fellowRecord?.pgy === "PGY-4" && rotationName !== "imaging") {
          julyImagingErrors.push(`${fellow} should be on imaging in ${firstMonthKey}, got ${rotationName || "none"}`);
        }
      }
    });

    const fellowRecord = roster?.find((item) => item.name.trim() === fellow);
    if (fellowRecord?.pgy && PGY_ROTATION_TARGETS[fellowRecord.pgy]) {
      Object.entries(PGY_ROTATION_TARGETS[fellowRecord.pgy]).forEach(([rotationName, expected]) => {
        const actual = counts[rotationName] || 0;
        if (actual !== expected) {
          rotationQuotaErrors.push(`${fellow} has ${actual} ${rotationName} months, expected ${expected}`);
        }
      });
    }

    monthKeys.forEach((month, index) => {
      if (index === 0) return;
      const currentRotation = rotationByFellowMonth[`${fellow}::${month}`];
      const previousRotation = rotationByFellowMonth[`${fellow}::${monthKeys[index - 1]}`];
      if (currentRotation && currentRotation === previousRotation && currentRotation !== "research") {
        consecutiveRotationErrors.push(`${fellow} repeated ${currentRotation} in ${monthKeys[index - 1]} and ${month}`);
      }
    });

    let runLength = 0;
    monthKeys.forEach((month) => {
      if (rotationByFellowMonth[`${fellow}::${month}`] === "research") {
        runLength += 1;
        if (runLength > 2) {
          researchRunErrors.push(`${fellow} has more than two consecutive research months ending in ${month}`);
        }
      } else {
        runLength = 0;
      }
    });
  });

  monthKeys.forEach((month) => {
    const consultCount = rotationCountByMonthType[`${month}::consult`] || 0;
    const cathCount = rotationCountByMonthType[`${month}::cath`] || 0;
    const imagingCount = rotationCountByMonthType[`${month}::imaging`] || 0;
    const pcicuCount = rotationCountByMonthType[`${month}::pcicu`] || 0;
    const achdCount = rotationCountByMonthType[`${month}::achd_ep`] || 0;
    const expectedPcicu = exceptionMonthSet.has(month) ? 0 : 1;

    if (consultCount !== 1) slotCountErrors.push(`${month} has ${consultCount} consult fellows`);
    if (cathCount !== 1) slotCountErrors.push(`${month} has ${cathCount} cath fellows`);
    if (imagingCount < 1) slotCountErrors.push(`${month} has no imaging fellow`);
    if (pcicuCount !== expectedPcicu) slotCountErrors.push(`${month} has ${pcicuCount} PCICU fellows, expected ${expectedPcicu}`);
    if (achdCount > 1) slotCountErrors.push(`${month} has ${achdCount} ACHD/EP fellows`);
  });

  const uniqueSlotErrors = slotCountErrors.filter((item, index, list) => list.indexOf(item) === index);

  checks.push({
    ok: rotationCoverageErrors.length === 0,
    label: "Monthly rotation coverage",
    detail: rotationCoverageErrors.length === 0
      ? "Every fellow has exactly one rotation in each month."
      : rotationCoverageErrors.slice(0, 3).join(" | "),
  });
  checks.push({
    ok: uniqueSlotErrors.length === 0,
    label: "Rotation slot counts",
    detail: uniqueSlotErrors.length === 0
      ? "Monthly consult, cath, imaging, PCICU, and ACHD/EP slot counts are valid."
      : uniqueSlotErrors.slice(0, 3).join(" | "),
  });
  checks.push({
    ok: julyImagingErrors.length === 0,
    label: "July first-year fellow imaging",
    detail: julyImagingErrors.length === 0
      ? `Both first-year fellows (PGY-4) are on imaging in ${firstMonthLabel}.`
      : julyImagingErrors.slice(0, 3).join(" | "),
  });
  checks.push({
    ok: rotationQuotaErrors.length === 0,
    label: "Rotation quotas",
    detail: rotationQuotaErrors.length === 0
      ? "Each fellow matches the required PGY rotation totals."
      : rotationQuotaErrors.slice(0, 3).join(" | "),
  });
  checks.push({
    ok: consecutiveRotationErrors.length === 0,
    label: "Consecutive non-research rotations",
    detail: consecutiveRotationErrors.length === 0
      ? "No fellow repeats a non-research rotation in back-to-back months."
      : consecutiveRotationErrors.slice(0, 3).join(" | "),
  });

  while (cur.isSameOrBefore(endDate)) {
    const dateStr = cur.format(DATE_FMT);
    const month = cur.format("YYYY-MM");
    const assigned = byDate[dateStr];
    if (!assigned) missing.push(dateStr);

    if (cur.day() === 1 && !holidayCoveredDates.has(dateStr) && assigned !== consultByMonth[month]) {
      mondayErrors.push(`${dateStr}: expected ${consultByMonth[month]}, got ${assigned}`);
    }

    if (cur.day() === 2 && !holidayCoveredDates.has(dateStr)) {
      const expected = exceptionMonthSet.has(month) ? consultByMonth[month] : pcicuByMonth[month];
      if (assigned !== expected) {
        tuesdayErrors.push(`${dateStr}: expected ${expected}, got ${assigned}`);
      }
    }

    if (holidayStartMap[dateStr]) {
      const holiday = holidayStartMap[dateStr];
      const endMoment = moment(holiday.end, DATE_FMT);
      const dates = [];
      const tmp = cur.clone();
      while (tmp.isSameOrBefore(endMoment)) {
        dates.push(byDate[tmp.format(DATE_FMT)]);
        tmp.add(1, "day");
      }
      if (new Set(dates).size !== 1) {
        weekendErrors.push(`${holiday.label}: holiday block does not stay with one fellow`);
      }
      if (dates[0]) {
        weekendAssignments.push({ start: dateStr, fellow: dates[0], label: holiday.label });
      }
      if (dates[0] === consultByMonth[month]) {
        consultWeekendErrors.push(`${holiday.label}: consult fellow ${dates[0]} was assigned the holiday weekend`);
      }
      if (dates[0] === pcicuByMonth[month]) {
        pcicuWeekendErrors.push(`${holiday.label}: PCICU fellow ${dates[0]} was assigned the holiday weekend`);
      }
    } else if (majorHolidayStartMap[dateStr]) {
      const majorHoliday = majorHolidayStartMap[dateStr];
      const endMoment = moment(majorHoliday.end, DATE_FMT);
      const dates = [];
      const tmp = cur.clone();

      let containsFriday = false;
      const scan = cur.clone();
      while (scan.isSameOrBefore(endMoment)) {
        if (scan.day() === 5) {
          containsFriday = true;
          break;
        }
        scan.add(1, "day");
      }

      while (tmp.isSameOrBefore(endMoment)) {
        dates.push(byDate[tmp.format(DATE_FMT)]);
        tmp.add(1, "day");
      }
      if (new Set(dates).size !== 1) {
        majorHolidayErrors.push(`${majorHoliday.label}: holiday half does not stay with one fellow`);
      }
      if (containsFriday && dates[0]) {
        weekendAssignments.push({ start: dateStr, fellow: dates[0], label: majorHoliday.label });
      }
    } else if (
      cur.day() === 5
      && !holidayCoveredDates.has(dateStr)
      && cur.clone().add(2, "days").isSameOrBefore(endDate)
    ) {
      const fri = assigned;
      const sat = byDate[cur.clone().add(1, "day").format(DATE_FMT)];
      const sun = byDate[cur.clone().add(2, "day").format(DATE_FMT)];
      if (fri !== sat || fri !== sun) {
        weekendErrors.push(`${dateStr}: Fri=${fri}, Sat=${sat}, Sun=${sun}`);
      }
      if (fri) {
        weekendAssignments.push({ start: dateStr, fellow: fri, label: dateStr });
      }
      blockStartByDate[dateStr] = dateStr;
      blockStartByDate[cur.clone().add(1, "day").format(DATE_FMT)] = dateStr;
      blockStartByDate[cur.clone().add(2, "day").format(DATE_FMT)] = dateStr;
      if (fri === consultByMonth[month]) {
        consultWeekendErrors.push(`${dateStr}: consult fellow ${fri} was assigned a weekend`);
      }
      if (fri === pcicuByMonth[month]) {
        pcicuWeekendErrors.push(`${dateStr}: PCICU fellow ${fri} was assigned a weekend`);
      }
    }

    if (cur.day() === 4 && cathByMonth[month] && assigned === cathByMonth[month]) {
      cathThursdayMatches.push(dateStr);
    }

    if (cur.day() === 4 && !holidayCoveredDates.has(dateStr)) {
      const thursdayFellow = assigned;
      const nextFriday = cur.clone().add(1, "day").format(DATE_FMT);
      const fridayBlockStart = blockStartByDate[nextFriday] || nextFriday;
      const fridayFellow = byDate[fridayBlockStart];
      if (thursdayFellow && fridayFellow === thursdayFellow) {
        thursdayWeekendErrors.push(`${dateStr}: ${thursdayFellow} also took the following weekend`);
      }
    }

    cur.add(1, "day");
  }

  (holidayWeekends || []).forEach((item) => {
    holidayCounts[item.fellow] = (holidayCounts[item.fellow] || 0) + 1;
  });
  (majorHolidays || []).forEach((item) => {
    majorHolidayCounts[item.fellow] = (majorHolidayCounts[item.fellow] || 0) + 1;
  });

  const majorHolidayCoverageCounts = Object.fromEntries(
    Object.keys(DEFAULT_MAJOR_HOLIDAY_BLOCKS).map((holiday) => [holiday, 0]),
  );
  (majorHolidays || []).forEach((item) => {
    majorHolidayCoverageCounts[item.holiday] = (majorHolidayCoverageCounts[item.holiday] || 0) + 1;
  });

  weekendAssignments
    .sort((a, b) => moment(a.start, DATE_FMT).valueOf() - moment(b.start, DATE_FMT).valueOf())
    .forEach((assignment, index, list) => {
      if (index === 0) return;
      const previous = list[index - 1];
      if (previous.fellow === assignment.fellow) {
        consecutiveWeekendErrors.push(
          `${assignment.fellow} worked consecutive weekends starting ${previous.start} and ${assignment.start}`,
        );
      }
    });

  const scheduleByDate = [...schedule].sort(
    (a, b) => moment(a.date, DATE_FMT).valueOf() - moment(b.date, DATE_FMT).valueOf(),
  );
  for (let i = 0; i < scheduleByDate.length - 1; i += 1) {
    const current = scheduleByDate[i];
    const next = scheduleByDate[i + 1];
    const currentMoment = moment(current.date, DATE_FMT);
    const nextMoment = moment(next.date, DATE_FMT);
    if (nextMoment.diff(currentMoment, "days") !== 1) continue;
    if (current.fellow !== next.fellow) continue;

    const currentBlock = blockStartByDate[current.date];
    const nextBlock = blockStartByDate[next.date];
    if (currentBlock && currentBlock === nextBlock) continue;

    const isAllowedConsultException =
      currentMoment.day() === 1
      && nextMoment.day() === 2
      && exceptionMonthSet.has(currentMoment.format("YYYY-MM"))
      && current.fellow === consultByMonth[currentMoment.format("YYYY-MM")];

    if (!isAllowedConsultException) {
      consecutiveCallErrors.push(
        `${current.fellow} worked consecutive call days on ${current.date} and ${next.date}`,
      );
    }
  }

  checks.push({
    ok: missing.length === 0,
    label: "Coverage",
    detail: missing.length === 0 ? "Every day has an assignment." : `Missing dates: ${missing.slice(0, 5).join(", ")}`,
    suggestion: missing.length === 0 ? "" : "Adjust vacations, holiday-half dates, or exception months so every day has an assigned fellow.",
  });
  checks.push({
    ok: researchRunErrors.length === 0,
    label: "Research streaks",
    detail: researchRunErrors.length === 0
      ? "No fellow has more than two consecutive research months."
      : researchRunErrors.slice(0, 3).join(" | "),
    suggestion: researchRunErrors.length === 0 ? "" : "Swap one of the research months with imaging, cath, ACHD/EP, consult, or PCICU to break the streak.",
  });
  checks.push({
    ok: majorHolidayErrors.length === 0,
    label: "Major holiday blocks",
    detail: majorHolidayErrors.length === 0 ? "All major holiday halves stay together." : majorHolidayErrors.slice(0, 3).join(" | "),
    suggestion: majorHolidayErrors.length === 0 ? "" : "Adjust the major holiday half dates or regenerate so each half stays with one fellow.",
  });
  checks.push({
    ok: mondayErrors.length === 0,
    label: "Consult Mondays",
    detail: mondayErrors.length === 0 ? "All Mondays go to the consult fellow." : mondayErrors.slice(0, 3).join(" | "),
    suggestion: mondayErrors.length === 0 ? "" : "Change the monthly consult assignments or regenerate with fewer conflicting vacations.",
  });
  checks.push({
    ok: tuesdayErrors.length === 0,
    label: "Tuesday rule",
    detail: tuesdayErrors.length === 0 ? "All Tuesdays follow the PCICU/consult rule." : tuesdayErrors.slice(0, 3).join(" | "),
    suggestion: tuesdayErrors.length === 0 ? "" : "Revisit the selected PCICU exception months or monthly PCICU/consult assignments.",
  });
  checks.push({
    ok: weekendErrors.length === 0,
    label: "Weekend blocks",
    detail: weekendErrors.length === 0 ? "All Friday-Sunday blocks stay together." : weekendErrors.slice(0, 3).join(" | "),
    suggestion: weekendErrors.length === 0 ? "" : "Regenerate so each weekend or holiday block stays with a single fellow.",
  });
  checks.push({
    ok: consecutiveWeekendErrors.length === 0,
    label: "Consecutive weekends",
    detail: consecutiveWeekendErrors.length === 0
      ? "No fellow is assigned to back-to-back weekends."
      : consecutiveWeekendErrors.slice(0, 3).join(" | "),
    suggestion: consecutiveWeekendErrors.length === 0 ? "" : "Try different vacations or holiday-half dates so weekend coverage can be redistributed.",
  });
  checks.push({
    ok: consecutiveCallErrors.length === 0,
    label: "Consecutive call days",
    detail: consecutiveCallErrors.length === 0
      ? "No fellow is assigned to back-to-back call days outside allowed blocks."
      : consecutiveCallErrors.slice(0, 3).join(" | "),
    suggestion: consecutiveCallErrors.length === 0 ? "" : "Reduce conflicting vacations or adjust exception months so consecutive call can be reassigned.",
  });
  checks.push({
    ok: consultWeekendErrors.length === 0,
    label: "Consult weekends",
    detail: consultWeekendErrors.length === 0 ? "Consult fellows are excluded from weekend call." : consultWeekendErrors.slice(0, 3).join(" | "),
    suggestion: consultWeekendErrors.length === 0 ? "" : "Move that fellow off consult in the affected month or relax other schedule pressure by adjusting vacations.",
  });
  checks.push({
    ok: pcicuWeekendErrors.length === 0,
    label: "PCICU weekends",
    detail: pcicuWeekendErrors.length === 0 ? "PCICU fellows are excluded from weekend call in their PCICU month." : pcicuWeekendErrors.slice(0, 3).join(" | "),
    suggestion: pcicuWeekendErrors.length === 0 ? "" : "Adjust monthly PCICU assignments or vacation timing so weekends can be covered by a different fellow.",
  });
  checks.push({
    ok: thursdayWeekendErrors.length === 0,
    label: "Thursday to weekend",
    detail: thursdayWeekendErrors.length === 0 ? "No Thursday call fellow also takes the following weekend block, including holiday weekends." : thursdayWeekendErrors.slice(0, 3).join(" | "),
    suggestion: thursdayWeekendErrors.length === 0 ? "" : "Reassign the Thursday call or the following weekend block to a different fellow.",
  });
  checks.push({
    ok: true,
    label: "Cath Thursdays",
    detail: `${cathThursdayMatches.length} Thursday(s) matched the monthly cath fellow.`,
  });
  checks.push({
    ok: Object.values(holidayCounts).every((count) => count === 1),
    label: "Holiday weekends",
    detail: (holidayWeekends || []).map((item) => `${item.label}: ${item.fellow}`).join(", "),
    suggestion: Object.values(holidayCounts).every((count) => count === 1) ? "" : "Regenerate so each fellow receives exactly one holiday weekend assignment.",
  });
  checks.push({
    ok: fellows.every((fellow) => majorHolidayCounts[fellow] === 1) && Object.values(majorHolidayCoverageCounts).every((count) => count === 2),
    label: "Major holidays",
    detail: (majorHolidays || []).map((item) => `${item.label}: ${item.fellow}`).join(", "),
    suggestion: fellows.every((fellow) => majorHolidayCounts[fellow] === 1) && Object.values(majorHolidayCoverageCounts).every((count) => count === 2)
      ? ""
      : "Adjust the major holiday half dates or regenerate so each fellow receives exactly one major-holiday half and each holiday has two halves covered.",
  });

  return checks;
}
