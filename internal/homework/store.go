package homework

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const currentSchemaVersion = 1

var ErrNotFound = errors.New("homework not found")

var supportedSubjects = []string{"语文", "数学", "英语", "物理", "化学", "生物"}

type Store struct {
	path string
	mu   sync.RWMutex
	data StoreFile
}

func NewStore(path string) (*Store, error) {
	store := &Store{
		path: path,
		data: StoreFile{
			SchemaVersion: currentSchemaVersion,
			Homeworks:     []Homework{},
		},
	}

	if err := store.load(); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *Store) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return fmt.Errorf("create data dir: %w", err)
	}

	content, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return s.writeLocked()
	}
	if err != nil {
		return fmt.Errorf("read store: %w", err)
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		return s.writeLocked()
	}

	var file StoreFile
	if err := json.Unmarshal(content, &file); err != nil {
		return fmt.Errorf("decode store: %w", err)
	}
	if file.SchemaVersion == 0 {
		file.SchemaVersion = currentSchemaVersion
	}
	if file.Homeworks == nil {
		file.Homeworks = []Homework{}
	}

	s.data = file
	return nil
}

func (s *Store) List(ctx context.Context, view string, now time.Time) ([]HomeworkView, error) {
	_ = ctx

	s.mu.RLock()
	defer s.mu.RUnlock()

	homeworks := make([]Homework, len(s.data.Homeworks))
	copy(homeworks, s.data.Homeworks)

	views := make([]HomeworkView, 0, len(homeworks))
	for _, item := range homeworks {
		derived := deriveView(item, now)
		switch view {
		case "today":
			if derived.IsToday || (derived.IsOverdue && !derived.Submitted) {
				views = append(views, derived)
			}
		case "records":
			views = append(views, derived)
		default:
			return nil, fmt.Errorf("unsupported view %q", view)
		}
	}

	sortViews(views, view)
	return views, nil
}

