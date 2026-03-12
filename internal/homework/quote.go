package homework

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	alapiMingyanURL = "https://v3.alapi.cn/api/mingyan"
	maxQuoteLength  = 160
)

type DailyQuote struct {
	Text      string `json:"text"`
	Author    string `json:"author"`
	QuoteDate string `json:"quoteDate"`
	Source    string `json:"source"`
}

type DailyQuoteProvider interface {
	Get(ctx context.Context) (DailyQuote, error)
}

type DailyQuoteFetchResult struct {
	Text   string
	Author string
}

type DailyQuoteFetchFunc func(ctx context.Context) (DailyQuoteFetchResult, error)

type DailyQuoteService struct {
	cache   *DailyQuoteCache
	now     Clock
	fetch   DailyQuoteFetchFunc
	library []DailyQuoteFetchResult
}

type DailyQuoteCache struct {
	path  string
	mu    sync.RWMutex
	entry dailyQuoteCacheEntry
}

type dailyQuoteCacheEntry struct {
	Text      string `json:"text"`
	Author    string `json:"author"`
	QuoteDate string `json:"quoteDate"`
}

type alapiMingyanRequest struct {
	Token string `json:"token"`
}

type alapiMingyanResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Code    int    `json:"code"`
	Data    struct {
		Content string `json:"content"`
		Author  string `json:"author"`
	} `json:"data"`
}

type embeddedDailyQuote struct {
	Text   string `json:"text"`
	Author string `json:"author"`
}

//go:embed quotes_zh_cn.json
var embeddedQuoteLibraryJSON []byte

var (
	embeddedQuoteLibraryOnce sync.Once
	embeddedQuoteLibrary     []DailyQuoteFetchResult
)

var defaultDailyQuoteLibrary = []DailyQuoteFetchResult{
	{
		Text:   "今天也要认真把眼前的事做好。",
		Author: "内置名言库",
	},
}

func NewDailyQuoteCache(path string) (*DailyQuoteCache, error) {
	cache := &DailyQuoteCache{path: path}
	if path == "" {
		return cache, nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create quote cache dir: %w", err)
	}
	if err := cache.load(); err != nil {
		return nil, err
	}
	return cache, nil
}

func (c *DailyQuoteCache) load() error {
	if c.path == "" {
		return nil
	}

	content, err := os.ReadFile(c.path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read quote cache: %w", err)
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		return nil
	}

	var entry dailyQuoteCacheEntry
	if err := json.Unmarshal(content, &entry); err != nil {
		// A broken cache should not stop the app from starting.
		return nil
	}

	if !isValidQuote(entry.Text, entry.Author) {
		return nil
	}

	c.entry = entry
	return nil
}

func (c *DailyQuoteCache) Get() dailyQuoteCacheEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.entry
}

func (c *DailyQuoteCache) Save(entry dailyQuoteCacheEntry) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.path == "" {
		c.entry = entry
		return nil
	}

	tempFile, err := os.CreateTemp(filepath.Dir(c.path), "daily-quote-*.json")
	if err != nil {
		return fmt.Errorf("create quote cache temp file: %w", err)
	}

	encoder := json.NewEncoder(tempFile)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(entry); err != nil {
		tempFile.Close()
		os.Remove(tempFile.Name())
		return fmt.Errorf("encode quote cache: %w", err)
	}

	if err := tempFile.Close(); err != nil {
		os.Remove(tempFile.Name())
		return fmt.Errorf("close quote cache temp file: %w", err)
	}

	if err := replaceFile(tempFile.Name(), c.path); err != nil {
		os.Remove(tempFile.Name())
		return fmt.Errorf("replace quote cache: %w", err)
	}

	c.entry = entry
	return nil
}

