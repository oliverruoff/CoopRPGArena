# Coop Browser RPG Arena Game – Specification

## 1. Project Goal

Build a browser-based 3D cooperative RPG arena game inspired by simplified MMORPG combat and dungeon crawler wave survival.

The game should run in the browser and support up to 5 players in one lobby. Players choose a class, ready up, spawn together in a minimalist white 3D arena, fight waves of monsters, gain experience, level up, unlock/upgrade abilities, and defeat a final boss.

The MVP should prioritize:
- responsive multiplayer gameplay
- readable class-based combat
- server-authoritative game logic
- extensible class/ability/enemy definitions
- a clean minimal 3D presentation
- simple but fun RPG progression

The game does not need realistic graphics. The first version should use simple geometric/low-poly placeholders.

---

## 2. High-Level Game Concept

Players join a lobby and select one of several classes:

- Warrior
- Hunter
- Priest
- Mage

Each class has:
- health
- a class-specific resource
- auto-attack
- initially 2 active abilities
- later unlockable or upgradeable abilities
- class-specific upgrade options on level-up

The group fights together against enemy waves. Enemies include repeated recognizable types so players can feel their power growth over time.

A full run should last approximately 20–30 minutes.

---

## 3. Technology Stack

### Frontend

Use:

- TypeScript
- Babylon.js
- Vite
- WebSocket client
- Simple HTML/CSS UI overlay

The frontend is responsible for:
- rendering the 3D scene
- handling local input
- rendering UI
- interpolating server state
- sending player inputs/actions to the backend
- showing animations and effects

The frontend must not be authoritative for game logic.

### Backend

Use:

- Python 3.12+
- FastAPI
- WebSockets
- asyncio-based game loop

The backend is responsible for:
- lobby state
- ready/start logic
- match state
- player positions
- movement validation
- enemy AI
- attacks
- healing
- threat/aggro
- cooldowns
- resources
- XP
- level-ups
- wave progression
- win/loss conditions
- broadcasting authoritative state to clients

### Server Model

The server must be authoritative.

Clients only send:
- movement input
- jump input
- target selection
- ability activation
- ready/class selection in lobby

The server calculates all real outcomes.

---

## 4. MVP Scope

The MVP should include:

- one lobby
- 1–5 players
- four classes
- one round white arena
- fixed angled top-down camera
- movement via WASD
- visual jump via Space
- enemy targeting
- ally targeting for healers
- auto-attacks
- 2 starting active abilities per class
- server-side waves
- XP and leveling
- upgrade selection on level-up
- 5 normal enemy types
- 1 final boss
- 10 waves + final boss
- win/loss screen

The MVP should not include:

- accounts
- login
- persistent progression
- inventory
- item drops
- equipment
- cosmetics
- matchmaking
- multiple maps
- dungeon generation
- pets
- camera rotation
- complex physics
- real art assets
- advanced animation system
- complex pathfinding
- mobile support

---

## 5. Match Structure

A match is a fixed cooperative run.

### Duration

Target duration: 20–30 minutes.

### Structure

- Players start at level 1.
- The match consists of 10 waves.
- Wave 10 contains or leads into the final boss.
- After each completed wave, there is a short break.
- During breaks, players can select pending level-up upgrades.
- If the group defeats the final boss, the run is won.
- If all players are dead at the same time, the run is lost.

### Wave Break

After each wave:

- pause enemy spawning
- wait 15 seconds
- allow players to choose pending upgrades
- revive dead players
- restore a small amount of health/mana if desired

Default MVP rule:
- Dead players respawn after each completed wave.
- No death penalty in MVP.

---

## 6. Lobby

A lobby supports 1–5 players.

### Lobby Flow

1. Player connects.
2. Player enters lobby.
3. Player selects a class.
4. Player presses Ready.
5. When all connected players are ready, a 3-second countdown starts.
6. After countdown, all players spawn in the arena.
7. Match starts.

### Lobby Rules

