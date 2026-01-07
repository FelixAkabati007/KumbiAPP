import "@testing-library/jest-dom";

import { expect } from "vitest";

expect.extend({
  toBeInTheDocument(received) {
    const pass = received !== null;
    return {
      pass,
      message: () =>
        `expected ${received} ${pass ? "not " : ""}to be in the document`,
    };
  },
  toBeEnabled(received) {
    const pass = !received.hasAttribute("disabled");
    return {
      pass,
      message: () => `expected ${received} ${pass ? "not " : ""}to be enabled`,
    };
  },
});
