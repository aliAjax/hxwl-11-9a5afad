import { describe, it, expect } from "vitest";
import { parseLocalDate, startOfLocalDay } from "../utils/dateUtils";

describe("parseLocalDate", () => {
  it("parses a valid date string into a Date object", () => {
    const result = parseLocalDate("2025-06-15");
    expect(result.getFullYear()).toBe(2025);
    expect(result.getDate()).toBe(15);
  });

  it("creates date in local timezone with month 0-indexed", () => {
    const result = parseLocalDate("2025-01-15");
    expect(result.getMonth()).toBe(0);
    const result2 = parseLocalDate("2025-12-15");
    expect(result2.getMonth()).toBe(11);
  });
});

describe("startOfLocalDay", () => {
  it("strips time components to midnight", () => {
    const date = new Date(2025, 5, 15, 14, 30, 45, 500);
    const result = startOfLocalDay(date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it("preserves date components", () => {
    const date = new Date(2025, 5, 15, 14, 30, 45);
    const result = startOfLocalDay(date);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(15);
  });
});
