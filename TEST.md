# Automated Runtime Verification – TEST.md

## 1. Purpose

This document defines how the coding agent must automatically test and verify the game against the actually running system.

The goal is not only to test isolated functions, but to prove that the full game works when the backend, frontend, WebSocket communication, browser UI, and game loop are running together.

A feature is only considered complete when it can be verified in the running system.

---

## 2. Testing Philosophy

The project must use three levels of testing:

1. Unit tests
2. Backend integration tests
3. End-to-end browser tests against the real running game

Unit tests are useful, but they are not enough. The coding agent must also start the actual backend and frontend, open real browser sessions, simulate players, and verify that the visible UI and authoritative server state behave correctly.

---

## 3. Required Test Tools

Use the following tools:

### Backend

- `pytest`
- Python WebSocket client for integration tests
- optional: `pytest-asyncio`

### Frontend

- TypeScript type checking
- production build check
- Playwright for browser end-to-end tests

### Runtime Verification

- shell scripts for starting/stopping services
- Playwright traces/screenshots/videos on failure
- backend log capture
- browser console error capture

---

## 4. Required Commands

The repository must provide the following commands.

### Backend Unit and Integration Tests

```bash
cd server
pytest
```

### Frontend Typecheck and Build

```bash
cd client
npm run typecheck
npm run build
```

### Browser End-to-End Tests

```bash
cd client
npm run test:e2e
```

### Full Verification

```bash
./scripts/verify.sh
```

The `verify.sh` script must run all relevant checks and return a non-zero exit code if any step fails.

---

## 5. Verification Principle

A feature is only considered implemented when:

1. the code exists,
2. the game starts successfully,
3. the feature can be exercised in the running browser,
4. at least one automated runtime test verifies it,
5. the full verification script passes.

The coding agent must not mark a milestone as complete if the runtime verification fails.

---

## 6. Test Mode

The game must provide a dedicated test mode.

Enable it via environment variable:

```bash
GAME_TEST_MODE=true
```

When test mode is enabled, the backend may expose debug and test-only functionality.

When test mode is disabled, all debug/test endpoints and commands must be unavailable.

---

## 7. Debug/Test Hooks

The following test hooks should be available only when `GAME_TEST_MODE=true`.

Suggested debug actions:

```text
spawn_enemy(type, position)
set_player_hp(playerId, value)
set_player_resource(playerId, value)
give_xp(playerId, amount)
force_level_up(playerId)
force_wave_start(waveNumber)
force_wave_complete()
kill_enemy(enemyId)
kill_player(playerId)
reset_match()
get_debug_state()
```

These hooks are allowed because they make automated runtime verification reliable and deterministic.

They must never be available in normal game mode.

---

## 8. Debug State Endpoint

The backend should expose a debug state endpoint only in test mode:

```http
GET /debug/state
```

This endpoint returns the authoritative server state in a machine-readable format.

Example response:

```json
{
  "matchState": "running",
  "players": {
    "player_1": {
      "name": "Player 1",
      "classId": "priest",
      "hp": 100,
      "maxHealth": 100,
      "resource": 72,
      "maxResource": 100,
      "resourceType": "mana",
      "level": 2,
      "xp": 120,
      "targetId": "player_2",
      "position": { "x": 0, "z": 1 },
      "dead": false
    }
  },
  "enemies": {
    "enemy_1": {
      "type": "goblin",
      "hp": 42,
      "maxHealth": 60,
      "targetId": "player_1",
      "position": { "x": 5, "z": 3 },
      "threat": {
        "player_1": 50,
        "player_2": 20
      }
    }
  },
  "wave": {
    "number": 2,
    "state": "active",
    "aliveEnemies": 3
  }
}
```

End-to-end tests may use this endpoint to verify that visible UI actions caused correct authoritative server state changes.

---

## 9. Debug Action Endpoint

The backend may expose a test-only debug action endpoint:

```http
POST /debug/action
```

Example request:

```json
{
  "action": "spawn_enemy",
  "payload": {
    "type": "goblin",
    "position": { "x": 5, "z": 0 }
  }
}
```

Example request:

```json
{
  "action": "set_player_hp",
  "payload": {
    "playerId": "player_1",
    "hp": 40
  }
}
```

This endpoint must only exist when `GAME_TEST_MODE=true`.

---

## 10. UI Testability Requirements

The frontend must include stable `data-testid` attributes for important UI elements.

