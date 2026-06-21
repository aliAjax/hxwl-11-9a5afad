import { describe, it, expect } from "vitest";
import {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  ROLE_CONFIGS,
  type UserRole,
  type RolePermission,
  type DashboardSection,
} from "../types/role";
import { STEP_PERMISSION_MAP, type WorkflowStep } from "../types/workflow";

const ALL_ROLES: UserRole[] = ["optometrist", "advisor", "review-doctor"];

const ALL_DASHBOARD_SECTIONS: DashboardSection[] = [
  "metrics",
  "reminder",
  "comparison",
  "lens-recommendation",
  "field-workspace",
];

const ALL_STEPS: WorkflowStep[] = [
  "dashboard",
  "patient-profile",
  "initial-exam",
  "recheck-compare",
  "prescription-summary",
  "export",
];

describe("ROLE_LABELS", () => {
  it("has correct Chinese labels for all roles", () => {
    expect(ROLE_LABELS["optometrist"]).toBe("验光师");
    expect(ROLE_LABELS["advisor"]).toBe("门店顾问");
    expect(ROLE_LABELS["review-doctor"]).toBe("复查医生");
  });

  it("covers all UserRole values", () => {
    ALL_ROLES.forEach((role) => {
      expect(ROLE_LABELS[role]).toBeDefined();
    });
  });
});

describe("ROLE_PERMISSIONS - optometrist", () => {
  it("has all permissions true", () => {
    const perm = ROLE_PERMISSIONS["optometrist"];
    const keys = Object.keys(perm) as (keyof RolePermission)[];
    keys.forEach((key) => {
      expect(perm[key]).toBe(true);
    });
  });
});

describe("ROLE_PERMISSIONS - advisor", () => {
  it("cannot view/edit initial exam", () => {
    const perm = ROLE_PERMISSIONS["advisor"];
    expect(perm.canViewInitialExam).toBe(false);
    expect(perm.canEditInitialExam).toBe(false);
  });

  it("cannot view/edit recheck compare", () => {
    const perm = ROLE_PERMISSIONS["advisor"];
    expect(perm.canViewRecheckCompare).toBe(false);
    expect(perm.canEditRecheckCompare).toBe(false);
  });

  it("cannot view/edit prescription summary", () => {
    const perm = ROLE_PERMISSIONS["advisor"];
    expect(perm.canViewPrescriptionSummary).toBe(false);
    expect(perm.canEditPrescriptionSummary).toBe(false);
  });

  it("cannot export", () => {
    expect(ROLE_PERMISSIONS["advisor"].canExport).toBe(false);
  });

  it("cannot clear data", () => {
    expect(ROLE_PERMISSIONS["advisor"].canClearAllData).toBe(false);
  });

  it("cannot view professional params", () => {
    expect(ROLE_PERMISSIONS["advisor"].canViewProfessionalParams).toBe(false);
  });

  it("cannot view detailed records", () => {
    expect(ROLE_PERMISSIONS["advisor"].canViewDetailedRecords).toBe(false);
  });

  it("can view and edit patient profile", () => {
    const perm = ROLE_PERMISSIONS["advisor"];
    expect(perm.canViewPatientProfile).toBe(true);
    expect(perm.canEditPatientProfile).toBe(true);
  });

  it("can generate lens recommendation and manage reminders", () => {
    const perm = ROLE_PERMISSIONS["advisor"];
    expect(perm.canGenerateLensRecommendation).toBe(true);
    expect(perm.canViewReminderBoard).toBe(true);
    expect(perm.canEditReminderCycle).toBe(true);
  });
});

describe("ROLE_PERMISSIONS - review-doctor", () => {
  it("can view but not edit patient profile", () => {
    const perm = ROLE_PERMISSIONS["review-doctor"];
    expect(perm.canViewPatientProfile).toBe(true);
    expect(perm.canEditPatientProfile).toBe(false);
  });

  it("can view but not edit initial exam", () => {
    const perm = ROLE_PERMISSIONS["review-doctor"];
    expect(perm.canViewInitialExam).toBe(true);
    expect(perm.canEditInitialExam).toBe(false);
  });

  it("can view and edit recheck compare", () => {
    const perm = ROLE_PERMISSIONS["review-doctor"];
    expect(perm.canViewRecheckCompare).toBe(true);
    expect(perm.canEditRecheckCompare).toBe(true);
  });

  it("can view and edit prescription summary", () => {
    const perm = ROLE_PERMISSIONS["review-doctor"];
    expect(perm.canViewPrescriptionSummary).toBe(true);
    expect(perm.canEditPrescriptionSummary).toBe(true);
  });

  it("can export", () => {
    expect(ROLE_PERMISSIONS["review-doctor"].canExport).toBe(true);
  });

  it("cannot clear data", () => {
    expect(ROLE_PERMISSIONS["review-doctor"].canClearAllData).toBe(false);
  });

  it("can view professional params and detailed records", () => {
    const perm = ROLE_PERMISSIONS["review-doctor"];
    expect(perm.canViewProfessionalParams).toBe(true);
    expect(perm.canViewDetailedRecords).toBe(true);
  });
});

