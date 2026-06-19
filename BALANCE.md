# BALANCE.md – Coop Browser RPG Arena Game

## 1. Balance Goals

This document defines the first playable balancing values for the MVP.

The goal of this balance version is not perfect competitive balance. The goal is to provide concrete, playable, tunable defaults so the coding agent can implement the game without inventing missing numbers.

The MVP balance should achieve:

- A full run duration of approximately 20–30 minutes.
- A clear difference between classes.
- A readable difficulty curve from wave 1 to wave 10.
- Noticeable player power growth through levels and upgrades.
- Repeated enemy types that become easier as players grow stronger.
- A healer role that feels useful but not mandatory in every possible composition.
- A warrior that can function as a tank through threat and survivability.
- A mage that provides burst damage and crowd control.
- A hunter that provides consistent ranged damage.
- A priest that can specialize toward healing or damage through upgrades.

All values in this file are initial MVP defaults and should be easy to tune.

---

## 2. Global Combat Constants

```text
serverTickRate = 20 ticks per second
stateBroadcastRate = 10-20 snapshots per second

globalCooldown = 1.0 seconds
defaultCritMultiplier = 1.5
baseCritChance = 0.05

healingThreatMultiplier = 0.5
tankThreatMultiplier = 2.0

combatRegenEnabled = true
outOfCombatRegenMultiplier = 2.0

waveBreakDuration = 15 seconds
matchTargetDuration = 20-30 minutes

maxLevel = 12
startingLevel = 1

playerCollisionRadius = 0.45
enemyCollisionRadius = 0.45
arenaRadius = 28
enemySpawnRadius = 25
playerSpawnRadius = 3
```

### Damage Mitigation Formula

Use this formula for physical and magical mitigation:

```text
finalDamage = rawDamage * (100 / (100 + mitigationValue))
```

Where:

```text
mitigationValue = armor for physical damage
mitigationValue = resistance for magical damage
```

---

## 3. Player Stat Definitions

Use direct stats instead of abstract attributes.

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
autoAttackDamage
autoAttackInterval
autoAttackRange
```

### Movement Scale

```text
slowMoveSpeed = 4.0
normalMoveSpeed = 5.0
fastMoveSpeed = 5.8
```

These values assume the arena radius is approximately 28 units.

---

## 4. Class Base Stats

### 4.1 Warrior

```text
classId = warrior
resource = rage

maxHealth = 180
maxResource = 100
attackPower = 18
spellPower = 0
armor = 35
resistance = 10
critChance = 0.05
critMultiplier = 1.5
moveSpeed = 5.0
resourceRegen = 0

autoAttackDamage = 14
autoAttackInterval = 1.6 seconds
autoAttackRange = 2.0
```

Role:
- melee fighter
- strongest baseline survivability
- can build into tank or melee damage

### 4.2 Hunter

```text
classId = hunter
resource = focus

maxHealth = 125
maxResource = 100
attackPower = 22
spellPower = 0
armor = 15
resistance = 10
critChance = 0.08
critMultiplier = 1.5
moveSpeed = 5.3
resourceRegen = 8 focus per second

autoAttackDamage = 12
autoAttackInterval = 1.4 seconds
autoAttackRange = 18.0
```

Role:
- consistent ranged physical damage
- mobile damage dealer
- strong auto-attack uptime

### 4.3 Priest

```text
classId = priest
resource = mana

maxHealth = 115
maxResource = 120
attackPower = 0
spellPower = 20
armor = 8
resistance = 20
critChance = 0.05
critMultiplier = 1.5
moveSpeed = 5.0
resourceRegen = 5 mana per second

autoAttackDamage = 6
autoAttackInterval = 1.8 seconds
autoAttackRange = 16.0
```

Role:
- healer or holy/shadow caster
- low physical defense
- strong support value

### 4.4 Mage

```text
classId = mage
resource = mana

maxHealth = 105
maxResource = 130
attackPower = 0
spellPower = 26
armor = 6
resistance = 18
critChance = 0.06
critMultiplier = 1.5
moveSpeed = 5.0
resourceRegen = 5 mana per second

