# Technical Architecture

Deep-dive into how CoopRPGArena works — server, client, networking, combat, and data systems.

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (TypeScript / Babylon.js)                           │
│  - Renders scene, handles input, plays procedural audio      │
│  - Sends input + commands over WebSocket                     │
│  - Receives full game state snapshots at 20 Hz               │
└──────────────────────────┬───────────────────────────────────┘
                           │ WebSocket (JSON)
┌──────────────────────────▼───────────────────────────────────┐
│  Server (Python / FastAPI)                                   │
│  - Authoritative game loop at 20 ticks/second                │
│  - Single asyncio.Lock serializes all mutations              │
│  - Broadcasts full state snapshot to every client per tick   │
└──────────────────────────────────────────────────────────────┘
```

There is no client-side prediction or interpolation. The client is purely reactive — it receives a complete snapshot of every entity's position, HP, cooldowns, and effects every 50ms, and renders it directly. This design is viable because the game is cooperative PvE with no competitive latency requirements.

---

## 2. Server Architecture

**Entry point**: `server/app/main.py`
**Core logic**: `server/app/game.py` (the `Game` class)

### 2.1 Game Loop

A single async task runs continuously for the server's lifetime:

```python
async def game_loop() -> None:
    while True:
        await game.tick()        # advance game state by one tick
        await broadcast()        # send snapshot to every connected client
        await asyncio.sleep(0.05)  # 50ms = 20 Hz
```

The `Game` class holds an `asyncio.Lock` (`self._lock`). Every tick, every WebSocket message handler, and every snapshot read acquires this lock, ensuring single-threaded state access without database transactions.

Delta time is capped at 0.1 seconds to prevent physics explosions after pauses:

```python
now = time.monotonic()
dt = min(0.1, now - self._last_tick)
self._last_tick = now
```

### 2.2 State Snapshot

Every tick, each client receives a full `state_snapshot` containing:

| Field | Contents |
|---|---|
| `you` | The requesting player's ID |
| `matchState` | `"lobby"` / `"running"` / `"victory"` / `"defeat"` |
| `players` | All player positions, HP, resources, levels, abilities, cooldowns, casting state, shields, auras, hots |
| `enemies` | All enemy positions, HP, threat tables, alert status, stun/slow states, DoTs |
| `wave` | Wave number, state (`"active"` / `"break"` / `"spawning"`), alive count, next wave timer |
| `mapObjects` | Static procedural arena geometry (walls, trees, bushes, rocks, ruins) |
| `groundEffects` | Active persistent ground effects (snare traps) |
| `events` | Last 20 combat events (damage, heals, casts, deaths, status effects) |
| `abilities` | Full ability definitions (for client tooltips) |

### 2.3 WebSocket Protocol

**Endpoint**: `ws://host:8000/ws`

#### Client → Server Messages

| Type | Fields | Description |
|---|---|---|
| `set_name` | `name` | Set player display name |
| `select_class` | `classId` | Choose warrior/hunter/priest/mage |
| `ready` | `ready` | Toggle ready state |
| `input` | `movement: {up, down, left, right}` | Movement keys (sent every 50ms + on key change) |
| `jump` | — | Trigger jump animation |
| `select_target` | `targetId` | Click-select an enemy |
| `cycle_target` | `ally: bool` | Tab-cycle enemies, Shift+Tab cycle allies |
| `cast_ability` | `abilitySlot` | Cast spell in slot 1–7 |
| `choose_upgrade` | `upgradeId` | Level-up choice |
| `restart_match` | — | Restart after victory/defeat |

#### Server → Client

Sends a full `state_snapshot` every tick. No delta compression, no batching. The snapshot includes all players and all enemies — there is no fog-of-war or spatial culling.

### 2.4 Lobby & Match Start

1. Players connect, set name, select class, mark ready
2. When all class-selected players are ready (or single player), a 3-second countdown begins
3. All players spawn in a circle at radius 3 from center
4. Map is procedurally generated once at match start
5. Wave 1 begins immediately after setup

### 2.5 Event System