- Minimum players: 1.
- Maximum players: 5.
- Classes may be selected multiple times.
- A player cannot ready up without selecting a class.
- If a player disconnects before match start, remove them from the lobby.
- If any player un-readies or disconnects during countdown, cancel countdown.

---

## 7. Camera and Controls

### Camera

Use a fixed angled top-down camera.

The camera should be zoomed out far enough that most or all players are usually visible. Player characters are expected to appear relatively small.

The camera should follow the local player smoothly, but the view should remain wide enough for cooperative awareness.

No camera rotation in MVP.

### Movement

Movement uses WASD relative to the screen:

- W = move upward / away from camera
- S = move downward / toward camera
- A = move left on screen
- D = move right on screen

### Jump

Space triggers a visual jump.

Jump rules:
- Jump is mostly cosmetic.
- Jump has no gameplay effect in MVP.
- Jump should not avoid damage.
- Jump should not cross obstacles.
- Jump should be visible to other players.
- The client sends a jump input to the server.
- The server broadcasts jump events or jump state.

### Targeting

- Left-click enemy: select enemy target.
- Tab: cycle through enemy targets.
- Shift + Tab: cycle through allied player targets.
- Party frames should also be clickable for ally targeting later.

Targeting is important for healers.

---

## 8. Arena

The first arena is minimal and white.

### Arena Shape

- Round arena.
- Soft/blurred visual boundary.
- Gameplay collision boundary is still a clear circle.
- Players and enemies cannot leave the arena.

### Visual Style

- Mostly white floor/background.
- Minimal rendering requirements.
- Soft arena edge.
- Simple placeholder characters.
- Clear readable effects.
- Player/team readability is more important than visual realism.

### Initial Arena Requirements

- Circular floor.
- Soft circular boundary/fade at edge.
- Spawn players near center.
- Spawn enemies near outer edge.
- Do not spawn enemies directly on players.
- Show a short spawn indicator before enemies appear.

---

## 9. Combat System

Combat is inspired by World of Warcraft but simplified for a browser-based arena game.

### Combat Style

Use a hybrid system:

- Some abilities are target-based.
- Some abilities are directional.
- Some abilities are area-based.
- Players have an active target.
- Auto-attacks can use the selected target if in range.

### Global Cooldown

Use a simplified global cooldown.

Default:
- 1.0 second global cooldown for most active abilities.
- Some abilities may be off-GCD later, but not required for MVP.

### Cast Times

Some spells may have cast times.

Default:
- Player cannot move while casting.
- Moving cancels the cast.
- Taking damage does not interrupt casts in MVP unless specified.
- Enemy interrupts are not required in MVP.

### Hit Rules

- No miss chance in MVP.
- No dodge chance in MVP.
- If range, line, cooldown, resource cost, and target rules are valid, the ability hits.

### Crits

Use a simple crit system.

Default:
- Crit chance is a percentage.
- Crit multiplier is 1.5x by default.
- Crit applies to damage and healing unless specified otherwise.

### Armor and Resistance

Use simple mitigation:

- Armor reduces physical damage.
- Resistance reduces magical damage.

Exact formula can be simple and tunable. Suggested formula:

```text
finalDamage = rawDamage * (100 / (100 + mitigationValue))
```

---

## 10. Threat and Aggro

Enemies choose targets based on threat.

### Threat Rules

- Damage generates threat on the damaged enemy.
- Healing generates threat on the healer.
- Healer threat should apply to enemies currently in combat.
- Healing threat should be lower than direct damage threat but still meaningful.
- Tank abilities may generate bonus threat.

Default values:

```text
1 damage = 1 threat
1 healing = 0.5 threat
Tank threat modifier = 2.0x
```

### Enemy Target Selection

Enemies should periodically select the player with the highest threat.

For MVP:
- Enemies do not need perfect WoW-style threat behavior.
- Re-evaluate target every 1–2 seconds.
- Dead players cannot be targeted.
- If no threat exists, target nearest living player.

