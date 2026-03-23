import moment from "moment";

import { DATE_FMT } from "../config/schedule";
import {
  buildMajorHolidayRows,
  buildVacationRows,
  buildWeekendAssignmentRows,
  escapeXml,
  fellowColor,
  getCallType,
  tintHex,
} from "./schedule";

export function exportCalendarWorkbook(
  schedule,
  startStr,
  endStr,
  roster,
  vacations,
  holidayWeekends,
  majorHolidayAssignments,
  majorHolidayBlocks,
  exceptionMonths,
  options = {},
) {
  const { download = true } = options;
  const byDate = {};
  const scheduleByDate = {};
  for (const item of schedule) {
    byDate[item.date] = item.fellow;
    scheduleByDate[item.date] = item;
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const styles = [
    '<Style ss:ID="default"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>',
    '<Style ss:ID="monthHeader"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:Bold="1" ss:Size="14"/><Interior ss:Color="#e9ecef" ss:Pattern="Solid"/></Style>',
    '<Style ss:ID="dayHeader"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:Bold="1"/><Interior ss:Color="#f1f3f5" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>',
    '<Style ss:ID="sectionHeader"><Font ss:Bold="1" ss:Size="12"/><Interior ss:Color="#dbe4f0" ss:Pattern="Solid"/></Style>',
    '<Style ss:ID="tableHeader"><Font ss:Bold="1"/><Interior ss:Color="#eef2f7" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>',
  ];

  roster.forEach((fellow, index) => {
    const color = fellowColor(index);
    styles.push(
      `<Style ss:ID="fellow_${index}"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="${color}" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>`,
    );
    styles.push(
      `<Style ss:ID="fellow_tint_${index}"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Interior ss:Color="${tintHex(color, 0.8)}" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>`,
    );
  });

  const monthSheets = [];
  let monthCursor = moment(startStr, DATE_FMT).startOf("month");
  const windowEnd = moment(endStr, DATE_FMT);

  while (monthCursor.isSameOrBefore(windowEnd, "month")) {
    const rows = [];
    rows.push(`<Row><Cell ss:MergeAcross="6" ss:StyleID="monthHeader"><Data ss:Type="String">${escapeXml(monthCursor.format("MMMM YYYY"))}</Data></Cell></Row>`);
    rows.push(`<Row>${dayNames.map((dayName) => (
      `<Cell ss:StyleID="dayHeader"><Data ss:Type="String">${escapeXml(dayName)}</Data></Cell>`
    )).join("")}</Row>`);

    let currentWeek = new Array(7).fill(null);
    let col = monthCursor.clone().startOf("month").day();

    for (let day = 1; day <= monthCursor.daysInMonth(); day += 1) {
      const date = monthCursor.clone().date(day);
      const dateStr = date.format(DATE_FMT);
      let label = String(day);
      let styleId = "default";
      if (byDate[dateStr]) {
        const fellowIndex = roster.findIndex((fellow) => fellow.name.trim() === byDate[dateStr]);
        const callType = scheduleByDate[dateStr]?.call_type || getCallType(dateStr, exceptionMonths, majorHolidayBlocks);
        label += `\n${byDate[dateStr]}\n${callType}`;
        styleId = fellowIndex >= 0 ? `fellow_${fellowIndex}` : "default";
      }
      currentWeek[col] = { value: label, styleId };
      col += 1;
      if (col === 7) {
        rows.push(`<Row ss:AutoFitHeight="0" ss:Height="54">${currentWeek.map((cell) => {
          if (!cell) {
            return '<Cell ss:StyleID="default"><Data ss:Type="String"></Data></Cell>';
          }
          return `<Cell ss:StyleID="${cell.styleId}"><Data ss:Type="String">${escapeXml(cell.value)}</Data></Cell>`;
        }).join("")}</Row>`);
        currentWeek = new Array(7).fill(null);
        col = 0;
      }
    }

    if (col > 0) {
      rows.push(`<Row ss:AutoFitHeight="0" ss:Height="54">${currentWeek.map((cell) => {
        if (!cell) {
          return '<Cell ss:StyleID="default"><Data ss:Type="String"></Data></Cell>';
        }
        return `<Cell ss:StyleID="${cell.styleId}"><Data ss:Type="String">${escapeXml(cell.value)}</Data></Cell>`;
      }).join("")}</Row>`);
    }

    monthSheets.push(
      `<Worksheet ss:Name="${escapeXml(monthCursor.format("MMM YYYY"))}"><Table>`
      + '<Column ss:Width="115"/><Column ss:Width="140"/><Column ss:Width="140"/><Column ss:Width="140"/><Column ss:Width="140"/><Column ss:Width="140"/><Column ss:Width="140"/>'
      + rows.join("")
      + "</Table></Worksheet>",
    );
    monthCursor.add(1, "month");
  }

  const vacationRows = buildVacationRows(roster, vacations);
  const majorHolidayRows = buildMajorHolidayRows(majorHolidayAssignments);
  const weekendRows = buildWeekendAssignmentRows(schedule, holidayWeekends, startStr, endStr, majorHolidayBlocks);

  const assignmentsRows = [];
  const pushSection = (title, headers, rows) => {
    assignmentsRows.push(`<Row><Cell ss:MergeAcross="${headers.length - 1}" ss:StyleID="sectionHeader"><Data ss:Type="String">${escapeXml(title)}</Data></Cell></Row>`);
    assignmentsRows.push(`<Row>${headers.map((header) => (
      `<Cell ss:StyleID="tableHeader"><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`
    )).join("")}</Row>`);
    if (rows.length === 0) {
      assignmentsRows.push(`<Row><Cell ss:MergeAcross="${headers.length - 1}" ss:StyleID="default"><Data ss:Type="String">None</Data></Cell></Row>`);
    } else {
      rows.forEach((row) => {
        assignmentsRows.push(`<Row>${row.map((cell) => (
          `<Cell ss:StyleID="default"><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`
        )).join("")}</Row>`);
      });
    }
    assignmentsRows.push("<Row></Row>");
  };

  pushSection("Vacation Assignments", ["Fellow", "Vacation Slot", "From", "To"], vacationRows);
  pushSection("Major Holiday Assignments", ["Holiday", "Half", "Start", "End", "Assigned Fellow", "Call Type"], majorHolidayRows);
  pushSection("Three-Day And Holiday Weekend Assignments", ["Assignment", "Start", "End", "Assigned Fellow", "Call Type"], weekendRows);

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
<Styles>${styles.join("")}</Styles>
${monthSheets.join("")}
<Worksheet ss:Name="Assignments"><Table>
<Column ss:Width="160"/><Column ss:Width="120"/><Column ss:Width="120"/><Column ss:Width="120"/><Column ss:Width="160"/><Column ss:Width="120"/>
${assignmentsRows.join("")}
</Table></Worksheet>
</Workbook>`;

  if (!download) {
    return workbook;
  }

  const blob = new Blob([workbook], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fellowship_schedule_export.xls";
  a.click();
  URL.revokeObjectURL(url);
  return workbook;
}
