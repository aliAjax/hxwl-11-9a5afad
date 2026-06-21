import { describe, it, expect } from "vitest";
import {
  categorizeLensRecommendation,
  parseDiopter,
  generateLensRecommendation,
} from "../utils/lensRecommendation";
import type { LensRecommendationInput } from "../types/comparison";

function makeInput(overrides: Partial<LensRecommendationInput> = {}): LensRecommendationInput {
  return {
    ageGroup: "成人",
    isReview: false,
    lensType: "单光镜",
    rightSphere: "-2.00",
    leftSphere: "-2.00",
    rightCylinder: "-0.50",
    leftCylinder: "-0.50",
    cylinderChange: "0",
    ...overrides,
  };
}

describe("categorizeLensRecommendation", () => {
  it('returns "ortho-k" when lensType is 角膜塑形镜', () => {
    expect(categorizeLensRecommendation(makeInput({ lensType: "角膜塑形镜" }))).toBe("ortho-k");
  });

  it('returns "progressive" when lensType is 渐进片', () => {
    expect(categorizeLensRecommendation(makeInput({ lensType: "渐进片" }))).toBe("progressive");
  });

  it('returns "progressive" when ageGroup is 中老年', () => {
    expect(categorizeLensRecommendation(makeInput({ ageGroup: "中老年", lensType: "单光镜" }))).toBe("progressive");
  });

  it('returns "children-myopia" when ageGroup is 儿童', () => {
    expect(categorizeLensRecommendation(makeInput({ ageGroup: "儿童" }))).toBe("children-myopia");
  });

  it('returns "children-myopia" when ageGroup is 青少年', () => {
    expect(categorizeLensRecommendation(makeInput({ ageGroup: "青少年" }))).toBe("children-myopia");
  });

  it('returns "adult-regular" for adult with regular lens', () => {
    expect(categorizeLensRecommendation(makeInput({ ageGroup: "成人", lensType: "单光镜" }))).toBe("adult-regular");
  });
});

describe("categorizeLensRecommendation priority", () => {
  it("ortho-k takes priority over progressive triggers", () => {
    const input = makeInput({ lensType: "角膜塑形镜", ageGroup: "中老年" });
    expect(categorizeLensRecommendation(input)).toBe("ortho-k");
  });

  it("ortho-k takes priority over children ageGroup", () => {
    const input = makeInput({ lensType: "角膜塑形镜", ageGroup: "儿童" });
    expect(categorizeLensRecommendation(input)).toBe("ortho-k");
  });

  it("progressive (via 渐进片) takes priority over children ageGroup", () => {
    const input = makeInput({ lensType: "渐进片", ageGroup: "儿童" });
    expect(categorizeLensRecommendation(input)).toBe("progressive");
  });

  it("progressive (via 中老年) takes priority over children-like lensType", () => {
    const input = makeInput({ ageGroup: "中老年", lensType: "单光镜" });
    expect(categorizeLensRecommendation(input)).toBe("progressive");
  });
});

describe("parseDiopter", () => {
  it("parses valid number strings", () => {
    expect(parseDiopter("-2.25")).toBe(-2.25);
    expect(parseDiopter("0.75")).toBe(0.75);
    expect(parseDiopter("5")).toBe(5);
    expect(parseDiopter("-6.00")).toBe(-6);
  });

  it("returns null for invalid values", () => {
    expect(parseDiopter("abc")).toBeNull();
    expect(parseDiopter("")).toBeNull();
    expect(parseDiopter("1.2.3")).toBeNull();
  });
});

describe("generateLensRecommendation - children-myopia with myopia", () => {
  it("returns correct advice for initial myopic child", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", isReview: false, rightSphere: "-2.00", leftSphere: "-1.50" })
    );
    expect(result.category).toBe("children-myopia");
    expect(result.categoryLabel).toBe("儿童近视防控");
    expect(result.primaryAdvice).toContain("初配评估");
    expect(result.primaryAdvice).toContain("近视防控");
    expect(result.doctorConfirmationRequired).toBe(false);
    expect(result.reviewCycle).toBe("3个月");
  });

  it("returns review advice for myopic child review", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", isReview: true, rightSphere: "-2.00", leftSphere: "-1.50" })
    );
    expect(result.primaryAdvice).toContain("复查评估");
    expect(result.primaryAdvice).toContain("近视进展");
  });
});