---

## 11. Player Classes

The game starts with four classes:

- Warrior
- Hunter
- Priest
- Mage

Classes should be data-driven and extensible.

Avoid hardcoding class behavior directly into scattered conditional logic. Use class, ability, resource, and upgrade definitions.

### Class Data Structure

Each class should define:

```json
{
  "id": "mage",
  "name": "Mage",
  "roleTags": ["ranged", "magic", "damage", "control"],
  "resourceType": "mana",
  "baseStats": {},
  "statGrowth": {},
  "startingAbilities": [],
  "upgradePool": []
}
```

---

## 12. Resources

### Warrior

Resource: Rage

Rage behavior:
- Starts at 0.
- Builds from dealing damage.
- Builds from taking damage.
- Spent on stronger warrior abilities.
- Does not regenerate passively.

### Hunter

Resource: Focus

Focus behavior:
- Starts partially full or full.
- Regenerates slowly over time.
- Spent on shots and utility skills.

### Priest

Resource: Mana

Mana behavior:
- Starts full.
- Regenerates slowly over time.
- Spent on healing and damage spells.

### Mage

Resource: Mana

Mana behavior:
- Starts full.
- Regenerates slowly over time.
- Spent on offensive spells and control spells.

---

## 13. Starting Class Design

All classes start with:
- auto-attack
- 2 active abilities

More active abilities can be unlocked during the run through level-up choices.

### Warrior

Role:
- melee fighter
- can develop into tank or melee damage

Resource:
- Rage

Auto-Attack:
- melee swing against selected target in range

Starting Abilities:

1. Strike
   - melee damage
   - low cooldown
   - generates or spends small rage depending on balancing

2. Taunting Blow
   - melee damage
   - generates extra threat
   - useful for tank-oriented play

Upgrade directions:
- more armor
- more max health
- more threat
- stronger Strike
- cleave attacks
- rage generation
- rage spending burst attacks

### Hunter

Role:
- ranged physical damage

Resource:
- Focus

Auto-Attack:
- ranged shot against selected target in range

Starting Abilities:

1. Power Shot
   - ranged damage
   - costs focus
   - medium cooldown

2. Quick Shot
   - lower damage
   - low cooldown
   - low focus cost or generates focus

Upgrade directions:
- faster attacks
- stronger shots
- focus regeneration
- piercing shots
- traps later
- crit-focused build

No hunter pets in MVP.

### Priest

Role:
- healer or magic damage

Resource:
- Mana

Auto-Attack:
- weak ranged holy/shadow bolt or no meaningful auto-attack

Starting Abilities:

1. Heal
   - heals selected allied target
   - costs mana
   - has cast time

2. Smite
   - target-based magic damage
   - costs mana
   - has cast time or short cooldown

Upgrade directions:
- stronger healing
- cheaper healing
- faster casting
- group healing later
- shadow damage
- mana regeneration
- healing crit chance

### Mage

Role:
- ranged magic damage and control

Resource:
- Mana

Auto-Attack:
- weak ranged magic bolt or no meaningful auto-attack

Starting Abilities:

1. Fireball
   - target-based fire damage
   - costs mana
   - cast time

2. Frostbolt
   - target-based frost damage
   - costs mana
   - slows enemy

Upgrade directions:
- stronger Fireball
- cheaper Fireball
- faster casting
- better mana regeneration
- stronger slow
- area damage
- cooldown reduction
- arcane efficiency

---

## 14. Ability System

Abilities must be data-driven.

Each ability should define:

```json
{
  "id": "fireball",
  "name": "Fireball",
  "classId": "mage",
  "slot": 1,
  "targetType": "enemy",
  "range": 18,
  "cooldown": 3.0,
  "globalCooldown": true,
  "castTime": 1.5,
  "resourceCost": {
    "type": "mana",
    "amount": 20
  },
  "effects": [
    {
      "type": "damage",
      "school": "fire",
      "amount": 35,
      "scaling": {
        "stat": "spellPower",
        "coefficient": 0.8
      }
    }
  ]
}
```

