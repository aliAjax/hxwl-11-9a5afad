import { describe, it, expect } from "vitest";
import {
  compareNumber,
  compareEyeRefraction,
  compareCurvature,
  classifyComparison,
  comparePrescriptions,
  getPatientRecords,
  getAllComparisons,
  getLatestTwoComparisons,
  getFirstToCurrentComparisons,
  getCustomComparison,
  getComparisonsByBaseline,
  getVisibleRecordSummary,
} from "../utils/comparisonUtils";
import type { RefractionRecord, EyeRefraction, EyeCurvature } from "../types/patient";
import type { EyeComparison, CurvatureComparison } from "../types/comparison";

function makeEye(
  overrides: Partial<EyeRefraction> = {}
): EyeRefraction {
  return {
    nakedVision: "0.8",
    correctedVision: "1.0",
    sphere: "-1.00",
    cylinder: "-0.50",
    axis: "90",
    add: "",
    ...overrides,
  };
}

function makeCurvature(
  overrides: Partial<EyeCurvature> = {}
): EyeCurvature {
  return {
    horizontal: "42.50",
    vertical: "43.00",
    ...overrides,
  };
}

let nextId = 1;

function makeRecord(
  overrides: Partial<RefractionRecord> = {}
): RefractionRecord {
  const id = String(nextId++);
  return {
    id,
    patientNo: "P001",
    category: "儿童近视",
    type: "初查",
    summary: "轻度近视",
    patientName: "张三",
    ageGroup: "6-12",
    gender: "男",
    examDate: "2025-01-01",
    rightEye: makeEye(),
    leftEye: makeEye(),
    pd: "60",
    cornealCurvature: {
      right: makeCurvature(),
      left: makeCurvature(),
    },
    recommendation: "定期复查",
    ...overrides,
  };
}

describe("compareNumber", () => {
  it("returns changed:true when diff meets threshold", () => {
    const result = compareNumber("-1.00", "-1.50", 0.25);
    expect(result.diff).toBe(-0.5);
    expect(result.changed).toBe(true);
    expect(result.prev).toBe("-1.00");
    expect(result.curr).toBe("-1.50");
  });

  it("returns changed:false when diff is below threshold", () => {
    const result = compareNumber("-1.00", "-1.10", 0.25);
    expect(result.diff).toBeCloseTo(-0.1);
    expect(result.changed).toBe(false);
  });

  it("returns changed:false for unchanged values", () => {
    const result = compareNumber("-2.00", "-2.00", 0.25);
    expect(result.diff).toBe(0);
    expect(result.changed).toBe(false);
  });

  it("returns changed:false and diff:0 for non-numeric values", () => {
    const result = compareNumber("abc", "-1.00", 0.25);
    expect(result.diff).toBe(0);
    expect(result.changed).toBe(false);
    expect(result.prev).toBe("abc");
    expect(result.curr).toBe("-1.00");
  });

  it("returns changed:false when both values are non-numeric", () => {
    const result = compareNumber("N/A", "N/A", 0.25);
    expect(result.diff).toBe(0);
    expect(result.changed).toBe(false);
  });
});

describe("compareEyeRefraction", () => {
  it("compares all four fields", () => {
    const prev = makeEye({ sphere: "-1.00", cylinder: "-0.50", axis: "90", correctedVision: "1.0" });
    const curr = makeEye({ sphere: "-1.50", cylinder: "-0.75", axis: "100", correctedVision: "0.8" });
    const result = compareEyeRefraction(prev, curr);

    expect(result.sphere.changed).toBe(true);
    expect(result.sphere.diff).toBe(-0.5);

    expect(result.cylinder.changed).toBe(true);
    expect(result.cylinder.diff).toBeCloseTo(-0.25);

    expect(result.axis.changed).toBe(true);
    expect(result.axis.diff).toBe(10);

    expect(result.correctedVision.changed).toBe(true);
    expect(result.correctedVision.diff).toBeCloseTo(-0.2);
  });

  it("reports no change when values are identical", () => {
    const eye = makeEye();
    const result = compareEyeRefraction(eye, eye);
    expect(result.sphere.changed).toBe(false);
    expect(result.cylinder.changed).toBe(false);
    expect(result.axis.changed).toBe(false);
    expect(result.correctedVision.changed).toBe(false);
  });
});

