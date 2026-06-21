import type { PatientProfile, PatientReminder } from "../types/patient";
import { getReminderCycle, UPCOMING_THRESHOLD, DAY_IN_MS } from "../constants";
import { parseLocalDate, startOfLocalDay } from "./dateUtils";
import { formatLocalDate } from "../csvParsers";

export function calculateReminder(
  patient: PatientProfile,
  today: Date,
  customCycle?: number | null
): PatientReminder {
  const cycleDays = customCycle && customCycle > 0 ? customCycle : getReminderCycle(patient.ageGroup, patient.lensType);
  const lastCheck = parseLocalDate(patient.lastCheckDate);
  const nextCheck = new Date(lastCheck);
  nextCheck.setDate(lastCheck.getDate() + cycleDays);

  const diffTime = nextCheck.getTime() - startOfLocalDay(today).getTime();
  const diffDays = Math.round(diffTime / DAY_IN_MS);

  let status: PatientReminder["reminderStatus"];
  if (diffDays < 0) {
    status = "overdue";
  } else if (diffDays <= UPCOMING_THRESHOLD) {
    status = "upcoming";
  } else {
    status = "normal";
  }

  return {
    ...patient,
    reminderStatus: status,
    nextCheckDate: formatLocalDate(nextCheck),
    daysUntilNext: diffDays,
    reminderCycle: cycleDays,
  };
}
