.PHONY: dev build test typecheck backend

NPM := npm

dev:
	$(NPM) run dev

build:
	$(NPM) run build

test:
	go test ./...
	$(NPM) test

typecheck:
	$(NPM) run typecheck

backend:
	go build -o dist/bin/homeworkd ./cmd/homeworkd
