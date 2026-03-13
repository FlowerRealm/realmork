package homework

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type Clock func() time.Time

type API struct {
	store  *Store
	quotes DailyQuoteProvider
	token  string
	now    Clock
}

func NewAPI(store *Store, token string, now Clock, quotes DailyQuoteProvider) *API {
	if now == nil {
		now = time.Now
	}
	return &API{
		store:  store,
		quotes: quotes,
		token:  token,
		now:    now,
	}
}

func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", a.handleHealth)
	mux.HandleFunc("/api/daily-quote", a.handleDailyQuote)
	mux.HandleFunc("/api/homeworks", a.handleHomeworks)
	mux.HandleFunc("/api/homeworks/", a.handleHomeworkAction)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		writeCORSHeaders(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if a.token != "" && r.Header.Get("X-Realmork-Token") != a.token {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func (a *API) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w, http.MethodGet)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *API) handleDailyQuote(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w, http.MethodGet)
		return
	}
	if a.quotes == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "daily quote unavailable"})
		return
	}

	item, err := a.quotes.Get(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (a *API) handleHomeworks(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		view := r.URL.Query().Get("view")
		if view == "" {
			view = "today"
		}
		items, err := a.store.List(r.Context(), view, a.now())
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, items)
	case http.MethodPost:
		var input CreateHomeworkInput
		if err := decodeJSON(r, &input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		item, err := a.store.Create(r.Context(), input, a.now())
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, item)
	default:
		writeMethodNotAllowed(w, http.MethodGet, http.MethodPost)
	}
}

func (a *API) handleHomeworkAction(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/homeworks/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodPatch:
			var input UpdateHomeworkInput
			if err := decodeJSON(r, &input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			item, err := a.store.Update(r.Context(), id, input, a.now())
			if err != nil {
				writeError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, item)
		case http.MethodDelete:
			if err := a.store.Delete(r.Context(), id); err != nil {
				writeError(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			writeMethodNotAllowed(w, http.MethodPatch, http.MethodDelete)
		}
		return
	}

	if len(parts) != 2 || r.Method != http.MethodPost {
		writeMethodNotAllowed(w, http.MethodPost)
		return
	}

	var (
		item HomeworkView
		err  error
	)
	switch parts[1] {
	case "submit":
		item, err = a.store.Submit(r.Context(), id, a.now())
	case "unsubmit":
		item, err = a.store.Unsubmit(r.Context(), id, a.now())
	default:
		http.NotFound(w, r)
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func decodeJSON(r *http.Request, target any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("invalid request body: %w", err)
	}
	return nil
}

func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	if errors.Is(err, ErrNotFound) {
		status = http.StatusNotFound
	} else if errors.Is(err, context.DeadlineExceeded) {
		status = http.StatusGatewayTimeout
	} else if strings.Contains(err.Error(), "required") || strings.Contains(err.Error(), "unsupported view") || strings.Contains(err.Error(), "must be one of") {
		status = http.StatusBadRequest
	}
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func writeMethodNotAllowed(w http.ResponseWriter, methods ...string) {
	w.Header().Set("Allow", strings.Join(methods, ", "))
	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

func writeCORSHeaders(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Realmork-Token")
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