Examples:

```html
<button data-testid="class-warrior">Warrior</button>
<button data-testid="class-hunter">Hunter</button>
<button data-testid="class-priest">Priest</button>
<button data-testid="class-mage">Mage</button>

<button data-testid="ready-button">Ready</button>

<div data-testid="countdown"></div>
<div data-testid="arena"></div>

<div data-testid="player-health-bar"></div>
<div data-testid="player-resource-bar"></div>
<div data-testid="xp-bar"></div>
<div data-testid="player-level"></div>

<div data-testid="party-frame"></div>
<div data-testid="target-frame"></div>
<div data-testid="action-bar"></div>
<div data-testid="cast-bar"></div>
<div data-testid="wave-counter"></div>
<div data-testid="level-up-panel"></div>

<button data-testid="ability-slot-1"></button>
<button data-testid="ability-slot-2"></button>
<button data-testid="ability-slot-3"></button>
<button data-testid="ability-slot-4"></button>
<button data-testid="ability-slot-q"></button>
<button data-testid="ability-slot-e"></button>
<button data-testid="ability-slot-r"></button>
```

The agent should prefer testing via user-visible UI and stable test IDs instead of fragile CSS selectors.

---

## 11. Logging Requirements

Automated tests must capture:

- backend logs
- browser console errors
- failed network requests
- Playwright screenshots on failure
- Playwright traces on failure
- optional video recordings on failure

A test should fail if unexpected browser console errors occur.

A test should fail if the backend logs unhandled exceptions.

---

## 12. Service Startup for E2E Tests

The E2E test setup must start:

1. backend server
2. frontend dev server
3. browser session(s)

Recommended scripts:

```text
scripts/
  verify.sh
  start-dev.sh
  wait-for-server.sh
  stop-dev.sh
```

The E2E setup must wait until both services are reachable before running tests.

Suggested health endpoints:

```http
GET /health
GET /debug/state
```

`/debug/state` is only available in test mode.

---

## 13. Playwright Test Structure

Recommended file structure:

```text
client/
  tests/
    e2e/
      smoke.spec.ts
      lobby.spec.ts
      multiplayer.spec.ts
      movement.spec.ts
      jump.spec.ts
      targeting.spec.ts
      combat.spec.ts
      healing-threat.spec.ts
      waves-leveling.spec.ts
      victory-defeat.spec.ts
```

---

## 14. Required E2E Test Cases

### 14.1 Smoke Test: Application Starts

Purpose:
Verify that backend and frontend start and the browser can load the game.

Steps:
1. Start backend with `GAME_TEST_MODE=true`.
2. Start frontend.
3. Open the browser.
4. Navigate to the game URL.
5. Verify that the lobby UI is visible.
6. Verify that the WebSocket connects.
7. Verify that no browser console errors occur.

Expected result:
- The page loads.
- Lobby UI is visible.
- No critical console errors.
- No backend exceptions.

---

### 14.2 Single Player Lobby Test

Purpose:
Verify that one player can select a class, ready up, and start a match.

Steps:
1. Open one browser page.
2. Select `Mage`.
3. Click Ready.
4. Wait for the 3-second countdown.
5. Verify that the arena becomes visible.
6. Verify that the player spawned.

Expected result:
- Mage is selected.
- Ready state is visible.
- Countdown appears.
- Match starts.
- Arena is visible.
- Player exists in `/debug/state`.

---

### 14.3 Multiplayer Lobby Test

Purpose:
Verify that multiple players share the same lobby and start together.

Steps:
1. Open three browser pages or browser contexts.
2. Player 1 selects Warrior.
3. Player 2 selects Priest.
4. Player 3 selects Mage.
5. All players click Ready.
6. Verify countdown appears for all players.
7. Verify match starts for all players.
8. Verify each player sees three party frames.

Expected result:
- All players are listed in the same lobby.
- All players see the countdown.
- All players enter the same match.
- Each client sees all party members.
- `/debug/state` contains all three players.

---

### 14.4 Movement Synchronization Test

Purpose:
Verify that server-authoritative movement is synchronized across clients.

Steps:
1. Start a two-player match.
2. Record Player 1 position from `/debug/state`.
3. In Player 1 browser, hold `W` for a short duration.
4. Read Player 1 position again from `/debug/state`.
5. Verify position changed.
6. Verify Player 2 browser visually receives the updated Player 1 position.

