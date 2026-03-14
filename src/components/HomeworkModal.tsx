import { useEffect, useState } from "react";
import { isSupportedSubject, supportedSubjects } from "../lib/types";
import type { Homework, HomeworkPayload } from "../lib/types";
import { fromDueAtFormValue, toDateInputValue, toDueAtFormValue } from "../lib/format";

type HomeworkModalProps = {
  open: boolean;
  initialValue?: Homework | null;
  onClose: () => void;
  onSubmit: (payload: HomeworkPayload, existingId?: string) => Promise<void>;
};

type FormState = {
  subject: HomeworkPayload["subject"] | "";
  content: string;
  dueDate: string;
  dueHour: string;
  dueMinute: string;
};

const emptyForm: FormState = {
  subject: "",
  content: "",
  dueDate: "",
  dueHour: "",
  dueMinute: ""
};

const hourOptions = Array.from({ length: 24 }, (_, index) => `${index}`.padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, index) => `${index}`.padStart(2, "0"));

function buildCreateForm(now: Date): FormState {
  return {
    ...emptyForm,
    dueDate: toDateInputValue(now)
  };
}

export function HomeworkModal({ open, initialValue, onClose, onSubmit }: HomeworkModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!initialValue) {
      setForm(buildCreateForm(new Date()));
      setError("");
      return;
    }

    const dueAt = toDueAtFormValue(initialValue.dueAt);

    setForm({
      subject: isSupportedSubject(initialValue.subject) ? initialValue.subject : "",
      content: initialValue.content,
      dueDate: dueAt.date,
      dueHour: dueAt.hour,
      dueMinute: dueAt.minute
    });
    setError("");
  }, [initialValue, open]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupportedSubject(form.subject) || !form.content.trim() || !form.dueDate || !form.dueHour || !form.dueMinute) {
      setError("请把学科、内容和提交时间填完整。");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSubmit(
        {
          subject: form.subject,
          content: form.content.trim(),
          dueAt: fromDueAtFormValue({
            date: form.dueDate,
            hour: form.dueHour,
            minute: form.dueMinute
          })
        },
        initialValue?.id
      );
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="homework-modal-title">
        <div className="modal-header">
          <h2 id="homework-modal-title">{initialValue ? "编辑作业" : "新增作业"}</h2>
          <button className="ghost-button" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label>
            <span>学科</span>
            <select
              value={form.subject}
              onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value as FormState["subject"] }))}
            >
              <option value="">请选择学科</option>
              {supportedSubjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>作业内容</span>
            <textarea
              value={form.content}
              onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
              maxLength={240}
              rows={5}
              placeholder="写清楚要交什么"
            />
          </label>
          <label>
            <span>提交时间</span>
            <div className="modal-time-grid">
              <input
                type="date"
                aria-label="提交日期"
                value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
              />
              <select
                aria-label="提交小时"
                value={form.dueHour}
                onChange={(event) => setForm((current) => ({ ...current, dueHour: event.target.value }))}
              >
                <option value="">小时</option>
                {hourOptions.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </select>
              <select
                aria-label="提交分钟"
                value={form.dueMinute}
                onChange={(event) => setForm((current) => ({ ...current, dueMinute: event.target.value }))}
              >
                <option value="">分钟</option>
                {minuteOptions.map((minute) => (
                  <option key={minute} value={minute}>
                    {minute}
                  </option>
                ))}
              </select>
            </div>
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions">
            <button className="ghost-button" type="button" onClick={onClose}>
              取消
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "保存中..." : "保存作业"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