describe("generateLensRecommendation - children-myopia with high myopia", () => {
  it("requires doctor confirmation when maxMyopia >= 6.00D", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", rightSphere: "-6.50", leftSphere: "-5.00" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("高度近视")])
    );
  });

  it("does not require doctor confirmation for low myopia", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", rightSphere: "-2.00", leftSphere: "-1.50" })
    );
    expect(result.doctorConfirmationRequired).toBe(false);
  });

  it("requires doctor confirmation when maxCylinder >= 2.00DC", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", rightSphere: "-2.00", leftSphere: "-2.00", rightCylinder: "-2.25", leftCylinder: "-0.50" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("高度散光")])
    );
  });

  it("requires doctor confirmation when cylChange >= 0.75DC", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", rightSphere: "-2.00", leftSphere: "-2.00", cylinderChange: "0.75" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("散光变化较大")])
    );
  });

  it("requires doctor confirmation on review when maxMyopia >= 4.00D", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", isReview: true, rightSphere: "-4.50", leftSphere: "-3.00" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("中高度近视复查")])
    );
  });

  it("does not require doctor confirmation for review with myopia < 4D", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", isReview: true, rightSphere: "-3.00", leftSphere: "-2.00" })
    );
    expect(result.doctorConfirmationRequired).toBe(false);
  });
});

describe("generateLensRecommendation - children-myopia with hyperopia", () => {
  it("returns hyperopia-specific primaryAdvice for initial visit", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", isReview: false, rightSphere: "3.00", leftSphere: "2.50" })
    );
    expect(result.primaryAdvice).toContain("初配评估");
    expect(result.primaryAdvice).toContain("远视");
    expect(result.primaryAdvice).toContain("弱视");
  });

  it("returns hyperopia review primaryAdvice", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", isReview: true, rightSphere: "3.00", leftSphere: "2.50" })
    );
    expect(result.primaryAdvice).toContain("远视复查");
  });

  it("requires doctor confirmation when maxHyperopia >= 5.00D", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", rightSphere: "5.50", leftSphere: "4.00" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("高度远视")])
    );
  });
});

describe("generateLensRecommendation - progressive", () => {
  it("returns correct advice for initial progressive", () => {
    const result = generateLensRecommendation(
      makeInput({ lensType: "渐进片", isReview: false })
    );
    expect(result.category).toBe("progressive");
    expect(result.categoryLabel).toBe("渐进片验配");
    expect(result.primaryAdvice).toContain("初配评估");
    expect(result.reviewCycle).toBe("6个月");
  });

  it("returns review advice for progressive review", () => {
    const result = generateLensRecommendation(
      makeInput({ lensType: "渐进片", isReview: true })
    );
    expect(result.primaryAdvice).toContain("复查评估");
  });

  it("requires doctor confirmation when maxCylinder >= 2.00DC", () => {
    const result = generateLensRecommendation(
      makeInput({ lensType: "渐进片", rightCylinder: "-2.50", leftCylinder: "-0.50" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("高度散光")])
    );
  });

  it("requires doctor confirmation when cylChange >= 0.75DC", () => {
    const result = generateLensRecommendation(
      makeInput({ lensType: "渐进片", cylinderChange: "0.75" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("散光变化较大")])
    );
  });
});

describe("generateLensRecommendation - ortho-k myopic", () => {
  it("returns correct initial advice for myopic ortho-k", () => {
    const result = generateLensRecommendation(
      makeInput({ lensType: "角膜塑形镜", isReview: false, rightSphere: "-3.00", leftSphere: "-2.50" })
    );
    expect(result.category).toBe("ortho-k");
    expect(result.categoryLabel).toBe("角膜塑形镜");
    expect(result.primaryAdvice).toContain("初配评估");
    expect(result.primaryAdvice).toContain("适应症");
  });

  it("returns review advice for ortho-k review", () => {
    const result = generateLensRecommendation(
      makeInput({ lensType: "角膜塑形镜", isReview: true, rightSphere: "-3.00", leftSphere: "-2.50" })
    );
    expect(result.primaryAdvice).toContain("复查");
    expect(result.primaryAdvice).toContain("塑形效果");
  });

  it("requires doctor confirmation when maxMyopia >= 6.00D", () => {
    const result = generateLensRecommendation(
      makeInput({ lensType: "角膜塑形镜", rightSphere: "-6.50", leftSphere: "-4.00" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("近视度数较高")])
    );
  });

  it("requires doctor confirmation when maxCylinder >= 1.50DC", () => {
    const result = generateLensRecommendation(
      makeInput({ lensType: "角膜塑形镜", rightCylinder: "-1.75", leftCylinder: "-0.50" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("散光较大")])
    );
  });

  it("requires doctor confirmation on review when cylChange >= 0.50DC", () => {
    const result = generateLensRecommendation(
      makeInput({ lensType: "角膜塑形镜", isReview: true, cylinderChange: "0.50" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("散光变化明显")])
    );
  });
});

describe("generateLensRecommendation - ortho-k hyperopic", () => {
  it("warns not suitable for hyperopic patient", () => {
    const result = generateLensRecommendation(
      makeInput({ lensType: "角膜塑形镜", rightSphere: "2.00", leftSphere: "1.50" })
    );
    expect(result.primaryAdvice).toContain("远视");
    expect(result.primaryAdvice).toContain("不适用");
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("远视患者不适合")])
    );
  });

  it("does not warn for mixed (myopic + hyperopic) - treats as myopic", () => {
    const result = generateLensRecommendation(
      makeInput({ lensType: "角膜塑形镜", rightSphere: "-2.00", leftSphere: "1.50" })
    );
    expect(result.primaryAdvice).not.toContain("不适用");
  });
});