Expected result:
- Player 1 moves according to server state.
- Player 2 sees Player 1 move.
- No desync or runtime error occurs.

---

### 14.5 Jump Test

Purpose:
Verify that Space triggers a visible cosmetic jump.

Steps:
1. Start a match.
2. Press Space in Player 1 browser.
3. Verify jump animation or jump state appears locally.
4. Verify another client receives the jump event or sees the jump animation.
5. Verify jump does not affect HP, collision, or combat state.

Expected result:
- Jump is visible.
- Jump has no gameplay effect in MVP.
- No server errors.

---

### 14.6 Enemy Targeting Test

Purpose:
Verify that players can target enemies with click and Tab.

Steps:
1. Start a match.
2. Spawn two enemies using debug action.
3. Click enemy 1.
4. Verify target frame shows enemy 1.
5. Press Tab.
6. Verify target switches to another enemy.

Expected result:
- Enemy target selection works.
- Target frame updates.
- Server state reflects selected target.

---

### 14.7 Ally Targeting Test

Purpose:
Verify that healers can target allies with Shift + Tab.

Steps:
1. Start a two-player match with Priest and Warrior.
2. Focus Priest browser.
3. Press Shift + Tab.
4. Verify Warrior becomes selected ally target.
5. Verify target frame displays Warrior.

Expected result:
- Ally target selection works.
- Priest can select party members.
- Server state reflects selected ally target.

---

### 14.8 Combat Ability Test

Purpose:
Verify that offensive ability casting works end-to-end.

Steps:
1. Start a Mage match.
2. Spawn a Goblin using debug action.
3. Select the Goblin.
4. Cast Fireball via ability slot or hotkey.
5. Verify cast bar appears if Fireball has cast time.
6. Wait for cast completion.
7. Verify Mage mana decreased.
8. Verify Goblin HP decreased.
9. Verify cooldown is visible.
10. Verify combat text appears.

Expected result:
- Ability can be cast.
- Resource cost is applied.
- Damage is applied server-side.
- UI updates correctly.
- Cooldown is visible.

---

### 14.9 Healing and Threat Test

Purpose:
Verify that Priest healing works and creates threat on the healer.

Steps:
1. Start a match with Warrior and Priest.
2. Spawn a Goblin.
3. Force Goblin to attack Warrior or let Warrior build initial threat.
4. Set Warrior HP below max using debug action.
5. In Priest browser, target Warrior using Shift + Tab or party frame.
6. Cast Heal.
7. Verify Warrior HP increases.
8. Verify Priest mana decreases.
9. Read `/debug/state`.
10. Verify Priest received healing threat on the Goblin.

Expected result:
- Priest can heal Warrior.
- Warrior HP increases.
- Priest mana decreases.
- Healing creates threat on Priest.
- Threat value should follow the defined rule, e.g. `1 healing = 0.5 threat`.

---

### 14.10 Wave Spawn Test

Purpose:
Verify that waves spawn enemies correctly.

Steps:
1. Start a match.
2. Force wave 1 start using debug action or wait for normal wave start.
3. Verify wave counter displays wave 1.
4. Verify enemies spawn near arena edge.
5. Verify spawn indicators appear before enemies spawn.
6. Verify enemies are present in `/debug/state`.

Expected result:
- Wave starts.
- Spawn indicators appear.
- Enemies spawn.
- UI wave counter updates.
- Server state matches UI.

---

### 14.11 XP and Level-Up Test

Purpose:
Verify that players receive group XP and level up.

Steps:
1. Start a two-player match.
2. Spawn a low-health enemy.
3. Kill the enemy through player attack or debug action.
4. Verify both players receive XP.
5. Give enough XP to level up if necessary.
6. Verify level-up panel appears.
7. Select one of three upgrade options.
8. Verify player level/stat/ability changes.

Expected result:
- XP is group-wide.
- Both players receive XP.
- Level-up panel appears.
- Player can select one upgrade.
- Upgrade modifies authoritative server state.

---

### 14.12 Death and Respawn Test

Purpose:
Verify player death, group defeat, and wave-end respawn behavior.

Steps:
1. Start a two-player match.
2. Kill Player 1 using debug action.
3. Verify Player 1 is dead/downed and cannot act.
4. Complete the wave using debug action.
5. Verify Player 1 respawns.
6. Kill all players.
7. Verify defeat screen appears.

