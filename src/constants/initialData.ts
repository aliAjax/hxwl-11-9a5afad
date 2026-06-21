import type { PatientProfile, RefractionRecord } from "../types/patient";

export const INITIAL_PATIENTS: PatientProfile[] = [
  {
    id: "p-001",
    patientNo: "Patient-032",
    ageGroup: "儿童",
    lensType: "单光镜",
    lastCheckDate: "2026-05-15",
    remark: "近视进展较快，需密切关注"
  },
  {
    id: "p-002",
    patientNo: "Patient-081",
    ageGroup: "中老年",
    lensType: "渐进片",
    lastCheckDate: "2026-04-20",
    remark: "ADD +1.50，瞳高待确认"
  },
  {
    id: "p-003",
    patientNo: "Patient-144",
    ageGroup: "青少年",
    lensType: "散光镜",
    lastCheckDate: "2026-06-01",
    remark: "柱镜变化0.50D"
  },
  {
    id: "p-004",
    patientNo: "Patient-256",
    ageGroup: "儿童",
    lensType: "角膜塑形镜",
    lastCheckDate: "2026-05-10",
    remark: "OK镜配戴良好，需定期复查眼轴"
  },
  {
    id: "p-005",
    patientNo: "Patient-312",
    ageGroup: "儿童",
    lensType: "角膜塑形镜",
    lastCheckDate: "2026-06-15",
    remark: "视力稳定，继续保持"
  },
  {
    id: "p-006",
    patientNo: "Patient-478",
    ageGroup: "青少年",
    lensType: "角膜塑形镜",
    lastCheckDate: "2026-05-18",
    remark: "眼压略高，需关注"
  },
  {
    id: "p-007",
    patientNo: "Patient-521",
    ageGroup: "成人",
    lensType: "渐进片",
    lastCheckDate: "2025-12-10",
    remark: "花眼症状明显，渐进片适配中"
  },
  {
    id: "p-008",
    patientNo: "Patient-634",
    ageGroup: "成人",
    lensType: "单光镜",
    lastCheckDate: "2026-03-15",
    remark: "高度近视，每年需检查眼底"
  },
  {
    id: "p-009",
    patientNo: "Patient-789",
    ageGroup: "中老年",
    lensType: "老花镜",
    lastCheckDate: "2026-01-05",
    remark: "ADD +2.00，视近清晰"
  },
  {
    id: "p-010",
    patientNo: "Patient-890",
    ageGroup: "儿童",
    lensType: "散光镜",
    lastCheckDate: "2026-05-20",
    remark: "散光度数稳定"
  },
  {
    id: "p-011",
    patientNo: "Patient-901",
    ageGroup: "成人",
    lensType: "散光镜",
    lastCheckDate: "2026-04-01",
    remark: "工作性质需长时间对着电脑"
  },
  {
    id: "p-012",
    patientNo: "Patient-102",
    ageGroup: "青少年",
    lensType: "单光镜",
    lastCheckDate: "2026-06-10",
    remark: "近视度数稳定"
  },
  {
    id: "p-013",
    patientNo: "Patient-666",
    ageGroup: "成人",
    lensType: "单光镜",
    lastCheckDate: "2026-05-20",
    remark: "矫正视力提升，屈光度数稳定"
  },
  {
    id: "p-014",
    patientNo: "Patient-777",
    ageGroup: "儿童",
    lensType: "角膜塑形镜",
    lastCheckDate: "2026-05-25",
    remark: "OK镜塑形效果良好，曲率变平"
  }
];

export const PROJECT_CONFIG = {
  "id": "hxwl-11",
  "port": 5111,
  "title": "眼科验光记录",
  "subtitle": "视力、屈光参数与复查处方对比",
  "stack": "React + Vite + TypeScript + CSS",
  "theme": [
    "#2563eb",
    "#059669",
    "#dc2626"
  ],
  "domain": "眼视光",
  "users": [
    "验光师",
    "门店顾问",
    "复查医生"
  ],
  "metrics": [
    "患者总数",
    "已逾期",
    "即将到期",
    "正常"
  ],
  "filters": [
    "儿童",
    "成人",
    "渐进片",
    "角膜塑形镜"
  ],
  "fields": [
    "裸眼视力",
    "矫正视力",
    "球镜",
    "柱镜",
    "轴位",
    "瞳距",
    "角膜曲率"
  ]
};