autoAttackDamage = 5
autoAttackInterval = 1.8 seconds
autoAttackRange = 16.0
```

Role:
- burst magic damage
- crowd control
- lower durability

---

## 5. Resource Rules

### 5.1 Rage

Used by Warrior.

```text
startingRage = 0
maxRage = 100

rageFromDamageDealt = damageDealt * 0.25
rageFromDamageTaken = damageTaken * 0.35

rageDecayOutOfCombat = 5 rage per second after 5 seconds out of combat
```

Rage does not regenerate passively.

### 5.2 Focus

Used by Hunter.

```text
startingFocus = 100
maxFocus = 100
focusRegen = 8 per second
```

Focus regenerates during combat and out of combat.

### 5.3 Mana

Used by Priest and Mage.

```text
startingMana = maxMana
manaRegenInCombat = class resourceRegen
manaRegenOutOfCombat = resourceRegen * 2
```

---

## 6. Starting Abilities

Each class starts with:
- auto-attack
- active ability slot 1
- active ability slot 2

Players cannot manually reorder abilities.

### 6.1 Warrior Abilities

#### Auto-Attack: Melee Swing

```text
type = physical
targetType = enemy
range = 2.0
damage = autoAttackDamage + attackPower * 0.4
interval = 1.6 seconds
resourceEffect = gain 4 rage on hit
threatMultiplier = 1.0
```

#### Slot 1: Strike

```text
id = warrior_strike
name = Strike
targetType = enemy
range = 2.2
cooldown = 3.0 seconds
globalCooldown = true
castTime = 0
resourceCost = 20 rage
damageType = physical
damage = 24 + attackPower * 0.9
threatMultiplier = 1.0
```

#### Slot 2: Taunting Blow

```text
id = warrior_taunting_blow
name = Taunting Blow
targetType = enemy
range = 2.2
cooldown = 8.0 seconds
globalCooldown = true
castTime = 0
resourceCost = 10 rage
damageType = physical
damage = 16 + attackPower * 0.5
threatMultiplier = 3.0
forcedTargetDuration = 2.0 seconds
```

### 6.2 Hunter Abilities

#### Auto-Attack: Bow Shot

```text
type = physical
targetType = enemy
range = 18.0
damage = autoAttackDamage + attackPower * 0.35
interval = 1.4 seconds
resourceEffect = none
threatMultiplier = 1.0
```

#### Slot 1: Power Shot

```text
id = hunter_power_shot
name = Power Shot
targetType = enemy
range = 20.0
cooldown = 4.0 seconds
globalCooldown = true
castTime = 0.6 seconds
resourceCost = 30 focus
damageType = physical
damage = 34 + attackPower * 1.0
threatMultiplier = 1.0
```

#### Slot 2: Quick Shot

```text
id = hunter_quick_shot
name = Quick Shot
targetType = enemy
range = 18.0
cooldown = 2.0 seconds
globalCooldown = true
castTime = 0
resourceCost = 10 focus
damageType = physical
damage = 16 + attackPower * 0.45
threatMultiplier = 1.0
```

### 6.3 Priest Abilities

#### Auto-Attack: Holy Spark

```text
type = magical
school = holy
targetType = enemy
range = 16.0
damage = autoAttackDamage + spellPower * 0.2
interval = 1.8 seconds
resourceEffect = none
threatMultiplier = 1.0
```

#### Slot 1: Heal

```text
id = priest_heal
name = Heal
targetType = ally
range = 18.0
cooldown = 0
globalCooldown = true
castTime = 1.5 seconds
resourceCost = 22 mana
healing = 36 + spellPower * 0.9
threatMultiplier = healingThreatMultiplier
```

#### Slot 2: Smite

```text
id = priest_smite
name = Smite
targetType = enemy
range = 18.0
cooldown = 2.5 seconds
globalCooldown = true
castTime = 1.2 seconds
resourceCost = 16 mana
damageType = magical
school = holy
damage = 24 + spellPower * 0.65
threatMultiplier = 1.0
```

### 6.4 Mage Abilities

#### Auto-Attack: Arcane Spark

```text
type = magical
school = arcane
targetType = enemy
range = 16.0
damage = autoAttackDamage + spellPower * 0.2
interval = 1.8 seconds
resourceEffect = none
threatMultiplier = 1.0
```

#### Slot 1: Fireball

```text
id = mage_fireball
name = Fireball
targetType = enemy
range = 20.0
cooldown = 3.0 seconds
globalCooldown = true
castTime = 1.5 seconds
resourceCost = 24 mana
damageType = magical
school = fire
damage = 40 + spellPower * 0.9
threatMultiplier = 1.0
```

#### Slot 2: Frostbolt

```text
id = mage_frostbolt
name = Frostbolt
targetType = enemy
range = 20.0
cooldown = 4.0 seconds
globalCooldown = true
castTime = 1.2 seconds
resourceCost = 20 mana
damageType = magical
school = frost
damage = 26 + spellPower * 0.6
slowPercent = 35%
slowDuration = 3.0 seconds
threatMultiplier = 1.0
```

---

## 7. XP and Level Curve

Players start at level 1 and can reach level 12.

XP is group-wide. When an enemy dies, every player receives the listed XP.

Dead players also receive XP if the group survives the wave.

### XP Required Per Level

```text
Level 1 -> 2: 100 XP
Level 2 -> 3: 180 XP
Level 3 -> 4: 280 XP
Level 4 -> 5: 420 XP
Level 5 -> 6: 600 XP
Level 6 -> 7: 820 XP
Level 7 -> 8: 1080 XP
Level 8 -> 9: 1380 XP
Level 9 -> 10: 1720 XP
Level 10 -> 11: 2100 XP
Level 11 -> 12: 2520 XP
```

Total XP to reach level 12:

```text
11200 XP
```

The MVP should tune wave XP so players reach approximately:

```text
Level 2 after wave 1 or 2
Level 4 around wave 3
Level 6 around wave 5
Level 8 around wave 7
Level 10 around wave 9
Level 11-12 around boss
```

---

## 8. Level-Up Stat Growth

Each level automatically increases base stats.

### 8.1 Warrior Growth Per Level

```text
maxHealth +18
attackPower +3
armor +3
resistance +1
critChance +0.003
```

### 8.2 Hunter Growth Per Level

```text
maxHealth +12
attackPower +4
armor +1
resistance +1
critChance +0.004
```

### 8.3 Priest Growth Per Level

```text
maxHealth +10
spellPower +4
armor +1
resistance +2
maxResource +5
resourceRegen +0.25
critChance +0.003
```

### 8.4 Mage Growth Per Level

```text
maxHealth +9
spellPower +5
armor +1
resistance +2
maxResource +6
resourceRegen +0.25
critChance +0.003
```

---

## 9. Upgrade System

On every level-up, the player chooses 1 of 3 offered upgrades.

Upgrade selection should include:
- class-specific upgrades
- occasional generic upgrades
- ability unlocks
- ability improvements

### Generic Upgrade Pool

Generic upgrades may appear for all classes.

```text
+12% maxHealth
+10% moveSpeed
+5% critChance
+15 armor
+15 resistance
+15% resourceRegen
+10% autoAttackDamage
```

Generic upgrades should appear less often than class-specific upgrades.

```text
classSpecificUpgradeWeight = 80%
genericUpgradeWeight = 20%
```

### 9.1 Warrior Upgrade Pool

```text
Strike Damage +25%
Strike Rage Cost -5
Taunting Blow Cooldown -2s
Taunting Blow Threat +50%
Max Health +20%
Armor +25%
Rage From Damage Dealt +30%
Rage From Damage Taken +30%
Unlock Cleave
Unlock Shield Wall
Cleave Damage +20%
Shield Wall Cooldown -20%
```

#### Unlock: Cleave

```text
id = warrior_cleave
slot = 3
targetType = enemy
range = 2.5
cooldown = 6.0 seconds
resourceCost = 35 rage
damageType = physical
damage = 22 + attackPower * 0.7
effect = hits up to 3 enemies in front of the warrior
```

#### Unlock: Shield Wall

```text
id = warrior_shield_wall
slot = E
targetType = self
cooldown = 30.0 seconds
resourceCost = 0
effect = reduce incoming damage by 40% for 5 seconds
```

### 9.2 Hunter Upgrade Pool

```text
Power Shot Damage +25%
Power Shot Focus Cost -8
Power Shot Cast Time -0.2s
Quick Shot Damage +20%
Quick Shot Cooldown -0.5s
Focus Regeneration +20%
Auto-Attack Speed +15%
Crit Chance +6%
Unlock Piercing Shot
Unlock Trap
Piercing Shot Damage +20%
Trap Slow Duration +2s
```

#### Unlock: Piercing Shot

```text
id = hunter_piercing_shot
slot = 3
targetType = direction
range = 22.0
cooldown = 8.0 seconds
resourceCost = 35 focus
damageType = physical
damage = 28 + attackPower * 0.8
effect = damages enemies in a line
```

#### Unlock: Trap

```text
id = hunter_trap
slot = Q
targetType = ground_area
range = 12.0
cooldown = 18.0 seconds
resourceCost = 20 focus
effect = slows enemies in area by 45% for 5 seconds
```

### 9.3 Priest Upgrade Pool

```text
Heal Amount +25%
Heal Mana Cost -6
Heal Cast Time -0.25s
Smite Damage +25%
Smite Mana Cost -5
Mana Regeneration +20%
Healing Crit Chance +8%
Unlock Renew
Unlock Holy Nova
Unlock Shadow Word
Renew Duration +4s
Holy Nova Healing +20%
Shadow Word Damage +20%
```

#### Unlock: Renew

```text
id = priest_renew
slot = 3
targetType = ally
range = 18.0
cooldown = 4.0 seconds
resourceCost = 20 mana
effect = heal target for 12 + spellPower * 0.25 every second for 6 seconds
```

#### Unlock: Holy Nova

```text
id = priest_holy_nova
slot = Q
targetType = self
range = 8.0 radius
cooldown = 12.0 seconds
resourceCost = 35 mana
effect = heal allies and damage enemies around priest
healing = 22 + spellPower * 0.45
damage = 18 + spellPower * 0.35
```

#### Unlock: Shadow Word

```text
id = priest_shadow_word
slot = 3
targetType = enemy
range = 18.0
cooldown = 8.0 seconds
resourceCost = 24 mana
damageType = magical
school = shadow
effect = damage over time for 6 seconds
damagePerSecond = 10 + spellPower * 0.2
```

### 9.4 Mage Upgrade Pool

```text
Fireball Damage +25%
Fireball Mana Cost -6
Fireball Cast Time -0.25s
Frostbolt Damage +20%
Frostbolt Slow +15%
Frostbolt Slow Duration +2s
Mana Regeneration +20%
Spell Crit Chance +6%
Unlock Flame Wave
Unlock Ice Barrier
Unlock Arcane Surge
Flame Wave Damage +20%
Ice Barrier Strength +25%
Arcane Surge Cooldown -20%
```

#### Unlock: Flame Wave

```text
id = mage_flame_wave
slot = 3
targetType = ground_area
range = 16.0
radius = 5.0
cooldown = 10.0 seconds
resourceCost = 40 mana
damageType = magical
school = fire
damage = 32 + spellPower * 0.75
effect = area damage
```

#### Unlock: Ice Barrier

```text
id = mage_ice_barrier
slot = E
targetType = self
cooldown = 24.0 seconds
resourceCost = 25 mana
effect = absorb 45 + spellPower * 0.8 damage for 6 seconds
```

#### Unlock: Arcane Surge

```text
id = mage_arcane_surge
slot = Q
targetType = self
cooldown = 30.0 seconds
resourceCost = 0
effect = reduce mana costs by 40% and cast times by 20% for 6 seconds
```

---

## 10. Enemy Stats

Enemy values are base values before wave and player count scaling.

### 10.1 Goblin

```text
enemyId = goblin
role = basic_melee

