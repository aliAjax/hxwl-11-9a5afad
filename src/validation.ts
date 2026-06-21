export const NUMBER_REGEX = /^[+-]?\d+(\.\d+)?$/;
export const POSITIVE_NUMBER_REGEX = /^\d+(\.\d+)?$/;
export const NON_NEGATIVE_INTEGER_REGEX = /^\d+$/;

export function isValidNumberFormat(value: string, allowSign: boolean = true): boolean {
  if (!value.trim()) return false;
  const regex = allowSign ? NUMBER_REGEX : POSITIVE_NUMBER_REGEX;
  return regex.test(value.trim());
}

export function parseSafeNumber(value: string): number | null {
  if (!isValidNumberFormat(value)) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

export function cleanNumber(value: string, allowSign: boolean = true): string {
  if (allowSign) {
    return value.replace(/[^0-9.+\-]/g, "").replace(/(?!^)[+-]/g, "").replace(/(\..*)\./g, "$1");
  } else {
    return value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
  }
}

export function isQuarterStep(value: string): boolean {
  if (!value || value === "-" || value === "+" || value === "." || value === "-." || value === "+.") return true;
  if (!isValidNumberFormat(value)) return false;
  const num = parseSafeNumber(value);
  if (num === null) return false;
  return Math.abs(num * 4 - Math.round(num * 4)) < 0.001;
}

export interface FieldError {
  message: string;
}

export function validateVision(value: string): FieldError | undefined {
  if (!value.trim()) return { message: "必填" };
  if (!isValidNumberFormat(value, false)) return { message: "请输入正数" };
  const num = parseSafeNumber(value);
  if (num === null || num <= 0 || num > 2.0) return { message: "范围0.01~2.0" };
  return undefined;
}

export function validateSphere(value: string): FieldError | undefined {
  if (!value.trim()) return { message: "必填" };
  if (!isValidNumberFormat(value, true)) return { message: "请输入有效数字" };
  const num = parseSafeNumber(value);
  if (num === null) return { message: "请输入有效数字" };
  if (num < -20 || num > 20) return { message: "范围-20~+20D" };
  if (!isQuarterStep(value)) return { message: "需0.25D步进" };
  return undefined;
}

export function validateCylinder(value: string): FieldError | undefined {
  if (!value.trim()) return { message: "必填" };
  if (!isValidNumberFormat(value, true)) return { message: "请输入有效数字" };
  const num = parseSafeNumber(value);
  if (num === null) return { message: "请输入有效数字" };
  if (num < -10 || num > 10) return { message: "范围-10~+10D" };
  if (!isQuarterStep(value)) return { message: "需0.25D步进" };
  return undefined;
}

export function validateAxis(value: string, hasCylinder: boolean): FieldError | undefined {
  if (!hasCylinder && !value.trim()) return undefined;
  if (hasCylinder && !value.trim()) return { message: "有柱镜时必填" };
  if (!value.trim()) return undefined;
  if (!NON_NEGATIVE_INTEGER_REGEX.test(value.trim())) return { message: "请输入正整数" };
  const num = parseSafeNumber(value);
  if (num === null) return { message: "请输入有效数字" };
  if (num < 0 || num > 180) return { message: "范围0~180°" };
  return undefined;
}

export function validateAdd(value: string): FieldError | undefined {
  if (!value.trim()) return undefined;
  if (!isValidNumberFormat(value, true)) return { message: "请输入有效数字" };
  const num = parseSafeNumber(value);
  if (num === null) return { message: "请输入有效数字" };
  if (num < 0 || num > 4) return { message: "范围0~+4.00D" };
  if (!isQuarterStep(value)) return { message: "需0.25D步进" };
  return undefined;
}

export function validatePd(value: string): FieldError | undefined {
  if (!value.trim()) return { message: "必填" };
  if (!isValidNumberFormat(value, false)) return { message: "请输入正数" };
  const num = parseSafeNumber(value);
  if (num === null) return { message: "请输入有效数字" };
  if (num < 40 || num > 80) return { message: "范围40~80mm" };
  return undefined;
}

export function validateCurvature(value: string): FieldError | undefined {
  if (!value.trim()) return undefined;
  if (!isValidNumberFormat(value, false)) return { message: "请输入正数" };
  const num = parseSafeNumber(value);
  if (num === null) return { message: "请输入有效数字" };
  if (num < 35 || num > 50) return { message: "范围35~50D" };
  if (!isQuarterStep(value)) return { message: "需0.25D步进" };
  return undefined;
}
