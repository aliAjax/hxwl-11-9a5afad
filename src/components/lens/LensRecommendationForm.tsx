import React, { useState } from "react";
import type { LensRecommendationInput, LensRecommendationResult } from "../../types";
import { generateLensRecommendation } from "../../utils";
import { ageGroups } from "../../csvParsers";
import { lensTypes } from "../../constants";
import { cleanNumber } from "../../validation";

export function LensRecommendationForm({
  onGenerate,
  disabled
}: {
  onGenerate: (result: LensRecommendationResult) => void;
  disabled?: boolean;
}) {
  const [formData, setFormData] = useState<LensRecommendationInput>({
    ageGroup: "",
    isReview: false,
    lensType: "",
    rightSphere: "",
    leftSphere: "",
    rightCylinder: "",
    leftCylinder: "",
    cylinderChange: "",
  });

  const handleFieldChange = (field: keyof LensRecommendationInput, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.ageGroup || !formData.lensType) return;
    const result = generateLensRecommendation(formData);
    onGenerate(result);
  };

  const canGenerate = formData.ageGroup && formData.lensType && !disabled;

  return (
    <form className="recommendation-form" onSubmit={handleGenerate}>
      <div className="form-section">
        <div className="form-section-title">基础信息</div>
        <div className="form-row">
          <label>
            <span>年龄段 *</span>
            <select
              value={formData.ageGroup}
              onChange={e => handleFieldChange("ageGroup", e.target.value)}
              disabled={disabled}
            >
              <option value="">请选择</option>
              {ageGroups.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label>
            <span>用镜类型 *</span>
            <select
              value={formData.lensType}
              onChange={e => handleFieldChange("lensType", e.target.value)}
              disabled={disabled}
            >
              <option value="">请选择</option>
              {lensTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={formData.isReview}
            onChange={e => handleFieldChange("isReview", e.target.checked)}
            disabled={disabled}
          />
          <span>为复查患者（非初次配镜）</span>
        </label>
      </div>

      <div className="form-section">
        <div className="form-section-title">屈光参数</div>
        <div className="eyes-row">
          <div className="eye-block">
            <div className="eye-block-title">右眼 (OD)</div>
            <div className="eye-fields-grid">
              <label>
                <span>球镜 (DS)</span>
                <input
                  type="text"
                  placeholder="如 -2.75"
                  value={formData.rightSphere}
                  onChange={e => handleFieldChange("rightSphere", cleanNumber(e.target.value, true))}
                  disabled={disabled}
                />
              </label>
              <label>
                <span>柱镜 (DC)</span>
                <input
                  type="text"
                  placeholder="如 -0.50"
                  value={formData.rightCylinder}
                  onChange={e => handleFieldChange("rightCylinder", cleanNumber(e.target.value, true))}
                  disabled={disabled}
                />
              </label>
            </div>
          </div>
          <div className="eye-block">
            <div className="eye-block-title">左眼 (OS)</div>
            <div className="eye-fields-grid">
              <label>
                <span>球镜 (DS)</span>
                <input
                  type="text"
                  placeholder="如 -2.50"
                  value={formData.leftSphere}
                  onChange={e => handleFieldChange("leftSphere", cleanNumber(e.target.value, true))}
                  disabled={disabled}
                />
              </label>
              <label>
                <span>柱镜 (DC)</span>
                <input
                  type="text"
                  placeholder="如 -0.75"
                  value={formData.leftCylinder}
                  onChange={e => handleFieldChange("leftCylinder", cleanNumber(e.target.value, true))}
                  disabled={disabled}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">变化情况</div>
        <label>
          <span>散光变化量 (DC)</span>
          <input
            type="text"
            placeholder="与上次相比的散光变化，如 0.50"
            value={formData.cylinderChange}
            onChange={e => handleFieldChange("cylinderChange", cleanNumber(e.target.value, true))}
            disabled={disabled}
          />
          <em className="field-hint">可选项，已知上次度数可填写以评估变化幅度</em>
        </label>
      </div>

      <div className="form-actions">
        <button
          type="submit"
          className="primary-action"
          disabled={!canGenerate}
        >
          生成配镜建议
        </button>
      </div>
    </form>
  );
}
