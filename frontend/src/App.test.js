import { fireEvent, render, screen } from "@testing-library/react";

import App from "./App";
import { RequestSummaryPanel } from "./components/ResultSections";

test("renders fellowship scheduler heading", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /fellowship scheduler/i })).toBeInTheDocument();
});

test("renders final calendar tab without crashing", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /final calendar/i }));
  expect(screen.getByText(/generate a schedule from the scheduler tab/i)).toBeInTheDocument();
});

test("renders malformed request summary entries without crashing", () => {
  render(<RequestSummaryPanel summary={[{ fellowId: "f1", fellow: "Test Fellow", pgy: "PGY-4" }]} />);
  expect(screen.getByText(/test fellow/i)).toBeInTheDocument();
  expect(screen.getByText(/no specific requests were entered for this fellow/i)).toBeInTheDocument();
});
