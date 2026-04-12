COMPOSE=docker compose

.PHONY: up down restart logs cert lint smoke

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f --tail=120

cert:
	bash infra/scripts/issue-cert.sh

lint:
	cd server && npm run lint

smoke:
	bash infra/scripts/smoke-check.sh
