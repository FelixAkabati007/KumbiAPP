import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);
const ensureLocalStorage = () => {
  const store = new Map<string, string>();
  const mock = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  const ls: unknown = (globalThis as unknown as { localStorage?: unknown })
    .localStorage;
  const isBroken =
    !ls ||
    typeof (ls as { getItem?: unknown }).getItem !== "function" ||
    typeof (ls as { setItem?: unknown }).setItem !== "function";
  if (isBroken) {
    (globalThis as unknown as { localStorage: unknown }).localStorage = mock;
  }
};
ensureLocalStorage();