maxHealth = 70
damage = 10
attackInterval = 1.5 seconds
attackRange = 1.6
moveSpeed = 3.8
armor = 5
resistance = 0
xp = 35
budgetCost = 1
```

Behavior:
- chase highest threat target
- melee attack in range

### 10.2 Runner

```text
enemyId = runner
role = fast_pressure

maxHealth = 55
damage = 8
attackInterval = 1.2 seconds
attackRange = 1.5
moveSpeed = 5.8
armor = 2
resistance = 0
xp = 45
budgetCost = 2
```

Behavior:
- prefers Priest/Mage/Hunter if no strong threat exists
- fast pressure enemy
- low durability

### 10.3 Archer

```text
enemyId = archer
role = ranged

maxHealth = 60
damage = 12
attackInterval = 2.0 seconds
attackRange = 14.0
moveSpeed = 3.2
armor = 2
resistance = 5
xp = 60
budgetCost = 3
```

Behavior:
- keeps distance from target
- uses ranged attacks
- tries not to stand in melee range

### 10.4 Shaman

```text
enemyId = shaman
role = support

maxHealth = 75
damage = 6
attackInterval = 2.2 seconds
attackRange = 12.0
moveSpeed = 3.0
armor = 2
resistance = 15
xp = 80
budgetCost = 4
```

Abilities:

```text
Enemy Heal:
- cooldown = 8 seconds
- range = 12
- healing = 30
- target = lowest-health nearby enemy

