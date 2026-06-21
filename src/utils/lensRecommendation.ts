import type { LensRecommendationInput, LensRecommendationResult, LensCategory } from "../types/comparison";
import { LENS_CATEGORY_CONFIG } from "../types/comparison";
import { parseSafeNumber } from "../validation";

export function categorizeLensRecommendation(input: LensRecommendationInput): LensCategory {
  const { ageGroup, lensType } = input;

  if (lensType === "角膜塑形镜") return "ortho-k";
  if (lensType === "渐进片" || ageGroup === "中老年") return "progressive";
  if (ageGroup === "儿童" || ageGroup === "青少年") return "children-myopia";
  return "adult-regular";
}

export function parseDiopter(value: string): number | null {
  return parseSafeNumber(value);
}

export function generateLensRecommendation(input: LensRecommendationInput): LensRecommendationResult {
  const category = categorizeLensRecommendation(input);
  const { isReview, lensType, cylinderChange } = input;

  const rightSphere = parseDiopter(input.rightSphere) || 0;
  const leftSphere = parseDiopter(input.leftSphere) || 0;
  const rightCylinder = Math.abs(parseDiopter(input.rightCylinder) || 0);
  const leftCylinder = Math.abs(parseDiopter(input.leftCylinder) || 0);
  const maxCylinder = Math.max(rightCylinder, leftCylinder);
  const cylChange = Math.abs(parseDiopter(cylinderChange) || 0);

  const rightMyopia = rightSphere < 0 ? Math.abs(rightSphere) : 0;
  const leftMyopia = leftSphere < 0 ? Math.abs(leftSphere) : 0;
  const maxMyopia = Math.max(rightMyopia, leftMyopia);
  const isMyopic = maxMyopia > 0;

  const rightHyperopia = rightSphere > 0 ? rightSphere : 0;
  const leftHyperopia = leftSphere > 0 ? leftSphere : 0;
  const maxHyperopia = Math.max(rightHyperopia, leftHyperopia);
  const isHyperopic = maxHyperopia > 0;

  const detailedAdvice: string[] = [];
  const confirmationReasons: string[] = [];
  let primaryAdvice = "";
  let reviewCycle = "";
  let doctorConfirmationRequired = false;

  const disclaimers = [
    "本建议为门店顾问初步参考，不替代专业医疗诊断",
    "最终配镜方案需由验光师或眼科医生确认",
    "如有眼部不适或视力变化，请及时就医"
  ];

  switch (category) {
    case "children-myopia": {
      if (isHyperopic && !isMyopic) {
        primaryAdvice = isReview
          ? "远视复查评估：关注远视度数变化，评估弱视风险"
          : "初配评估：儿童远视需排查弱视和斜视风险";

        if (maxHyperopia >= 5.0) {
          confirmationReasons.push("高度远视（≥5.00D），高度远视易引起弱视，需医生评估");
          doctorConfirmationRequired = true;
        }
        if (maxCylinder >= 2.0) {
          confirmationReasons.push("高度散光（≥2.00DC），需排除圆锥角膜等疾病");
          doctorConfirmationRequired = true;
        }
        if (cylChange >= 0.75) {
          confirmationReasons.push("散光变化较大（≥0.75DC），需进一步检查");
          doctorConfirmationRequired = true;
        }

        detailedAdvice.push("建议每3个月复查视力和屈光状态");
        detailedAdvice.push("儿童远视需关注视力发育，定期检查矫正视力");
        detailedAdvice.push("如存在弱视，需配合弱视训练并严格遵医嘱戴镜");
        detailedAdvice.push("保证充足睡眠，均衡饮食，增加户外活动");

        if (maxHyperopia < 3.0) {
          detailedAdvice.push("轻度远视：如无症状可暂不配镜，定期观察");
        } else if (maxHyperopia < 5.0) {
          detailedAdvice.push("中度远视：建议配镜矫正，预防弱视和视疲劳");
        } else {
          detailedAdvice.push("高度远视：必须配镜矫正，定期检查眼底和眼轴");
        }
      } else {
        primaryAdvice = isReview
          ? "复查评估：关注近视进展情况，调整防控方案"
          : "初配评估：建议采取近视防控措施，延缓近视进展";

        if (maxMyopia >= 6.0) {
          confirmationReasons.push("高度近视（≥6.00D），需医生评估眼底情况");
          doctorConfirmationRequired = true;
        }
        if (maxCylinder >= 2.0) {
          confirmationReasons.push("高度散光（≥2.00DC），需排除圆锥角膜等疾病");
          doctorConfirmationRequired = true;
        }
        if (cylChange >= 0.75) {
          confirmationReasons.push("散光变化较大（≥0.75DC），需进一步检查");
          doctorConfirmationRequired = true;
        }
        if (isReview && maxMyopia >= 4.0) {
          confirmationReasons.push("中高度近视复查，需关注近视进展情况");
          doctorConfirmationRequired = true;
        }

        detailedAdvice.push("建议每3个月复查视力和屈光状态");
        detailedAdvice.push("增加户外活动时间，每天不少于2小时");
        detailedAdvice.push("保持正确用眼姿势，控制近距离用眼时长");
        detailedAdvice.push("保证充足睡眠，均衡饮食");

        if (maxMyopia < 3.0) {
          detailedAdvice.push("低度近视：可考虑周边离焦镜片或低浓度阿托品防控");
        } else if (maxMyopia < 6.0) {
          detailedAdvice.push("中度近视：建议评估角膜塑形镜或离焦镜片适用性");
        } else {
          detailedAdvice.push("高度近视：需定期检查眼底，避免剧烈运动");
        }
      }

      if (maxCylinder > 0) {
        detailedAdvice.push(`散光 ${maxCylinder.toFixed(2)}DC，需足矫并定期监测变化`);
      }

      reviewCycle = "3个月";
      break;
    }

    case "progressive": {
      primaryAdvice = isReview
        ? "渐进片复查评估：确认适应情况，调整参数"
        : "渐进片初配评估：确认适应症，选择合适通道设计";

      if (maxCylinder >= 2.0) {
        confirmationReasons.push("高度散光（≥2.00DC），渐进片适配需谨慎评估");
        doctorConfirmationRequired = true;
      }
      if (cylChange >= 0.75) {
        confirmationReasons.push("散光变化较大（≥0.75DC），需确认处方稳定性");
        doctorConfirmationRequired = true;
      }

      detailedAdvice.push("建议测量瞳高，确保渐进片光学中心精准定位");
      detailedAdvice.push("初配者需2-4周适应期，由近及远逐步适应");
      detailedAdvice.push("选择合适的通道设计，根据使用场景推荐");
      detailedAdvice.push("建议室内外各备一副眼镜，提高生活质量");

      if (input.ageGroup === "中老年") {
        detailedAdvice.push("中老年患者：优先考虑短通道渐进片，适应更快");
        detailedAdvice.push("定期检查眼压和眼底，排除青光眼、白内障等疾病");
      }

      if (maxCylinder > 1.0) {
        detailedAdvice.push("较高散光：建议选择非球面设计，提升视觉质量");
      }

      reviewCycle = "6个月";
      break;
    }

    case "ortho-k": {
      if (isHyperopic && !isMyopic) {
        primaryAdvice = "注意：角膜塑形镜仅适用于近视矫正，远视患者不适用";
        confirmationReasons.push("远视患者不适合角膜塑形镜，需咨询医生选择其他矫正方式");
        doctorConfirmationRequired = true;

        detailedAdvice.push("角膜塑形镜主要用于近视控制和矫正，对远视无效");
        detailedAdvice.push("建议咨询眼科医生，选择合适的远视矫正方案");
        detailedAdvice.push("如为儿童远视，需关注弱视和斜视风险");
        reviewCycle = "按医生评估周期复查";
      } else {
        primaryAdvice = isReview
          ? "角膜塑形镜复查：评估塑形效果，监测角膜健康"
          : "角膜塑形镜初配评估：确认适应症，完善术前检查";

        if (maxMyopia >= 6.0) {
          confirmationReasons.push("近视度数较高（≥6.00D），OK镜矫治效果受限，需医生评估");
          doctorConfirmationRequired = true;
        }
        if (maxCylinder >= 1.5) {
          confirmationReasons.push("散光较大（≥1.50DC），需评估散光OK镜适用性");
          doctorConfirmationRequired = true;
        }
        if (isReview && cylChange >= 0.5) {
          confirmationReasons.push("散光变化明显（≥0.50DC），需评估镜片配适状态");
          doctorConfirmationRequired = true;
        }

        detailedAdvice.push("严格按照规范流程护理镜片，注意眼部卫生");
        detailedAdvice.push("初配后1周、1个月、3个月定期复查，之后每3个月复查一次");
        detailedAdvice.push("监测角膜地形图，评估塑形效果和角膜形态变化");
        detailedAdvice.push("如出现眼红、眼痛、畏光等症状，立即停戴并就医");

        if (isReview) {
          detailedAdvice.push("复查需检查：裸眼视力、矫正视力、角膜曲率、角膜地形图、眼压");
          detailedAdvice.push("评估镜片配适状态，必要时调整镜片参数或更换镜片");
        } else {
          detailedAdvice.push("初配前需完善：角膜地形图、眼压、眼轴、角膜内皮等检查");
          detailedAdvice.push("评估适应症，排除禁忌症，选择合适的镜片设计");
        }

        reviewCycle = "1个月（初配期）/ 3个月（稳定期）";
      }
      break;
    }

    case "adult-regular": {
      primaryAdvice = isReview
        ? "成人配镜复查：确认视力变化，调整处方"
        : "成人普通配镜：根据验光结果，推荐合适镜片";

      if (maxMyopia >= 8.0) {
        confirmationReasons.push("高度近视（≥8.00D），建议定期检查眼底");
        doctorConfirmationRequired = true;
      }
      if (maxHyperopia >= 6.0) {
        confirmationReasons.push("高度远视（≥6.00D），需排查其他眼部问题");
        doctorConfirmationRequired = true;
      }
      if (maxCylinder >= 3.0) {
        confirmationReasons.push("高度散光（≥3.00DC），需排除病理性因素");
        doctorConfirmationRequired = true;
      }
      if (cylChange >= 1.0) {
        confirmationReasons.push("散光变化较大（≥1.00DC），需进一步检查原因");
        doctorConfirmationRequired = true;
      }

      detailedAdvice.push("建议每半年至一年复查一次视力和屈光状态");
      detailedAdvice.push("根据工作和生活场景选择合适的镜片类型和功能");
      detailedAdvice.push("注意用眼休息，每40分钟近距离用眼后远眺5分钟");

      if (maxMyopia >= 6.0) {
        detailedAdvice.push("高度近视：建议选择高折射率镜片，更轻薄美观");
        detailedAdvice.push("高度近视：每年检查眼底，预防视网膜病变");
      } else if (maxMyopia >= 3.0) {
        detailedAdvice.push("中度近视：可选择中高折射率镜片，兼顾美观与舒适度");
      } else if (maxMyopia > 0) {
        detailedAdvice.push("低度近视：常规镜片即可满足需求，可按需选择功能镜片");
      }

      if (maxHyperopia >= 4.0) {
        detailedAdvice.push("高度远视：建议选择高折射率镜片，减少镜片厚度和重量");
      } else if (maxHyperopia > 0) {
        detailedAdvice.push("远视配镜：建议足矫，尤其是近距离工作较多的人群");
      }

      if (maxCylinder > 0) {
        detailedAdvice.push(`散光 ${maxCylinder.toFixed(2)}DC，建议足矫以获得最佳视觉质量`);
      }

      if (lensType === "单光镜") {
        detailedAdvice.push("单光镜片：推荐非球面设计，提升周边视觉质量");
      } else if (lensType === "散光镜") {
        detailedAdvice.push("散光镜片：确保轴位精准，必要时选择稳定型设计");
      }

      reviewCycle = "6-12个月";
      break;
    }
  }

  if (cylChange > 0 && !confirmationReasons.some(r => r.includes("散光变化"))) {
    if (cylChange >= 0.5) {
      detailedAdvice.unshift(`散光变化 ${cylChange.toFixed(2)}DC，需关注变化原因`);
    }
  }

  return {
    category,
    categoryLabel: LENS_CATEGORY_CONFIG[category].label,
    primaryAdvice,
    detailedAdvice,
    doctorConfirmationRequired,
    confirmationReasons,
    reviewCycle,
    disclaimers,
  };
}
