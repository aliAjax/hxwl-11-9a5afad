import { useState, useMemo } from "react";
import "./styles.css";

interface PatientProfile {
  id: string;
  patientNo: string;
  ageGroup: string;
  lensType: string;
  lastCheckDate: string;
  remark: string;
}

type ReminderStatus = "overdue" | "upcoming" | "normal";

interface PatientReminder extends PatientProfile {
  reminderStatus: ReminderStatus;
  nextCheckDate: string;
  daysUntilNext: number;
  reminderCycle: number;
}

const ageGroups = ["儿童", "青少年", "成人", "中老年"];
const lensTypes = ["单光镜", "渐进片", "角膜塑形镜", "散光镜", "老花镜"];

const REMINDER_CYCLES: Record<string, number> = {
  "儿童-角膜塑形镜": 30,
  "儿童-单光镜": 30,
  "儿童-散光镜": 30,
  "青少年-角膜塑形镜": 30,
  "成人-渐进片": 180,
  "中老年-渐进片": 180,
  "成人-老花镜": 180,
  "中老年-老花镜": 180,
};

const DEFAULT_CYCLE = 90;
const UPCOMING_THRESHOLD = 7;

function getReminderCycle(ageGroup: string, lensType: string): number {
  const key = `${ageGroup}-${lensType}`;
  return REMINDER_CYCLES[key] || DEFAULT_CYCLE;
}

function calculateReminder(patient: PatientProfile, today: Date): PatientReminder {
  const cycleDays = getReminderCycle(patient.ageGroup, patient.lensType);
  const lastCheck = new Date(patient.lastCheckDate);
  const nextCheck = new Date(lastCheck);
  nextCheck.setDate(lastCheck.getDate() + cycleDays);

  const diffTime = nextCheck.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let status: ReminderStatus;
  if (diffDays < 0) {
    status = "overdue";
  } else if (diffDays <= UPCOMING_THRESHOLD) {
    status = "upcoming";
  } else {
    status = "normal";
  }

  return {
    ...patient,
    reminderStatus: status,
    nextCheckDate: nextCheck.toISOString().split("T")[0],
    daysUntilNext: diffDays,
    reminderCycle: cycleDays,
  };
}

const initialPatients: PatientProfile[] = [
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
  }
];

const project = {
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
  ],
  "records": [
    [
      "Patient-032",
      "儿童近视",
      "复查",
      "右眼-2.75DS，轴位180"
    ],
    [
      "Patient-081",
      "渐进片",
      "初配",
      "ADD +1.50，瞳高待确认"
    ],
    [
      "Patient-144",
      "散光",
      "复查",
      "柱镜变化0.50D"
    ]
  ]
};

const statusColors = ["status-ok", "status-watch", "status-danger"];

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

const emptyForm: Omit<PatientProfile, "id"> = {
  patientNo: "",
  ageGroup: "",
  lensType: "",
  lastCheckDate: "",
  remark: ""
};

function PatientForm({
  initialData,
  onSubmit,
  onCancel
}: {
  initialData?: Omit<PatientProfile, "id">;
  onSubmit: (data: Omit<PatientProfile, "id">) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<Omit<PatientProfile, "id">>(initialData || emptyForm);

  const handleChange = (field: keyof Omit<PatientProfile, "id">, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patientNo.trim()) return;
    onSubmit(formData);
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
          />
        </label>
        <label>
          <span>年龄段</span>
          <select
            value={formData.ageGroup}
            onChange={e => handleChange("ageGroup", e.target.value)}
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
        />
      </label>
      <div className="form-actions">
        <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
        <button type="submit" className="primary-action">
          {initialData ? "保存修改" : "新增档案"}
        </button>
      </div>
    </form>
  );
}

function PatientCard({
  patient,
  index,
  onEdit,
  onDelete
}: {
  patient: PatientProfile;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="patient-card">
      <div className="patient-index">{String(index + 1).padStart(2, "0")}</div>
      <div className="patient-info">
        <div className="patient-header">
          <h3>{patient.patientNo}</h3>
          <div className="patient-tags">
            {patient.ageGroup && <span className="tag tag-primary">{patient.ageGroup}</span>}
            {patient.lensType && <span className="tag tag-accent">{patient.lensType}</span>}
          </div>
        </div>
        {patient.lastCheckDate && (
          <p className="patient-date">最近复查：{patient.lastCheckDate}</p>
        )}
        {patient.remark && <p className="patient-remark">{patient.remark}</p>}
        <div className="patient-actions">
          <button className="text-btn" onClick={onEdit}>编辑</button>
          <button className="text-btn danger" onClick={onDelete}>删除</button>
        </div>
      </div>
    </article>
  );
}

