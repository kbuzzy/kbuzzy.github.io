# Frontend

This frontend is a React application for configuring fellowship scheduling inputs, calling the FastAPI backend, visualizing the solved schedule, and exporting calendar data.

## Structure

Key files under [src](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src):

- [App.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/App.js): top-level page layout
- [hooks/useScheduler.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/hooks/useScheduler.js): API orchestration, retries, persistence, and result state
- [components/FormSections.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/components/FormSections.js): roster, vacation, holiday, and rule configuration UI
- [components/ResultSections.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/components/ResultSections.js): solved schedule, validation, holiday, and rotation output UI
- [config/schedule.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/config/schedule.js): constants such as API URL, default roster, and default exception months
- [utils/schedule.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/utils/schedule.js): schedule helpers, event building, and default fixture creation
- [utils/validation.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/utils/validation.js): validation fallback when backend validation is unavailable
- [utils/exportWorkbook.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/utils/exportWorkbook.js): workbook export helpers

## Data Flow

The frontend sends scheduling inputs to `POST /schedule` and expects:

- `schedule`
- `rotations`
- `holiday_weekends`
- `major_holidays`
- `validation`

When present, backend `validation` is used directly. Backend `schedule` items also include:

- `call_type`
- `is_in_house`

Those fields are preferred over frontend date inference.

## Local Development

From [frontend](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend):

```bash
npm install
npm start
```

The app opens at [http://localhost:3000](http://localhost:3000).

## Tests

Run the frontend test suite with:

```bash
npm test -- --watch=false
```

Current test coverage includes:

- [App.test.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/App.test.js)
- [schedule.test.js](/Users/kilianburke/Desktop/fellowship-scheduler-clean/frontend/src/utils/schedule.test.js)
