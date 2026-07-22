import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// vitest.config.ts doesn't set `test.globals: true`, so React Testing
// Library's own auto-cleanup (which looks for a global `afterEach`) never
// registers - explicitly wiring it here so component tests don't leak
// DOM nodes between `it` blocks.
afterEach(() => {
  cleanup();
});