### Ability Target Types

Support at least:

- self
- ally
- enemy
- direction
- ground_area

MVP may only implement:
- self
- ally
- enemy

### Ability Slots

The UI has fixed ability slots.

Default hotkeys:

- 1 = ability slot 1
- 2 = ability slot 2
- 3 = ability slot 3
- 4 = ability slot 4
- Q = utility slot
- E = defensive slot
- R = ultimate slot, reserved for later

Players cannot manually reorder abilities in MVP.

Abilities are automatically assigned to slots.

---

## 15. Leveling and Progression

### Levels

- Start level: 1
- MVP max level: 12
- XP is earned during the match only.
- No persistent progression in MVP.

### XP

When an enemy dies:
- all players gain XP
- XP is group-wide
- dead players also gain XP if the group survives the wave

This avoids punishing healers or support roles.

### Level-Up

On level-up:
- player receives automatic stat growth
- player gets one upgrade choice

### Upgrade Choice

Use a roguelite-style upgrade system.

When a player levels up:
- present 3 upgrade options
- player selects 1
- upgrades are class-specific or generic
- pending choices may queue if multiple level-ups happen quickly

The game does not pause during active combat.

During the 15-second wave break, players should be encouraged to choose upgrades.

### Upgrade Types

Upgrade options can include:

- increase damage of specific ability
- reduce mana/focus/rage cost
- reduce cooldown
- reduce cast time
- increase resource regeneration
- increase max health
- increase armor/resistance
- increase crit chance
- unlock new ability
- add slow effect
- improve healing
- improve threat generation

---

## 16. Player Stats

Use direct stats, not abstract attributes.

Base stats:

```text
maxHealth
maxResource
attackPower
spellPower
armor
resistance
critChance
critMultiplier
moveSpeed
resourceRegen
```

No Strength, Agility, Intellect attributes in MVP.

Each class has different base stats and stat growth.

---

## 17. Enemies

The MVP includes five normal enemy types and one boss.

Enemy behavior should be simple but readable.

### Enemy Types

#### Goblin

Basic melee enemy.

- low health
- low damage
- medium speed
- chases target
- basic melee attack

#### Runner

Fast pressure enemy.

- low health
- high speed
- prefers ranged/healer targets if possible
- low-medium damage
- intended to pressure Priest and Mage

#### Brute

Heavy melee enemy.

- high health
- slow speed
- high melee damage
- should feel dangerous if ignored

#### Archer

Ranged enemy.

- medium-low health
- stays at range
- shoots projectiles or target-based ranged attacks
- tries to avoid melee range

#### Shaman

Support enemy.

- medium-low health
- heals or buffs other enemies
- high priority target
- should create tactical decisions

### Boss

The final boss appears at the end of the run.

MVP boss requirements:
- high health
- at least 2 mechanics
- clear telegraphs
- should require movement and focus fire

Suggested mechanics:
1. Ground slam
   - circular area warning
   - damages players after delay

2. Summon adds
   - periodically spawns Goblins/Runners

Optional:
3. Enrage below 30% HP
   - increased attack speed or damage

---

## 18. Wave System

Use a wave-budget system.

Each wave has:
- wave number
- budget
- allowed enemy types
- spawn timing
- optional special rules

Example costs:

```text
Goblin = 1
Runner = 2
Archer = 3
Shaman = 4
Brute = 5
Boss = special
```

### Wave Scaling

Enemy difficulty scales with:
- wave number
- player count
- optional elite modifiers

Default scaling:
- more players increase spawn budget
- later waves increase budget
- later waves may include stronger enemy types

### Tutorial Waves

Waves 1–3 should be controlled and simple:

- Wave 1: mostly Goblins
- Wave 2: Goblins + Runners
- Wave 3: Goblins + Archers

Later waves can use the budget system more freely.

### Spawn Rules

