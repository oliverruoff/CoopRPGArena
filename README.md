# Coop RPG Arena

<p align="center">
  <img src="media/gameplay.gif" alt="Coop RPG Arena gameplay" width="640" />
</p>

A browser-based cooperative RPG arena — up to 5 players fight waves of enemies together, choose class upgrades, and combine abilities in real-time.

## Gameplay

- **Lobby** — Enter your name, pick a class, and mark ready. The match starts when all players are ready.
- **Classes** — Warrior, Hunter, Mage, Priest. Each begins with a single signature ability: Strike, Power Shot, Firebolt, or Heal.
- **Level Up** — Earn XP by defeating enemies. On level-up, choose **one** reward: max out a stat (Strength, Agility, Intellect, Stamina, Spirit) or learn a new ability from your class tree.
- **Abilities** — Each class has 4 learnable spells with unique effects: AoE damage, shields, stuns, traps, HoTs, cones, and more. Abilities are mapped to keys 1–4, Q, E, R.
- **Combat** — Real-time action with a global cooldown (triggers on cast start, cancelled on interrupt). Enemy HP bars, damage numbers, and spell effects provide constant feedback.

## Classes & Abilities

| Class | Starter | Learnable Spells |
|-------|---------|-----------------|
| **Warrior** | Strike | Whirlwind, Shield Wall, Concussive Slam |
| **Hunter** | Power Shot | Multishot, Snare Trap, Adrenaline |
| **Mage** | Firebolt | Frost Nova, Meteor, Arcane Blast |
| **Priest** | Heal | Renew, Sanctify, Barrier |

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

Runs backend tests, frontend typecheck, frontend build, and Playwright E2E tests.

## Tech Stack

- **Server** — Python, FastAPI, WebSockets, Pydantic
- **Client** — TypeScript, Babylon.js, Vite
- **Infra** — Docker Compose
