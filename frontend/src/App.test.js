import { render, screen } from "@testing-library/react";

import App from "./App";

test("renders fellowship scheduler heading", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /fellowship scheduler/i })).toBeInTheDocument();
});
