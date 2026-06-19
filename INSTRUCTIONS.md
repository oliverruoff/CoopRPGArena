# INSTRUCTIONS.md – Project Implementation Guide for Coding Agent

## 1. Project Summary

Build a browser-based 3D cooperative RPG arena game.

The game is a simplified, original, blocky, dungeon-crawler-style browser game where 1–5 players join a lobby, choose classes, ready up, spawn into a round white arena, fight waves of enemies, level up during the match, choose upgrades, and defeat a final boss.

The game should feel inspired by simplified MMORPG combat and cooperative dungeon crawler wave survival.

The MVP must be playable end-to-end.

Core fantasy:

- Players fight together as a small party.
- Classes have distinct roles and resources.
- Combat is simple but RPG-like.
- Enemies spawn in waves.
- Players gain XP and become stronger during the run.
- The visual style is simple, blocky, readable, and performant.
- The entire project should run easily via Docker.

---

## 2. Required Reading Order

Before implementing, read the project Markdown files in this order:

1. `SPEC.md`
2. `BALANCE.md`
3. `CHARACTER_DESIGN.md`
4. `TEST.md`
5. `DOCKER.md` if present as a separate supporting file

If the Docker requirements are already included in `SPEC.md`, treat the Docker section in `SPEC.md` as authoritative.

---

## 3. Purpose of Each Markdown File

### 3.1 `SPEC.md`

This is the main product and technical specification.

It defines:

- game concept
- MVP scope
- lobby flow
- match structure
- camera and controls
- arena rules
- combat model
- classes
- resources
- abilities
- leveling
- enemies
- waves
- UI requirements
- networking model
- server authority
- repository structure
- implementation milestones
- acceptance criteria
- Docker/deployment requirements

Treat this as the primary source of truth for what must be built.

If something is unclear in another file, prefer `SPEC.md`.

---

### 3.2 `BALANCE.md`

This file defines concrete gameplay numbers.

It defines:

- global combat constants
- class base stats
- resource rules
- starting abilities
- XP curve
- level-up stat growth
- upgrade pools
- enemy stats
- enemy scaling
- wave table
- boss stats
- boss abilities
- tuning notes

Use this file to create the structured game data files.

Recommended output data files:

```text
server/app/game_data/classes.json
server/app/game_data/abilities.json
server/app/game_data/upgrades.json
server/app/game_data/enemies.json
server/app/game_data/waves.json
server/app/game_data/bosses.json
server/app/game_data/constants.json
```

Do not hardcode balance values directly into game logic if they can reasonably live in data files.

---

### 3.3 `CHARACTER_DESIGN.md`

This file defines the visual direction.

It defines:

- blocky low-poly / voxel-inspired style
- class silhouettes
- class colors
- character model requirements
- enemy visual design
- combat effect colors
- arena visual direction
- UI readability guidance
- suggested Babylon.js primitive mesh implementation
- character/effect factory structure

The MVP should not require external 3D assets.

Use procedural Babylon.js meshes first:

- boxes
- cuboids
- cylinders
- simple spheres
- simple emissive materials
- simple particles/trails

The art must prioritize readability from a zoomed-out top-down camera.

---

### 3.4 `TEST.md`

This file defines automated runtime verification.

It defines:

- unit test expectations
- backend integration tests
- Playwright browser E2E tests
- test mode
- debug endpoints
- required test hooks
- required `data-testid` attributes
- per-milestone verification rules
- definition of done

A feature is not complete until it can be verified in the running system.

The agent must not only write code. It must run and verify the actual game.

---

### 3.5 `DOCKER.md`

This file defines Docker-specific implementation details if kept as a separate file.

It defines:

- development Docker Compose setup
- backend container
- client container
- production deployment options
- environment variables
- Dockerized testing expectations
- README commands

If this content is already merged into `SPEC.md`, use the merged `SPEC.md` section as the main reference.

---

## 4. MVP Definition

The first playable MVP is complete when the game supports:

- Dockerized local startup
- Python FastAPI backend
- TypeScript/Babylon.js frontend
- WebSocket communication
- one lobby
- 1–5 players
- class selection
- ready state
- synchronized 3-second countdown
- round white arena
- fixed zoomed-out angled top-down camera
- WASD movement
- Space jump as cosmetic action
- enemy targeting via click and Tab
- ally targeting via Shift+Tab
- four classes:
  - Warrior
  - Hunter
  - Priest
  - Mage