Enemy Buff:
- optional for MVP
- cooldown = 14 seconds
- effect = +20% damage to nearby enemies for 5 seconds
```

### 10.5 Brute

```text
enemyId = brute
role = heavy_melee

maxHealth = 180
damage = 24
attackInterval = 2.2 seconds
attackRange = 1.8
moveSpeed = 2.6
armor = 20
resistance = 5
xp = 120
budgetCost = 5
```

Behavior:
- slow but dangerous
- high health
- high melee damage

---

## 11. Enemy Scaling

Enemy stats scale by wave number and player count.

### Wave Scaling

For normal enemies:

```text
healthMultiplier = 1.0 + (waveNumber - 1) * 0.12
damageMultiplier = 1.0 + (waveNumber - 1) * 0.08
xpMultiplier = 1.0 + (waveNumber - 1) * 0.05
```

Example wave 5:

```text
healthMultiplier = 1.48
damageMultiplier = 1.32
xpMultiplier = 1.20
```

### Player Count Scaling

Use these multipliers:

```text
1 player: enemyHealth x 0.75, waveBudget x 0.55
2 players: enemyHealth x 0.90, waveBudget x 0.80
3 players: enemyHealth x 1.00, waveBudget x 1.00
4 players: enemyHealth x 1.12, waveBudget x 1.20
5 players: enemyHealth x 1.25, waveBudget x 1.40
```

Damage should not scale strongly with player count.

```text
enemyDamagePlayerCountMultiplier = 1.0
```

---

## 12. Wave Table

This table defines the first MVP wave plan.

The implementation may either use this exact table or use it as input to a budget-based generator.

### Wave 1

```text
budget = 8
allowedEnemies = goblin
composition = 8 goblins
goal = teach basic movement and attacks
```

### Wave 2

```text
budget = 12
allowedEnemies = goblin, runner
composition = 8 goblins, 2 runners
goal = introduce fast pressure enemies
```

### Wave 3

```text
budget = 16
allowedEnemies = goblin, runner, archer
composition = 8 goblins, 2 runners, 2 archers
goal = introduce ranged enemies
```

### Wave 4

```text
budget = 22
allowedEnemies = goblin, runner, archer, brute
composition = 8 goblins, 3 runners, 2 archers, 1 brute
goal = introduce heavy enemy
```

### Wave 5

```text
budget = 28
allowedEnemies = goblin, runner, archer, brute, shaman
composition = 10 goblins, 3 runners, 2 archers, 1 brute, 1 shaman
goal = introduce support enemy
```

### Wave 6

```text
budget = 34
allowedEnemies = goblin, runner, archer, brute, shaman
composition = 10 goblins, 4 runners, 3 archers, 2 brutes
goal = pressure and positioning
```

### Wave 7

```text
budget = 42
allowedEnemies = goblin, runner, archer, brute, shaman
composition = 12 goblins, 4 runners, 3 archers, 2 brutes, 1 shaman
goal = mixed tactical wave
```

### Wave 8

```text
budget = 52
allowedEnemies = goblin, runner, archer, brute, shaman
composition = 12 goblins, 5 runners, 4 archers, 3 brutes, 1 shaman
goal = high pressure wave
```

### Wave 9

```text
budget = 64
allowedEnemies = goblin, runner, archer, brute, shaman
composition = 14 goblins, 6 runners, 4 archers, 3 brutes, 2 shamans
goal = pre-boss challenge
```

### Wave 10

```text
budget = boss
composition = final boss + periodic adds
goal = final encounter
```

---

## 13. Final Boss

### 13.1 Boss Base Stats

These values are before player count scaling.

```text
enemyId = arena_overlord
name = Arena Overlord

