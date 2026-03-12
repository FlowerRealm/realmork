import { useEffect, useState } from "react";
import { isSupportedSubject, supportedSubjects } from "../lib/types";
import type { Homework, HomeworkPayload } from "../lib/types";
import { fromLocalInputValue, toLocalInputValue } from "../lib/format";

type HomeworkModalProps = {
  open: boolean;
  initialValue?: Homework | null;
  onClose: () => void;
  onSubmit: (payload: HomeworkPayload, existingId?: string) => Promise<void>;
};

type FormState = {
  subject: HomeworkPayload["subject"] | "";
  content: string;
  dueAt: string;
};

const emptyForm: FormState = {
  subject: "",
  content: "",
  dueAt: ""
};

export function HomeworkModal({ open, initialValue, onClose, onSubmit }: HomeworkModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!initialValue) {
      setForm(emptyForm);
      setError("");
      return;
    }

    setForm({
      subject: isSupportedSubject(initialValue.subject) ? initialValue.subject : "",
      content: initialValue.content,
      dueAt: toLocalInputValue(initialValue.dueAt)
    });
    setError("");
  }, [initialValue, open]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupportedSubject(form.subject) || !form.content.trim() || !form.dueAt) {
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
          dueAt: fromLocalInputValue(form.dueAt)
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
            <input
              type="datetime-local"
              value={form.dueAt}
              onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))}
            />
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
