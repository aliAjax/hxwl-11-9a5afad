import { useState } from "react";
import { CSV_FIELD_MAPPINGS, type CsvParseResult, parseCsvText } from "../../csvParsers";
import type { RefractionRecord } from "../../types";

export function ImportPreview({
  onConfirm,
  onCancel
}: {
  onConfirm: (records: Array<Omit<RefractionRecord, "id" | "summary"> & { summary: string }>) => void;
  onCancel: () => void;
}) {
  const [csvText, setCsvText] = useState("");
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [hasParsed, setHasParsed] = useState(false);

  const handleParse = () => {
    const result = parseCsvText(csvText);
    setParseResult(result);
    setHasParsed(true);
  };

  const handleClear = () => {
    setCsvText("");
    setParseResult(null);
    setHasParsed(false);
  };

  const handleConfirm = () => {
    if (!parseResult || parseResult.validRows.length === 0) return;
    if (parseResult.missingRequired.length > 0) return;
    const records = parseResult.validRows.map(row => row.record);
    onConfirm(records);
    setCsvText("");
    setParseResult(null);
    setHasParsed(false);
  };

  const canConfirm = parseResult && parseResult.validRows.length > 0 && parseResult.missingRequired.length === 0;

  const sampleHeaders = CSV_FIELD_MAPPINGS.map(f => f.label);
  const sampleCsv = [
    sampleHeaders.join(","),
    "Patient-201,王小明,儿童近视,2026-06-10,-2.50,-0.50,180,-2.25,-0.50,175,复查,儿童,58,视力稳定，继续保持",
    "Patient-202,李小红,成人近视,2026-06-12,-3.00,-0.75,90,-2.75,-0.50,85,初配,成人,62,初次配镜"
  ].join("\n");

  return (
    <div className="import-preview">
      <div className="import-section">
        <div className="form-section-title">粘贴CSV数据</div>
        <p className="import-hint">
          自动识别表头，支持多种列名：{sampleHeaders.join("、")}
        </p>
        <textarea
          className="import-textarea"
          placeholder={`请粘贴带表头的CSV数据，系统将自动匹配列名。\n支持的表头别名：患者编号/编号/patientNo、姓名、分类、检查日期、右眼球镜/R球镜 等\n\n示例：\n${sampleCsv}`}
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          rows={8}
        />
        <div className="import-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
          <button type="button" className="ghost-btn" onClick={handleClear}>清空</button>
          <button
            type="button"
            className="primary-action"
            onClick={handleParse}
            disabled={!csvText.trim()}
          >
            解析预览
          </button>
        </div>
      </div>

      {hasParsed && parseResult && (
        <div className="parse-results">
          {parseResult.missingRequired.length > 0 && (
            <div className="parse-error-section">
              <div className="parse-result-header error">
                <span>✕ 缺少必需列</span>
              </div>
              <div className="missing-columns-warning">
                <p>以下必需列未在表头中找到，无法确认导入：</p>
                <ul>
                  {parseResult.missingRequired.map((col, i) => (
                    <li key={i}>{col}</li>
                  ))}
                </ul>
                <p className="hint-text">请在CSV数据首行添加对应的列名后重试。</p>
              </div>
            </div>
          )}

          {parseResult.extraColumns.length > 0 && (
            <div className="parse-warning-section">
              <div className="parse-result-header warning">
                <span>⚠ 额外列（将被忽略）</span>
              </div>
              <div className="extra-columns-info">
                <p>以下列未被识别，导入时将被忽略：</p>
                <ul>
                  {parseResult.extraColumns.map((col, i) => (
                    <li key={i}>{col}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {parseResult.validRows.length > 0 && (
            <div className="parse-success-section">
              <div className="parse-result-header success">
                <span>✓ 可导入记录</span>
                <span className="parse-count">{parseResult.validRows.length} 条</span>
              </div>
              <div className="parse-table-wrapper">
                <table className="parse-table">
                  <thead>
                    <tr>
                      <th style={{ width: "50px" }}>序号</th>
                      <th>患者编号</th>
                      <th>分类</th>
                      <th>类型</th>
                      <th>右眼处方摘要</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.validRows.map((row) => (
                      <tr key={row.rowIndex}>
                        <td className="row-index">{row.rowIndex}</td>
                        <td className="mono">{row.record.patientNo}</td>
                        <td>{row.record.category || "—"}</td>
                        <td>
                          <span className={`type-badge type-${row.record.type}`}>
                            {row.record.type}
                          </span>
                        </td>
                        <td className="mono">{row.rightEyeSummary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parseResult.errorRows.length > 0 && (
            <div className="parse-error-section">
              <div className="parse-result-header error">
                <span>✕ 错误行（将被跳过）</span>
                <span className="parse-count">{parseResult.errorRows.length} 条</span>
              </div>
              <div className="parse-table-wrapper error-table">
                <table className="parse-table">
                  <thead>
                    <tr>
                      <th style={{ width: "50px" }}>行号</th>
                      <th>原始内容</th>
                      <th>错误信息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.errorRows.map((row) => (
                      <tr key={row.rowIndex} className="error-row">
                        <td className="row-index">{row.rowIndex}</td>
                        <td className="raw-text">{row.rowText}</td>
                        <td className="error-cell">
                          <ul>
                            {row.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parseResult.validRows.length === 0 && parseResult.errorRows.length === 0 && (
            <div className="empty-parse">
              <p>未解析到任何有效数据</p>
            </div>
          )}

          <div className="import-confirm-actions">
            <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
            {canConfirm && (
              <button
                type="button"
                className="primary-action"
                onClick={handleConfirm}
              >
                确认导入 {parseResult.validRows.length} 条记录
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