func (s *Store) Create(ctx context.Context, input CreateHomeworkInput, now time.Time) (HomeworkView, error) {
	_ = ctx

	subject := strings.TrimSpace(input.Subject)
	content := strings.TrimSpace(input.Content)
	if err := validateInput(subject, content, input.DueAt); err != nil {
		return HomeworkView{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	item := Homework{
		ID:        newID(),
		Subject:   subject,
		Content:   content,
		DueAt:     input.DueAt,
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.data.Homeworks = append(s.data.Homeworks, item)
	if err := s.writeLocked(); err != nil {
		return HomeworkView{}, err
	}

	return deriveView(item, now), nil
}

func (s *Store) Update(ctx context.Context, id string, input UpdateHomeworkInput, now time.Time) (HomeworkView, error) {
	_ = ctx

	subject := strings.TrimSpace(input.Subject)
	content := strings.TrimSpace(input.Content)
	if err := validateInput(subject, content, input.DueAt); err != nil {
		return HomeworkView{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for idx, item := range s.data.Homeworks {
		if item.ID != id {
			continue
		}

		item.Subject = subject
		item.Content = content
		item.DueAt = input.DueAt
		item.UpdatedAt = now
		s.data.Homeworks[idx] = item

		if err := s.writeLocked(); err != nil {
			return HomeworkView{}, err
		}

		return deriveView(item, now), nil
	}

	return HomeworkView{}, ErrNotFound
}

func (s *Store) Delete(ctx context.Context, id string) error {
	_ = ctx

	s.mu.Lock()
	defer s.mu.Unlock()

	for idx, item := range s.data.Homeworks {
		if item.ID != id {
			continue
		}

		s.data.Homeworks = append(s.data.Homeworks[:idx], s.data.Homeworks[idx+1:]...)
		return s.writeLocked()
	}

	return ErrNotFound
}

func (s *Store) Submit(ctx context.Context, id string, now time.Time) (HomeworkView, error) {
	_ = ctx

	s.mu.Lock()
	defer s.mu.Unlock()

	for idx, item := range s.data.Homeworks {
		if item.ID != id {
			continue
		}

		item.Submitted = true
		submittedAt := now
		item.SubmittedAt = &submittedAt
		item.UpdatedAt = now
		s.data.Homeworks[idx] = item

		if err := s.writeLocked(); err != nil {
			return HomeworkView{}, err
		}

		return deriveView(item, now), nil
	}

	return HomeworkView{}, ErrNotFound
}

func (s *Store) Unsubmit(ctx context.Context, id string, now time.Time) (HomeworkView, error) {
	_ = ctx

	s.mu.Lock()
	defer s.mu.Unlock()

	for idx, item := range s.data.Homeworks {
		if item.ID != id {
			continue
		}

		item.Submitted = false
		item.SubmittedAt = nil
		item.UpdatedAt = now
		s.data.Homeworks[idx] = item

		if err := s.writeLocked(); err != nil {
			return HomeworkView{}, err
		}

		return deriveView(item, now), nil
	}

	return HomeworkView{}, ErrNotFound
}

func (s *Store) writeLocked() error {
	tmp, err := os.CreateTemp(filepath.Dir(s.path), "homework-*.json")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpName := tmp.Name()

	encoder := json.NewEncoder(tmp)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(s.data); err != nil {
		tmp.Close()
		_ = os.Remove(tmpName)
		return fmt.Errorf("encode store: %w", err)
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpName)
		return fmt.Errorf("close temp file: %w", err)
	}
	if err := os.Rename(tmpName, s.path); err != nil {
		_ = os.Remove(tmpName)
		return fmt.Errorf("replace store: %w", err)
	}
	return nil
}

func validateInput(subject string, content string, dueAt time.Time) error {
	if subject == "" {
		return errors.New("subject is required")
	}
	if !isSupportedSubject(subject) {
		return fmt.Errorf("subject must be one of %s", strings.Join(supportedSubjects, ", "))
	}
	if content == "" {
		return errors.New("content is required")
	}
	if dueAt.IsZero() {
		return errors.New("dueAt is required")
	}
	return nil
}

func isSupportedSubject(subject string) bool {
	switch subject {
	case "语文", "数学", "英语", "物理", "化学", "生物":
		return true
	default:
		return false
	}
}

func deriveView(item Homework, now time.Time) HomeworkView {
	localDueAt := item.DueAt.In(now.Location())
	isToday := sameDay(localDueAt, now)
	isOverdue := !item.Submitted && localDueAt.Before(now) && !isToday

	return HomeworkView{
		Homework: Homework{
			ID:          item.ID,
			Subject:     item.Subject,
			Content:     item.Content,
			DueAt:       localDueAt,
			Submitted:   item.Submitted,
			SubmittedAt: item.SubmittedAt,
			CreatedAt:   item.CreatedAt,
			UpdatedAt:   item.UpdatedAt,
		},
		NeedsSubmission: !item.Submitted && (localDueAt.Equal(now) || localDueAt.Before(now)),
		IsOverdue:       isOverdue,
		IsToday:         isToday,
	}
}

func sameDay(left time.Time, right time.Time) bool {
	ly, lm, ld := left.Date()
	ry, rm, rd := right.Date()
	return ly == ry && lm == rm && ld == rd
}

func sortViews(items []HomeworkView, view string) {
	sort.SliceStable(items, func(i, j int) bool {
		left := items[i]
		right := items[j]

		if view == "today" {
			if left.IsOverdue != right.IsOverdue {
				return left.IsOverdue
			}
			if !left.DueAt.Equal(right.DueAt) {
				return left.DueAt.Before(right.DueAt)
			}
			if left.Submitted != right.Submitted {
				return !left.Submitted
			}
			return left.CreatedAt.After(right.CreatedAt)
		}

		if !left.DueAt.Equal(right.DueAt) {
			return left.DueAt.After(right.DueAt)
		}
		if left.Submitted != right.Submitted {
			return !left.Submitted
		}
		return left.CreatedAt.After(right.CreatedAt)
	})
}

func newID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		now := time.Now().UnixNano()
		return fmt.Sprintf("hw-%d", now)
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16])
}
