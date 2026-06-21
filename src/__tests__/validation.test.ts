import { describe, it, expect } from "vitest";
import {
  isQuarterStep,
  isValidNumberFormat,
  parseSafeNumber,
  validateSphere,
  validateCylinder,
  validateAxis,
  validatePd,
} from "../validation";

describe("isQuarterStep", () => {
  it("returns true for valid 0.25D step values", () => {
    expect(isQuarterStep("0")).toBe(true);
    expect(isQuarterStep("0.25")).toBe(true);
    expect(isQuarterStep("0.5")).toBe(true);
    expect(isQuarterStep("0.75")).toBe(true);
    expect(isQuarterStep("1")).toBe(true);
    expect(isQuarterStep("1.25")).toBe(true);
    expect(isQuarterStep("-0.25")).toBe(true);
    expect(isQuarterStep("-0.5")).toBe(true);
    expect(isQuarterStep("-0.75")).toBe(true);
    expect(isQuarterStep("-1")).toBe(true);
    expect(isQuarterStep("-20")).toBe(true);
    expect(isQuarterStep("20")).toBe(true);
  });

  it("returns false for non-0.25D step values", () => {
    expect(isQuarterStep("0.1")).toBe(false);
    expect(isQuarterStep("0.3")).toBe(false);
    expect(isQuarterStep("0.15")).toBe(false);
    expect(isQuarterStep("1.1")).toBe(false);
    expect(isQuarterStep("-0.1")).toBe(false);
    expect(isQuarterStep("-0.3")).toBe(false);
    expect(isQuarterStep("0.33")).toBe(false);
  });

  it("returns true for partial/in-progress input strings", () => {
    expect(isQuarterStep("")).toBe(true);
    expect(isQuarterStep("-")).toBe(true);
    expect(isQuarterStep("+")).toBe(true);
    expect(isQuarterStep(".")).toBe(true);
    expect(isQuarterStep("-.")).toBe(true);
    expect(isQuarterStep("+.")).toBe(true);
  });
});

describe("isValidNumberFormat", () => {
  it("accepts signed numbers when allowSign=true", () => {
    expect(isValidNumberFormat("-2.25", true)).toBe(true);
    expect(isValidNumberFormat("+1.5", true)).toBe(true);
    expect(isValidNumberFormat("0.75", true)).toBe(true);
    expect(isValidNumberFormat("3", true)).toBe(true);
  });

  it("rejects signed numbers when allowSign=false", () => {
    expect(isValidNumberFormat("-2.25", false)).toBe(false);
    expect(isValidNumberFormat("+1.5", false)).toBe(false);
  });

  it("accepts positive-only numbers when allowSign=false", () => {
    expect(isValidNumberFormat("2.25", false)).toBe(true);
    expect(isValidNumberFormat("0.75", false)).toBe(true);
  });

  it("rejects empty or non-numeric", () => {
    expect(isValidNumberFormat("", true)).toBe(false);
    expect(isValidNumberFormat("abc", true)).toBe(false);
    expect(isValidNumberFormat("1.2.3", true)).toBe(false);
  });
});

describe("parseSafeNumber", () => {
  it("parses valid number strings", () => {
    expect(parseSafeNumber("-2.25")).toBe(-2.25);
    expect(parseSafeNumber("0.75")).toBe(0.75);
    expect(parseSafeNumber("5")).toBe(5);
  });

  it("returns null for invalid input", () => {
    expect(parseSafeNumber("abc")).toBeNull();
    expect(parseSafeNumber("")).toBeNull();
    expect(parseSafeNumber("1.2.3")).toBeNull();
  });
});

describe("validateSphere", () => {
  it("accepts valid sphere values with 0.25D steps", () => {
    expect(validateSphere("-2.25")).toBeUndefined();
    expect(validateSphere("-20")).toBeUndefined();
    expect(validateSphere("20")).toBeUndefined();
    expect(validateSphere("0")).toBeUndefined();
    expect(validateSphere("-0.25")).toBeUndefined();
    expect(validateSphere("+1.5")).toBeUndefined();
    expect(validateSphere("-0.75")).toBeUndefined();
  });

  it("rejects empty input", () => {
    const err = validateSphere("");
    expect(err).toBeDefined();
    expect(err!.message).toBe("必填");
  });

  it("rejects non-numeric input", () => {
    const err = validateSphere("abc");
    expect(err).toBeDefined();
    expect(err!.message).toBe("请输入有效数字");
  });

  it("rejects out-of-range sphere values", () => {
    const err1 = validateSphere("-20.25");
    expect(err1).toBeDefined();
    expect(err1!.message).toBe("范围-20~+20D");

    const err2 = validateSphere("20.25");
    expect(err2).toBeDefined();
    expect(err2!.message).toBe("范围-20~+20D");
  });

  it("rejects non-0.25D step sphere values", () => {
    const err = validateSphere("-2.3");
    expect(err).toBeDefined();
    expect(err!.message).toBe("需0.25D步进");
  });

  it("rejects sphere value with 0.1D step", () => {
    const err = validateSphere("1.1");
    expect(err).toBeDefined();
    expect(err!.message).toBe("需0.25D步进");
  });
});

