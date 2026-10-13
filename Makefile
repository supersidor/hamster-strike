.PHONY: help install dev debug online build serve check assets clean

help:
	@echo "make install  - npm install"
	@echo "make dev      - vite dev server on :5173 (solo)"
	@echo "make debug    - dev server, opens /?debug"
	@echo "make online   - game server (:8080) + vite dev server (/ws proxied)"
	@echo "make build    - build dist/"
	@echo "make serve    - build, then run the production server on :8080"
	@echo "make check    - map checks + headless net test"
	@echo "make assets   - convert assets from ../petro3d"

node_modules: package.json package-lock.json
	npm install
	@touch node_modules

install: node_modules

dev: node_modules
	npm run dev

debug: node_modules
	npm run dev -- --open /?debug

online: node_modules
	@trap "kill 0" INT TERM EXIT; npm run server & npm run dev -- --open /?online & wait

build: node_modules
	npm run build

serve: build
	npm start

check: node_modules
	npm run check

assets:
	npm run assets

clean:
	rm -rf dist
