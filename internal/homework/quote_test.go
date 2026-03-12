package homework

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type stubDailyQuoteProvider struct {
	quote DailyQuote
	err   error
}

func (s stubDailyQuoteProvider) Get(ctx context.Context) (DailyQuote, error) {
	_ = ctx
	if s.err != nil {
		return DailyQuote{}, s.err
	}
	return s.quote, nil
}

func TestDailyQuoteServiceFetchesAndCachesChineseOnlineQuote(t *testing.T) {
	t.Parallel()

	cachePath := filepath.Join(t.TempDir(), "daily-quote.json")
	cache, err := NewDailyQuoteCache(cachePath)
	if err != nil {
		t.Fatalf("NewDailyQuoteCache() error = %v", err)
	}

	now := time.Date(2026, 3, 12, 9, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	fetchCalls := 0
	service := NewDailyQuoteService(cache, func() time.Time { return now }, "", func(ctx context.Context) (DailyQuoteFetchResult, error) {
		_ = ctx
		fetchCalls++
		return DailyQuoteFetchResult{
			Text:   "学而不思则罔，思而不学则殆。",
			Author: "孔子",
		}, nil
	})

	first, err := service.Get(context.Background())
	if err != nil {
		t.Fatalf("Get() first error = %v", err)
	}
	if first.Source != "online" {
		t.Fatalf("Get() first source = %q, want online", first.Source)
	}
	if first.QuoteDate != "2026-03-12" {
		t.Fatalf("Get() first quoteDate = %q", first.QuoteDate)
	}

	second, err := service.Get(context.Background())
	if err != nil {
		t.Fatalf("Get() second error = %v", err)
	}
	if second.Source != "cache" {
		t.Fatalf("Get() second source = %q, want cache", second.Source)
	}
	if fetchCalls != 1 {
		t.Fatalf("fetchCalls = %d, want 1", fetchCalls)
	}

	content, err := os.ReadFile(cachePath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	if len(content) == 0 {
		t.Fatal("cache file should not be empty")
	}
}

func TestDailyQuoteServiceUsesSameDayCacheWithoutFetching(t *testing.T) {
	t.Parallel()

	cache, err := NewDailyQuoteCache("")
	if err != nil {
		t.Fatalf("NewDailyQuoteCache() error = %v", err)
	}
	if err := cache.Save(dailyQuoteCacheEntry{
		Text:      "今天适合把简单的事做好。",
		Author:    "内置名言库",
		QuoteDate: "2026-03-12",
	}); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	service := NewDailyQuoteService(cache, func() time.Time {
		return time.Date(2026, 3, 12, 10, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	}, "", func(ctx context.Context) (DailyQuoteFetchResult, error) {
		_ = ctx
		t.Fatal("fetch should not be called for same-day cache")
		return DailyQuoteFetchResult{}, nil
	})

	quote, err := service.Get(context.Background())
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if quote.Source != "cache" {
		t.Fatalf("Get() source = %q, want cache", quote.Source)
	}
	if quote.Text != "今天适合把简单的事做好。" {
		t.Fatalf("Get() text = %q", quote.Text)
	}
}

func TestDailyQuoteServiceFallsBackToPreviousCacheWhenFetchFails(t *testing.T) {
	t.Parallel()

	cache, err := NewDailyQuoteCache("")
	if err != nil {
		t.Fatalf("NewDailyQuoteCache() error = %v", err)
	}
	if err := cache.Save(dailyQuoteCacheEntry{
		Text:      "昨日之深渊，今日之浅谈。",
		Author:    "尼采",
		QuoteDate: "2026-03-11",
	}); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	service := NewDailyQuoteService(cache, func() time.Time {
		return time.Date(2026, 3, 12, 9, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	}, "", func(ctx context.Context) (DailyQuoteFetchResult, error) {
		_ = ctx
		return DailyQuoteFetchResult{}, errors.New("upstream failed")
	})

	quote, err := service.Get(context.Background())
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if quote.Source != "cache" {
		t.Fatalf("Get() source = %q, want cache", quote.Source)
	}
	if quote.QuoteDate != "2026-03-11" {
		t.Fatalf("Get() quoteDate = %q, want stale cache date", quote.QuoteDate)
	}
}

func TestDailyQuoteServiceRejectsEnglishOnlineQuote(t *testing.T) {
	t.Parallel()

	cachePath := filepath.Join(t.TempDir(), "daily-quote.json")
	cache, err := NewDailyQuoteCache(cachePath)
	if err != nil {
		t.Fatalf("NewDailyQuoteCache() error = %v", err)
	}

	service := NewDailyQuoteService(cache, func() time.Time {
		return time.Date(2026, 3, 12, 9, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	}, "", func(ctx context.Context) (DailyQuoteFetchResult, error) {
		_ = ctx
		return DailyQuoteFetchResult{
			Text:   "Stay hungry, stay foolish.",
			Author: "Steve Jobs",
		}, nil
	})

	quote, err := service.Get(context.Background())
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if quote.Source != "library" {
		t.Fatalf("Get() source = %q, want library", quote.Source)
	}
	if hasASCIILetters(quote.Text) || hasASCIILetters(quote.Author) {
		t.Fatalf("Get() should not return ASCII quote, got %+v", quote)
	}
	if cached := cache.Get(); cached.Text != "" || cached.Author != "" {
		t.Fatalf("english quote should not be cached, got %+v", cached)
	}
}

func TestDailyQuoteServiceUsesLibraryWhenNoTokenAndNoCache(t *testing.T) {
	t.Parallel()

	service := NewDailyQuoteService(nil, func() time.Time {
		return time.Date(2026, 3, 12, 9, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	}, "", nil)

	quote, err := service.Get(context.Background())
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if quote.Source != "library" {
		t.Fatalf("Get() source = %q, want library", quote.Source)
	}
	if !containsHanRune(quote.Text) || !containsHanRune(quote.Author) {
		t.Fatalf("Get() should return Chinese library quote, got %+v", quote)
	}
}

func TestNewDailyQuoteCacheIgnoresLegacyEnglishCache(t *testing.T) {
	t.Parallel()

	cachePath := filepath.Join(t.TempDir(), "daily-quote.json")
	content := `{"text":"Stay hungry, stay foolish.","author":"Steve Jobs","quoteDate":"2026-03-12"}`
	if err := os.WriteFile(cachePath, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	cache, err := NewDailyQuoteCache(cachePath)
	if err != nil {
		t.Fatalf("NewDailyQuoteCache() error = %v", err)
	}

	if cached := cache.Get(); cached.Text != "" || cached.Author != "" || cached.QuoteDate != "" {
		t.Fatalf("legacy english cache should be ignored, got %+v", cached)
	}
}

func TestALAPIFetchFuncParsesSuccessfulResponse(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if got := r.Header.Get("Content-Type"); got != "application/json" {
			t.Fatalf("content-type = %q", got)
		}

		var req alapiMingyanRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("Decode() error = %v", err)
		}
		if req.Token != "test-token" {
			t.Fatalf("token = %q", req.Token)
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"message": "success",
			"code":    200,
			"data": map[string]string{
				"content": "路漫漫其修远兮，吾将上下而求索。",
				"author":  "屈原",
			},
		})
	}))
	defer server.Close()

	fetch := newALAPIFetchFunc(server.Client(), server.URL, "test-token")
	got, err := fetch(context.Background())
	if err != nil {
		t.Fatalf("fetch() error = %v", err)
	}
	if got.Text != "路漫漫其修远兮，吾将上下而求索。" || got.Author != "屈原" {
		t.Fatalf("fetch() result = %+v", got)
	}
}

func TestALAPIFetchFuncRejectsApplicationLevelError(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"success": false,
			"message": "该接口每日请求次数已使用完，如需继续使用请升级更高级会员",
			"code":    10010,
		})
	}))
	defer server.Close()

	fetch := newALAPIFetchFunc(server.Client(), server.URL, "test-token")
	if _, err := fetch(context.Background()); err == nil {
		t.Fatal("fetch() should reject ALAPI business error")
	}
}