func replaceFile(tempPath string, targetPath string) error {
	targetInfo, statErr := os.Stat(targetPath)
	if statErr == nil && targetInfo.IsDir() {
		return fmt.Errorf("target path is a directory")
	}

	renameErr := os.Rename(tempPath, targetPath)
	if renameErr == nil {
		return nil
	}

	if statErr != nil {
		if os.IsNotExist(statErr) {
			return fmt.Errorf("rename temp file: %w", renameErr)
		}
		return fmt.Errorf("stat target file: %w", statErr)
	}

	backupFile, err := os.CreateTemp(filepath.Dir(targetPath), filepath.Base(targetPath)+".bak-*")
	if err != nil {
		return fmt.Errorf("create backup path: %w", err)
	}

	backupPath := backupFile.Name()
	if err := backupFile.Close(); err != nil {
		os.Remove(backupPath)
		return fmt.Errorf("close backup path: %w", err)
	}
	if err := os.Remove(backupPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("prepare backup path: %w", err)
	}

	if err := os.Rename(targetPath, backupPath); err != nil {
		return fmt.Errorf("backup target file: %w", err)
	}

	if err := os.Rename(tempPath, targetPath); err != nil {
		if restoreErr := os.Rename(backupPath, targetPath); restoreErr != nil {
			return fmt.Errorf("move new file into place: %w (restore backup: %v)", err, restoreErr)
		}
		return fmt.Errorf("move new file into place: %w", err)
	}

	_ = os.Remove(backupPath)
	return nil
}

func NewDailyQuoteService(cache *DailyQuoteCache, now Clock, alapiToken string, fetch DailyQuoteFetchFunc) *DailyQuoteService {
	if now == nil {
		now = time.Now
	}
	if cache == nil {
		cache = &DailyQuoteCache{}
	}

	cleanToken := strings.TrimSpace(alapiToken)
	if fetch == nil && cleanToken != "" {
		fetch = newALAPIFetchFunc(&http.Client{Timeout: 3 * time.Second}, alapiMingyanURL, cleanToken)
	}

	return &DailyQuoteService{
		cache:   cache,
		now:     now,
		fetch:   fetch,
		library: loadEmbeddedQuoteLibrary(),
	}
}

func (s *DailyQuoteService) Get(ctx context.Context) (DailyQuote, error) {
	today := formatQuoteDate(s.now())
	cached := s.cache.Get()
	if isCachedQuoteForDate(cached, today) {
		return DailyQuote{
			Text:      cached.Text,
			Author:    cached.Author,
			QuoteDate: today,
			Source:    "cache",
		}, nil
	}

	if s.fetch != nil {
		fresh, err := s.fetch(ctx)
		if err == nil && isValidQuote(fresh.Text, fresh.Author) {
			entry := dailyQuoteCacheEntry{
				Text:      strings.TrimSpace(fresh.Text),
				Author:    strings.TrimSpace(fresh.Author),
				QuoteDate: today,
			}
			if saveErr := s.cache.Save(entry); saveErr == nil {
				return DailyQuote{
					Text:      entry.Text,
					Author:    entry.Author,
					QuoteDate: today,
					Source:    "online",
				}, nil
			}
			return DailyQuote{
				Text:      entry.Text,
				Author:    entry.Author,
				QuoteDate: today,
				Source:    "online",
			}, nil
		}

		if isValidQuote(cached.Text, cached.Author) {
			return DailyQuote{
				Text:      cached.Text,
				Author:    cached.Author,
				QuoteDate: cached.QuoteDate,
				Source:    "cache",
			}, nil
		}
	}

	selected := libraryQuoteForDate(today, s.library)
	return DailyQuote{
		Text:      selected.Text,
		Author:    selected.Author,
		QuoteDate: today,
		Source:    "library",
	}, nil
}