- auto-attack
- 2 starting active abilities per class
- resources:
  - Warrior: Rage
  - Hunter: Focus
  - Priest: Mana
  - Mage: Mana
- server-authoritative combat
- enemy waves
- XP gain
- level-ups
- 3-option upgrade selection
- player death/downed state
- respawn after wave completion
- loss if all players die
- final boss
- victory screen
- defeat screen
- automated runtime verification

---

## 5. Implementation Strategy

Implement the game in small vertical slices.

Do not build all systems in isolation before anything is playable.

Recommended order:

1. Project structure and Docker startup
2. Backend health endpoint
3. Frontend loading screen / lobby shell
4. WebSocket connection
5. Lobby player list
6. Class selection
7. Ready state and countdown
8. Basic arena rendering
9. Server-authoritative player spawn
10. WASD movement
11. Multiplayer movement sync
12. Cosmetic jump
13. Simple enemy spawn
14. Targeting
15. Auto-attack
16. First damage system
17. Class data loading
18. Starting abilities
19. Resources and cooldowns
20. Healing
21. Threat/aggro
22. Wave system
23. XP and leveling
24. Upgrade selection
25. Enemy variety
26. Boss encounter
27. Win/loss screens
28. Full automated verification

At every step, keep the game runnable.

---

## 6. Technical Architecture

### 6.1 Backend

Use:

- Python 3.12+
- FastAPI
- Uvicorn
- WebSockets
- asyncio game loop

Backend responsibilities:

- authoritative game state
- lobby state
- player connection handling
- player movement validation
- combat resolution
- cooldowns
- resources
- XP and leveling
- upgrades
- enemy AI
- threat/aggro
- waves
- boss
- win/loss logic
- debug/test mode

### 6.2 Frontend

Use:

- TypeScript
- Vite
- Babylon.js
- WebSocket client
- HTML/CSS UI overlay

Frontend responsibilities:

- render 3D arena
- render players/enemies/effects
- collect input
- send input/actions to server
- interpolate server snapshots
- render HUD/UI
- render lobby
- render ability bar
- render level-up selection
- render victory/defeat screens

### 6.3 Server Authority Rule

The server is authoritative.

The client must never decide:

- whether an attack hit
- how much damage was dealt
- whether healing happened
- whether an enemy died
- whether XP was awarded
- whether a level-up occurred
- whether a wave completed
- whether the match was won/lost

The client only sends intent and input.

---

## 7. Docker Requirement

The project must be runnable with:

```bash
docker compose up --build
```

Expected local URLs:

```text
Game frontend: http://localhost:5173
Backend health: http://localhost:8000/health
```

The Docker setup should start both backend and client.

Do not require manual local installation for the default development startup beyond Docker.

---

## 8. Testing Requirement

The implementation must include automated tests from the beginning.

Required command:

```bash
./scripts/verify.sh
```

This script should run:

- backend tests
- frontend typecheck
- frontend build
- browser E2E tests

Use `TEST.md` as the detailed verification guide.

The agent must add tests for every meaningful feature.

---

## 9. Required Debug/Test Mode

The backend must support test mode via:

```bash
GAME_TEST_MODE=true
```

In test mode, expose debug endpoints such as:

```http
GET /debug/state
POST /debug/action
```

These endpoints are only allowed in test mode.

They are required so Playwright tests can verify the actual authoritative server state.

---

## 10. Data-Driven Implementation

Game data should be stored in structured files.

Recommended:

```text
server/app/game_data/
  constants.json
  classes.json
  abilities.json
  upgrades.json
  enemies.json
  waves.json
  bosses.json
```

The backend should load these files at startup.

Avoid scattering balance values throughout code.

---

## 11. UI Testability

Every important UI element must have stable test IDs.

Examples:

```text
class-warrior
class-hunter
class-priest
class-mage
ready-button
countdown
arena
party-frame
target-frame
action-bar
cast-bar
wave-counter
level-up-panel
ability-slot-1
ability-slot-2
```

Use `data-testid` attributes in the frontend.

---

## 12. Current Known Gaps and How to Handle Them

The current specifications are sufficient for a playable MVP, but some details are intentionally left flexible.

The coding agent may choose simple sensible defaults for the following:

### 12.1 Exact UI Layout

The files define required UI elements but not pixel-perfect layout.

Default recommendation:
- party frames on the left
- target frame top center
- player HP/resource/XP bottom center
- action bar bottom center
- wave counter top right
- level-up panel center/right overlay