Expected result:
- Dead player cannot move/cast/attack.
- Dead player respawns after wave completion.
- All players dead triggers defeat.

---

### 14.13 Victory Test

Purpose:
Verify the win condition.

Steps:
1. Start a match.
2. Force final boss wave or spawn boss using debug action.
3. Kill boss using player actions or debug action.
4. Verify victory screen appears.
5. Verify match state is `victory`.

Expected result:
- Boss death triggers victory.
- All clients see victory screen.
- Server state indicates victory.

---

## 15. Backend Unit Test Requirements

The backend must include unit tests for core game logic.

Required areas:

### Damage

- physical damage is reduced by armor
- magical damage is reduced by resistance
- crits apply correct multiplier
- dead targets cannot receive normal combat actions unless explicitly allowed

### Healing

- healing increases HP
- healing cannot exceed max HP
- healing can crit if supported
- dead players cannot be healed unless revive mechanics are added later

### Threat

- damage creates threat
- healing creates threat on healer
- healing threat uses the configured multiplier
- tank threat multiplier works
- dead players are ignored as enemy targets

### Resources

- mana is consumed on cast
- focus regenerates over time
- rage builds from dealing damage
- rage builds from taking damage
- abilities fail if resource is insufficient

### Cooldowns and Casts

- ability enters cooldown after successful cast
- global cooldown blocks other GCD abilities
- moving cancels cast
- invalid target prevents cast

### XP and Leveling

- XP is shared group-wide
- players level up at correct thresholds
- level-up grants stat growth
- upgrade options are generated
- selected upgrade applies correctly

### Waves

- wave budget creates valid enemy compositions
- player count scaling increases budget
- enemy spawn positions are inside valid spawn area
- wave completes when all spawned enemies are dead

---

## 16. Backend Integration Test Requirements

Backend integration tests should open real WebSocket connections and simulate players without a browser.

Required scenarios:

1. one client connects and receives lobby state
2. multiple clients connect and see each other
3. clients select classes and ready up
4. countdown starts when all clients are ready
5. match starts after countdown
6. clients send movement inputs and receive state snapshots
7. client casts ability and receives combat event
8. disconnected player is removed from lobby before match start
9. disconnected player during match is handled according to spec

These tests should run faster than full Playwright tests and verify server behavior directly.

---

## 17. Per-Milestone Verification

### Milestone 1: Local 3D Prototype

Required verification:
- frontend loads
- arena is visible
- camera is angled and zoomed out
- player placeholder is visible
- WASD movement works
- Space jump is visible
- no console errors

### Milestone 2: WebSocket Lobby

Required verification:
- backend starts
- frontend connects via WebSocket
- player appears in lobby
- class selection works
- ready button works
- countdown starts
- countdown cancels if player un-readies or disconnects

### Milestone 3: Multiplayer Movement

Required verification:
- two or more browser clients join
- all clients enter same match
- movement updates server state
- movement is visible on other clients
- server state and UI are consistent

### Milestone 4: Basic Combat

Required verification:
- enemy can be spawned
- target selection works
- auto-attack works
- damage changes enemy HP
- enemy can die
- combat events are shown

### Milestone 5: Classes and Abilities

Required verification:
- all four classes can be selected
- every class has auto-attack
- every class has 2 active abilities
- resources work
- cooldowns work
- Priest can heal
- healing threat works

### Milestone 6: Waves and Leveling

Required verification:
- waves spawn enemies
- wave counter updates
- enemies attack players
- XP is granted group-wide
- players level up
- upgrade panel appears
- selected upgrade changes state

### Milestone 7: Boss and End Screen

Required verification:
- boss spawns
- boss mechanics are visible
- boss can be defeated
- victory screen appears
- all players dead triggers defeat screen

---

## 18. Full Verification Script

The repository must provide:

```bash
./scripts/verify.sh
```

Suggested behavior:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Running backend tests..."
cd server
pytest
cd ..

echo "Running frontend typecheck..."
cd client
npm run typecheck

echo "Running frontend build..."
npm run build

echo "Running browser E2E tests..."
npm run test:e2e
cd ..