- Enemies spawn near arena edge.
- Enemies do not spawn directly on players.
- Show spawn marker 1 second before spawning.
- Enemies spawn in small groups, not necessarily all at once.

---

## 19. Death and Respawn

### Player Death

When a player reaches 0 HP:
- player becomes dead/downed
- player cannot move
- player cannot cast
- player cannot attack
- player remains visible
- enemies stop targeting that player

### Respawn

- Dead players respawn after the current wave is completed.
- Respawn at or near arena center.
- No death penalty in MVP.

### Loss Condition

If all players are dead at the same time:
- match ends
- show defeat screen

### Win Condition

If players defeat the final boss:
- match ends
- show victory screen

---

## 20. UI Requirements

The game UI should feel RPG-like and readable.

### Required UI

- health bar
- resource bar
- XP bar
- current level
- party frames
- selected target frame
- action bar
- cooldown indicators
- cast bar
- wave counter
- countdown before match start
- level-up upgrade selection panel
- victory/defeat screen

### Party Frames

Party frames show:
- player name
- class
- health
- resource
- dead/alive state

Party frames should later be clickable for ally targeting.

### Action Bar

Shows:
- ability icon placeholder
- hotkey
- cooldown overlay
- disabled state if unusable
- resource error feedback

### Combat Feedback

Include simple floating combat text:
- damage numbers
- healing numbers
- crit indication

---

## 21. Networking

Use WebSockets between frontend and backend.

### Client-to-Server Messages

Examples:

```json
{
  "type": "select_class",
  "classId": "mage"
}
```

```json
{
  "type": "ready",
  "ready": true
}
```

```json
{
  "type": "input",
  "movement": {
    "up": true,
    "down": false,
    "left": false,
    "right": true
  }
}
```

```json
{
  "type": "jump"
}
```

```json
{
  "type": "select_target",
  "targetId": "enemy_123"
}
```

```json
{
  "type": "cast_ability",
  "abilitySlot": 1,
  "targetId": "enemy_123"
}
```

### Server-to-Client Messages

Examples:

```json
{
  "type": "lobby_state",
  "players": []
}
```

```json
{
  "type": "match_started"
}
```

```json
{
  "type": "state_snapshot",
  "serverTime": 123.45,
  "players": {},
  "enemies": {},
  "projectiles": {},
  "wave": {}
}
```

```json
{
  "type": "combat_event",
  "events": []
}
```

```json
{
  "type": "level_up_options",
  "playerId": "player_1",
  "options": []
}
```

---

## 22. Server Tick and State Sync

### Tick Rate

Recommended:
- Server simulation tick: 20 ticks per second.
- Server state broadcast: 10–20 times per second.

### Client Rendering

- Client renders at browser frame rate.
- Client interpolates entity positions between server snapshots.
- The local player may use light client-side prediction later, but MVP can start without advanced prediction.

### State Authority

The server owns:
- position
- HP
- resource values
- cooldowns
- cast state
- target validity
- XP
- levels
- enemy AI
- death state
- wave state

---

## 23. Data-Driven Design

The game must be easy to extend.

Use structured data files for:

- classes
- abilities
- upgrades
- enemies
- waves

Recommended location:

```text
server/game_data/classes.json
server/game_data/abilities.json
server/game_data/upgrades.json
server/game_data/enemies.json
server/game_data/waves.json
```

The frontend can either:
- receive relevant game data from the backend, or
- share generated TypeScript definitions later

For MVP, backend-owned data is enough.

---

## 24. Suggested Repository Structure

```text
project-root/
  README.md
  SPEC.md

  server/
    pyproject.toml
    app/
      main.py
      websocket.py
      lobby.py
      game_loop.py
      room.py
      models.py
      combat.py
      abilities.py
      enemies.py
      waves.py
      leveling.py
      data_loader.py
      game_data/
        classes.json
        abilities.json
        upgrades.json
        enemies.json
        waves.json

  client/
    package.json
    vite.config.ts
    src/
      main.ts
      network/
        websocketClient.ts
        messages.ts
      game/
        scene.ts
        camera.ts
        input.ts
        entities.ts
        interpolation.ts
      ui/
        hud.ts
        actionBar.ts
        partyFrames.ts
        targetFrame.ts
        levelUpPanel.ts
      data/
        types.ts
```

