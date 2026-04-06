import { fireEvent, render, screen } from "@testing-library/react";

import App from "./App";

test("renders fellowship scheduler heading", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /fellowship scheduler/i })).toBeInTheDocument();
});

test("renders final calendar tab without crashing", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /final calendar/i }));
  expect(screen.getByText(/generate a schedule from the scheduler tab/i)).toBeInTheDocument();
});