describe("compareCurvature", () => {
  it("compares horizontal and vertical", () => {
    const prev = makeCurvature({ horizontal: "42.50", vertical: "43.00" });
    const curr = makeCurvature({ horizontal: "42.75", vertical: "43.50" });
    const result = compareCurvature(prev, curr);

    expect(result.horizontal.changed).toBe(true);
    expect(result.horizontal.diff).toBeCloseTo(0.25);

    expect(result.vertical.changed).toBe(true);
    expect(result.vertical.diff).toBeCloseTo(0.5);
  });

  it("reports no change when identical", () => {
    const curv = makeCurvature();
    const result = compareCurvature(curv, curv);
    expect(result.horizontal.changed).toBe(false);
    expect(result.vertical.changed).toBe(false);
  });
});

describe("classifyComparison", () => {
  function makeClassifyInput(
    overrides: {
      rightEye?: Partial<EyeComparison>;
      leftEye?: Partial<EyeComparison>;
      cornealCurvature?: {
        right?: Partial<CurvatureComparison>;
        left?: Partial<CurvatureComparison>;
      };
    } = {}
  ) {
    const unchangedField = { prev: "-1.00", curr: "-1.00", diff: 0, changed: false };
    const defaultEye: EyeComparison = {
      sphere: unchangedField,
      cylinder: unchangedField,
      axis: unchangedField,
      correctedVision: unchangedField,
    };
    const defaultCurvature: CurvatureComparison = {
      horizontal: unchangedField,
      vertical: unchangedField,
    };

    const rightEye: EyeComparison = { ...defaultEye, ...overrides.rightEye };
    const leftEye: EyeComparison = { ...defaultEye, ...overrides.leftEye };
    const cornealCurvature = {
      right: { ...defaultCurvature, ...overrides.cornealCurvature?.right },
      left: { ...defaultCurvature, ...overrides.cornealCurvature?.left },
    };

    return { rightEye, leftEye, cornealCurvature };
  }

  it("returns myopia-progress when right sphere worsens beyond threshold", () => {
    const input = makeClassifyInput({
      rightEye: { sphere: { prev: "-1.00", curr: "-1.50", diff: -0.5, changed: true } },
    });
    expect(classifyComparison(input)).toBe("myopia-progress");
  });

  it("returns myopia-progress when left sphere worsens beyond threshold", () => {
    const input = makeClassifyInput({
      leftEye: { sphere: { prev: "-2.00", curr: "-2.75", diff: -0.75, changed: true } },
    });
    expect(classifyComparison(input)).toBe("myopia-progress");
  });

  it("returns astigmatism-change when cylinder changes", () => {
    const input = makeClassifyInput({
      rightEye: { cylinder: { prev: "-0.50", curr: "-1.00", diff: -0.5, changed: true } },
    });
    expect(classifyComparison(input)).toBe("astigmatism-change");
  });

  it("returns astigmatism-change when axis changes", () => {
    const input = makeClassifyInput({
      leftEye: { axis: { prev: "90", curr: "110", diff: 20, changed: true } },
    });
    expect(classifyComparison(input)).toBe("astigmatism-change");
  });

  it("returns astigmatism-change when correctedVision changes", () => {
    const input = makeClassifyInput({
      rightEye: { correctedVision: { prev: "1.0", curr: "0.8", diff: -0.2, changed: true } },
    });
    expect(classifyComparison(input)).toBe("astigmatism-change");
  });

  it("returns astigmatism-change when curvature changes", () => {
    const input = makeClassifyInput({
      cornealCurvature: {
        right: { horizontal: { prev: "42.50", curr: "43.00", diff: 0.5, changed: true } },
      },
    });
    expect(classifyComparison(input)).toBe("astigmatism-change");
  });

  it("returns stable when no significant change", () => {
    const input = makeClassifyInput();
    expect(classifyComparison(input)).toBe("stable");
  });

  it("prioritizes myopia-progress over astigmatism-change", () => {
    const input = makeClassifyInput({
      rightEye: {
        sphere: { prev: "-1.00", curr: "-1.50", diff: -0.5, changed: true },
        cylinder: { prev: "-0.50", curr: "-1.00", diff: -0.5, changed: true },
      },
    });
    expect(classifyComparison(input)).toBe("myopia-progress");
  });
});