### 12.2 Exact Model Geometry

`CHARACTER_DESIGN.md` defines visual direction but not exact mesh coordinates.

Default recommendation:
- implement procedural primitive models
- keep silhouettes readable
- keep class colors clear

### 12.3 Exact Animation Implementation

The specification does not require skeletal animation.

Default recommendation:
- use simple transform-based animation
- bobbing for movement
- rotation for weapon swings
- scale/position changes for jump
- emissive particles for spells

### 12.4 Exact Enemy Pathfinding

The MVP does not require advanced pathfinding.

Default recommendation:
- use simple steering/chase behavior
- enemies move toward target
- ranged enemies try to maintain distance
- avoid complex navmesh until obstacles are introduced

### 12.5 Exact Projectiles

The specification allows target-based and projectile-like visuals.

Default recommendation:
- server resolves ability outcome authoritatively
- frontend may render projectile visuals for readability
- do not rely on client projectile collision for gameplay

### 12.6 Perfect Balance

`BALANCE.md` provides initial values but they will need tuning.

Default recommendation:
- implement values as data
- keep tuning easy
- prioritize playable flow over perfect numbers

---

## 13. Definition of Done for the Coding Agent

A feature is done only when:

1. it is implemented,
2. it works in the running game,
3. it is covered by at least one appropriate test,
4. it does not break existing tests,
5. it is compatible with Docker startup,
6. the browser console has no unexpected runtime errors,
7. the backend logs have no unhandled exceptions.

A milestone is done only when:

```bash
./scripts/verify.sh
```

passes.

---

## 14. Recommended First Milestone

Start with the smallest runnable vertical slice:

### Goal

A Dockerized app where one player can open the browser, connect to the backend, enter a lobby, select a class, ready up, start the match, spawn in a round white arena, move with WASD, and jump with Space.

### Required implementation

Backend:
- FastAPI app
- `/health`
- WebSocket endpoint
- lobby state
- class selection
- ready state
- countdown
- basic match state
- player position state

Frontend:
- Vite/Babylon.js app
- WebSocket client
- lobby UI
- class buttons
- ready button
- countdown display
- round white arena
- local player model
- camera
- input handling
- server snapshot rendering

Docker:
- `docker-compose.yml`
- backend Dockerfile
- client Dockerfile.dev

Tests:
- smoke test
- single player lobby test
- match start test
- movement test
- jump test

---

## 15. Recommended Second Milestone

Add the first combat loop.

### Goal

A player can fight one basic enemy.

Required:
- spawn Goblin
- select target
- auto-attack
- one active ability
- enemy HP
- player HP
- damage calculation
- enemy death
- combat text or basic UI feedback

Tests:
- enemy spawn test
- targeting test
- damage test
- enemy death test

---

## 16. Recommended Third Milestone

Add all classes and basic multiplayer.

### Goal

Multiple players can join, choose different classes, move together, and use starting abilities.

Required:
- all four classes
- resources
- cooldowns
- Warrior Strike/Taunting Blow
- Hunter Power Shot/Quick Shot
- Priest Heal/Smite
- Mage Fireball/Frostbolt
- ally targeting
- healing
- healing threat

Tests:
- three-player lobby test
- class ability tests
- heal test
- healing threat test
- multiplayer movement sync test

---

## 17. Recommended Fourth Milestone

Add progression and waves.

### Goal

The game becomes a real wave-based RPG run.

Required:
- waves 1–10
- five enemy types
- XP
- levels
- upgrade panel
- stat growth
- wave breaks
- respawn after wave

Tests:
- wave spawn test
- XP test
- level-up test
- upgrade selection test
- death/respawn test

---

## 18. Recommended Fifth Milestone

Add boss and finish the MVP.

### Goal

The run has a clear ending.

Required:
- final boss
- boss abilities
- victory condition
- defeat condition
- victory/defeat UI
- full verification passing

Tests:
- boss spawn test
- boss ability telegraph test
- victory test
- defeat test
- full run smoke test if feasible

---

## 19. Final Agent Instruction

Implement the game as a working, runnable, testable MVP.

Always prefer:

- simple over complex
- playable over perfect
- data-driven over hardcoded
- verified runtime behavior over theoretical correctness
- clear visuals over detailed visuals
- server authority over client trust

Do not add non-MVP features until the core loop is playable and verified.