function ReminderCard({
  reminder,
  index
}: {
  reminder: PatientReminder;
  index: number;
}) {
  const statusConfig = {
    overdue: { label: "已逾期", className: "status-danger", textClass: "text-danger", daysText: `逾期 ${Math.abs(reminder.daysUntilNext)} 天` },
    upcoming: { label: "即将到期", className: "status-watch", textClass: "text-watch", daysText: `还剩 ${reminder.daysUntilNext} 天` },
    normal: { label: "正常", className: "status-ok", textClass: "text-ok", daysText: `还剩 ${reminder.daysUntilNext} 天` },
  };

  const config = statusConfig[reminder.reminderStatus];

  return (
    <article className={`reminder-card reminder-${reminder.reminderStatus}`}>
      <div className={`reminder-index ${config.className}`}>{String(index + 1).padStart(2, "0")}</div>
      <div className="reminder-info">
        <div className="reminder-header">
          <h3>{reminder.patientNo}</h3>
          <span className={`reminder-status ${config.textClass}`}>{config.label}</span>
        </div>
        <div className="reminder-tags">
          {reminder.ageGroup && <span className="tag tag-primary">{reminder.ageGroup}</span>}
          {reminder.lensType && <span className="tag tag-accent">{reminder.lensType}</span>}
          <span className="tag tag-cycle">周期 {reminder.reminderCycle} 天</span>
        </div>
        <div className="reminder-dates">
          <p className="reminder-date">上次复查：{reminder.lastCheckDate}</p>
          <p className={`reminder-due ${config.textClass}`}>下次复查：{reminder.nextCheckDate} · {config.daysText}</p>
        </div>
        {reminder.remark && <p className="patient-remark">{reminder.remark}</p>}
      </div>
    </article>
  );
}

