import React from "react";
import type { LensRecommendationResult } from "../../types";
import { LENS_CATEGORY_CONFIG as lensCategoryConfig } from "../../types";

export function LensRecommendationResultDisplay({
  result,
  onReset
}: {
  result: LensRecommendationResult;
  onReset: () => void;
}) {
  const config = lensCategoryConfig[result.category];

  return (
    <div className={`recommendation-result ${config.className}`}>
      <div className="recommendation-header">
        <div className="recommendation-icon">{config.icon}</div>
        <div>
          <div className="recommendation-category">{result.categoryLabel}</div>
          <h3>{result.primaryAdvice}</h3>
        </div>
      </div>

      {result.doctorConfirmationRequired && (
        <div className="recommendation-warning">
          <div className="warning-icon">⚠️</div>
          <div>
            <strong>需要医生确认</strong>
            <ul>
              {result.confirmationReasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="recommendation-section">
        <h4>详细建议</h4>
        <ul className="recommendation-list">
          {result.detailedAdvice.map((advice, i) => (
            <li key={i}>{advice}</li>
          ))}
        </ul>
      </div>

      <div className="recommendation-meta">
        <div className="meta-item">
          <span className="meta-label">建议复查周期</span>
          <span className="meta-value">{result.reviewCycle}</span>
        </div>
      </div>

      <div className="recommendation-disclaimers">
        <p className="disclaimer-title">温馨提示</p>
        {result.disclaimers.map((d, i) => (
          <p key={i} className="disclaimer-text">• {d}</p>
        ))}
      </div>

      <div className="recommendation-actions">
        <button className="ghost-btn" onClick={onReset}>重新生成</button>
      </div>
    </div>
  );
}
