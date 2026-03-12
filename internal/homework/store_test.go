package homework

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStoreCreateUpdateSubmitAndUnsubmit(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "homework.json"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	now := time.Date(2026, 3, 11, 9, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	created, err := store.Create(context.Background(), CreateHomeworkInput{
		Subject: "数学",
		Content: "完成练习册第 12 页",
		DueAt:   now.Add(2 * time.Hour),
	}, now)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	updated, err := store.Update(context.Background(), created.ID, UpdateHomeworkInput{
		Subject: "数学",
		Content: "完成练习册第 12 页和第 13 页",
		DueAt:   now.Add(3 * time.Hour),
	}, now.Add(5*time.Minute))
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if updated.Content != "完成练习册第 12 页和第 13 页" {
		t.Fatalf("Update() content = %q", updated.Content)
	}
	if updated.Submitted {
		t.Fatal("Update() should preserve unsubmitted state")
	}

	submitted, err := store.Submit(context.Background(), created.ID, now.Add(10*time.Minute))
	if err != nil {
		t.Fatalf("Submit() error = %v", err)
	}
	if !submitted.Submitted || submitted.SubmittedAt == nil {
		t.Fatal("Submit() should mark homework as submitted")
	}

	editedSubmitted, err := store.Update(context.Background(), created.ID, UpdateHomeworkInput{
		Subject: "数学",
		Content: "改完后的最终版本",
		DueAt:   now.Add(3 * time.Hour),
	}, now.Add(12*time.Minute))
	if err != nil {
		t.Fatalf("Update() on submitted homework error = %v", err)
	}
	if !editedSubmitted.Submitted {
		t.Fatal("Update() should keep submitted state")
	}

	unsubmitted, err := store.Unsubmit(context.Background(), created.ID, now.Add(15*time.Minute))
	if err != nil {
		t.Fatalf("Unsubmit() error = %v", err)
	}
	if unsubmitted.Submitted || unsubmitted.SubmittedAt != nil {
		t.Fatal("Unsubmit() should clear submitted state")
	}

	content, err := os.ReadFile(filepath.Join(dir, "homework.json"))
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	var file StoreFile
	if err := json.Unmarshal(content, &file); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if len(file.Homeworks) != 1 {
		t.Fatalf("expected 1 homework, got %d", len(file.Homeworks))
	}
}

func TestStoreListTodayAndRecordsViews(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "homework.json"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	location := time.FixedZone("CST", 8*60*60)
	now := time.Date(2026, 3, 11, 12, 0, 0, 0, location)

	seedHomework := []CreateHomeworkInput{
		{Subject: "语文", Content: "今天晚上交作文", DueAt: time.Date(2026, 3, 11, 20, 0, 0, 0, location)},
		{Subject: "物理", Content: "昨天漏交实验报告", DueAt: time.Date(2026, 3, 10, 19, 0, 0, 0, location)},
		{Subject: "英语", Content: "明天单词默写", DueAt: time.Date(2026, 3, 12, 8, 0, 0, 0, location)},
	}
	ids := make([]string, 0, len(seedHomework))
	for _, item := range seedHomework {
		created, createErr := store.Create(context.Background(), item, now)
		if createErr != nil {
			t.Fatalf("Create() error = %v", createErr)
		}
		ids = append(ids, created.ID)
	}

	if _, err := store.Submit(context.Background(), ids[2], now.Add(10*time.Minute)); err != nil {
		t.Fatalf("Submit() error = %v", err)
	}

	todayView, err := store.List(context.Background(), "today", now)
	if err != nil {
		t.Fatalf("List(today) error = %v", err)
	}
	if len(todayView) != 2 {
		t.Fatalf("List(today) length = %d, want 2", len(todayView))
	}
	if todayView[0].Subject != "物理" || !todayView[0].IsOverdue || !todayView[0].NeedsSubmission {
		t.Fatalf("expected overdue item first, got %+v", todayView[0])
	}
	if todayView[1].Subject != "语文" || !todayView[1].IsToday {
		t.Fatalf("expected today item second, got %+v", todayView[1])
	}

	recordView, err := store.List(context.Background(), "records", now)
	if err != nil {
		t.Fatalf("List(records) error = %v", err)
	}
	if len(recordView) != 3 {
		t.Fatalf("List(records) length = %d, want 3", len(recordView))
	}
	if recordView[0].Subject != "英语" {
		t.Fatalf("expected records view in descending dueAt order, got %+v", recordView[0])
	}
}

func TestStoreRejectsUnsupportedSubjects(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "homework.json"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	now := time.Date(2026, 3, 11, 9, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	_, err = store.Create(context.Background(), CreateHomeworkInput{
		Subject: "历史",
		Content: "整理笔记",
		DueAt:   now.Add(time.Hour),
	}, now)
	if err == nil || !strings.Contains(err.Error(), "must be one of") {
		t.Fatalf("Create() error = %v, want unsupported subject validation", err)
	}

	created, err := store.Create(context.Background(), CreateHomeworkInput{
		Subject: "语文",
		Content: "背诵课文",
		DueAt:   now.Add(2 * time.Hour),
	}, now)
	if err != nil {
		t.Fatalf("Create() with supported subject error = %v", err)
	}

	_, err = store.Update(context.Background(), created.ID, UpdateHomeworkInput{
		Subject: "地理",
		Content: "改成别的作业",
		DueAt:   now.Add(3 * time.Hour),
	}, now.Add(5*time.Minute))
	if err == nil || !strings.Contains(err.Error(), "must be one of") {
		t.Fatalf("Update() error = %v, want unsupported subject validation", err)
	}
}

func TestStoreDeleteRemovesHomework(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "homework.json"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	now := time.Date(2026, 3, 11, 9, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	first, err := store.Create(context.Background(), CreateHomeworkInput{
		Subject: "数学",
		Content: "完成习题一",
		DueAt:   now.Add(time.Hour),
	}, now)
	if err != nil {
		t.Fatalf("Create(first) error = %v", err)
	}
	second, err := store.Create(context.Background(), CreateHomeworkInput{
		Subject: "英语",
		Content: "完成阅读",
		DueAt:   now.Add(2 * time.Hour),
	}, now)
	if err != nil {
		t.Fatalf("Create(second) error = %v", err)
	}

	if err := store.Delete(context.Background(), first.ID); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}

	items, err := store.List(context.Background(), "records", now)
	if err != nil {
		t.Fatalf("List(records) error = %v", err)
	}
	if len(items) != 1 || items[0].ID != second.ID {
		t.Fatalf("expected only second homework to remain, got %+v", items)
	}

	if err := store.Delete(context.Background(), first.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Delete() second time error = %v, want ErrNotFound", err)
	}
}

func TestDeriveViewNeedsSubmissionAtDueTime(t *testing.T) {
	t.Parallel()

	location := time.FixedZone("CST", 8*60*60)
	now := time.Date(2026, 3, 11, 18, 30, 0, 0, location)
	item := Homework{
		ID:        "test",
		Subject:   "化学",
		Content:   "上传实验报告",
		DueAt:     now,
		CreatedAt: now.Add(-time.Hour),
		UpdatedAt: now.Add(-time.Minute),
	}

	view := deriveView(item, now)
	if !view.NeedsSubmission {
		t.Fatal("expected needsSubmission to be true at exact due time")
	}
	if !view.IsToday {
		t.Fatal("expected IsToday to be true")
	}
	if view.IsOverdue {
		t.Fatal("expected IsOverdue to be false for same-day due time")
	}
}

func TestDeriveViewUsesBeijingTimezoneForClassification(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 3, 11, 17, 0, 0, 0, time.UTC)
	item := Homework{
		ID:        "cross-zone",
		Subject:   "英语",
		Content:   "跨时区测试",
		DueAt:     time.Date(2026, 3, 12, 0, 30, 0, 0, time.FixedZone("CST", 8*60*60)),
		CreatedAt: now.Add(-time.Hour),
		UpdatedAt: now.Add(-time.Minute),
	}

	view := deriveView(item, now)
	if !view.IsToday {
		t.Fatal("expected IsToday to use Beijing day boundaries")
	}
	if view.IsOverdue {
		t.Fatal("expected future Beijing item to not be overdue")
	}
	if !view.NeedsSubmission {
		t.Fatal("expected item before current Beijing time to require submission")
	}
	if got := view.DueAt.Location().String(); got != beijingLocation.String() {
		t.Fatalf("expected DueAt to be converted to Beijing timezone, got %q", got)
	}
}

func TestAPIHandlerSupportsCORSPreflight(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "homework.json"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	api := NewAPI(store, "secret-token", func() time.Time {
		return time.Date(2026, 3, 12, 8, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	})

	req := httptest.NewRequest(http.MethodOptions, "/api/homeworks?view=today", nil)
	req.Header.Set("Origin", "http://127.0.0.1:5173")
	req.Header.Set("Access-Control-Request-Method", http.MethodDelete)
	req.Header.Set("Access-Control-Request-Headers", "content-type,x-realmork-token")
	recorder := httptest.NewRecorder()

	api.Handler().ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:5173" {
		t.Fatalf("allow origin = %q", got)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(got, http.MethodDelete) {
		t.Fatalf("allow methods = %q", got)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(got, "X-Realmork-Token") {
		t.Fatalf("allow headers = %q", got)
	}
}

func TestAPIHandlerDeletesHomework(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "homework.json"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	now := time.Date(2026, 3, 12, 8, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	created, err := store.Create(context.Background(), CreateHomeworkInput{
		Subject: "生物",
		Content: "完成实验记录",
		DueAt:   now.Add(2 * time.Hour),
	}, now)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	api := NewAPI(store, "secret-token", func() time.Time {
		return now
	})

	req := httptest.NewRequest(http.MethodDelete, "/api/homeworks/"+created.ID, nil)
	req.Header.Set("X-Realmork-Token", "secret-token")
	recorder := httptest.NewRecorder()

	api.Handler().ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d", recorder.Code, http.StatusNoContent)
	}

	items, err := store.List(context.Background(), "records", now)
	if err != nil {
		t.Fatalf("List(records) error = %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected homework to be deleted, got %+v", items)
	}
}

func TestAPIHandlerDeleteReturnsNotFound(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "homework.json"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	api := NewAPI(store, "secret-token", func() time.Time {
		return time.Date(2026, 3, 12, 8, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	})

	req := httptest.NewRequest(http.MethodDelete, "/api/homeworks/missing", nil)
	req.Header.Set("X-Realmork-Token", "secret-token")
	recorder := httptest.NewRecorder()

	api.Handler().ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("delete missing status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
}