function App() {
  const [patients, setPatients] = useState<PatientProfile[]>(initialPatients);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [today] = useState(new Date("2026-06-19"));

  const reminders = useMemo(() => {
    return patients
      .filter(p => p.lastCheckDate)
      .map(p => calculateReminder(p, today))
      .sort((a, b) => a.daysUntilNext - b.daysUntilNext);
  }, [patients, today]);

  const { overdue, upcoming, normal } = useMemo(() => {
    return {
      overdue: reminders.filter(r => r.reminderStatus === "overdue"),
      upcoming: reminders.filter(r => r.reminderStatus === "upcoming"),
      normal: reminders.filter(r => r.reminderStatus === "normal"),
    };
  }, [reminders]);

  const reminderCounts = {
    overdue: overdue.length,
    upcoming: upcoming.length,
    normal: normal.length,
  };

  const metricValues = [
    String(patients.length),
    String(reminderCounts.overdue),
    String(reminderCounts.upcoming),
    String(reminderCounts.normal),
  ];

  const handleAdd = (data: Omit<PatientProfile, "id">) => {
    const newPatient: PatientProfile = {
      ...data,
      id: `p-${Date.now()}`
    };
    setPatients(prev => [newPatient, ...prev]);
    setShowForm(false);
  };

  const handleEdit = (data: Omit<PatientProfile, "id">) => {
    if (!editingId) return;
    setPatients(prev =>
      prev.map(p => (p.id === editingId ? { ...p, ...data } : p))
    );
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("确定要删除该患者档案吗？")) return;
    setPatients(prev => prev.filter(p => p.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const startEdit = (patient: PatientProfile) => {
    setEditingId(patient.id);
    setShowForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const openAddForm = () => {
    setShowForm(true);
    setEditingId(null);
  };

  const cancelAdd = () => {
    setShowForm(false);
  };

  const editingPatient = patients.find(p => p.id === editingId);

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
        </div>
      </section>

      <section className="metrics-grid">
        {project.metrics.map((metric: string, index: number) => (
          <MetricCard key={metric} label={metric} value={metricValues[index]} index={index} />
        ))}
      </section>

      <section className="reminder-board panel">
        <div className="section-heading">
          <div>
            <p>复查管理</p>
            <h2>复查提醒看板</h2>
          </div>
          <span className="today-info">今日日期：{today.toISOString().split("T")[0]}</span>
        </div>
        <div className="reminder-columns">
          <div className="reminder-column">
            <div className="column-header column-danger">
              <span className="column-dot"></span>
              <h3>已逾期</h3>
              <span className="column-count">{overdue.length}</span>
            </div>
            <div className="reminder-list">
              {overdue.length > 0 ? (
                overdue.map((reminder, index) => (
                  <ReminderCard key={reminder.id} reminder={reminder} index={index} />
                ))
              ) : (
                <div className="empty-state small">
                  <p>暂无逾期复查</p>
                </div>
              )}
            </div>
          </div>
          <div className="reminder-column">
            <div className="column-header column-watch">
              <span className="column-dot"></span>
              <h3>即将到期</h3>
              <span className="column-count">{upcoming.length}</span>
            </div>
            <div className="reminder-list">
              {upcoming.length > 0 ? (
                upcoming.map((reminder, index) => (
                  <ReminderCard key={reminder.id} reminder={reminder} index={index} />
                ))
              ) : (
                <div className="empty-state small">
                  <p>暂无即将到期</p>
                </div>
              )}
            </div>
          </div>
          <div className="reminder-column">
            <div className="column-header column-ok">
              <span className="column-dot"></span>
              <h3>正常</h3>
              <span className="column-count">{normal.length}</span>
            </div>
            <div className="reminder-list">
              {normal.length > 0 ? (
                normal.map((reminder, index) => (
                  <ReminderCard key={reminder.id} reminder={reminder} index={index} />
                ))
              ) : (
                <div className="empty-state small">
                  <p>暂无正常复查</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips">
            {project.users.map((user: string) => (
              <span key={user}>{user}</span>
            ))}
          </div>
          <h2>筛选</h2>
          <div className="chips muted">
            {project.filters.map((filter: string) => (
              <button key={filter}>{filter}</button>
            ))}
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>记录字段</h2>
            </div>
            <button className="primary-action">新增记录</button>
          </div>
          <div className="field-grid">
            {project.fields.map((field: string) => (
              <label key={field}>
                <span>{field}</span>
                <input placeholder={"填写" + field} />
              </label>
            ))}
          </div>
        </section>
      </section>

      <section className="two-column">
        <section className="records panel">
          <div className="section-heading">
            <div>
              <p>示例数据</p>
              <h2>近期记录</h2>
            </div>
            <button>导出摘要</button>
          </div>
          <div className="record-list">
            {project.records.map((record: string[], index: number) => (
              <article key={record.join("-")} className="record-card">
                <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <h3>{record[0]}</h3>
                  <p>{record.slice(1).join(" · ")}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="patient-panel panel">
          <div className="section-heading">
            <div>
              <p>本地档案</p>
              <h2>患者档案</h2>
            </div>
            {!showForm && !editingId && (
              <button className="primary-action" onClick={openAddForm}>+ 新增档案</button>
            )}
          </div>

          {showForm && (
            <PatientForm
              key="add-form"
              onSubmit={handleAdd}
              onCancel={cancelAdd}
            />
          )}

          {editingPatient && !showForm && (
            <div className="editing-form">
              <p className="form-title">编辑档案</p>
              <PatientForm
                key={editingPatient.id}
                initialData={{
                  patientNo: editingPatient.patientNo,
                  ageGroup: editingPatient.ageGroup,
                  lensType: editingPatient.lensType,
                  lastCheckDate: editingPatient.lastCheckDate,
                  remark: editingPatient.remark
                }}
                onSubmit={handleEdit}
                onCancel={cancelEdit}
              />
            </div>
          )}

          <div className="patient-list">
            {patients.map((patient, index) => (
              editingId === patient.id ? null : (
                <PatientCard
                  key={patient.id}
                  patient={patient}
                  index={index}
                  onEdit={() => startEdit(patient)}
                  onDelete={() => handleDelete(patient.id)}
                />
              )
            ))}
            {patients.length === 0 && (
              <div className="empty-state">
                <p>暂无患者档案</p>
                <p className="empty-hint">点击"新增档案"添加第一条记录</p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
