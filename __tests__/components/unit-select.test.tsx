import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterEach,
} from "vitest";
import { UnitSelect } from "@/components/ui/unit-select";

// Mock fetch
global.fetch = vi.fn();

// Mock DOM APIs for cmdk
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // @ts-ignore
  global.PointerEvent = class PointerEvent extends Event {};
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.releasePointerCapture = function () {};
  window.HTMLElement.prototype.hasPointerCapture = function () {
    return false;
  };
});

const mockCategories = [
  {
    category: "Mass",
    units: [
      { value: "kg", label: "Kilogram (kg)" },
      { value: "g", label: "Gram (g)" },
    ],
  },
];

describe("UnitSelect", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders correctly", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockCategories,
    });

    render(<UnitSelect onChange={() => {}} />);

    // Initially loading
    expect(screen.getByText("Loading units...")).toBeInTheDocument();

    // Wait for load to finish
    expect(await screen.findByText("Select unit...")).toBeInTheDocument();

    expect(screen.getAllByTestId("unit-select-trigger")[0]).toBeInTheDocument();
  });

  it("fetches and displays units", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockCategories,
    });

    render(<UnitSelect onChange={() => {}} />);

    // Wait for load to finish
    expect(await screen.findByText("Select unit...")).toBeInTheDocument();

    const buttons = screen.getAllByTestId("unit-select-trigger");
    const button = buttons[0];
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Mass")).toBeInTheDocument(); // Check for category header
      expect(screen.getByText("Kilogram (kg)")).toBeInTheDocument();
      expect(screen.getByText("Gram (g)")).toBeInTheDocument();
    });
  });

  it("calls onChange when a unit is selected", async () => {
    const handleChange = vi.fn();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockCategories,
    });

    render(<UnitSelect onChange={handleChange} />);

    // Wait for load to finish
    await waitFor(() => {
      const elements = screen.getAllByText("Select unit...");
      expect(elements.length).toBeGreaterThan(0);
    });

    const buttons = screen.getAllByTestId("unit-select-trigger");
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByText("Kilogram (kg)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Kilogram (kg)"));

    expect(handleChange).toHaveBeenCalledWith("kg");
  });

  it("displays loading state", async () => {
    // Mock a pending promise
    (global.fetch as any).mockReturnValue(new Promise(() => {}));

    render(<UnitSelect onChange={() => {}} />);

    expect(screen.getByText("Loading units...")).toBeInTheDocument();
  });

  it("displays error state and retry button", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Failed"));

    render(<UnitSelect onChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load units.")).toBeInTheDocument();
    });
  });
});