describe("comparePrescriptions", () => {
  it("produces full comparison result with correct category", () => {
    const prev = makeRecord({ examDate: "2025-01-01" });
    const curr = makeRecord({
      examDate: "2025-04-01",
      rightEye: makeEye({ sphere: "-1.50" }),
      leftEye: makeEye({ sphere: "-1.50" }),
    });

    const result = comparePrescriptions(prev, curr);

    expect(result.patientNo).toBe("P001");
    expect(result.patientName).toBe("张三");
    expect(result.prevRecord.id).toBe(prev.id);
    expect(result.currRecord.id).toBe(curr.id);
    expect(result.category).toBe("myopia-progress");
    expect(result.categoryLabel).toBe("近视进展");
    expect(result.daysBetween).toBe(90);
    expect(result.rightEye.sphere.diff).toBe(-0.5);
    expect(result.leftEye.sphere.diff).toBe(-0.5);
  });
});

describe("getPatientRecords", () => {
  it("filters by patientNo and sorts by examDate ascending", () => {
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-06-01" });
    const r2 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });
    const r3 = makeRecord({ patientNo: "P002", examDate: "2025-03-01" });

    const result = getPatientRecords([r1, r2, r3], "P001");

    expect(result).toHaveLength(2);
    expect(result[0].examDate).toBe("2025-01-01");
    expect(result[1].examDate).toBe("2025-06-01");
  });
});

describe("getAllComparisons", () => {
  it("compares all consecutive records per patient", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });
    const r2 = makeRecord({ patientNo: "P001", examDate: "2025-03-01" });
    const r3 = makeRecord({ patientNo: "P001", examDate: "2025-06-01" });

    const results = getAllComparisons([r1, r2, r3]);

    expect(results).toHaveLength(2);
  });

  it("handles multiple patients separately", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });
    const r2 = makeRecord({ patientNo: "P001", examDate: "2025-06-01" });
    const r3 = makeRecord({ patientNo: "P002", examDate: "2025-02-01" });
    const r4 = makeRecord({ patientNo: "P002", examDate: "2025-07-01" });

    const results = getAllComparisons([r1, r2, r3, r4]);

    expect(results).toHaveLength(2);
    const patients = results.map((r) => r.patientNo).sort();
    expect(patients).toEqual(["P001", "P002"]);
  });
});

describe("getLatestTwoComparisons", () => {
  it("compares only last 2 records per patient", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });
    const r2 = makeRecord({ patientNo: "P001", examDate: "2025-03-01" });
    const r3 = makeRecord({ patientNo: "P001", examDate: "2025-06-01" });

    const results = getLatestTwoComparisons([r1, r2, r3]);

    expect(results).toHaveLength(1);
    expect(results[0].prevRecord.examDate).toBe("2025-03-01");
    expect(results[0].currRecord.examDate).toBe("2025-06-01");
  });
});

describe("getFirstToCurrentComparisons", () => {
  it("compares first and last records per patient", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });
    const r2 = makeRecord({ patientNo: "P001", examDate: "2025-03-01" });
    const r3 = makeRecord({ patientNo: "P001", examDate: "2025-06-01" });

    const results = getFirstToCurrentComparisons([r1, r2, r3]);

    expect(results).toHaveLength(1);
    expect(results[0].prevRecord.examDate).toBe("2025-01-01");
    expect(results[0].currRecord.examDate).toBe("2025-06-01");
  });
});