---

## 25. Implementation Milestones

### Milestone 1: Local 3D Prototype

Implement:
- Babylon.js scene
- round white arena
- zoomed-out angled camera
- one local player
- WASD movement
- Space jump visual
- simple placeholder model

No backend required yet except project setup.

### Milestone 2: WebSocket Lobby

Implement:
- FastAPI WebSocket endpoint
- lobby state
- player connection/disconnection
- class selection
- ready state
- 3-second countdown
- match start message

### Milestone 3: Multiplayer Movement

Implement:
- server-authoritative player positions
- movement input messages
- server tick loop
- state snapshots
- multiple browser tabs showing all players
- interpolation on client

### Milestone 4: Basic Combat

Implement:
- target selection
- auto-attack
- one enemy type
- HP
- damage
- death
- simple combat events

### Milestone 5: Classes and Abilities

Implement:
- 4 classes
- resources
- 2 starting abilities per class
- cooldowns
- global cooldown
- cast times
- healing
- threat from damage and healing

### Milestone 6: Waves and Leveling

Implement:
- wave system
- 5 enemy types
- XP
- levels
- upgrade options
- 15-second wave breaks

### Milestone 7: Boss and End Screen

Implement:
- final boss
- victory condition
- defeat condition
- victory/defeat UI

---

## 26. MVP Acceptance Criteria

The MVP is complete when:

- 1–5 players can join the same lobby.
- Each player can select a class.
- Players can ready up.
- A synchronized 3-second countdown starts when all are ready.
- Players spawn in a round white arena.
- Players can move with WASD.
- Players can visually jump with Space.
- Camera is fixed angled top-down and zoomed out.
- Players can target enemies with click/Tab.
- Players can target allies with Shift+Tab.
- Each class has auto-attack and 2 active abilities.
- Priest can heal allies.
- Healing generates threat on the healer.
- Enemies spawn in waves.
- Enemies attack players based on simple threat logic.
- Players gain group XP.
- Players level up.
- Players choose upgrades from 3 options.
- Dead players respawn after wave completion.
- The group loses if all players die.
- The group wins after defeating the final boss.
- Game logic is authoritative on the Python backend.
- Classes, abilities, enemies, upgrades, and waves are data-driven.

---

## 27. Important Development Principles

- Build vertical slices first.
- Keep visuals simple.
- Prefer readable placeholder graphics over complex assets.
- Keep combat deterministic and server-authoritative.
- Avoid adding persistent progression before the core match is fun.
- Avoid overengineering matchmaking or account systems.
- Make every system data-driven where reasonable.
- Prioritize gameplay clarity over visual realism.
- Ensure the healer role is playable through ally targeting and party frames.
- Ensure repeated enemy types remain recognizable so player power growth is noticeable.

---

## 28. Dockerization and Deployment

The project must be containerized and easy to run via Docker.

A developer or coding agent should be able to start the full game locally with one command:

```bash
docker compose up --build
```

Docker support is part of the required MVP scope. The implementation must not require manual backend/frontend startup steps for the normal local development run.

### 28.1 Container Architecture

Use a Docker Compose setup with at least two services during development:

```text
backend
client
```

#### backend

The backend container runs:

- Python 3.12+
- FastAPI
- Uvicorn
- WebSocket game server
- authoritative asyncio game loop

Default internal and exposed port:

```text
8000
```

#### client

The client container runs:

- Node.js
- Vite development server for local development
- TypeScript/Babylon.js browser client

Default internal and exposed port:

```text
5173
```

The browser game should be reachable at:

```text
http://localhost:5173
```

The backend health endpoint should be reachable at:

```text
http://localhost:8000/health
```