func TestAPIHandlerServesDailyQuote(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "homework.json"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	api := NewAPI(store, "secret-token", func() time.Time {
		return time.Date(2026, 3, 12, 8, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	}, stubDailyQuoteProvider{
		quote: DailyQuote{
			Text:      "学而不思则罔，思而不学则殆。",
			Author:    "孔子",
			QuoteDate: "2026-03-12",
			Source:    "online",
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/daily-quote", nil)
	req.Header.Set("X-Realmork-Token", "secret-token")
	recorder := httptest.NewRecorder()

	api.Handler().ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	var quote DailyQuote
	if err := json.NewDecoder(recorder.Body).Decode(&quote); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	if quote.Author != "孔子" || quote.Source != "online" {
		t.Fatalf("quote = %+v", quote)
	}
}

func TestAPIHandlerRejectsUnauthorizedDailyQuote(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "homework.json"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	api := NewAPI(store, "secret-token", func() time.Time {
		return time.Date(2026, 3, 12, 8, 0, 0, 0, time.FixedZone("CST", 8*60*60))
	}, stubDailyQuoteProvider{
		quote: DailyQuote{
			Text:      "学而不思则罔，思而不学则殆。",
			Author:    "孔子",
			QuoteDate: "2026-03-12",
			Source:    "library",
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/daily-quote", nil)
	recorder := httptest.NewRecorder()

	api.Handler().ServeHTTP(recorder, req)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}
