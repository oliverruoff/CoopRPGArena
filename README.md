# Coop RPG Arena

<p align="center">
  <img src="media/gameplay.gif" alt="Coop RPG Arena in-game combat preview" width="640" />
</p>

A browser-based cooperative RPG arena — up to 5 players fight waves of enemies together, choose class upgrades, and combine abilities in real-time.

## Gameplay

- **Lobby** — Enter your name, pick a class, and mark ready. The match starts when all players are ready.
- **Classes** — Warrior, Hunter, Priest, Mage, Rogue, Druid, Shaman, and Paladin. Each begins with one or more signature abilities.
- **Level Up** — Earn XP by defeating enemies. On level-up, choose **one** reward: improve a stat or learn a new ability from your class tree.
- **Abilities** — Each class has multiple learnable spells with unique effects: AoE damage, shields, stuns, traps, HoTs, cones, and more. Abilities are mapped to keys 1–4, Q, E, R.
- **Combat** — Real-time action with a global cooldown (triggers on cast start, cancelled on interrupt). Enemy HP bars, damage numbers, and spell effects provide constant feedback.

## Classes

The game ships with **eight** classes. Each has its own resource (Rage, Focus, Mana, Energy) and a clearly defined role. Pick the one that fits your playstyle — or coordinate a comp with your team.