describe("getCustomComparison", () => {
  it("compares two specific records by ID", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });
    const r2 = makeRecord({ patientNo: "P001", examDate: "2025-06-01" });

    const result = getCustomComparison([r1, r2], [r1.id, r2.id]);

    expect(result).not.toBeNull();
    expect(result!.prevRecord.examDate).toBe("2025-01-01");
    expect(result!.currRecord.examDate).toBe("2025-06-01");
  });

  it("swaps order when second record is earlier", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-06-01" });
    const r2 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });

    const result = getCustomComparison([r1, r2], [r1.id, r2.id]);

    expect(result).not.toBeNull();
    expect(result!.prevRecord.examDate).toBe("2025-01-01");
    expect(result!.currRecord.examDate).toBe("2025-06-01");
  });

  it("returns null for same record ID", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });

    const result = getCustomComparison([r1], [r1.id, r1.id]);

    expect(result).toBeNull();
  });

  it("returns null for records from different patients", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });
    const r2 = makeRecord({ patientNo: "P002", examDate: "2025-06-01" });

    const result = getCustomComparison([r1, r2], [r1.id, r2.id]);

    expect(result).toBeNull();
  });

  it("returns null when record ID not found", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });

    const result = getCustomComparison([r1], [r1.id, "nonexistent"]);

    expect(result).toBeNull();
  });
});

describe("getComparisonsByBaseline", () => {
  it("dispatches to getLatestTwoComparisons for latest-two", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });
    const r2 = makeRecord({ patientNo: "P001", examDate: "2025-06-01" });

    const results = getComparisonsByBaseline([r1, r2], { type: "latest-two" });

    expect(results).toHaveLength(1);
  });

  it("dispatches to getFirstToCurrentComparisons for first-to-current", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });
    const r2 = makeRecord({ patientNo: "P001", examDate: "2025-03-01" });
    const r3 = makeRecord({ patientNo: "P001", examDate: "2025-06-01" });

    const results = getComparisonsByBaseline([r1, r2, r3], { type: "first-to-current" });

    expect(results).toHaveLength(1);
    expect(results[0].prevRecord.examDate).toBe("2025-01-01");
    expect(results[0].currRecord.examDate).toBe("2025-06-01");
  });

  it("dispatches to getCustomComparison for custom baseline", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });
    const r2 = makeRecord({ patientNo: "P001", examDate: "2025-06-01" });

    const results = getComparisonsByBaseline([r1, r2], {
      type: "custom",
      customRecordIds: [r1.id, r2.id],
    });

    expect(results).toHaveLength(1);
    expect(results[0].prevRecord.examDate).toBe("2025-01-01");
  });

  it("returns empty array for custom baseline with missing IDs", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });

    const results = getComparisonsByBaseline([r1], {
      type: "custom",
      customRecordIds: [r1.id, "nonexistent"],
    });

    expect(results).toHaveLength(0);
  });

  it("defaults to latest-two for unknown baseline type", () => {
    nextId = 1;
    const r1 = makeRecord({ patientNo: "P001", examDate: "2025-01-01" });
    const r2 = makeRecord({ patientNo: "P001", examDate: "2025-06-01" });

    const results = getComparisonsByBaseline([r1, r2], { type: "unknown" as any });

    expect(results).toHaveLength(1);
  });
});

describe("getVisibleRecordSummary", () => {
  it("shows category, type and summary when canViewDetailedRecords is true", () => {
    const record = makeRecord();
    const result = getVisibleRecordSummary(record, true);
    expect(result).toBe("儿童近视 · 初查 · 轻度近视");
  });

  it("shows category, type and exam date when canViewDetailedRecords is false", () => {
    const record = makeRecord({ examDate: "2025-01-01" });
    const result = getVisibleRecordSummary(record, false);
    expect(result).toBe("儿童近视 · 初查 · 检查日期 2025-01-01");
  });
});
