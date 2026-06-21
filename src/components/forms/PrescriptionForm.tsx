import { useState, useRef, useCallback, useEffect } from "react";
import type { RefractionRecord, EyeRefraction, EyeCurvature, CornealCurvature, PrescriptionErrors } from "../../types";
import type { PrescriptionFormData } from "../../types";
import { EMPTY_EYE, EMPTY_CURVATURE, EMPTY_PRESCRIPTION_FORM, CATEGORIES, EXAM_TYPES, GENDERS } from "../../types/form";
import { ageGroups } from "../../csvParsers";
import { formatLocalDate } from "../../csvParsers";
import { parseSafeNumber, cleanNumber } from "../../validation";
import { validateVision, validateSphere, validateCylinder, validateAxis, validateAdd, validatePd, validateCurvature } from "../../validation";

export function PrescriptionForm({
  onSubmit,
  onCancel,
  readOnly = false,
  initialData,
  draftData,
  draftSavedAt,
  onDraftChange,
  onDraftDiscard,
  onDirtyChange,
  submitRef
}: {
  onSubmit: (record: Omit<RefractionRecord, "id" | "summary"> & { summary: string }) => void;
  onCancel: () => void;
  readOnly?: boolean;
  initialData?: RefractionRecord;
  draftData?: PrescriptionFormData | null;
  draftSavedAt?: string | null;
  onDraftChange?: (data: PrescriptionFormData) => void;
  onDraftDiscard?: () => void;
  onDirtyChange?: (dirty: boolean, data: PrescriptionFormData) => void;
  submitRef?: React.MutableRefObject<(() => boolean) | null>;
}) {
  const resolveInitialFormData = (): PrescriptionFormData => {
    if (initialData) {
      return {
        patientNo: initialData.patientNo,
        patientName: initialData.patientName,
        ageGroup: initialData.ageGroup,
        gender: initialData.gender,
        examDate: initialData.examDate,
        category: initialData.category,
        type: initialData.type,
        rightEye: { ...initialData.rightEye },
        leftEye: { ...initialData.leftEye },
        pd: initialData.pd,
        cornealCurvature: {
          right: { ...initialData.cornealCurvature.right },
          left: { ...initialData.cornealCurvature.left }
        },
        recommendation: initialData.recommendation
      };
    }
    if (draftData) {
      return {
        patientNo: draftData.patientNo || "",
        patientName: draftData.patientName || "",
        ageGroup: draftData.ageGroup || "",
        gender: draftData.gender || "",
        examDate: draftData.examDate || formatLocalDate(new Date()),
        category: draftData.category || "",
        type: draftData.type || "初配",
        rightEye: { ...EMPTY_EYE, ...draftData.rightEye },
        leftEye: { ...EMPTY_EYE, ...draftData.leftEye },
        pd: draftData.pd || "",
        cornealCurvature: {
          right: { ...EMPTY_CURVATURE, ...(draftData.cornealCurvature?.right || {}) },
          left: { ...EMPTY_CURVATURE, ...(draftData.cornealCurvature?.left || {}) }
        },
        recommendation: draftData.recommendation || ""
      };
    }
    return { ...EMPTY_PRESCRIPTION_FORM, examDate: formatLocalDate(new Date()) };
  };

  const [formData, setFormData] = useState<PrescriptionFormData>(resolveInitialFormData);
  const [errors, setErrors] = useState<PrescriptionErrors>({});
  const [showDraftBanner, setShowDraftBanner] = useState(!!draftData);
  const [dirty, setDirty] = useState(false);
  const baseDataRef = useRef<PrescriptionFormData>(resolveInitialFormData());
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computePrescriptionDirty = useCallback((data: PrescriptionFormData, base: PrescriptionFormData): boolean => {
    if (data.patientNo !== base.patientNo) return true;
    if (data.patientName !== base.patientName) return true;
    if (data.ageGroup !== base.ageGroup) return true;
    if (data.gender !== base.gender) return true;
    if (data.examDate !== base.examDate) return true;
    if (data.category !== base.category) return true;
    if (data.type !== base.type) return true;
    if (data.pd !== base.pd) return true;
    if (data.recommendation !== base.recommendation) return true;
    const re = data.rightEye, bre = base.rightEye;
    if (re.nakedVision !== bre.nakedVision || re.correctedVision !== bre.correctedVision ||
        re.sphere !== bre.sphere || re.cylinder !== bre.cylinder ||
        re.axis !== bre.axis || re.add !== bre.add) return true;
    const le = data.leftEye, ble = base.leftEye;
    if (le.nakedVision !== ble.nakedVision || le.correctedVision !== ble.correctedVision ||
        le.sphere !== ble.sphere || le.cylinder !== ble.cylinder ||
        le.axis !== ble.axis || le.add !== ble.add) return true;
    const rcc = data.cornealCurvature.right, brcc = base.cornealCurvature.right;
    if (rcc.horizontal !== brcc.horizontal || rcc.vertical !== brcc.vertical) return true;
    const lcc = data.cornealCurvature.left, blcc = base.cornealCurvature.left;
    if (lcc.horizontal !== blcc.horizontal || lcc.vertical !== blcc.vertical) return true;
    return false;
  }, []);

  const notifyDirty = useCallback((data: PrescriptionFormData) => {
    const isDirty = computePrescriptionDirty(data, baseDataRef.current);
    setDirty(isDirty);
    if (onDirtyChange) onDirtyChange(isDirty, data);
  }, [computePrescriptionDirty, onDirtyChange]);

  const notifyDraftChange = useCallback((data: PrescriptionFormData) => {
    if (!onDraftChange) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      onDraftChange(data);
    }, 800);
  }, [onDraftChange]);

  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, []);

  const setField = <K extends keyof PrescriptionFormData>(field: K, value: PrescriptionFormData[K]) => {
    if (field === "pd") {
      value = cleanNumber(value as string, false) as PrescriptionFormData[K];
    }
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      notifyDirty(next);
      notifyDraftChange(next);
      return next;
    });
  };

  const setEyeField = (
    eye: "rightEye" | "leftEye",
    field: keyof EyeRefraction,
    value: string
  ) => {
    let cleaned = value;
    if (field === "sphere" || field === "cylinder" || field === "add") {
      cleaned = cleanNumber(value, true);
    } else if (field === "nakedVision" || field === "correctedVision") {
      cleaned = cleanNumber(value, false);
    } else if (field === "axis") {
      cleaned = cleanNumber(value, false);
    }
    setFormData(prev => {
      const next = {
        ...prev,
        [eye]: { ...prev[eye], [field]: cleaned }
      };
      notifyDirty(next);
      notifyDraftChange(next);
      return next;
    });
  };

  const setCurvatureField = (
    eye: "right" | "left",
    field: keyof EyeCurvature,
    value: string
  ) => {
    const cleaned = cleanNumber(value, false);
    setFormData(prev => {
      const next = {
        ...prev,
        cornealCurvature: {
          ...prev.cornealCurvature,
          [eye]: { ...prev.cornealCurvature[eye], [field]: cleaned }
        }
      };
      notifyDirty(next);
      notifyDraftChange(next);
      return next;
    });
  };

  const validate = (): PrescriptionErrors => {
    const newErrors: PrescriptionErrors = {};
    if (!formData.patientNo.trim()) newErrors.patientNo = { message: "必填" };
    if (!formData.patientName.trim()) newErrors.patientName = { message: "必填" };
    if (!formData.ageGroup) newErrors.ageGroup = { message: "必选" };
    if (!formData.gender) newErrors.gender = { message: "必选" };
    if (!formData.examDate) newErrors.examDate = { message: "必选" };

    const re = formData.rightEye;
    const reErrors: PrescriptionErrors["rightEye"] = {};
    const nv = validateVision(re.nakedVision); if (nv) reErrors.nakedVision = nv;
    const cv = validateVision(re.correctedVision); if (cv) reErrors.correctedVision = cv;
    const sp = validateSphere(re.sphere); if (sp) reErrors.sphere = sp;
    const cy = validateCylinder(re.cylinder); if (cy) reErrors.cylinder = cy;
    const ax = validateAxis(re.axis, !!re.cylinder.trim()); if (ax) reErrors.axis = ax;
    const ad = validateAdd(re.add); if (ad) reErrors.add = ad;
    if (Object.keys(reErrors).length > 0) newErrors.rightEye = reErrors;

    const le = formData.leftEye;
    const leErrors: PrescriptionErrors["leftEye"] = {};
    const lnv = validateVision(le.nakedVision); if (lnv) leErrors.nakedVision = lnv;
    const lcv = validateVision(le.correctedVision); if (lcv) leErrors.correctedVision = lcv;
    const lsp = validateSphere(le.sphere); if (lsp) leErrors.sphere = lsp;
    const lcy = validateCylinder(le.cylinder); if (lcy) leErrors.cylinder = lcy;
    const lax = validateAxis(le.axis, !!le.cylinder.trim()); if (lax) leErrors.axis = lax;
    const lad = validateAdd(le.add); if (lad) leErrors.add = lad;
    if (Object.keys(leErrors).length > 0) newErrors.leftEye = leErrors;

    const pdErr = validatePd(formData.pd); if (pdErr) newErrors.pd = pdErr;

    const ccErrors: PrescriptionErrors["cornealCurvature"] = {};
    const rch = validateCurvature(formData.cornealCurvature.right.horizontal);
    const rcv = validateCurvature(formData.cornealCurvature.right.vertical);
    const lch = validateCurvature(formData.cornealCurvature.left.horizontal);
    const lcv2 = validateCurvature(formData.cornealCurvature.left.vertical);
    if (rch || rcv) ccErrors.right = { horizontal: rch, vertical: rcv };
    if (lch || lcv2) ccErrors.left = { horizontal: lch, vertical: lcv2 };
    if (Object.keys(ccErrors).length > 0) newErrors.cornealCurvature = ccErrors;

    return newErrors;
  };

  const formatNumber = (value: string, decimals: number = 2): string => {
    const num = parseSafeNumber(value);
    if (num === null) return value;
    return num.toFixed(decimals);
  };

  const generateSummary = (): string => {
    const parts: string[] = [];
    const reAddNum = parseSafeNumber(formData.rightEye.add);
    if (reAddNum !== null && reAddNum > 0) {
      parts.push(`ADD ${formatNumber(formData.rightEye.add)}D`);
    }
    const reSphere = formatNumber(formData.rightEye.sphere);
    const reCylNum = parseSafeNumber(formData.rightEye.cylinder);
    const hasRCylinder = reCylNum !== null && reCylNum !== 0;
    const reText = `右眼${reSphere}DS${hasRCylinder ? `/${formatNumber(formData.rightEye.cylinder)}DC×${formatNumber(formData.rightEye.axis, 0)}°` : ""}`;
    parts.push(reText);
    const leSphere = formatNumber(formData.leftEye.sphere);
    const leCylNum = parseSafeNumber(formData.leftEye.cylinder);
    const hasLCylinder = leCylNum !== null && leCylNum !== 0;
    const leText = `左眼${leSphere}DS${hasLCylinder ? `/${formatNumber(formData.leftEye.cylinder)}DC×${formatNumber(formData.leftEye.axis, 0)}°` : ""}`;
    parts.push(leText);
    const pdNum = parseSafeNumber(formData.pd);
    parts.push(`PD ${pdNum !== null ? pdNum.toFixed(0) : formData.pd}mm`);
    return parts.join("，");
  };

  const sanitizeEyeData = (eye: EyeRefraction): EyeRefraction => ({
    nakedVision: formatNumber(eye.nakedVision, 2),
    correctedVision: formatNumber(eye.correctedVision, 2),
    sphere: formatNumber(eye.sphere, 2),
    cylinder: formatNumber(eye.cylinder, 2),
    axis: formatNumber(eye.axis, 0),
    add: eye.add ? formatNumber(eye.add, 2) : ""
  });

  const sanitizeCurvature = (curv: EyeCurvature): EyeCurvature => ({
    horizontal: curv.horizontal ? formatNumber(curv.horizontal, 2) : "",
    vertical: curv.vertical ? formatNumber(curv.vertical, 2) : ""
  });

  const trySubmit = useCallback((): boolean => {
    if (readOnly) return false;
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return false;

    const sanitizedRightEye = sanitizeEyeData(formData.rightEye);
    const sanitizedLeftEye = sanitizeEyeData(formData.leftEye);
    const sanitizedCurvature: CornealCurvature = {
      right: sanitizeCurvature(formData.cornealCurvature.right),
      left: sanitizeCurvature(formData.cornealCurvature.left)
    };
    const sanitizedPd = formatNumber(formData.pd, 0);

    const summary = generateSummary();
    onSubmit({
      patientNo: formData.patientNo.trim(),
      category: formData.category.trim() || formData.ageGroup,
      type: formData.type,
      summary,
      patientName: formData.patientName.trim(),
      ageGroup: formData.ageGroup,
      gender: formData.gender,
      examDate: formData.examDate,
      rightEye: sanitizedRightEye,
      leftEye: sanitizedLeftEye,
      pd: sanitizedPd,
      cornealCurvature: sanitizedCurvature,
      recommendation: formData.recommendation.trim()
    });
    setDirty(false);
    if (onDirtyChange) onDirtyChange(false, EMPTY_PRESCRIPTION_FORM);
    setFormData({ ...EMPTY_PRESCRIPTION_FORM, examDate: formatLocalDate(new Date()) });
    setErrors({});
    return true;
  }, [readOnly, formData, onSubmit, onDirtyChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    trySubmit();
  };

  useEffect(() => {
    if (submitRef) {
      submitRef.current = trySubmit;
    }
    return () => {
      if (submitRef) {
        submitRef.current = null;
      }
    };
  }, [submitRef, trySubmit]);

  const EyeBlock = ({ eye, title, eyeErrors }: {
    eye: "rightEye" | "leftEye";
    title: string;
    eyeErrors: PrescriptionErrors["rightEye"];
  }) => {
    const data = formData[eye];
    const err = eyeErrors || {};
    return (
      <div className="eye-block">
        <div className="eye-block-title">{title}</div>
        <div className="eye-fields-grid">
          <label className={err.nakedVision ? "field-error" : ""}>
            <span>裸眼视力</span>
            <input
              type="text"
              placeholder="如 0.3"
              value={data.nakedVision}
              onChange={e => setEyeField(eye, "nakedVision", e.target.value)}
              readOnly={readOnly}
            />
            {err.nakedVision && <em>{err.nakedVision.message}</em>}
          </label>
          <label className={err.correctedVision ? "field-error" : ""}>
            <span>矫正视力</span>
            <input
              type="text"
              placeholder="如 1.0"
              value={data.correctedVision}
              onChange={e => setEyeField(eye, "correctedVision", e.target.value)}
              readOnly={readOnly}
            />
            {err.correctedVision && <em>{err.correctedVision.message}</em>}
          </label>
          <label className={err.sphere ? "field-error" : ""}>
            <span>球镜 (DS)</span>
            <input
              type="text"
              placeholder="如 -2.75"
              value={data.sphere}
              onChange={e => setEyeField(eye, "sphere", e.target.value)}
              readOnly={readOnly}
            />
            {err.sphere && <em>{err.sphere.message}</em>}
          </label>
          <label className={err.cylinder ? "field-error" : ""}>
            <span>柱镜 (DC)</span>
            <input
              type="text"
              placeholder="如 -0.50"
              value={data.cylinder}
              onChange={e => setEyeField(eye, "cylinder", e.target.value)}
              readOnly={readOnly}
            />
            {err.cylinder && <em>{err.cylinder.message}</em>}
          </label>
          <label className={err.axis ? "field-error" : ""}>
            <span>轴位 (°)</span>
            <input
              type="text"
              placeholder="如 180"
              value={data.axis}
              onChange={e => setEyeField(eye, "axis", e.target.value)}
              readOnly={readOnly}
            />
            {err.axis && <em>{err.axis.message}</em>}
          </label>
          <label className={err.add ? "field-error" : ""}>
            <span>ADD (D)</span>
            <input
              type="text"
              placeholder="老花/渐进时填，如 +1.50"
              value={data.add}
              onChange={e => setEyeField(eye, "add", e.target.value)}
              readOnly={readOnly}
            />
            {err.add && <em>{err.add.message}</em>}
          </label>
        </div>
      </div>
    );
  };

  return (
    <form className="prescription-form" onSubmit={handleSubmit}>
      {showDraftBanner && draftSavedAt && (
        <div className="draft-banner">
          <span className="draft-banner-icon">📋</span>
          <span className="draft-banner-text">
            已恢复 {new Date(draftSavedAt).toLocaleString("zh-CN")} 保存的草稿
          </span>
          <button type="button" className="draft-banner-discard" onClick={() => {
            setShowDraftBanner(false);
            setFormData({ ...EMPTY_PRESCRIPTION_FORM, examDate: formatLocalDate(new Date()) });
            baseDataRef.current = { ...EMPTY_PRESCRIPTION_FORM, examDate: formatLocalDate(new Date()) };
            setDirty(false);
            if (onDirtyChange) onDirtyChange(false, EMPTY_PRESCRIPTION_FORM);
            if (onDraftDiscard) onDraftDiscard();
          }}>
            丢弃草稿
          </button>
          <button type="button" className="draft-banner-close" onClick={() => setShowDraftBanner(false)}>
            ✕
          </button>
        </div>
      )}
      <div className="form-section">
        <div className="form-section-title">基础信息</div>
        <div className="form-row">
          <label className={errors.patientNo ? "field-error" : ""}>
            <span>患者编号 *</span>
            <input
              type="text"
              placeholder="如 Patient-100"
              value={formData.patientNo}
              onChange={e => setField("patientNo", e.target.value)}
              readOnly={readOnly}
            />
            {errors.patientNo && <em>{errors.patientNo.message}</em>}
          </label>
          <label className={errors.patientName ? "field-error" : ""}>
            <span>患者姓名 *</span>
            <input
              type="text"
              placeholder="如 张小明"
              value={formData.patientName}
              onChange={e => setField("patientName", e.target.value)}
              readOnly={readOnly}
            />
            {errors.patientName && <em>{errors.patientName.message}</em>}
          </label>
        </div>
        <div className="form-row">
          <label className={errors.ageGroup ? "field-error" : ""}>
            <span>年龄段 *</span>
            <select
              value={formData.ageGroup}
              onChange={e => setField("ageGroup", e.target.value)}
              disabled={readOnly}
            >
              <option value="">请选择</option>
              {ageGroups.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {errors.ageGroup && <em>{errors.ageGroup.message}</em>}
          </label>
          <label className={errors.gender ? "field-error" : ""}>
            <span>性别 *</span>
            <select
              value={formData.gender}
              onChange={e => setField("gender", e.target.value)}
              disabled={readOnly}
            >
              <option value="">请选择</option>
              {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            {errors.gender && <em>{errors.gender.message}</em>}
          </label>
        </div>
        <div className="form-row">
          <label className={errors.examDate ? "field-error" : ""}>
            <span>检查日期 *</span>
            <input
              type="date"
              value={formData.examDate}
              onChange={e => setField("examDate", e.target.value)}
              readOnly={readOnly}
            />
            {errors.examDate && <em>{errors.examDate.message}</em>}
          </label>
          <label>
            <span>类型</span>
            <select
              value={formData.type}
              onChange={e => setField("type", e.target.value)}
              disabled={readOnly}
            >
              {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            <span>分类（可选）</span>
            <select
              value={formData.category}
              onChange={e => setField("category", e.target.value)}
              disabled={readOnly}
            >
              <option value="">（自动根据年龄判断）</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className={errors.pd ? "field-error" : ""}>
            <span>瞳距 PD (mm) *</span>
            <input
              type="text"
              placeholder="如 58"
              value={formData.pd}
              onChange={e => setField("pd", e.target.value)}
              readOnly={readOnly}
            />
            {errors.pd && <em>{errors.pd.message}</em>}
          </label>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">屈光参数（必填）</div>
        <div className="eyes-row">
          <EyeBlock eye="rightEye" title="右眼 (OD)" eyeErrors={errors.rightEye} />
          <EyeBlock eye="leftEye" title="左眼 (OS)" eyeErrors={errors.leftEye} />
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">角膜曲率（可选，35~50D，0.25D步进）</div>
        <div className="eyes-row">
          <div className="eye-block">
            <div className="eye-block-title">右眼 (OD)</div>
            <div className="eye-fields-grid">
              <label className={errors.cornealCurvature?.right?.horizontal ? "field-error" : ""}>
                <span>水平曲率 (D)</span>
                <input
                  type="text"
                  placeholder="如 42.50"
                  value={formData.cornealCurvature.right.horizontal}
                  onChange={e => setCurvatureField("right", "horizontal", e.target.value)}
                  readOnly={readOnly}
                />
                {errors.cornealCurvature?.right?.horizontal && <em>{errors.cornealCurvature.right.horizontal.message}</em>}
              </label>
              <label className={errors.cornealCurvature?.right?.vertical ? "field-error" : ""}>
                <span>垂直曲率 (D)</span>
                <input
                  type="text"
                  placeholder="如 43.00"
                  value={formData.cornealCurvature.right.vertical}
                  onChange={e => setCurvatureField("right", "vertical", e.target.value)}
                  readOnly={readOnly}
                />
                {errors.cornealCurvature?.right?.vertical && <em>{errors.cornealCurvature.right.vertical.message}</em>}
              </label>
            </div>
          </div>
          <div className="eye-block">
            <div className="eye-block-title">左眼 (OS)</div>
            <div className="eye-fields-grid">
              <label className={errors.cornealCurvature?.left?.horizontal ? "field-error" : ""}>
                <span>水平曲率 (D)</span>
                <input
                  type="text"
                  placeholder="如 42.75"
                  value={formData.cornealCurvature.left.horizontal}
                  onChange={e => setCurvatureField("left", "horizontal", e.target.value)}
                  readOnly={readOnly}
                />
                {errors.cornealCurvature?.left?.horizontal && <em>{errors.cornealCurvature.left.horizontal.message}</em>}
              </label>
              <label className={errors.cornealCurvature?.left?.vertical ? "field-error" : ""}>
                <span>垂直曲率 (D)</span>
                <input
                  type="text"
                  placeholder="如 43.25"
                  value={formData.cornealCurvature.left.vertical}
                  onChange={e => setCurvatureField("left", "vertical", e.target.value)}
                  readOnly={readOnly}
                />
                {errors.cornealCurvature?.left?.vertical && <em>{errors.cornealCurvature.left.vertical.message}</em>}
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">验配建议（可选）</div>
        <label>
          <textarea
            placeholder="填写验配建议，如近视控制方案、复查周期等..."
            value={formData.recommendation}
            onChange={e => setField("recommendation", e.target.value)}
            rows={3}
            readOnly={readOnly}
          />
        </label>
      </div>

      {!readOnly && (
        <div className="form-actions">
          <button type="button" className="ghost-btn" onClick={() => {
            setDirty(false);
            if (onDirtyChange) onDirtyChange(false, EMPTY_PRESCRIPTION_FORM);
            setFormData({ ...EMPTY_PRESCRIPTION_FORM, examDate: formatLocalDate(new Date()) }); setErrors({}); onCancel();
          }}>取消</button>
          <button type="submit" className="primary-action">{initialData ? "保存修改" : "生成记录并加入列表"}</button>
        </div>
      )}
    </form>
  );
}