| Class | Role | Resource | HP | Range |
|-------|------|----------|----|----|
| [Warrior](#warrior) | Melee bruiser / tank | Rage | 162 | Melee |
| [Hunter](#hunter)  | Ranged sustained DPS | Focus | 112 | 18m |
| [Priest](#priest)  | Healer / holy caster | Mana | 103 | 18m |
| [Mage](#mage)      | Burst / control caster | Mana | 94 | 18–20m |
| [Rogue](#rogue)    | Dual-dagger assassin | Energy | 106 | Melee |
| [Druid](#druid)    | Bear / Cat shapeshifter | Mana | 118 | Hybrid |
| [Shaman](#shaman)  | Elemental caster / totems | Mana | 108 | 18m / melee |
| [Paladin](#paladin) | Two-handed holy bruiser | Mana | 132 | Melee / 14m |

### Warrior

<p align="left"><img src="media/classes/warrior.png" alt="Warrior 3D model" width="180" /></p>

A durable frontliner. Great at surviving, holding enemy attention, and smashing threats up close.

- **Starter ability:** *Strike* — direct melee hit that spends Rage for heavy physical damage.
- **Tools:** Taunting Blow, Whirlwind, Shield Wall, Concussive Slam, Charge, Thunder Clap.
- **Tactics:** Build Rage by being hit and hitting things, then unleash big melee attacks. Charge into clumps, Thunder Clap to slow them, and use Shield Wall to absorb spikes.

**Strengths**

- Highest base HP (162) and armor (32) in the game — by far the tankiest.
- Self-sufficient melee damage with built-in AoE (Whirlwind, Thunder Clap).
- Strongest single-target threat generation — pulls and holds boss aggro.
- Shield Wall gives a big absorb, letting you eat scripted bursts.

**Weaknesses**

- Slowest non-Druid-form move speed (5.0) and only melee range (2.0–2.4 m).
- No ranged pressure at all — kited by Hunter/Mage packs.
- Cooldowns are long; Whirlwind is the only sustained AoE and costs a lot of Rage.
- Damage scales purely with Attack Power, so against magic-resistant targets you fall off.

### Hunter

<p align="left"><img src="media/classes/hunter.png" alt="Hunter 3D model" width="180" /></p>

A mobile ranged damage dealer. Keeps pressure from afar with fast shots and strong uptime.

- **Starter ability:** *Power Shot* — charged ranged shot with high physical damage.
- **Tools:** Quick Shot, Multishot, Snare Trap, Adrenaline, Arrow Barrage, Explosive Shot.
- **Tactics:** Keep your distance, pop Adrenaline for burst windows, lay Snare Traps at chokepoints, and burn clumps with Multishot / Arrow Barrage / Explosive Shot.

**Strengths**

- Longest reliable range in the game (18–20 m) — can hit targets other classes can't reach.
- High sustained uptime: Quick Shot spam and Adrenaline windows melt bosses.
- Great map control with Snare Trap (AoE root on contact) and Multishot cleave.
- Crit-focused scaling (8% base) rewards Aim/Agility stat picks.

**Weaknesses**

- Squishy: only 112 HP and 14 armor — caught in melee and you're dead.
- All key shots have a cast time or cooldown; interrupted casts waste your window.
- Single-target sustained only — relies on positioning more than cooldowns.
- Resource (Focus) can starve if you spam without waiting for Power Shot payoffs.

### Priest

<p align="left"><img src="media/classes/priest.png" alt="Priest 3D model" width="180" /></p>

A holy support caster. Heals allies, deals holy damage, and can keep a group alive through pressure.

- **Starter ability:** *Heal* — holy cast that restores an ally.
- **Tools:** Smite, Renew, Sanctify, Barrier, Resurrection, Shadow Word: Pain.
- **Tactics:** Keep the party alive, peel off-healers with Barrier, drop Renew on tanks, and use Sanctify to convert incoming pressure into a group heal.

**Strengths**

- Strongest healer in the game: direct heal, HoT (Renew), AoE heal+damage (Sanctify), ally shield (Barrier), and the only *Resurrection* in the game.
- High magic resistance (18) makes you surprisingly durable against caster enemies.
- Hybrid damage toolkit: Smite, Shadow Word: Pain, and the damage half of Sanctify.
- Ranged (18 m) — you can play safely behind the frontline.

**Weaknesses**

- Lowest auto-attack damage in the game (5) and only 103 HP.
- Heal has a 1.5 s cast time — getting interrupted means a wasted GCD.
- No mobility, no escapes, no self-shield beyond ally-targeted Barrier.
- Healer threat generation is intentional (to keep enemies on you), but it makes you a permanent target.

### Mage

<p align="left"><img src="media/classes/mage.png" alt="Mage 3D model" width="180" /></p>

A fragile elemental nuker. Firebolt burns enemies over time; the full spellbook covers fire, frost, and arcane control.

- **Starter ability:** *Firebolt* — fire burst plus a 4 s burn DoT.
- **Tools:** Frostbolt, Frost Nova, Meteor, Arcane Blast, Ice Block, Arcane Missiles.
- **Tactics:** Stay at max range, layer DoTs, use Frost Nova to peel melees off you, drop Meteor on boss spawns, and panic-button Ice Block to skip lethal mechanics.

**Strengths**

- Highest spell power in the game (23) and biggest single-target nuke (Firebolt + DoT).
- Best crowd control: Frostbolt slow (3 s), Frost Nova AoE stun (2 s), and Meteor AoE damage in a huge radius (12 m).
- Ice Block is a hard 4 s immunity — the only true "I refuse to die" button in the game.
- Arcane Missiles gives a strong channeling burst window on a single target.

**Weaknesses**

- Glass cannon: lowest HP (94) and lowest armor (6) of any class.
- Almost every spell has a cast time (1.2–2.0 s) — interrupts delete your turn.
- Resource-hungry: Meteor (60 mana) and Arcane Blast (48 mana) drain your pool fast.
- Long cooldowns on the big payoffs — if you burn everything early, you have nothing left for the next wave.

### Rogue

<p align="left"><img src="media/classes/rogue.png" alt="Rogue 3D model" width="180" /></p>

A fast dual-dagger assassin. Backstep blinks behind a target for a brutal strike, while Vanish drops enemy attention for a short window.

- **Starter ability:** *Backstep* — blink behind your target and strike for heavy physical damage.
- **Tools:** Poisoned Blades, Kidney Shot, Blade Flurry, Vanish, Sprint.
- **Tactics:** Pick a priority target, Backstep behind it, layer Poisoned Blades + Kidney Shot to lock it down, then Vanish when you need to reset threat.

**Strengths**

- Highest base crit chance (12%) **and** crit multiplier (1.7×) — crits hit like a truck.
- Fastest move speed in the game (5.6) and the fastest auto-attack swing (0.8 s).
- Backstep teleports behind the target — perfect dodge plus a free positional advantage.
- Vanish (5 s) drops *all* enemy aggro, letting you reset and re-position.

**Weaknesses**

- Lowest HP of the melee classes (106) and only 10 armor.
- Backstep and Kidney Shot are short range (2.2 m) — you need to commit to melee.
- Energy regen is the only resource (12/s), so spam discipline matters.
- Squishy if you take a hit during Backstep or while waiting on cooldown; no shield, no heal, no immunity.

### Druid

<p align="left"><img src="media/classes/druid.png" alt="Druid 3D model" width="180" /></p>

A shapeshifting hybrid. Bear Form turns the druid into a durable bruiser, while Cat Form becomes a fast melee predator.

- **Starter abilities:** *Bear Form*, *Cat Form*, *Moonfire*, *Humanoid Form*.
- **Tools:** Maul (bear), Rake (cat), Rejuvenation.
- **Tactics:** Open in humanoid form with Moonfire and Rejuvenation, shift to Bear to soak or Cat to burst, then shift back when the form's window ends.

**Strengths**

- The only true hybrid: tanky in Bear (×1.35 HP, ×2.4 armor), critty in Cat (×1.45 AP, +8% crit, 0.62 s autos).
- Only class with a *free* resource — you can shift forms for almost no mana.
- Brings a ranged DoT (Moonfire) and a HoT (Rejuvenation) — the only class that can both heal *and* shapeshift.
- Scales with both Attack Power and Spell Power, so stat picks never feel wasted.

**Weaknesses**

- Master-of-none: a Warrior out-tanks you, a Rogue out-bursts you, a Priest out-heals you.
- Form change is on a 1 s GCD, so chaining Bear→Cat→Humanoid eats real time.
- Bear form reduces move speed (×0.92) and Cat form loses armor (-4 base) — both forms trade survivability for output.
- Heaviest "macro load" — you have to manage three modes, not one rotation.

### Shaman

<p align="left"><img src="media/classes/shaman.png" alt="Shaman 3D model" width="180" /></p>

A spiritual caster bonded to the elements. Calls down lightning, heals allies with totems, and wades into melee with elemental strikes.

- **Starter abilities:** *Lightning Bolt*, *Healing Wave*, *Primal Strike*.
- **Tools:** Chain Lightning, Healing Stream Totem, Searing Totem, Earthbind Totem, Frost Shock.
- **Tactics:** Stay in the backline and pelt enemies with Lightning Bolt, drop Healing Stream Totem before a wave hits, anchor a Searing Totem on the boss, and use Chain Lightning on clumps. Primal Strike covers the moments a mob gets into your face.

**Strengths**

- Hybrid damage: ranged Lightning Bolt (1.8 s cast), melee Primal Strike (instant), and the **Chain Lightning** AoE nuke (2.0 s cast, up to 3 jumps with 0.6 falloff per hop).
- **Totem toolkit** — three different summoned totems you can have up at the same time:
  - Healing Stream Totem (6 m, 15 s) — pulses heals onto the most-injured nearby ally.
  - Searing Totem (6 m, 15 s) — fire-pulses the closest enemy every 1.2 s.
  - Earthbind Totem (5 m, 12 s) — pulses a 40% slow on enemies that step inside.
- Best mobility of any caster: 5.1 move speed and an instant Primal Strike when something closes the gap.
- Frost Shock is a 0-cast-time 18 m range slow — great kiting tool.

**Weaknesses**

- Mana-hungry: Chain Lightning alone costs 55 mana and you have 120 max. Burn out and you're an auto-attack bot.
- Every meaningful ranged spell has a cast time (1.5–2.0 s). Interrupts delete your turn.
- 108 HP and 12 armor — squishier than Priest, no Resurrection, no Barrier.
- Totems die if you move away from the area, and each totem has a 16–18 s cooldown if it goes down or expires — bad positioning is punished.

### Paladin

<p align="left"><img src="media/classes/paladin.svg" alt="Paladin class model" width="180" /></p>

A heavily armored holy bruiser with a two-handed mace. Calls down judgement, protects allies with blessings, and survives through divine miracles.

- **Starter ability:** *Judgement* — calls down a massive holy hammer from above.
- **Tools:** Crusader Strike, Consecration, Hammer of Justice, Divine Shield, Lay on Hands, Blessing of Might.
- **Tactics:** Open with Judgement, unlock melee and support tools as you level, save Divine Shield for lethal spikes, and keep Blessing of Might on the teammate who benefits most.

**Strengths**

- Durable melee hybrid: 132 HP, 22 armor, and 16 resistance.
- Lay on Hands is a true full heal, but only every 90 seconds.
- Blessing of Might gives an ally +12% Attack Power and +12% Spell Power for 60 seconds with a visible golden buff effect.
- Judgement has a clear visual payoff: a massive holy hammer strikes down from above.
- Consecration leaves a molten holy ground effect visible for its full duration.

**Weaknesses**

- Slow movement and slow auto-attacks; the Paladin commits hard once in melee.
- Mana can run dry if you spam support tools and damage together.
- Less raw tanking than Warrior and less healing throughput than Priest or Shaman.
- Long cooldowns punish panic usage.

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

## Pull Published Containers

Every push builds and publishes the game containers to GitHub Container Registry:

```bash
docker pull ghcr.io/<owner>/cooprpgarena/backend:latest
docker pull ghcr.io/<owner>/cooprpgarena/client:latest
```

Replace `<owner>` with the lowercase GitHub user or organization that owns this repository.

## Verify

```bash
./scripts/verify.sh
```

Runs backend tests, frontend typecheck, frontend build, and Playwright E2E tests.

## Tech Stack

- **Server** — Python, FastAPI, WebSockets, Pydantic
- **Client** — TypeScript, Babylon.js, Vite
- **Infra** — Docker Compose
