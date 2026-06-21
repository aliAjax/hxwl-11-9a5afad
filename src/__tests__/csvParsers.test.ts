import { describe, it, expect } from "vitest";
import {
  parseCsvLine,
  matchHeaderToField,
  buildHeaderMapping,
  parseCsvText,
  CSV_FIELD_MAPPINGS,
  validateAndBuildRecord,
} from "../csvParsers";

describe("parseCsvLine", () => {
  it("splits simple comma-separated values", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace around values", () => {
    expect(parseCsvLine(" a , b , c ")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields with commas", () => {
    expect(parseCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });

  it("handles escaped double quotes inside quoted fields", () => {
    expect(parseCsvLine('a,"b""c",d')).toEqual(["a", 'b"c', "d"]);
  });

  it("handles empty fields", () => {
    expect(parseCsvLine("a,,c")).toEqual(["a", "", "c"]);
  });

  it("handles single field", () => {
    expect(parseCsvLine("only")).toEqual(["only"]);
  });
});

describe("matchHeaderToField", () => {
  it("matches known aliases", () => {
    expect(matchHeaderToField("患者编号")?.key).toBe("patientNo");
    expect(matchHeaderToField("patientNo")?.key).toBe("patientNo");
    expect(matchHeaderToField("编号")?.key).toBe("patientNo");
    expect(matchHeaderToField("右眼球镜")?.key).toBe("rightSphere");
    expect(matchHeaderToField("R球镜")?.key).toBe("rightSphere");
    expect(matchHeaderToField("瞳距")?.key).toBe("pd");
    expect(matchHeaderToField("PD")?.key).toBe("pd");
  });

  it("is case-insensitive", () => {
    expect(matchHeaderToField("patientno")?.key).toBe("patientNo");
    expect(matchHeaderToField("PATIENTNO")?.key).toBe("patientNo");
    expect(matchHeaderToField("pd")?.key).toBe("pd");
  });

  it("returns null for unknown headers", () => {
    expect(matchHeaderToField("未知列")).toBeNull();
    expect(matchHeaderToField("foobar")).toBeNull();
  });
});

describe("buildHeaderMapping", () => {
  it("maps a complete header row", () => {
    const headers = CSV_FIELD_MAPPINGS.map(f => f.label);
    const result = buildHeaderMapping(headers);
    expect(result.missingRequired).toEqual([]);
    expect(result.extraColumns).toEqual([]);
    expect(result.mapping["patientNo"]).toBe(0);
    expect(result.mapping["patientName"]).toBe(1);
    expect(result.mapping["rightSphere"]).toBe(4);
  });

  it("detects missing required columns", () => {
    const headers = ["患者编号", "患者姓名"];
    const result = buildHeaderMapping(headers);
    expect(result.missingRequired.length).toBeGreaterThan(0);
    expect(result.missingRequired).toContain("分类");
    expect(result.missingRequired).toContain("检查日期");
  });

  it("detects extra columns", () => {
    const headers = [...CSV_FIELD_MAPPINGS.map(f => f.label), "额外列"];
    const result = buildHeaderMapping(headers);
    expect(result.extraColumns).toContain("额外列");
  });

  it("maps via aliases", () => {
    const headers = ["编号", "姓名", "分类", "日期", "R球镜", "R柱镜", "R轴位", "L球镜", "L柱镜", "L轴位", "类型", "年龄段", "PD", "建议"];
    const result = buildHeaderMapping(headers);
    expect(result.missingRequired).toEqual([]);
    expect(result.mapping["patientNo"]).toBe(0);
    expect(result.mapping["rightSphere"]).toBe(4);
    expect(result.mapping["pd"]).toBe(12);
  });
});

describe("validateAndBuildRecord", () => {
  const baseMapping: Record<string, number> = {};
  CSV_FIELD_MAPPINGS.forEach((f, i) => { baseMapping[f.key] = i; });

  it("builds a valid record with all required fields", () => {
    const fields = [
      "P001", "张三", "近视", "2025-01-15",
      "-2.25", "-0.5", "180", "-1.75", "-0.25", "175",
      "初配", "青少年", "58", "定期复查"
    ];
    const result = validateAndBuildRecord(fields, 1, baseMapping);
    expect(result.errors).toBeUndefined();
    expect(result.record).toBeDefined();
    expect(result.record!.record.patientNo).toBe("P001");
    expect(result.record!.record.rightEye.sphere).toBe("-2.25");
    expect(result.record!.record.leftEye.axis).toBe("175");
    expect(result.record!.record.pd).toBe("58");
  });

  it("rejects record with missing patientNo", () => {
    const fields = [
      "", "张三", "近视", "2025-01-15",
      "-2.25", "-0.5", "180", "-1.75", "-0.25", "175",
      "", "", "", ""
    ];
    const result = validateAndBuildRecord(fields, 1, baseMapping);
    expect(result.errors).toBeDefined();
    expect(result.errors).toContain("患者编号不能为空");
  });

  it("rejects invalid sphere value in CSV", () => {
    const fields = [
      "P001", "张三", "近视", "2025-01-15",
      "-2.3", "-0.5", "180", "-1.75", "-0.25", "175",
      "", "", "", ""
    ];
    const result = validateAndBuildRecord(fields, 1, baseMapping);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some(e => e.includes("0.25D步进"))).toBe(true);
  });

  it("rejects invalid cylinder value in CSV", () => {
    const fields = [
      "P001", "张三", "近视", "2025-01-15",
      "-2.25", "-0.3", "180", "-1.75", "-0.25", "175",
      "", "", "", ""
    ];
    const result = validateAndBuildRecord(fields, 1, baseMapping);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some(e => e.includes("0.25D步进"))).toBe(true);
  });

  it("requires axis when cylinder is non-zero", () => {
    const fields = [
      "P001", "张三", "近视", "2025-01-15",
      "-2.25", "-0.5", "", "-1.75", "-0.25", "175",
      "", "", "", ""
    ];
    const result = validateAndBuildRecord(fields, 1, baseMapping);
    expect(result.errors).toBeDefined();
    expect(result.errors).toContain("右眼有柱镜时轴位必填");
  });

  it("accepts zero cylinder without axis", () => {
    const fields = [
      "P001", "张三", "近视", "2025-01-15",
      "-2.25", "0", "", "-1.75", "0", "",
      "", "", "", ""
    ];
    const result = validateAndBuildRecord(fields, 1, baseMapping);
    expect(result.errors).toBeUndefined();
    expect(result.record).toBeDefined();
  });

  it("rejects axis out of 0-180 range", () => {
    const fields = [
      "P001", "张三", "近视", "2025-01-15",
      "-2.25", "-0.5", "200", "-1.75", "-0.25", "175",
      "", "", "", ""
    ];
    const result = validateAndBuildRecord(fields, 1, baseMapping);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some(e => e.includes("0~180"))).toBe(true);
  });

  it("rejects PD out of 40-80 range", () => {
    const fields = [
      "P001", "张三", "近视", "2025-01-15",
      "-2.25", "-0.5", "180", "-1.75", "-0.25", "175",
      "", "", "39", ""
    ];
    const result = validateAndBuildRecord(fields, 1, baseMapping);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some(e => e.includes("40~80mm"))).toBe(true);
  });

  it("rejects invalid ageGroup", () => {
    const fields = [
      "P001", "张三", "近视", "2025-01-15",
      "-2.25", "-0.5", "180", "-1.75", "-0.25", "175",
      "", "幼儿", "", ""
    ];
    const result = validateAndBuildRecord(fields, 1, baseMapping);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some(e => e.includes("年龄段无效"))).toBe(true);
  });

  it("rejects invalid examDate format", () => {
    const fields = [
      "P001", "张三", "近视", "2025/01/15",
      "-2.25", "-0.5", "180", "-1.75", "-0.25", "175",
      "", "", "", ""
    ];
    const result = validateAndBuildRecord(fields, 1, baseMapping);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some(e => e.includes("检查日期格式无效"))).toBe(true);
  });
});

