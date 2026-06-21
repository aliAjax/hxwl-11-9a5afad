import { describe, it, expect } from "vitest";
import { calculateReminder } from "../utils/reminderUtils";
import type { PatientProfile } from "../types/patient";

function makePatient(overrides: Partial<PatientProfile> = {}): PatientProfile {
  return {
    id: "1",
    patientNo: "P001",
    ageGroup: "成人",
    lensType: "单光镜",
    lastCheckDate: "2025-01-01",
    remark: "",
    ...overrides,
  };
}

describe("calculateReminder", () => {
  it("returns normal status when far from next check", () => {
    const patient = makePatient({ lastCheckDate: "2025-01-01" });
    const today = new Date(2025, 0, 10);
    const result = calculateReminder(patient, today);
    expect(result.reminderStatus).toBe("normal");
    expect(result.reminderCycle).toBe(90);
  });

  it("returns upcoming status when within 7 days of next check", () => {
    const patient = makePatient({ lastCheckDate: "2025-01-01" });
    const today = new Date(2025, 2, 28);
    const result = calculateReminder(patient, today);
    expect(result.reminderStatus).toBe("upcoming");
  });

  it("returns overdue status when past next check", () => {
    const patient = makePatient({ lastCheckDate: "2025-01-01" });
    const today = new Date(2025, 6, 1);
    const result = calculateReminder(patient, today);
    expect(result.reminderStatus).toBe("overdue");
  });

  it("uses customCycle instead of default cycle", () => {
    const patient = makePatient({ lastCheckDate: "2025-01-01" });
    const today = new Date(2025, 0, 5);
    const result = calculateReminder(patient, today, 15);
    expect(result.reminderCycle).toBe(15);
    expect(result.reminderStatus).toBe("normal");
  });

  it("uses getReminderCycle based on ageGroup and lensType", () => {
    const patient = makePatient({ ageGroup: "青少年", lensType: "单光镜", lastCheckDate: "2025-01-01" });
    const today = new Date(2025, 0, 10);
    const result = calculateReminder(patient, today);
    expect(result.reminderCycle).toBe(60);
  });

  it("returns upcoming when exactly 7 days until next check", () => {
    const patient = makePatient({ lastCheckDate: "2025-01-01" });
    const nextCheck = new Date(2025, 0, 1);
    nextCheck.setDate(nextCheck.getDate() + 90);
    const today = new Date(nextCheck.getFullYear(), nextCheck.getMonth(), nextCheck.getDate());
    today.setDate(today.getDate() - 7);
    const result = calculateReminder(patient, today);
    expect(result.reminderStatus).toBe("upcoming");
    expect(result.daysUntilNext).toBe(7);
  });

  it("returns upcoming when exactly 0 days until next check", () => {
    const patient = makePatient({ lastCheckDate: "2025-01-01" });
    const nextCheck = new Date(2025, 0, 1);
    nextCheck.setDate(nextCheck.getDate() + 90);
    const today = new Date(nextCheck.getFullYear(), nextCheck.getMonth(), nextCheck.getDate());
    const result = calculateReminder(patient, today);
    expect(result.reminderStatus).toBe("upcoming");
    expect(result.daysUntilNext).toBe(0);
  });

  it("falls back to default cycle when customCycle is negative", () => {
    const patient = makePatient({ lastCheckDate: "2025-01-01" });
    const today = new Date(2025, 0, 10);
    const result = calculateReminder(patient, today, -10);
    expect(result.reminderCycle).toBe(90);
    expect(result.reminderStatus).toBe("normal");
  });
});
