/* eslint-disable @typescript-eslint/no-explicit-any */
// Polyfill for localStorage in environments where it exists but is broken (e.g. Node with certain configs)
// This file is imported in app/layout.tsx to run on the server (Node.js)

if (
  typeof global.localStorage === "undefined" ||
  typeof global.localStorage.getItem !== "function"
) {
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null,
  } as any;
}

export {};