describe("generateLensRecommendation - adult-regular", () => {
  it("returns correct advice for initial adult regular", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "成人", lensType: "单光镜", isReview: false, rightSphere: "-2.00", leftSphere: "-2.00" })
    );
    expect(result.category).toBe("adult-regular");
    expect(result.categoryLabel).toBe("成人普通配镜");
    expect(result.primaryAdvice).toContain("普通配镜");
    expect(result.reviewCycle).toBe("6-12个月");
  });

  it("returns review advice for adult review", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "成人", isReview: true })
    );
    expect(result.primaryAdvice).toContain("复查");
  });

  it("requires doctor confirmation when maxMyopia >= 8.00D", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "成人", rightSphere: "-8.50", leftSphere: "-7.00" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("高度近视")])
    );
  });

  it("requires doctor confirmation when maxHyperopia >= 6.00D", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "成人", rightSphere: "6.50", leftSphere: "4.00" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("高度远视")])
    );
  });

  it("requires doctor confirmation when maxCylinder >= 3.00DC", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "成人", rightCylinder: "-3.25", leftCylinder: "-0.50" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("高度散光")])
    );
  });

  it("requires doctor confirmation when cylChange >= 1.00DC", () => {
    const result = generateLensRecommendation(
      makeInput({ ageGroup: "成人", cylinderChange: "1.00" })
    );
    expect(result.doctorConfirmationRequired).toBe(true);
    expect(result.confirmationReasons).toEqual(
      expect.arrayContaining([expect.stringContaining("散光变化较大")])
    );
  });
});

describe("generateLensRecommendation - always includes 3 disclaimers", () => {
  it("contains exactly 3 disclaimers for children-myopia", () => {
    const result = generateLensRecommendation(makeInput({ ageGroup: "儿童" }));
    expect(result.disclaimers).toHaveLength(3);
    expect(result.disclaimers[0]).toContain("初步参考");
    expect(result.disclaimers[1]).toContain("验光师");
    expect(result.disclaimers[2]).toContain("眼部不适");
  });

  it("contains exactly 3 disclaimers for progressive", () => {
    const result = generateLensRecommendation(makeInput({ lensType: "渐进片" }));
    expect(result.disclaimers).toHaveLength(3);
  });

  it("contains exactly 3 disclaimers for ortho-k", () => {
    const result = generateLensRecommendation(makeInput({ lensType: "角膜塑形镜" }));
    expect(result.disclaimers).toHaveLength(3);
  });

  it("contains exactly 3 disclaimers for adult-regular", () => {
    const result = generateLensRecommendation(makeInput({ ageGroup: "成人" }));
    expect(result.disclaimers).toHaveLength(3);
  });
});

describe("generateLensRecommendation - isReview flag affects primaryAdvice", () => {
  it("children-myopia: review vs initial produce different advice", () => {
    const initial = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", isReview: false, rightSphere: "-2.00", leftSphere: "-2.00" })
    );
    const review = generateLensRecommendation(
      makeInput({ ageGroup: "儿童", isReview: true, rightSphere: "-2.00", leftSphere: "-2.00" })
    );
    expect(initial.primaryAdvice).not.toBe(review.primaryAdvice);
    expect(initial.primaryAdvice).toContain("初配");
    expect(review.primaryAdvice).toContain("复查");
  });

  it("progressive: review vs initial produce different advice", () => {
    const initial = generateLensRecommendation(
      makeInput({ lensType: "渐进片", isReview: false })
    );
    const review = generateLensRecommendation(
      makeInput({ lensType: "渐进片", isReview: true })
    );
    expect(initial.primaryAdvice).not.toBe(review.primaryAdvice);
    expect(initial.primaryAdvice).toContain("初配");
    expect(review.primaryAdvice).toContain("复查");
  });

  it("ortho-k: review vs initial produce different advice", () => {
    const initial = generateLensRecommendation(
      makeInput({ lensType: "角膜塑形镜", isReview: false, rightSphere: "-3.00", leftSphere: "-3.00" })
    );
    const review = generateLensRecommendation(
      makeInput({ lensType: "角膜塑形镜", isReview: true, rightSphere: "-3.00", leftSphere: "-3.00" })
    );
    expect(initial.primaryAdvice).not.toBe(review.primaryAdvice);
    expect(initial.primaryAdvice).toContain("初配");
    expect(review.primaryAdvice).toContain("复查");
  });

  it("adult-regular: review vs initial produce different advice", () => {
    const initial = generateLensRecommendation(
      makeInput({ ageGroup: "成人", isReview: false })
    );
    const review = generateLensRecommendation(
      makeInput({ ageGroup: "成人", isReview: true })
    );
    expect(initial.primaryAdvice).not.toBe(review.primaryAdvice);
    expect(initial.primaryAdvice).toContain("普通配镜");
    expect(review.primaryAdvice).toContain("复查");
  });
});