describe("ROLE_CONFIGS - defaultStep", () => {
  it("optometrist defaults to initial-exam", () => {
    expect(ROLE_CONFIGS["optometrist"].defaultStep).toBe("initial-exam");
  });

  it("advisor defaults to patient-profile", () => {
    expect(ROLE_CONFIGS["advisor"].defaultStep).toBe("patient-profile");
  });

  it("review-doctor defaults to recheck-compare", () => {
    expect(ROLE_CONFIGS["review-doctor"].defaultStep).toBe("recheck-compare");
  });
});

describe("ROLE_CONFIGS - primaryEntryPoints", () => {
  it("optometrist entry points", () => {
    expect(ROLE_CONFIGS["optometrist"].primaryEntryPoints).toEqual([
      "initial-exam",
      "patient-profile",
      "recheck-compare",
    ]);
  });

  it("advisor entry points", () => {
    expect(ROLE_CONFIGS["advisor"].primaryEntryPoints).toEqual([
      "patient-profile",
    ]);
  });

  it("review-doctor entry points", () => {
    expect(ROLE_CONFIGS["review-doctor"].primaryEntryPoints).toEqual([
      "recheck-compare",
      "prescription-summary",
    ]);
  });
});

describe("ROLE_CONFIGS - dashboardSections", () => {
  it("optometrist dashboard sections", () => {
    expect(ROLE_CONFIGS["optometrist"].dashboardSections).toEqual([
      "metrics",
      "reminder",
      "comparison",
      "field-workspace",
      "lens-recommendation",
    ]);
  });

  it("advisor dashboard sections", () => {
    expect(ROLE_CONFIGS["advisor"].dashboardSections).toEqual([
      "metrics",
      "reminder",
      "lens-recommendation",
    ]);
  });

  it("review-doctor dashboard sections", () => {
    expect(ROLE_CONFIGS["review-doctor"].dashboardSections).toEqual([
      "metrics",
      "comparison",
      "reminder",
    ]);
  });

  it("all dashboard sections are valid DashboardSection values", () => {
    ALL_ROLES.forEach((role) => {
      ROLE_CONFIGS[role].dashboardSections.forEach((section) => {
        expect(ALL_DASHBOARD_SECTIONS).toContain(section);
      });
    });
  });
});

describe("STEP_PERMISSION_MAP", () => {
  it("maps each step to a valid RolePermission key", () => {
    const permKeys = Object.keys(
      ROLE_PERMISSIONS["optometrist"]
    ) as (keyof RolePermission)[];

    ALL_STEPS.forEach((step) => {
      expect(permKeys).toContain(STEP_PERMISSION_MAP[step]);
    });
  });

  it("has an entry for every WorkflowStep", () => {
    ALL_STEPS.forEach((step) => {
      expect(STEP_PERMISSION_MAP[step]).toBeDefined();
    });
  });

  it("maps dashboard and patient-profile to canViewPatientProfile", () => {
    expect(STEP_PERMISSION_MAP["dashboard"]).toBe("canViewPatientProfile");
    expect(STEP_PERMISSION_MAP["patient-profile"]).toBe("canViewPatientProfile");
  });

  it("maps initial-exam to canViewInitialExam", () => {
    expect(STEP_PERMISSION_MAP["initial-exam"]).toBe("canViewInitialExam");
  });

  it("maps recheck-compare to canViewRecheckCompare", () => {
    expect(STEP_PERMISSION_MAP["recheck-compare"]).toBe("canViewRecheckCompare");
  });

  it("maps prescription-summary to canViewPrescriptionSummary", () => {
    expect(STEP_PERMISSION_MAP["prescription-summary"]).toBe(
      "canViewPrescriptionSummary"
    );
  });

  it("maps export to canExport", () => {
    expect(STEP_PERMISSION_MAP["export"]).toBe("canExport");
  });
});

describe("Cross-check: step permission key matches role permission structure", () => {
  it("each step permission key exists in every role's permission object", () => {
    ALL_STEPS.forEach((step) => {
      const permKey = STEP_PERMISSION_MAP[step];
      ALL_ROLES.forEach((role) => {
        expect(ROLE_PERMISSIONS[role]).toHaveProperty(permKey);
      });
    });
  });
});

describe("All UserRole values present in ROLE_PERMISSIONS and ROLE_CONFIGS", () => {
  it("every UserRole exists in ROLE_PERMISSIONS", () => {
    ALL_ROLES.forEach((role) => {
      expect(ROLE_PERMISSIONS).toHaveProperty(role);
    });
  });

  it("every UserRole exists in ROLE_CONFIGS", () => {
    ALL_ROLES.forEach((role) => {
      expect(ROLE_CONFIGS).toHaveProperty(role);
    });
  });

  it("ROLE_PERMISSIONS and ROLE_CONFIGS have no extra roles", () => {
    const permRoles = Object.keys(ROLE_PERMISSIONS);
    const configRoles = Object.keys(ROLE_CONFIGS);
    expect(permRoles.sort()).toEqual([...ALL_ROLES].sort());
    expect(configRoles.sort()).toEqual([...ALL_ROLES].sort());
  });
});