func newALAPIFetchFunc(client *http.Client, endpoint string, token string) DailyQuoteFetchFunc {
	return func(ctx context.Context) (DailyQuoteFetchResult, error) {
		payload, err := json.Marshal(alapiMingyanRequest{Token: token})
		if err != nil {
			return DailyQuoteFetchResult{}, fmt.Errorf("marshal alapi request: %w", err)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
		if err != nil {
			return DailyQuoteFetchResult{}, fmt.Errorf("build alapi request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			return DailyQuoteFetchResult{}, fmt.Errorf("request alapi: %w", err)
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return DailyQuoteFetchResult{}, fmt.Errorf("read alapi response: %w", err)
		}

		var parsed alapiMingyanResponse
		if len(strings.TrimSpace(string(body))) > 0 {
			if err := json.Unmarshal(body, &parsed); err != nil {
				return DailyQuoteFetchResult{}, fmt.Errorf("decode alapi payload: %w", err)
			}
		}

		if resp.StatusCode != http.StatusOK {
			return DailyQuoteFetchResult{}, fmt.Errorf("alapi request failed: %s", buildALAPIErrorMessage(parsed.Message, parsed.Code, resp.StatusCode))
		}
		if !parsed.Success || parsed.Code != http.StatusOK {
			return DailyQuoteFetchResult{}, fmt.Errorf("alapi response rejected: %s", buildALAPIErrorMessage(parsed.Message, parsed.Code, resp.StatusCode))
		}

		return DailyQuoteFetchResult{
			Text:   parsed.Data.Content,
			Author: parsed.Data.Author,
		}, nil
	}
}

func loadEmbeddedQuoteLibrary() []DailyQuoteFetchResult {
	embeddedQuoteLibraryOnce.Do(func() {
		var items []embeddedDailyQuote
		if err := json.Unmarshal(embeddedQuoteLibraryJSON, &items); err != nil {
			embeddedQuoteLibrary = cloneDailyQuoteResults(defaultDailyQuoteLibrary)
			return
		}

		loaded := make([]DailyQuoteFetchResult, 0, len(items))
		for _, item := range items {
			if !isValidQuote(item.Text, item.Author) {
				continue
			}
			loaded = append(loaded, DailyQuoteFetchResult{
				Text:   strings.TrimSpace(item.Text),
				Author: strings.TrimSpace(item.Author),
			})
		}
		if len(loaded) == 0 {
			loaded = cloneDailyQuoteResults(defaultDailyQuoteLibrary)
		}
		embeddedQuoteLibrary = loaded
	})

	return cloneDailyQuoteResults(embeddedQuoteLibrary)
}

func cloneDailyQuoteResults(items []DailyQuoteFetchResult) []DailyQuoteFetchResult {
	cloned := make([]DailyQuoteFetchResult, len(items))
	copy(cloned, items)
	return cloned
}

func formatQuoteDate(now time.Time) string {
	return now.Format("2006-01-02")
}

func isCachedQuoteForDate(entry dailyQuoteCacheEntry, quoteDate string) bool {
	return entry.QuoteDate == quoteDate && isValidQuote(entry.Text, entry.Author)
}

func isValidQuote(text string, author string) bool {
	cleanText := strings.TrimSpace(text)
	cleanAuthor := strings.TrimSpace(author)
	if cleanText == "" || cleanAuthor == "" {
		return false
	}
	if utf8.RuneCountInString(cleanText) > maxQuoteLength {
		return false
	}
	if strings.EqualFold(cleanAuthor, "anonymous") {
		return false
	}
	if hasASCIILetters(cleanText) || hasASCIILetters(cleanAuthor) {
		return false
	}
	if !containsHanRune(cleanText) || !containsHanRune(cleanAuthor) {
		return false
	}
	return true
}

func hasASCIILetters(input string) bool {
	for _, r := range input {
		if r <= unicode.MaxASCII && unicode.IsLetter(r) {
			return true
		}
	}
	return false
}

func containsHanRune(input string) bool {
	for _, r := range input {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

func libraryQuoteForDate(quoteDate string, candidates []DailyQuoteFetchResult) DailyQuoteFetchResult {
	if len(candidates) == 0 {
		return defaultDailyQuoteLibrary[0]
	}

	indexValue, err := strconv.Atoi(strings.ReplaceAll(quoteDate, "-", ""))
	if err != nil {
		indexValue = 0
	}
	return candidates[indexValue%len(candidates)]
}

func buildALAPIErrorMessage(message string, code int, status int) string {
	cleanMessage := strings.TrimSpace(message)
	switch {
	case cleanMessage != "" && code > 0:
		return fmt.Sprintf("%s (code=%d status=%d)", cleanMessage, code, status)
	case cleanMessage != "":
		return fmt.Sprintf("%s (status=%d)", cleanMessage, status)
	case code > 0:
		return fmt.Sprintf("code=%d status=%d", code, status)
	default:
		return fmt.Sprintf("status=%d", status)
	}
}
