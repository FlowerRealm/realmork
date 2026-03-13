package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"realmork/internal/homework"
)

func main() {
	var (
		dataDir         = flag.String("data-dir", "", "directory for persistent data")
		token           = flag.String("token", "", "shared secret for API access")
		host            = flag.String("host", "127.0.0.1", "http bind host")
		port            = flag.Int("port", 0, "http bind port")
		quoteALAPIToken = flag.String("quote-alapi-token", "", "ALAPI token for fetching Chinese daily quotes")
	)
	flag.Parse()

	if *dataDir == "" {
		log.Fatal("data-dir is required")
	}

	storePath := filepath.Join(*dataDir, "homework.json")
	store, err := homework.NewStore(storePath)
	if err != nil {
		log.Fatalf("init store: %v", err)
	}

	quoteCache, err := homework.NewDailyQuoteCache(filepath.Join(*dataDir, "daily-quote.json"))
	if err != nil {
		log.Fatalf("init quote cache: %v", err)
	}

	quoteService := homework.NewDailyQuoteService(quoteCache, time.Now, *quoteALAPIToken, nil)
	api := homework.NewAPI(store, *token, time.Now, quoteService)
	server := &http.Server{
		Addr:              fmt.Sprintf("%s:%d", *host, *port),
		Handler:           api.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		log.Fatalf("listen: %v", err)
	}

	fmt.Printf("READY %d\n", listener.Addr().(*net.TCPAddr).Port)
	os.Stdout.Sync()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("serve: %v", err)
	}
}
