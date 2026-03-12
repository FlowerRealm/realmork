package homework

import "time"

type Homework struct {
	ID          string     `json:"id"`
	Subject     string     `json:"subject"`
	Content     string     `json:"content"`
	DueAt       time.Time  `json:"dueAt"`
	Submitted   bool       `json:"submitted"`
	SubmittedAt *time.Time `json:"submittedAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type HomeworkView struct {
	Homework
	NeedsSubmission bool `json:"needsSubmission"`
	IsOverdue       bool `json:"isOverdue"`
	IsToday         bool `json:"isToday"`
}

type StoreFile struct {
	SchemaVersion int        `json:"schemaVersion"`
	Homeworks     []Homework `json:"homeworks"`
}

type CreateHomeworkInput struct {
	Subject string    `json:"subject"`
	Content string    `json:"content"`
	DueAt   time.Time `json:"dueAt"`
}

type UpdateHomeworkInput struct {
	Subject string    `json:"subject"`
	Content string    `json:"content"`
	DueAt   time.Time `json:"dueAt"`
}