### 28.2 Required Docker Files

The repository should include:

```text
project-root/
  docker-compose.yml
  docker-compose.prod.yml optional
  docker-compose.test.yml optional

  server/
    Dockerfile

  client/
    Dockerfile.dev
    Dockerfile optional for production
    nginx.conf optional for production
```

### 28.3 Development Docker Compose

The default `docker-compose.yml` should start the backend and client in development mode.

Expected behavior:

- backend runs with hot reload if possible
- client runs Vite dev server
- frontend can connect to backend WebSocket
- environment variables configure backend and WebSocket URLs
- source folders may be mounted as volumes for development

Example structure:

```yaml
services:
  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
    environment:
      GAME_ENV: development
      GAME_TEST_MODE: "false"
      CORS_ORIGINS: "http://localhost:5173"
    ports:
      - "8000:8000"
    volumes:
      - ./server/app:/app/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  client:
    build:
      context: ./client
      dockerfile: Dockerfile.dev
    environment:
      VITE_BACKEND_URL: "http://localhost:8000"
      VITE_WS_URL: "ws://localhost:8000/ws"
    ports:
      - "5173:5173"
    volumes:
      - ./client/src:/app/src
      - ./client/public:/app/public
    depends_on:
      - backend
    command: npm run dev -- --host 0.0.0.0
```

### 28.4 Backend Dockerfile Requirement

The backend image must be able to run the FastAPI application without manual setup.

Recommended backend Dockerfile:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY pyproject.toml ./
COPY app ./app

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -e .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

If the backend uses `requirements.txt` instead of `pyproject.toml`, the Dockerfile may install from `requirements.txt`.

### 28.5 Client Development Dockerfile Requirement

The client development image must run the Vite dev server.

Recommended client development Dockerfile:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

### 28.6 Production Deployment Option

For production-style deployment, the project may either use:

1. two containers:
   - backend FastAPI container
   - frontend static Nginx container

or

2. one combined container:
   - FastAPI backend serves API/WebSocket and static built frontend files

For early MVP deployment, the single-container option is acceptable if it makes deployment simpler.

In a single-container production setup:

- one external port is exposed
- FastAPI serves `/`
- FastAPI serves static frontend assets
- FastAPI serves `/ws` for WebSocket connections
- frontend uses same-origin backend and WebSocket URLs where possible

### 28.7 Environment Variables

Backend environment variables:

```text
GAME_ENV=development|test|production
GAME_TEST_MODE=true|false
HOST=0.0.0.0
PORT=8000
CORS_ORIGINS=http://localhost:5173
LOG_LEVEL=info
```

Frontend environment variables:

```text
VITE_BACKEND_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

In production, the frontend may use relative URLs if frontend and backend are served from the same origin.

### 28.8 Dockerized Testing

The automated verification setup should also be runnable in Docker.

Recommended command:

```bash
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit
```

When running test containers, set:

```text
GAME_TEST_MODE=true
```

Dockerized tests should be able to run:

- backend unit tests
- backend WebSocket integration tests
- frontend typecheck
- frontend build
- Playwright end-to-end tests against running containers

### 28.9 Docker Acceptance Criteria

Docker support is complete when:

- `docker compose up --build` starts backend and client.
- The game is reachable at `http://localhost:5173`.
- The backend health endpoint is reachable at `http://localhost:8000/health`.
- The browser client successfully connects to the backend WebSocket.
- A player can enter the lobby.
- A match can be started.
- Backend logs show no startup exception.
- Browser console shows no blocking runtime error.
- Environment variables allow switching between development, test, and production modes.
- The Docker workflow is documented in `README.md`.

### 28.10 README Commands

The `README.md` must document at least:

```bash
# Start development stack
docker compose up --build

# Open game
http://localhost:5173

# Backend health
http://localhost:8000/health

# Stop stack
docker compose down
```

Optional production-style local run:

```bash
docker compose -f docker-compose.prod.yml up --build
```