describe("parseCsvText - header-based path", () => {
  it("parses CSV with Chinese headers", () => {
    const csv = [
      "患者编号,患者姓名,分类,检查日期,右眼球镜,右眼柱镜,右眼轴位,左眼球镜,左眼柱镜,左眼轴位",
      "P001,张三,近视,2025-01-15,-2.25,-0.5,180,-1.75,-0.25,175",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].record.patientNo).toBe("P001");
    expect(result.validRows[0].record.rightEye.sphere).toBe("-2.25");
    expect(result.missingRequired).toEqual([]);
  });

  it("parses CSV with English aliases", () => {
    const csv = [
      "patientNo,patientName,category,examDate,rightSphere,rightCylinder,rightAxis,leftSphere,leftCylinder,leftAxis",
      "P002,Li,myopia,2025-02-01,-3,-0.75,90,-2.5,-0.5,85",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].record.patientNo).toBe("P002");
  });

  it("reports missing required columns", () => {
    const csv = [
      "患者编号,患者姓名",
      "P001,张三",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.missingRequired.length).toBeGreaterThan(0);
    expect(result.errorRows.length).toBeGreaterThan(0);
  });

  it("reports validation errors in rows", () => {
    const csv = [
      "患者编号,患者姓名,分类,检查日期,右眼球镜,右眼柱镜,右眼轴位,左眼球镜,左眼柱镜,左眼轴位",
      "P001,张三,近视,2025-01-15,-2.3,-0.5,180,-1.75,-0.25,175",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.errorRows).toHaveLength(1);
    expect(result.errorRows[0].errors.some(e => e.includes("0.25D步进"))).toBe(true);
  });

  it("detects extra columns", () => {
    const csv = [
      "患者编号,患者姓名,分类,检查日期,右眼球镜,右眼柱镜,右眼轴位,左眼球镜,左眼柱镜,左眼轴位,额外列",
      "P001,张三,近视,2025-01-15,-2.25,-0.5,180,-1.75,-0.25,175,foo",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.extraColumns).toContain("额外列");
  });

  it("handles optional PD column", () => {
    const csv = [
      "患者编号,患者姓名,分类,检查日期,右眼球镜,右眼柱镜,右眼轴位,左眼球镜,左眼柱镜,左眼轴位,瞳距",
      "P001,张三,近视,2025-01-15,-2.25,-0.5,180,-1.75,-0.25,175,58",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].record.pd).toBe("58");
  });

  it("skips header row - data rows start from second line", () => {
    const csv = [
      "患者编号,患者姓名,分类,检查日期,右眼球镜,右眼柱镜,右眼轴位,左眼球镜,左眼柱镜,左眼轴位",
      "P001,张三,近视,2025-01-15,-2.25,-0.5,180,-1.75,-0.25,175",
      "P002,李四,远视,2025-02-01,+1.5,+0.5,90,+2,+0.25,85",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.validRows).toHaveLength(2);
  });
});

