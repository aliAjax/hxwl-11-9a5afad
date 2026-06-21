import { useState, useRef, useCallback } from "react";
import type { PatientProfile } from "../../types";
import { ageGroups } from "../../csvParsers";
import { lensTypes } from "../../constants";

const emptyForm: Omit<PatientProfile, "id"> = {
  patientNo: "",
  ageGroup: "",
  lensType: "",
  lastCheckDate: "",
  remark: ""
};

export function PatientForm({
  initialData,
  onSubmit,
  onCancel,
  readOnly = false,
  onDirtyChange
}: {
  initialData?: Omit<PatientProfile, "id">;
  onSubmit: (data: Omit<PatientProfile, "id">) => void;
  onCancel: () => void;
  readOnly?: boolean;
  onDirtyChange?: (dirty: boolean, data: Omit<PatientProfile, "id">) => void;
}) {
  const [formData, setFormData] = useState<Omit<PatientProfile, "id">>(initialData || emptyForm);
  const baseDataRef = useRef<Omit<PatientProfile, "id">>(initialData || emptyForm);
  const [dirty, setDirty] = useState(false);

  const computeDirty = useCallback((data: Omit<PatientProfile, "id">, base: Omit<PatientProfile, "id">) => {
    return (
      data.patientNo !== base.patientNo ||
      data.ageGroup !== base.ageGroup ||
      data.lensType !== base.lensType ||
      data.lastCheckDate !== base.lastCheckDate ||
      data.remark !== base.remark
    );
  }, []);

  const handleChange = (field: keyof Omit<PatientProfile, "id">, value: string) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      const isDirty = computeDirty(next, baseDataRef.current);
      setDirty(isDirty);
      if (onDirtyChange) onDirtyChange(isDirty, next);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!formData.patientNo.trim()) return;
    onSubmit(formData);
    setDirty(false);
    if (onDirtyChange) onDirtyChange(false, emptyForm);
    setFormData(emptyForm);
  };

  return (
    <form className="patient-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          <span>患者编号</span>
          <input
            type="text"
            placeholder="例如：Patient-100"
            value={formData.patientNo}
            onChange={e => handleChange("patientNo", e.target.value)}
            required
            readOnly={readOnly}
          />
        </label>
        <label>
          <span>年龄段</span>
          <select
            value={formData.ageGroup}
            onChange={e => handleChange("ageGroup", e.target.value)}
            disabled={readOnly}
          >
            <option value="">请选择</option>
            {ageGroups.map(age => (
              <option key={age} value={age}>{age}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          <span>用镜类型</span>
          <select
            value={formData.lensType}
            onChange={e => handleChange("lensType", e.target.value)}
            disabled={readOnly}
          >
            <option value="">请选择</option>
            {lensTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          <span>最近复查日期</span>
          <input
            type="date"
            value={formData.lastCheckDate}
            onChange={e => handleChange("lastCheckDate", e.target.value)}
            readOnly={readOnly}
          />
        </label>
      </div>
      <label>
        <span>备注</span>
        <textarea
          placeholder="填写患者备注信息..."
          value={formData.remark}
          onChange={e => handleChange("remark", e.target.value)}
          rows={2}
          readOnly={readOnly}
        />
      </label>
      {!readOnly && (
        <div className="form-actions">
          <button type="button" className="ghost-btn" onClick={() => {
            setDirty(false);
            if (onDirtyChange) onDirtyChange(false, emptyForm);
            onCancel();
          }}>取消</button>
          <button type="submit" className="primary-action">
            {initialData ? "保存修改" : "新增档案"}
          </button>
        </div>
      )}
    </form>
  );
}