Combat events (damage, heals, casts, deaths, status applications) are appended to a rolling buffer of the last 50. Each event has a monotonically increasing `id`. The client receives the last 20 events per snapshot and processes them once using sequential ID tracking to avoid duplicates.

Event types: `cast`, `cast_complete`, `cast_cancelled`, `auto_attack`, `damage`, `heal`, `death`, `status`, `enemy_alert`.

---

## 3. Combat System

### 3.1 Damage Mitigation

```python
def _mitigate(raw: float, mitigation: float) -> float:
    return raw * (100 / (100 + mitigation))
```

100 armor = 50% physical damage reduction. Resistance works identically for magical damage. The formula is hyperbolic, so stacking armor has diminishing returns.

### 3.2 Auto-Attacks

Every entity has an auto-attack timer. When the timer expires and a valid target is in range with line-of-sight, the auto-attack fires:

```
raw_damage = autoAttackDamage + max(attackPower * 0.35, spellPower * 0.2)
```

Auto-attacks are always typed `"physical"`. The interval is modified by haste multipliers (e.g., Hunter's Adrenaline).

### 3.3 Ability Casting Flow

1. **Validation**: Not dead, GCD ready, ability off cooldown, resource sufficient, target in range, line-of-sight clear
2. **Cast start** (if `castTime > 0`): Creates a `casting` state with `startAt` and `endAt` timestamps. Emits a `cast` event. **GCD is applied immediately on cast start**, not on completion.
3. **Cast complete** (or instant cast): `_finish_cast_locked()` deducts resource, sets cooldown, iterates through the ability's `effects[]` array
4. **Interrupt**: Movement during a cast cancels it and refunds the GCD. Enemy hits delay casts by 0.18 seconds.

### 3.4 Global Cooldown (GCD)

- Duration: 1.0 second
- Triggers on **cast start** (not cast completion) for spells with cast time
- Cancelled via `_cancel_cast_gcd_locked()` when a cast is interrupted by movement
- Not re-triggered when a cast finishes — only on the next cast initiation

### 3.5 Ability Effects

Each ability has an `effects[]` array. Each effect is processed independently:

| Effect Type | Behavior |
|---|---|
| `damage` | Deals damage to enemies within radius (or single target). Scales with stat. |
| `dot` | Damage over time: `amount` per `tickInterval` for `duration` seconds |
| `slow` | Reduces movement speed by `slow_percent` for `duration` seconds |
| `stun` | Freezes enemy for `duration` seconds (sets `slow_percent = 1.0`) |
| `heal` | Heals ally, capped at maxHealth. Generates threat on all enemies. |
| `hot` | Heal over time: `amount` per `tickInterval` for `duration` seconds |
| `shield` | Absorb shield on ally with expiry timestamp |
| `resource` | Restores resource directly |
| `auto_haste` | Multiplies auto-attack speed for duration |
| `trap` | Creates a persistent ground effect at caster position |
| `aura_damage` | Ticking aura around caster that damages nearby enemies every 0.5s |

### 3.6 Targeting

- `targetType: "enemy"` — requires enemy target
- `targetType: "ally"` — requires ally target, falls back to self if none
- `targetType: "self"` — targets caster
- AoE effects with `radius` hit all valid targets within radius of either `target` or `caster` (based on `center: "caster"` field)
- Line-of-sight check: spells cannot hit through walls (`blocksSight` objects)

### 3.7 Shields

Shields absorb damage before HP:

```python
absorbed = min(player.shield, damage)
player.shield -= absorbed
remaining = damage - absorbed
player.hp = max(0, player.hp - remaining)
```

Shield is removed when exhausted or when `shield_until` expires.

### 3.8 Threat System

Every action generates threat on enemies:

| Action | Threat |
|---|---|
| Damage dealt | `damage * threatMultiplier` per enemy hit |
| Healing done | `healed * 0.5` on ALL enemies (healingThreatMultiplier) |
| Taunting Blow | 3.0x threat multiplier |

Enemies target the highest-threat player. If no threat exists, they target the closest living player.

---

## 4. Leveling & Upgrades

### 4.1 XP Thresholds

```python
thresholds = [100, 180, 280, 420, 600, 820, 1080, 1380, 1720, 2100, 2520]
```

Level 1→2 requires 100 XP. Level 11→12 requires 2520 XP. Max level is 12.

XP is shared: all living players receive XP when any enemy dies.

### 4.2 Stat Growth Per Level

Each class has `statGrowth` in `classes.json`. On level-up, each stat is incremented by its growth value. Example at level 12:

| Stat | Warrior | Hunter | Priest | Mage |
|---|---|---|---|---|
| Max HP | 180 + 18×11 = **378** | 125 + 12×11 = **257** | 115 + 10×11 = **225** | 105 + 9×11 = **204** |
| Attack Power | 18 + 3×11 = **51** | 22 + 4×11 = **66** | — | — |
| Spell Power | — | — | 20 + 4×11 = **64** | 26 + 5×11 = **81** |
| Armor | 35 + 3×11 = **68** | 15 + 1×11 = **26** | 8 + 1×11 = **19** | 6 + 1×11 = **17** |

### 4.3 Upgrade Choices

On each level-up, the player sees **all** stat upgrades (from `upgrades.json`) **plus** all unlearned class-specific spells. The player picks **one** choice total — either a stat upgrade or a new ability.

7 generic stat upgrades available to all classes:

1. Max Health +12% (multiplicative)
2. Move Speed +10% (multiplicative)
3. Crit Chance +5% (additive)
4. Resource Costs -15% (multiplicative, 0.85x multiplier)
5. Armor +15 (additive)
6. Resistance +15 (additive)
7. Resource Regen +25% (multiplicative)

New spells are assigned to the next free keyboard slot (1–4, Q, E, R).

---

## 5. Ability Reference

### 5.1 Warrior (Rage — generated from dealing and taking damage)

| Ability | Slot | Type | Cast | CD | Cost | Effect | Scaling |
|---|---|---|---|---|---|---|---|
| **Strike** | 1 | enemy, melee | instant | 3s | 20 rage | 24 physical | AP × 0.9 |
| **Taunting Blow** | 2 | enemy, melee | instant | 8s | 10 rage | 16 physical + 3.0x threat | AP × 0.5 |
| **Whirlwind** | 3 | self (aura) | instant | 10s | 35 rage | 7 physical/0.5s for 3s in 2.8m | AP × 0.18 |
| **Shield Wall** | 4 | self | instant | 16s | 25 rage | Shield 55 for 6s | armor × 0.6 |
| **Concussive Slam** | 5 | enemy, melee | instant | 10s | 30 rage | 22 physical + stun 1.4s | AP × 0.65 |

**Rage generation**: Deal damage → `+damage × 0.25 + 4` rage. Take damage → `+damage × 0.35` rage.

### 5.2 Hunter (Focus — starts full, regenerates 5/s)

| Ability | Slot | Type | Cast | CD | Cost | Effect | Scaling |
|---|---|---|---|---|---|---|---|
| **Power Shot** | 1 | enemy, range 20 | 0.6s | 4s | 30 focus | 34 physical | AP × 1.0 |
| **Quick Shot** | 2 | enemy, range 18 | instant | 2s | 10 focus | 16 physical | AP × 0.45 |
| **Multishot** | 3 | enemy, range 18 | instant | 7s | 35 focus | 20 physical in 3.6m | AP × 0.55 |
| **Snare Trap** | 4 | self (ground) | instant | 12s | 25 focus | 10 physical + stun 1.7s in 2.2m | AP × 0.2 |
| **Adrenaline** | 5 | self | instant | 14s | 0 | Auto-attack speed ×3 for 3s | — |

Snare traps persist on the ground and trigger when an enemy walks into them.

### 5.3 Priest (Mana — starts at 120, regenerates 2/s)

| Ability | Slot | Type | Cast | CD | Cost | Effect | Scaling |
|---|---|---|---|---|---|---|---|
| **Heal** | 1 | ally, range 18 | 1.5s | 0s | 22 mana | Heal 36 | SP × 0.9 |
| **Smite** | 2 | enemy, range 18 | 1.2s | 2.5s | 16 mana | 24 holy | SP × 0.65 |
| **Renew** | 3 | ally, range 18 | instant | 4s | 18 mana | HoT 10/tick for 6s | SP × 0.18 |
| **Sanctify** | 4 | self (caster) | 0.8s | 10s | 34 mana | Heal 24 + Damage 18 holy in 5m | SP × 0.45 / SP × 0.35 |
| **Barrier** | 5 | ally, range 18 | instant | 12s | 28 mana | Shield 38 for 6s | SP × 0.7 |

### 5.4 Mage (Mana — starts at 130, regenerates 2/s)

| Ability | Slot | Type | Cast | CD | Cost | Effect | Scaling |
|---|---|---|---|---|---|---|---|
| **Firebolt** | 1 | enemy, range 20 | 1.5s | 3s | 24 mana | 40 fire + DoT 8/s for 4s | SP × 0.9 / SP × 0.12 |
| **Frostbolt** | 2 | enemy, range 20 | 1.2s | 4s | 20 mana | 26 frost + slow 35% for 3s | SP × 0.6 |
| **Frost Nova** | 3 | self (caster) | instant | 11s | 32 mana | 18 frost in 4.2m + stun 2s | SP × 0.35 |
| **Meteor** | 4 | enemy, range 18 | 1.8s | 10s | 42 mana | 36 fire in 12m + DoT 7/s for 3s | SP × 0.75 / SP × 0.1 |
| **Arcane Blast** | 5 | self (caster) | instant | 8s | 48 mana | 34 arcane in 4m | SP × 0.62 |

---

## 6. Enemy System

### 6.1 Enemy Types

| Enemy | Role | HP | DMG | Interval | Range | Speed | Armor | Res | XP |
|---|---|---|---|---|---|---|---|---|---|
| Goblin | basic melee | 70 | 10 | 1.5s | 1.6 | 3.8 | 5 | 0 | 35 |
| Runner | fast pressure | 55 | 8 | 1.2s | 1.5 | 5.8 | 2 | 0 | 45 |
| Archer | ranged | 60 | 12 | 2.0s | 14 | 3.2 | 2 | 5 | 60 |
| Shaman | support | 75 | 6 | 2.2s | 12 | 3.0 | 2 | 15 | 80 |
| Brute | heavy melee | 180 | 24 | 2.2s | 1.8 | 2.6 | 20 | 5 | 120 |
| Arena Overlord | boss (wave 10) | 900 | 32 | 1.8s | 2.2 | 3.2 | 20 | 20 | 1000 |

### 6.2 Wave Compositions

| Wave | Enemies |
|---|---|
| 1 | 4 goblins |
| 2 | 5 goblins, 1 runner |
| 3 | 5 goblins, 1 runner, 1 archer |
| 4 | 6 goblins, 2 runners, 1 archer, 1 brute |
| 5 | 7 goblins, 2 runners, 2 archers, 1 shaman |
| 6 | 8 goblins, 3 runners, 2 archers, 1 brute |
| 7 | 8 goblins, 3 runners, 2 archers, 2 brutes, 1 shaman |
| 8 | 9 goblins, 4 runners, 3 archers, 2 brutes, 1 shaman |
| 9 | 10 goblins, 4 runners, 3 archers, 2 brutes, 2 shamans |
| 10 | 1 boss |

Actual spawn counts scale with player count: `ceil(baseCount × (0.45 + 0.18 × playerCount))`.

### 6.3 Wave Scaling

Per-wave multipliers applied to each spawned enemy:

```
health = base × (1 + (wave - 1) × 0.12)
damage = base × (1 + (wave - 1) × 0.08)
xp     = base × (1 + (wave - 1) × 0.05)
```

At wave 9: health ×1.96, damage ×1.64, xp ×1.40.

### 6.4 Enemy AI

1. **Idle/Patrol**: Walk to random points at 42% move speed. Re-pick destination every 5–9 seconds or on arrival.
2. **Vision check**: 55-degree cone, 11-unit range, line-of-sight check (walls, trees, and tubes block; bushes don't).
3. **Alert**: On first sight of a player, emit `enemy_alert` event, target closest player.
4. **Chase**: Move toward highest-threat target at full speed.
5. **Attack**: When within `attackRange`, attack on cooldown.
6. **Stunned**: Skip all AI processing (movement + attack).
7. **Slowed**: Movement speed reduced by `slow_percent`.

---

## 7. Collision & Line of Sight

### 7.1 Movement Collision

Two types of map objects:

- **Rectangular** (walls): AABB intersection with 0.55 padding. Entity pushed to nearest edge. 3 iterations of push-out.
- **Circular** (trees, tubes, bushes, rocks, ruins): Circle-circle push-out at `radius + 0.55` minimum distance.

Arena boundary: entities clamped to `arenaRadius - 1 = 27` units from center.

### 7.2 Line of Sight

- Walls use slab-based ray-AABB intersection
- Circular objects use closest-point-on-segment distance check
- Only objects with `blocksSight: true` (walls, trees, tubes) block line of sight
- Max vision range: 11 units

---

## 8. Client Architecture

**Single file**: `client/src/main.ts` (~2000 lines)

### 8.1 Rendering

- **Engine**: Babylon.js with antialiasing
- **Camera**: Fixed isometric-style `ArcRotateCamera` (alpha=-π/2, beta=0.9, radius=42). Follows the local player. No player-controlled camera rotation.
- **Lighting**: Hemispheric (intensity 0.42) + directional (intensity 0.66) with cascaded shadow maps (1024 resolution)
- **Arena floor**: Three concentric cylinders — outer ground, fade ring, arena floor

### 8.2 Entity Models

All 3D models are built from primitive boxes, cylinders, spheres, and tori — no external model files.

**Players**: Body + head + arms + class-specific details:
- Warrior: shoulder pauldrons, sword, shield with crest
- Hunter: quiver, bow (torus), 3 arrows, hood
- Priest: halo (torus), sash, book, stole
- Mage: pointy hat, staff with gem, cape, belt gem

**Enemies**: Size varies by type (goblin 0.9, brute 1.4, boss 2.2). Type-specific details:
- Goblin: pointed ears, dagger, nose
- Runner: crest, boots, tail
- Archer: hood, bow, arrow, cloak
- Shaman: mask, staff with orb, charms
- Brute: large fists, belt, back spikes
- Boss: crown, horns, chest armor, banner

### 8.3 Animation

Runs every render frame:
- **Bobbing**: Moving entities bob at 10Hz; idle at 2Hz with smaller amplitude
- **Arm swing**: Arms swing opposite each other during movement (sinusoidal, 10Hz)
- **Casting**: Arms raised upward with pulsing oscillation (14Hz)
- **Auto-attack swing**: Right arm swings forward in arc
- **Whirlwind spin**: `node.rotation.y += 0.34` per frame while active
- **Shield bubble pulse**: `1 + sin(t×8) × 0.045` scaling
- **Jump**: Parabolic arc `y = 4 × t × (1-t) × 0.9` over 0.36 seconds, max height 0.9 units

### 8.4 Visual Effects

All effects are procedural meshes with timed observers:

| Effect | Visual |
|---|---|
| Charge/Cast | Expanding torus ring at caster, fades over cast time |
| Firebolt | Projectile + fire burst (12 flame particles) |
| Frostbolt | Cone-shaped projectile with trail + frost spike eruption (9 spikes) |
| Meteor | Rock flies from offset position, on impact: fire burst + expanding scorch disc (12m radius) |
| Frost Nova | Expanding frost disc (4.2m) + 18 frost spike particles |
| Whirlwind | 3 rotating slash torus rings at different heights |
| Snare Trap | Green disc + jaw-like structures + 6 teeth |
| Sanctify | Golden expanding disc (5m) |
| Arcane Blast | Purple expanding disc (4m) |
| Multishot | 3 parallel arrows |
| Smite | Lightning bolt (tube with jagged points) + ground flash |
| Barrier/Shield | Sphere bubble that pulses |
| Impact | 14 particle shards with physics (gravity, velocity, rotation) + floating damage number |

### 8.5 Audio

Entirely procedural using Web Audio API oscillators and noise buffers — no audio files.

- **Battle music**: Dual oscillators (bass triangle at 55Hz + drone sine at 110Hz) with 8-step bass pattern
- **Sound effects**: Built from `tone()`, `gliss()`, and `noise()` primitives
  - Warrior: clang (noise burst + square wave), grunt (descending gliss)
  - Hunter: twang (descending triangle + sine + noise)
  - Priest: choir (3 sine waves at 523/659/784 Hz)
  - Mage: sparkle (4 ascending sine tones)
  - Fire: whoosh (lowpass noise + bandpass noise)
  - Frost: crackle (highpass noise + high sine tones)
  - Lightning: snap (highpass noise + descending sawtooth)
- **Ambient foley**: Player footsteps every 360ms when moving, enemy growls when alerted enemies are within 7 units

### 8.6 Input

| Key | Action |
|---|---|
| WASD | Movement |
| Space | Jump |
| Tab | Cycle enemy target |
| Shift+Tab | Cycle ally target |
| 1–4, Q, E, R | Ability slots |
| Mouse click | Pick target from 3D scene |

Movement input is sent to the server every 50ms via `setInterval`, plus on every keydown/keyup event.

---

## 9. Procedural Map Generation

On match start, `_generate_map_locked()` places:

| Object | Count | Details |
|---|---|---|
| Walls | 2–4 | Width 4–9, depth 2.5–2.8, random rotation. Block movement + line of sight. |
| Trees | 12–18 | 5 variant types. Block movement + line of sight. |
| Tubes | 4–7 | 3 variants. Block movement + line of sight. |
| Bushes | 8–14 | 3 variants. Block movement only. |
| Rocks | 4–8 | Block movement only. |
| Ruins | 2–4 | Block movement only. |

All objects respect minimum spacing (1.1 units) and arena bounds (radius 28).

---

## 10. Test Coverage

`server/tests/test_game.py` — 29 unit tests covering:

- Damage mitigation formula
- Lobby flow (start, spawn enemy)
- Healing threat generation
- Movement-cast cancellation
- GCD behavior on cast-time spells
- Duplicate spell recast behavior
- Duplicate upgrade prevention
- Level-up offerings (stats + spells)
- Spell slot assignment
- Frost Nova AoE freeze
- Hunter trap persistence and triggering
- Hunter Adrenaline haste
- Warrior Whirlwind aura ticks
- Priest Barrier absorption
- Resource cost/regen upgrades
- Fireball DoT and Frostbolt slow
- GCD exposure in snapshot
- Caster close-range auto-attack
- Auto-attack timer behavior
- Enemy wandering patrol
- Target selection (enemy vs ally clearing)
- Shift+Tab ally cycling
- Wall line-of-sight blocking
- Wall movement collision
- Name setting/truncation
- Restart after defeat
- Wave timer and wave break timing

---

## 11. Project Structure

```
CoopRPGArena/
├── server/
│   ├── app/
│   │   ├── main.py              # FastAPI routes, WebSocket, game loop
│   │   ├── game.py              # Game class: all game logic
│   │   └── game_data/
│   │       ├── abilities.json   # 20 abilities (5 per class)
│   │       ├── classes.json     # 4 classes with base stats + growth
│   │       ├── enemies.json     # 5 enemy types
│   │       ├── bosses.json      # 1 boss
│   │       ├── waves.json       # 10 wave compositions
│   │       ├── upgrades.json    # 7 generic stat upgrades
│   │       └── constants.json   # Global game constants
│   └── tests/
│       └── test_game.py         # 29 unit tests
├── client/
│   ├── index.html               # Minimal HTML shell
│   ├── src/
│   │   ├── main.ts              # All client logic (~2000 lines)
│   │   └── style.css            # UI styling
│   └── vite.config.ts           # Build config
├── media/
│   └── gameplay.gif             # Captured gameplay
├── docker-compose.yml           # Dev stack
└── README.md
```

**Total codebase**: ~1,200 lines Python + ~2,000 lines TypeScript + ~93 lines CSS + ~1,300 lines JSON data.