maxHealth = 1800
damage = 32
attackInterval = 1.8 seconds
attackRange = 2.2
moveSpeed = 3.2
armor = 20
resistance = 20
xp = 1000
```

### Player Count Scaling

```text
1 player: bossHealth x 0.45
2 players: bossHealth x 0.70
3 players: bossHealth x 1.00
4 players: bossHealth x 1.25
5 players: bossHealth x 1.50
```

Boss damage should not scale with player count in MVP.

### 13.2 Boss Abilities

#### Ground Slam

```text
cooldown = 10 seconds
telegraphDuration = 1.5 seconds
radius = 5.0
damage = 45 magical/physical hybrid
effect = damages players in marked area
```

#### Summon Adds

```text
cooldown = 18 seconds
summons = 3 goblins + 1 runner
spawnLocation = arena edge
```

Player count scaling:

```text
1-2 players: 2 goblins
3 players: 3 goblins + 1 runner
4-5 players: 4 goblins + 2 runners
```

#### Enrage

```text
trigger = boss below 30% HP
effect = boss damage +20%, attack speed +15%
```

---

## 14. Spawn Rules

Enemies spawn near the arena edge.

```text
arenaRadius = 28
enemySpawnRadius = 25
minimumDistanceToPlayer = 8
spawnTelegraphDuration = 1 second
```

Enemies should spawn in packs, not all at once.

```text
small waves = 2 packs
medium waves = 3 packs
large waves = 4 packs
timeBetweenPacks = 8-12 seconds
```

---

## 15. MVP Tuning Notes

The first implementation is expected to need tuning.

If the game feels too easy:
- increase wave budget
- increase enemy health scaling
- increase Runner count
- increase Archer pressure
- reduce wave break healing

If the game feels too hard:
- reduce enemy damage scaling
- reduce Brute count
- reduce Runner speed
- increase player health
- increase Priest healing
- increase wave break recovery

If runs are too short:
- increase enemy health
- increase spawn pack delay
- increase boss health
- add more enemies to waves 7-9

If runs are too long:
- reduce enemy health scaling
- reduce boss health
- increase player damage growth
- increase XP gain so players level faster

---

## 16. Known Balance Risks

### Healing Threat

Healing threat can easily make the Priest too vulnerable.

Initial value:

```text
1 healing = 0.5 threat
```

If Priest gets attacked too often:

```text
reduce healingThreatMultiplier to 0.3
```

If healing has no downside:

```text
increase healingThreatMultiplier to 0.7
```

### Mage Mana

Mage may run out of mana too quickly because both starting spells cost mana.

If Mage feels resource-starved:

```text
increase mage manaRegen from 5 to 6
reduce Fireball cost from 24 to 20
reduce Frostbolt cost from 20 to 16
```

### Warrior Rage

Warrior may feel boring if rage generation is too slow.

If Warrior cannot use abilities often enough:

```text
increase rageFromDamageDealt from 0.25 to 0.35
increase rage gained from auto-attack from 4 to 6
```

### Hunter Focus

Hunter should feel consistently active.

If Hunter spams too much:

```text
reduce focusRegen from 8 to 6
increase Quick Shot cost from 10 to 15
```

If Hunter feels too slow:

```text
increase focusRegen from 8 to 10
reduce Power Shot cost from 30 to 25
```

---

## 17. Implementation Guidance

The coding agent should implement these values as structured data wherever possible.

Recommended files:

```text
server/app/game_data/classes.json
server/app/game_data/abilities.json
server/app/game_data/upgrades.json
server/app/game_data/enemies.json
server/app/game_data/waves.json
server/app/game_data/bosses.json
server/app/game_data/constants.json
```

Avoid hardcoding numeric balance values directly into game logic.

All values in this document are MVP defaults and should be easy to change.