echo "Full verification passed."
```

If Docker or a process manager is used, the script should start and stop services automatically.

---

## 19. Failure Handling

When a test fails, the agent must inspect:

1. test error output
2. Playwright screenshot
3. Playwright trace
4. browser console logs
5. backend logs
6. server debug state if available

The agent should then fix the issue and re-run the failed test.

The agent should not continue building unrelated features while verification is failing.

---

## 20. Recommended Playwright Configuration

Playwright should be configured to:

- run headless in CI
- optionally run headed locally
- capture trace on first retry
- capture screenshot on failure
- capture video on failure if useful
- fail on unexpected console errors
- use stable `data-testid` selectors

Suggested Playwright settings:

```ts
use: {
  trace: "on-first-retry",
  screenshot: "only-on-failure",
  video: "retain-on-failure"
}
```

---

## 21. Example Playwright Test Pseudocode

### Three Players Can Start a Match

```ts
test("three players can start a match", async ({ browser }) => {
  const p1 = await browser.newPage();
  const p2 = await browser.newPage();
  const p3 = await browser.newPage();

  await p1.goto("http://localhost:5173");
  await p2.goto("http://localhost:5173");
  await p3.goto("http://localhost:5173");

  await p1.getByTestId("class-mage").click();
  await p2.getByTestId("class-warrior").click();
  await p3.getByTestId("class-priest").click();

  await p1.getByTestId("ready-button").click();
  await p2.getByTestId("ready-button").click();
  await p3.getByTestId("ready-button").click();

  await expect(p1.getByTestId("countdown")).toBeVisible();
  await expect(p2.getByTestId("countdown")).toBeVisible();
  await expect(p3.getByTestId("countdown")).toBeVisible();

  await expect(p1.getByTestId("arena")).toBeVisible();
  await expect(p2.getByTestId("arena")).toBeVisible();
  await expect(p3.getByTestId("arena")).toBeVisible();

  await expect(p1.getByTestId("party-frame")).toHaveCount(3);
  await expect(p2.getByTestId("party-frame")).toHaveCount(3);
  await expect(p3.getByTestId("party-frame")).toHaveCount(3);
});
```

### Priest Healing Creates Threat

```ts
test("priest healing creates threat", async ({ browser, request }) => {
  const priest = await browser.newPage();
  const warrior = await browser.newPage();

  await priest.goto("http://localhost:5173");
  await warrior.goto("http://localhost:5173");

  await priest.getByTestId("class-priest").click();
  await warrior.getByTestId("class-warrior").click();

  await priest.getByTestId("ready-button").click();
  await warrior.getByTestId("ready-button").click();

  await expect(priest.getByTestId("arena")).toBeVisible();

  await request.post("http://localhost:8000/debug/action", {
    data: {
      action: "spawn_enemy",
      payload: {
        type: "goblin",
        position: { x: 5, z: 0 }
      }
    }
  });

  const stateBefore = await request.get("http://localhost:8000/debug/state");
  // Resolve player IDs from debug state here.

  await request.post("http://localhost:8000/debug/action", {
    data: {
      action: "set_player_hp",
      payload: {
        playerId: "warrior_player_id",
        hp: 40
      }
    }
  });

  await priest.keyboard.press("Shift+Tab");
  await priest.getByTestId("ability-slot-1").click();

  await expect(priest.getByTestId("cast-bar")).toBeVisible();

  // Wait for heal cast to complete.
  await priest.waitForTimeout(2000);

  const stateAfterResponse = await request.get("http://localhost:8000/debug/state");
  const stateAfter = await stateAfterResponse.json();

  // Assert Warrior HP increased.
  // Assert Priest mana decreased.
  // Assert Goblin threat table contains Priest with healing threat.
});
```

---

## 22. Coding Agent Instructions

The coding agent must follow these rules:

1. Do not consider a feature complete until a runtime test verifies it.
2. Prefer small vertical slices over large unverified changes.
3. Keep all game logic server-authoritative.
4. Add or update tests whenever behavior changes.
5. Use `data-testid` attributes for all important UI elements.
6. Use debug/test hooks only behind `GAME_TEST_MODE=true`.
7. Run `./scripts/verify.sh` after each milestone.
8. Fix failing tests before adding new features.
9. Save screenshots/traces for failed E2E tests.
10. Keep test scenarios deterministic where possible.

---

## 23. Definition of Done

A milestone is done only when:

- backend tests pass
- frontend typecheck passes
- frontend build passes
- relevant Playwright tests pass
- the game starts locally
- browser console has no unexpected errors
- backend logs have no unhandled exceptions
- the feature is verified against the running system
- `./scripts/verify.sh` passes

