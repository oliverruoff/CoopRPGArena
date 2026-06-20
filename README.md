# Coop RPG Arena

Browser-based cooperative RPG arena MVP with a FastAPI authoritative server and a TypeScript/Babylon.js client.

## Start Development Stack

```bash
docker compose up --build
```

Open the game at:

```text
http://localhost:5173
```

Backend health:

```text
http://localhost:8000/health
```

Stop the stack:

```bash
docker compose down
```

## Verify

```bash
./scripts/verify.sh
```

The verification script runs backend tests, frontend typecheck, frontend build, and Playwright E2E tests.
