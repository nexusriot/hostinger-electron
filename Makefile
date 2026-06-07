# ---------------------------------------------------------------------------
# hostinger-electron Makefile
#
# Thin wrapper over npm + electron-builder. electron-builder produces the
# .deb packages natively (no manual dpkg-deb plumbing needed), but a
# hand-rolled build-deb.sh is also provided for environments without it.
#
# Common targets:
#   make install        npm install (downloads Electron + builder)
#   make run            launch the app (electron .)
#   make dev            launch with devtools open
#   make deb            .deb for the host arch
#   make deb-amd64      .deb for amd64  -> dist/
#   make deb-arm64      .deb for arm64
#   make deb-armhf      .deb for armv7l
#   make debs           all three .deb arches
#   make appimage       portable AppImage
#   make dist           debs + AppImage (host arch)
#   make clean          remove dist/ and node_modules build artifacts
#
# Override version:  make deb VERSION=1.0.0   (also edit package.json)
# ---------------------------------------------------------------------------

NPM      ?= npm
VERSION  ?= $(shell node -p "require('./package.json').version" 2>/dev/null || echo 0.0.0)
DIST_DIR := dist

.DEFAULT_GOAL := help

.PHONY: help
help:
	@echo "hostinger-electron (v$(VERSION)) targets:"
	@echo "  make install     - npm install"
	@echo "  make run | dev   - launch the app"
	@echo "  make deb         - .deb for host arch -> $(DIST_DIR)/"
	@echo "  make deb-amd64   - .deb amd64"
	@echo "  make deb-arm64   - .deb arm64"
	@echo "  make deb-armhf   - .deb armv7l"
	@echo "  make debs        - all three arches"
	@echo "  make appimage    - portable AppImage"
	@echo "  make dist        - debs + appimage (host arch)"
	@echo "  make pack        - unpacked dir build (fast smoke test)"
	@echo "  make clean       - remove build output"

node_modules: package.json
	$(NPM) install
	@touch node_modules

.PHONY: install
install:
	$(NPM) install

.PHONY: run
run: node_modules
	$(NPM) start

.PHONY: dev
dev: node_modules
	$(NPM) run dev

.PHONY: deb
deb: node_modules
	npx electron-builder --linux deb

.PHONY: deb-amd64
deb-amd64: node_modules
	npx electron-builder --linux deb --x64

.PHONY: deb-arm64
deb-arm64: node_modules
	npx electron-builder --linux deb --arm64

.PHONY: deb-armhf
deb-armhf: node_modules
	npx electron-builder --linux deb --armv7l

.PHONY: debs
debs: node_modules
	npx electron-builder --linux deb --x64 --arm64 --armv7l

.PHONY: appimage
appimage: node_modules
	npx electron-builder --linux AppImage

.PHONY: dist
dist: node_modules
	npx electron-builder --linux deb AppImage

.PHONY: pack
pack: node_modules
	npx electron-builder --dir

.PHONY: clean
clean:
	rm -rf $(DIST_DIR)

.PHONY: distclean
distclean: clean
	rm -rf node_modules