describe("validateCylinder", () => {
  it("accepts valid cylinder values with 0.25D steps", () => {
    expect(validateCylinder("-0.25")).toBeUndefined();
    expect(validateCylinder("-0.5")).toBeUndefined();
    expect(validateCylinder("-0.75")).toBeUndefined();
    expect(validateCylinder("-1")).toBeUndefined();
    expect(validateCylinder("0")).toBeUndefined();
    expect(validateCylinder("+0.25")).toBeUndefined();
    expect(validateCylinder("-10")).toBeUndefined();
    expect(validateCylinder("10")).toBeUndefined();
  });

  it("rejects empty input", () => {
    const err = validateCylinder("");
    expect(err).toBeDefined();
    expect(err!.message).toBe("必填");
  });

  it("rejects out-of-range cylinder values", () => {
    const err1 = validateCylinder("-10.25");
    expect(err1).toBeDefined();
    expect(err1!.message).toBe("范围-10~+10D");

    const err2 = validateCylinder("10.25");
    expect(err2).toBeDefined();
    expect(err2!.message).toBe("范围-10~+10D");
  });

  it("rejects non-0.25D step cylinder values", () => {
    const err = validateCylinder("-0.3");
    expect(err).toBeDefined();
    expect(err!.message).toBe("需0.25D步进");
  });
});

describe("validateAxis", () => {
  it("accepts valid axis values within 0-180", () => {
    expect(validateAxis("0", true)).toBeUndefined();
    expect(validateAxis("90", true)).toBeUndefined();
    expect(validateAxis("180", true)).toBeUndefined();
    expect(validateAxis("1", true)).toBeUndefined();
  });

  it("returns undefined for empty axis when no cylinder", () => {
    expect(validateAxis("", false)).toBeUndefined();
  });

  it("requires axis when cylinder is present", () => {
    const err = validateAxis("", true);
    expect(err).toBeDefined();
    expect(err!.message).toBe("有柱镜时必填");
  });

  it("rejects axis above 180", () => {
    const err = validateAxis("181", true);
    expect(err).toBeDefined();
    expect(err!.message).toBe("范围0~180°");
  });

  it("rejects negative axis", () => {
    const err = validateAxis("-5", true);
    expect(err).toBeDefined();
    expect(err!.message).toContain("正整数");
  });

  it("rejects decimal axis", () => {
    const err = validateAxis("90.5", true);
    expect(err).toBeDefined();
    expect(err!.message).toContain("正整数");
  });

  it("rejects non-numeric axis", () => {
    const err = validateAxis("abc", true);
    expect(err).toBeDefined();
  });
});

describe("validatePd", () => {
  it("accepts valid PD values within 40-80mm", () => {
    expect(validatePd("40")).toBeUndefined();
    expect(validatePd("60")).toBeUndefined();
    expect(validatePd("80")).toBeUndefined();
    expect(validatePd("55.5")).toBeUndefined();
    expect(validatePd("62.25")).toBeUndefined();
  });

  it("rejects empty input", () => {
    const err = validatePd("");
    expect(err).toBeDefined();
    expect(err!.message).toBe("必填");
  });

  it("rejects PD below 40mm", () => {
    const err = validatePd("39");
    expect(err).toBeDefined();
    expect(err!.message).toBe("范围40~80mm");
  });

  it("rejects PD above 80mm", () => {
    const err = validatePd("81");
    expect(err).toBeDefined();
    expect(err!.message).toBe("范围40~80mm");
  });

  it("rejects negative PD", () => {
    const err = validatePd("-50");
    expect(err).toBeDefined();
    expect(err!.message).toBe("请输入正数");
  });
});