export const INITIAL_RECORDS: RefractionRecord[] = [
  {
    id: "r-001",
    patientNo: "Patient-032",
    category: "儿童近视",
    type: "初配",
    summary: "右眼-2.25DS/-0.50DC×180°，左眼-1.75DS/-0.25DC×175°，PD 58mm",
    patientName: "张小明",
    ageGroup: "儿童",
    gender: "男",
    examDate: "2026-02-15",
    rightEye: { nakedVision: "0.3", correctedVision: "1.0", sphere: "-2.25", cylinder: "-0.50", axis: "180", add: "" },
    leftEye: { nakedVision: "0.4", correctedVision: "1.0", sphere: "-1.75", cylinder: "-0.25", axis: "175", add: "" },
    pd: "58",
    cornealCurvature: { right: { horizontal: "42.50", vertical: "43.00" }, left: { horizontal: "42.75", vertical: "43.25" } },
    recommendation: "初次配镜，建议每3个月复查，注意用眼习惯，增加户外活动时间。"
  },
  {
    id: "r-001b",
    patientNo: "Patient-032",
    category: "儿童近视",
    type: "复查",
    summary: "右眼-2.75DS/-0.50DC×180°，左眼-2.25DS/-0.25DC×175°，PD 58mm",
    patientName: "张小明",
    ageGroup: "儿童",
    gender: "男",
    examDate: "2026-05-15",
    rightEye: { nakedVision: "0.25", correctedVision: "1.0", sphere: "-2.75", cylinder: "-0.50", axis: "180", add: "" },
    leftEye: { nakedVision: "0.3", correctedVision: "1.0", sphere: "-2.25", cylinder: "-0.25", axis: "175", add: "" },
    pd: "58",
    cornealCurvature: { right: { horizontal: "42.75", vertical: "43.25" }, left: { horizontal: "43.00", vertical: "43.50" } },
    recommendation: "近视进展较快，双眼各增加0.50D，建议增加户外活动时间，考虑角膜塑形镜控制近视进展，3个月后复查。"
  },
  {
    id: "r-002",
    patientNo: "Patient-081",
    category: "渐进片",
    type: "初配",
    summary: "ADD +1.50D，右眼+0.50DS/-0.75DC×90°，左眼+0.75DS/-1.00DC×85°，PD 63mm",
    patientName: "李建国",
    ageGroup: "中老年",
    gender: "男",
    examDate: "2026-04-20",
    rightEye: { nakedVision: "0.6", correctedVision: "1.0", sphere: "+0.50", cylinder: "-0.75", axis: "90", add: "+1.50" },
    leftEye: { nakedVision: "0.5", correctedVision: "1.0", sphere: "+0.75", cylinder: "-1.00", axis: "85", add: "+1.50" },
    pd: "63",
    cornealCurvature: { right: { horizontal: "43.25", vertical: "44.00" }, left: { horizontal: "43.50", vertical: "44.25" } },
    recommendation: "ADD +1.50，渐进片初配需确认瞳高，建议选择短通道渐进片，2周后回访适应情况。"
  },
  {
    id: "r-003",
    patientNo: "Patient-144",
    category: "散光",
    type: "初配",
    summary: "右眼-1.50DS/-0.75DC×15°，左眼-1.75DS/-1.00DC×165°，PD 60mm",
    patientName: "王思雨",
    ageGroup: "青少年",
    gender: "女",
    examDate: "2026-01-10",
    rightEye: { nakedVision: "0.5", correctedVision: "1.0", sphere: "-1.50", cylinder: "-0.75", axis: "15", add: "" },
    leftEye: { nakedVision: "0.5", correctedVision: "1.0", sphere: "-1.75", cylinder: "-1.00", axis: "165", add: "" },
    pd: "60",
    cornealCurvature: { right: { horizontal: "42.00", vertical: "43.25" }, left: { horizontal: "42.25", vertical: "43.50" } },
    recommendation: "散光度数较高，建议半年复查一次，注意用眼姿势，避免躺着看书。"
  },
  {
    id: "r-003b",
    patientNo: "Patient-144",
    category: "散光",
    type: "复查",
    summary: "右眼-1.50DS/-1.25DC×10°，左眼-1.75DS/-1.50DC×170°，PD 60mm",
    patientName: "王思雨",
    ageGroup: "青少年",
    gender: "女",
    examDate: "2026-06-01",
    rightEye: { nakedVision: "0.5", correctedVision: "1.0", sphere: "-1.50", cylinder: "-1.25", axis: "10", add: "" },
    leftEye: { nakedVision: "0.5", correctedVision: "1.0", sphere: "-1.75", cylinder: "-1.50", axis: "170", add: "" },
    pd: "60",
    cornealCurvature: { right: { horizontal: "42.00", vertical: "43.75" }, left: { horizontal: "42.25", vertical: "44.00" } },
    recommendation: "柱镜较上次增加0.50D，散光变化需关注，建议半年后复查，注意用眼姿势。"
  },
  {
    id: "r-004",
    patientNo: "Patient-256",
    category: "角膜塑形镜",
    type: "初配",
    summary: "右眼-3.00DS/-0.75DC×170°，左眼-3.25DS/-0.50DC×5°，PD 61mm",
    patientName: "陈晓峰",
    ageGroup: "儿童",
    gender: "男",
    examDate: "2026-02-20",
    rightEye: { nakedVision: "0.2", correctedVision: "1.0", sphere: "-3.00", cylinder: "-0.75", axis: "170", add: "" },
    leftEye: { nakedVision: "0.2", correctedVision: "1.0", sphere: "-3.25", cylinder: "-0.50", axis: "5", add: "" },
    pd: "61",
    cornealCurvature: { right: { horizontal: "43.00", vertical: "44.00" }, left: { horizontal: "43.25", vertical: "44.25" } },
    recommendation: "角膜塑形镜初配，夜间配戴，白天摘镜，需密切随访角膜地形图，1周、1个月、3个月定期复查。"
  },
  {
    id: "r-004b",
    patientNo: "Patient-256",
    category: "角膜塑形镜",
    type: "复查",
    summary: "右眼-3.25DS/-0.75DC×170°，左眼-3.50DS/-0.50DC×5°，PD 61mm",
    patientName: "陈晓峰",
    ageGroup: "儿童",
    gender: "男",
    examDate: "2026-05-20",
    rightEye: { nakedVision: "0.8", correctedVision: "1.0", sphere: "-3.25", cylinder: "-0.75", axis: "170", add: "" },
    leftEye: { nakedVision: "0.8", correctedVision: "1.0", sphere: "-3.50", cylinder: "-0.50", axis: "5", add: "" },
    pd: "61",
    cornealCurvature: { right: { horizontal: "42.75", vertical: "43.75" }, left: { horizontal: "43.00", vertical: "44.00" } },
    recommendation: "OK镜配戴3个月复查，白天裸眼视力0.8，近视略有进展，眼轴增长需关注，继续配戴，3个月后复查。"
  },
  {
    id: "r-005",
    patientNo: "Patient-312",
    category: "角膜塑形镜",
    type: "初配",
    summary: "右眼-2.00DS/-0.50DC×180°，左眼-2.00DS/-0.25DC×175°，PD 59mm",
    patientName: "刘梦瑶",
    ageGroup: "儿童",
    gender: "女",
    examDate: "2026-03-01",
    rightEye: { nakedVision: "0.3", correctedVision: "1.0", sphere: "-2.00", cylinder: "-0.50", axis: "180", add: "" },
    leftEye: { nakedVision: "0.3", correctedVision: "1.0", sphere: "-2.00", cylinder: "-0.25", axis: "175", add: "" },
    pd: "59",
    cornealCurvature: { right: { horizontal: "42.25", vertical: "43.00" }, left: { horizontal: "42.50", vertical: "43.25" } },
    recommendation: "角膜塑形镜初配，注意眼部卫生，按规范护理镜片，定期复查。"
  },
  {
    id: "r-005b",
    patientNo: "Patient-312",
    category: "角膜塑形镜",
    type: "复查",
    summary: "右眼-2.00DS/-0.50DC×180°，左眼-2.00DS/-0.25DC×175°，PD 59mm",
    patientName: "刘梦瑶",
    ageGroup: "儿童",
    gender: "女",
    examDate: "2026-06-15",
    rightEye: { nakedVision: "0.9", correctedVision: "1.0", sphere: "-2.00", cylinder: "-0.50", axis: "180", add: "" },
    leftEye: { nakedVision: "0.9", correctedVision: "1.0", sphere: "-2.00", cylinder: "-0.25", axis: "175", add: "" },
    pd: "59",
    cornealCurvature: { right: { horizontal: "42.25", vertical: "43.00" }, left: { horizontal: "42.50", vertical: "43.25" } },
    recommendation: "视力稳定，近视控制良好，继续保持，建议半年后复查。"
  },
  {
    id: "r-006",
    patientNo: "Patient-478",
    category: "角膜塑形镜",
    type: "初配",
    summary: "右眼-4.00DS/-1.00DC×10°，左眼-3.75DS/-0.75DC×170°，PD 62mm",
    patientName: "赵宇航",
    ageGroup: "青少年",
    gender: "男",
    examDate: "2026-02-10",
    rightEye: { nakedVision: "0.15", correctedVision: "1.0", sphere: "-4.00", cylinder: "-1.00", axis: "10", add: "" },
    leftEye: { nakedVision: "0.15", correctedVision: "1.0", sphere: "-3.75", cylinder: "-0.75", axis: "170", add: "" },
    pd: "62",
    cornealCurvature: { right: { horizontal: "43.50", vertical: "44.50" }, left: { horizontal: "43.75", vertical: "44.75" } },
    recommendation: "高度近视，建议角膜塑形镜联合低浓度阿托品控制近视，密切关注眼轴增长。"
  },
  {
    id: "r-006b",
    patientNo: "Patient-478",
    category: "角膜塑形镜",
    type: "复查",
    summary: "右眼-4.25DS/-1.25DC×10°，左眼-4.00DS/-1.00DC×170°，PD 62mm",
    patientName: "赵宇航",
    ageGroup: "青少年",
    gender: "男",
    examDate: "2026-05-18",
    rightEye: { nakedVision: "0.7", correctedVision: "1.0", sphere: "-4.25", cylinder: "-1.25", axis: "10", add: "" },
    leftEye: { nakedVision: "0.7", correctedVision: "1.0", sphere: "-4.00", cylinder: "-1.00", axis: "170", add: "" },
    pd: "62",
    cornealCurvature: { right: { horizontal: "43.25", vertical: "44.25" }, left: { horizontal: "43.50", vertical: "44.50" } },
    recommendation: "近视进展+0.25D，散光略有增加，眼压略高需关注，建议3个月后复查眼轴和视野。"
  },
  {
    id: "r-007",
    patientNo: "Patient-521",
    category: "渐进片",
    type: "初配",
    summary: "ADD +1.75D，右眼-1.00DS/-0.50DC×90°，左眼-0.75DS/-0.75DC×85°，PD 62mm",
    patientName: "周美玲",
    ageGroup: "成人",
    gender: "女",
    examDate: "2025-12-10",
    rightEye: { nakedVision: "0.7", correctedVision: "1.0", sphere: "-1.00", cylinder: "-0.50", axis: "90", add: "+1.75" },
    leftEye: { nakedVision: "0.7", correctedVision: "1.0", sphere: "-0.75", cylinder: "-0.75", axis: "85", add: "+1.75" },
    pd: "62",
    cornealCurvature: { right: { horizontal: "42.75", vertical: "43.50" }, left: { horizontal: "43.00", vertical: "43.75" } },
    recommendation: "花眼症状明显，渐进片初配，需适应期2-4周，建议室内外各备一副眼镜。"
  },
  {
    id: "r-008",
    patientNo: "Patient-666",
    category: "成人近视",
    type: "初配",
    summary: "右眼-3.00DS/-0.50DC×180°，左眼-2.75DS/-0.50DC×175°，PD 62mm",
    patientName: "孙晓燕",
    ageGroup: "成人",
    gender: "女",
    examDate: "2026-01-20",
    rightEye: { nakedVision: "0.2", correctedVision: "0.8", sphere: "-3.00", cylinder: "-0.50", axis: "180", add: "" },
    leftEye: { nakedVision: "0.25", correctedVision: "0.8", sphere: "-2.75", cylinder: "-0.50", axis: "175", add: "" },
    pd: "62",
    cornealCurvature: { right: { horizontal: "43.00", vertical: "44.00" }, left: { horizontal: "43.25", vertical: "44.25" } },
    recommendation: "双眼矫正视力0.8，略低于正常，建议进一步检查眼底，排除弱视可能，半年后复查。"
  },
  {
    id: "r-008b",
    patientNo: "Patient-666",
    category: "成人近视",
    type: "复查",
    summary: "右眼-3.00DS/-0.50DC×180°，左眼-2.75DS/-0.50DC×175°，PD 62mm",
    patientName: "孙晓燕",
    ageGroup: "成人",
    gender: "女",
    examDate: "2026-05-20",
    rightEye: { nakedVision: "0.2", correctedVision: "1.0", sphere: "-3.00", cylinder: "-0.50", axis: "180", add: "" },
    leftEye: { nakedVision: "0.25", correctedVision: "1.0", sphere: "-2.75", cylinder: "-0.50", axis: "175", add: "" },
    pd: "62",
    cornealCurvature: { right: { horizontal: "43.00", vertical: "44.00" }, left: { horizontal: "43.25", vertical: "44.25" } },
    recommendation: "矫正视力提升至1.0，屈光度数稳定，建议半年后复查。"
  },
  {
    id: "r-009",
    patientNo: "Patient-777",
    category: "角膜塑形镜",
    type: "初配",
    summary: "右眼-2.50DS/-0.75DC×90°，左眼-2.25DS/-0.75DC×85°，PD 60mm",
    patientName: "钱天佑",
    ageGroup: "儿童",
    gender: "男",
    examDate: "2026-02-25",
    rightEye: { nakedVision: "0.3", correctedVision: "1.0", sphere: "-2.50", cylinder: "-0.75", axis: "90", add: "" },
    leftEye: { nakedVision: "0.3", correctedVision: "1.0", sphere: "-2.25", cylinder: "-0.75", axis: "85", add: "" },
    pd: "60",
    cornealCurvature: { right: { horizontal: "42.50", vertical: "43.50" }, left: { horizontal: "42.75", vertical: "43.75" } },
    recommendation: "OK镜初配，曲率偏高，需密切随访角膜形态变化，1周后首次复查。"
  },
  {
    id: "r-009b",
    patientNo: "Patient-777",
    category: "角膜塑形镜",
    type: "复查",
    summary: "右眼-2.50DS/-0.75DC×90°，左眼-2.25DS/-0.75DC×85°，PD 60mm",
    patientName: "钱天佑",
    ageGroup: "儿童",
    gender: "男",
    examDate: "2026-05-25",
    rightEye: { nakedVision: "0.8", correctedVision: "1.0", sphere: "-2.50", cylinder: "-0.75", axis: "90", add: "" },
    leftEye: { nakedVision: "0.8", correctedVision: "1.0", sphere: "-2.25", cylinder: "-0.75", axis: "85", add: "" },
    pd: "60",
    cornealCurvature: { right: { horizontal: "42.00", vertical: "43.00" }, left: { horizontal: "42.25", vertical: "43.25" } },
    recommendation: "OK镜配戴3个月，角膜曲率变平0.50D，塑形效果良好，屈光度数稳定，建议3个月后复查。"
  }
];
