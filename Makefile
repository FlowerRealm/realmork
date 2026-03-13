.PHONY: dev build test typecheck backend release-linux release-win release-mac

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
	$(NPM) run build:backend

release-linux:
	$(NPM) run release:linux

release-win:
	$(NPM) run release:win

release-mac:
	$(NPM) run release:mac