describe("parseCsvText - fixed-order (no header) path", () => {
  it("parses CSV without headers using fixed column order", () => {
    const csv = [
      "P001,张三,近视,2025-01-15,-2.25,-0.5,180,-1.75,-0.25,175",
      "P002,李四,远视,2025-02-01,+1.5,+0.5,90,+2,+0.25,85",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.validRows).toHaveLength(2);
    expect(result.validRows[0].record.patientNo).toBe("P001");
    expect(result.validRows[0].record.rightEye.sphere).toBe("-2.25");
    expect(result.validRows[1].record.patientNo).toBe("P002");
  });

  it("uses all data rows (no header row skipped)", () => {
    const csv = [
      "P001,张三,近视,2025-01-15,-2.25,-0.5,180,-1.75,-0.25,175",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.validRows).toHaveLength(1);
  });

  it("reports validation errors in fixed-order mode", () => {
    const csv = [
      "P001,张三,近视,2025-01-15,-2.3,-0.5,180,-1.75,-0.25,175",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.errorRows).toHaveLength(1);
    expect(result.errorRows[0].errors.some(e => e.includes("0.25D步进"))).toBe(true);
  });

  it("returns empty result for empty input", () => {
    const result = parseCsvText("");
    expect(result.validRows).toHaveLength(0);
    expect(result.errorRows).toHaveLength(0);
    expect(result.missingRequired.length).toBeGreaterThan(0);
  });

  it("returns fallbackMapping in fixed-order mode", () => {
    const csv = [
      "P001,张三,近视,2025-01-15,-2.25,-0.5,180,-1.75,-0.25,175",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.headerMapping["patientNo"]).toBe(0);
    expect(result.headerMapping["rightSphere"]).toBe(4);
    expect(result.missingRequired).toEqual([]);
  });
});

describe("parseCsvText - mixed scenarios", () => {
  it("handles CRLF line endings", () => {
    const csv = "患者编号,患者姓名,分类,检查日期,右眼球镜,右眼柱镜,右眼轴位,左眼球镜,左眼柱镜,左眼轴位\r\nP001,张三,近视,2025-01-15,-2.25,-0.5,180,-1.75,-0.25,175\r\n";
    const result = parseCsvText(csv);
    expect(result.validRows).toHaveLength(1);
  });

  it("handles rows with fewer columns - missing fields default to empty", () => {
    const csv = [
      "P001,张三,近视,2025-01-15,-2.25,-0.5,180",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].record.leftEye.sphere).toBe("");
    expect(result.validRows[0].record.leftEye.cylinder).toBe("");
  });

  it("handles multiple valid and invalid rows", () => {
    const csv = [
      "P001,张三,近视,2025-01-15,-2.25,-0.5,180,-1.75,-0.25,175",
      ",李四,近视,2025-01-15,-2.25,-0.5,180,-1.75,-0.25,175",
      "P003,王五,远视,2025-01-15,+1.5,+0.5,90,+2,+0.25,85",
    ].join("\n");
    const result = parseCsvText(csv);
    expect(result.validRows).toHaveLength(2);
    expect(result.errorRows).toHaveLength(1);
    expect(result.errorRows[0].errors).toContain("患者编号不能为空");
  });
});
