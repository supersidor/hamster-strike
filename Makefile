.PHONY: help install dev debug online build serve check assets ak47 clean

help:
	@echo "make install  - npm install"
	@echo "make dev      - vite dev server on :5173 (no game server, falls back to solo)"
	@echo "make debug    - dev server, opens /?debug"
	@echo "make online   - game server (:8080) + vite dev server (/ws proxied)"
	@echo "make build    - build dist/"
	@echo "make serve    - build, then run the production server on :8080"
	@echo "make check    - map checks + headless net test"
	@echo "make assets   - convert assets from ../petro3d"
	@echo "make ak47     - convert the AK-47 model from ~/Downloads/ak-47-assault-rifle.zip (ZIP=...)"

node_modules: package.json package-lock.json
	npm install
	@touch node_modules

install: node_modules

dev: node_modules
	npm run dev

debug: node_modules
	npm run dev -- --open /?debug

online: node_modules
	@trap "kill 0" INT TERM EXIT; npm run server & npm run dev -- --open / & wait

build: node_modules
	npm run build

serve: build
	npm start

check: node_modules
	npm run check

assets:
	npm run assets

ak47: node_modules
	bash tools/convert-ak47.sh $(ZIP)

clean:
	rm -rf dist
