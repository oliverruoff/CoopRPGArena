# CHARACTER_DESIGN.md – Character and Visual Design

## 1. Purpose

This document defines the initial visual direction for characters, enemies, and combat effects for the browser-based cooperative RPG arena game.

The goal is not high-end realism. The goal is a simple, readable, charming, performant visual style that works well with a zoomed-out top-down camera.

The visual direction should feel:

- blocky
- stylized
- playful
- readable from far away
- inspired by voxel / dungeon-crawler aesthetics
- suitable for simple implementation with low-poly or programmatic meshes

This document does **not** require copying Minecraft or Minecraft Dungeons directly. Instead, it defines an original visual style that is inspired by the general idea of a blocky fantasy action game.

---

## 2. Core Art Direction

### 2.1 Style Summary

Use a **blocky low-poly fantasy style**.

Characters, enemies, and weapons should be made from very simple shapes, such as:

- boxes
- cuboids
- cylinders
- simple cones
- simple planes for selected effects if needed

The style should feel somewhat like a mix of:

- voxel-inspired blocky character design
- simple low-poly dungeon crawler readability
- strong class silhouettes
- colorful combat effects against a mostly white arena

### 2.2 Visual Priorities

The most important visual goals are:

1. **Class readability**
2. **Enemy readability**
3. **Readable spell effects**
4. **Performance**
5. **Simplicity of implementation**

Because the game camera is zoomed out, small surface details do not matter much. Large silhouettes, bold colors, and clear effect shapes matter much more.

### 2.3 Things to Avoid

Avoid:

- realistic character proportions
- tiny visual details that are not visible from the gameplay camera
- complex cloth simulation
- heavy particle spam
- visually noisy effects that hide gameplay information
- designs that are too similar to any copyrighted official game assets

---

## 3. Camera Readability Rules

The gameplay camera is an angled top-down camera and should usually show most or all players at once.

Therefore:

- player characters should be visually compact
- heads can be slightly oversized
- weapons and magical props should be oversized
- class identity should be visible primarily through silhouette and color
- effects should be readable from a distance
- floor telegraphs should be clear and high contrast

Important design rule:

**If a class cannot be recognized at a glance from the gameplay camera, the design is too subtle and should be simplified or exaggerated.**

---

## 4. Shared Player Character Base

All player characters should share a common simple base rig / structure.

### 4.1 Base Shape Language

All player models should use:

- cube-like head
- rectangular torso
- rectangular arms
- rectangular legs
- simple weapon/accessory meshes
- optional robe or shoulder elements built from simple geometry

### 4.2 Suggested Base Proportions

Suggested proportions in world units:

```text
totalHeight = 1.8
headHeight = 0.45
bodyHeight = 0.75
legHeight = 0.6
shoulderWidth = 0.75
```

These values are approximate and can be tuned.

### 4.3 General Character Rules

All player characters should:

- look slightly toy-like
- have a bold silhouette
- have a visible weapon or magic focus
- support a simple idle animation
- support a simple run animation
- support very readable attack/cast poses

Optional but recommended:

- a colored selection / identity ring under each player
- HP bar above the character
- optional class icon near the HP bar

---

## 5. Class Color Language

Each class should have a consistent primary visual color identity.

### Warrior

- warm red
- bronze
- leather brown
- dark metal gray

### Hunter

- forest green
- tan
- brown
- muted yellow accents

### Priest

- white
- gold
- pale blue
- soft holy glow
- optional purple for shadow-oriented effects

### Mage

- deep blue
- purple
- cyan
- orange/red for fire magic
- blue/cyan for frost magic
- purple/cyan for arcane magic

### Additional Player Identity

If multiple players choose the same class, each player should also have an additional per-player identity marker, such as:

- a colored ring under the character
- a small color strip on UI elements
- a player name label

This should help distinguish multiple Warriors, Mages, etc.

---

## 6. Warrior Design

## 6.1 Fantasy

The Warrior should feel like a brutal frontliner with a somewhat barbaric arena-fighter look.

The Warrior should look:
- sturdy
- strong
- direct
- dangerous in melee

### 6.2 Silhouette

The Warrior silhouette should include:

- broad shoulders
- thicker torso
- heavy weapon
- strong stance
- optional large shoulder pad(s)
- optional leather/fur elements

### 6.3 Model Design

Suggested visual components:

- blocky head
- broad chest
- thick arms
- simple pants/boots
- asymmetrical shoulder armor or leather shoulder pad
- oversized axe or sword

Recommended visual tone:
- less elegant knight
- more rugged fighter / barbarian

### 6.4 Suggested Colors

- skin tone: medium/tan
- torso: brown leather
- cloth accent: red
- armor accent: dull bronze or gray
- weapon: dark handle + metallic blade

### 6.5 Animation Feel

- idle: solid breathing / slight weight shift
- movement: heavy blocky run
- auto-attack: strong horizontal swing
- Strike: heavier single-target attack motion
- Taunting Blow: aggressive weapon raise / slam / shout pose

### 6.6 Warrior Effects

#### Strike
Visuals:
- short red/orange slash arc
- brief spark/impact burst on enemy

#### Taunting Blow
Visuals:
- red pulse around Warrior
- small aggro visual marker on affected enemy
- enemy may briefly flash red or show a small attention icon

---

## 7. Hunter Design

## 7.1 Fantasy

The Hunter should feel like a fast, mobile ranger / archer.

The Hunter should look:
- agile
- light
- precise
- outdoorsy / ranger-like

### 7.2 Silhouette

The Hunter silhouette should include:

- slimmer body than Warrior
- clearly visible bow
- hood or light cloak
- quiver on back if possible

### 7.3 Model Design

Suggested visual components:

- blocky head with hood
- slim torso in tunic
- light boots
- bow mesh
- quiver block or simplified quiver shape
- optional shoulder cloth

### 7.4 Suggested Colors

- hood/tunic: forest green
- leather: tan/brown
- boots: dark brown
- accent: muted yellow or olive

### 7.5 Animation Feel

- idle: alert, lightweight posture
- movement: fast light run
- auto-attack: quick bow release
- Power Shot: visible draw and short charge pose
- Quick Shot: snappy release

### 7.6 Hunter Effects

#### Bow Shot
Visuals:
- thin yellow or green projectile
- short clean projectile trail

#### Power Shot
Visuals:
- brighter projectile
- clearer charge effect while preparing shot
- stronger impact flash

#### Quick Shot
Visuals:
- shorter, lighter projectile trail
- less dramatic impact

Later optional effects:
- trap area ring
- piercing line shot

---

## 8. Priest Design

## 8.1 Fantasy

The Priest should feel like a holy spellcaster and healer, with potential to branch into a shadow damage direction.

The Priest should look:
- calm
- magical
- supportive
- clearly distinct from Mage

### 8.2 Silhouette

The Priest silhouette should include:

- robe
- staff or holy focus
- lighter elegant shape
- possible hood or shoulder cloth
- gentle visual glow

### 8.3 Model Design

Suggested visual components:

- blocky head
- long robe body
- sleeves integrated into arms
- simple staff or floating book
- lower legs partly hidden by robe

### 8.4 Suggested Colors

- robe: white or off-white
- primary accent: gold
- secondary accent: pale blue
- shadow-related effects later: purple/dark violet

### 8.5 Animation Feel

- idle: subtle glow and calm breathing
- movement: simple robe movement without cloth simulation
- Heal: staff/hand forward with channeling pose
- Smite: brief holy casting motion

### 8.6 Priest Effects

#### Heal
Visuals:
- soft white/gold beam, orb stream, or luminous link to ally
- short golden healing ring or pulse on ally
- healing numbers should be clearly visible

#### Smite
Visuals:
- small holy bolt or luminous projectile
- compact impact flash

#### Renew (later)
Visuals:
- soft golden particles around ally
- subtle periodic pulse

#### Holy Nova (later)
Visuals:
- expanding gold-white ring around Priest
- readable circular effect

#### Shadow Word (later)
Visuals:
- dark purple aura or wisps around enemy
- clear distinction from holy effects

---

## 9. Mage Design

## 9.1 Fantasy

The Mage should feel like a classic wizard, clearly recognizable even from a distance.

The Mage should look:
- arcane
- intelligent
- magical
- fragile but dangerous

### 9.2 Silhouette

The Mage silhouette should include:

- robe
- pointed hat or wizard-like head shape
- staff with crystal
- slim body
- magical visual accent

### 9.3 Model Design

Suggested visual components:

- blocky head
- pointed or stepped wizard hat
- robe
- staff with glowing crystal
- slim body shape

### 9.4 Suggested Colors

- robe: deep blue or purple
- accent: cyan
- hat: darker blue/purple
- staff: brown with cyan crystal

Elemental effect colors:
- fire: orange/red
- frost: blue/cyan
- arcane: purple/cyan

### 9.5 Animation Feel

- idle: staff crystal pulses lightly
- movement: compact run
- Fireball: charging and forward cast motion
- Frostbolt: controlled casting motion
- Arcane effects later: lighter magical flourish

### 9.6 Mage Effects

#### Fireball
Visuals:
- glowing orange fire orb
- short flame trail
- compact explosion on impact

#### Frostbolt
Visuals:
- blue/cyan projectile
- cool icy trail
- visible slow indicator on target such as frost particles or icy ring

#### Flame Wave (later)
Visuals:
- visible orange area telegraph
- delayed burst of flame effect

#### Ice Barrier (later)
Visuals:
- translucent blue protective shell
- optional simple floating ice shards

#### Arcane Surge (later)
Visuals:
- purple/cyan arcane particles around Mage
- faster pulsing staff crystal

---

## 10. Enemy Design

All enemy types must also be readable from far away.

Enemy types should use exaggerated silhouettes and clear color grouping.

### 10.1 General Enemy Rules

Enemies should:
- be easy to distinguish from players
- use slightly more monstrous color palettes
- have readable weapon shapes where relevant
- have clear role-based silhouettes

### 10.2 Goblin

Fantasy:
- standard melee trash enemy

Visual design:
- small blocky humanoid
- green skin
- brown cloth
- small club or dagger

Silhouette:
- compact
- basic melee weapon
- easy to read as low-tier enemy

Death effect:
- small green pop / particles

### 10.3 Runner

Fantasy:
- fast annoying pressure enemy

Visual design:
- smaller than Goblin
- hunched or forward-leaning shape
- vivid accent color to suggest speed

Silhouette:
- low fast body
- exaggerated running posture

Effect:
- light speed trail or motion streak

### 10.4 Archer

Fantasy:
- ranged goblin archer

Visual design:
- slim goblin-like shape
- hood or darker cloth
- visible small bow

Silhouette:
- bow should be clearly readable

Effect:
- small arrow projectile with simple trail

### 10.5 Brute

Fantasy:
- heavy dangerous melee enemy

Visual design:
- large blocky body
- oversized torso
- small head
- club, hammer, or fists

Silhouette:
- obviously larger and heavier than Goblin

Effect:
- heavier hit effect
- optional small dust or stomp feel

### 10.6 Shaman

Fantasy:
- support / healer enemy

Visual design:
- medium-size enemy
- robe or ritual cloth
- visible staff, totem, or skull accessory
- magical accent color

Silhouette:
- caster/support role should be obvious

Effect:
- enemy healing beam
- purple/green support aura
- should feel like a high-priority target

### 10.7 Final Boss – Arena Overlord

Fantasy:
- large arena boss
- intimidating heavy melee presence

Visual design:
- very large blocky silhouette
- dark stone / bronze / red palette
- optional horns or massive shoulder shapes
- giant hammer or club

Silhouette:
- immediately identifiable as boss

Effects:
- large ground slam telegraph
- dark summon portals at arena edge
- red aura during enrage

---

## 11. Combat Effect Design

Because the arena is mostly white, effects may use stronger colors without becoming hard to see.

### 11.1 Core Effect Principles

Effects should be:

- readable from the zoomed-out gameplay camera
- simple
- color-coded
- performance-friendly
- short and informative
- not visually overwhelming

### 11.2 Effect Color Language

Use this general color mapping:

- physical melee = red / orange slash
- hunter ranged attacks = yellow / green
- healing / holy = white / gold
- fire magic = orange / red
- frost magic = cyan / light blue
- arcane magic = purple / cyan
- shadow magic = dark purple
- dangerous enemy telegraphs = red
- supportive/friendly area effects = gold / blue / green depending on skill

### 11.3 Telegraph Rules

All important area effects should be telegraphed clearly.

Rules:
- enemy danger zones use red telegraphs
- friendly or player-created beneficial zones use gold/blue/green telegraphs
- boss attacks should have the clearest telegraphs
- telegraphs should be visible from the gameplay camera before the effect resolves

---

## 12. Arena Visual Direction

The arena is intentionally minimalist to keep rendering simple and readability high.

### 12.1 Arena Look

- mostly white floor
- subtle shading allowed
- round arena
- soft blurred boundary
- clean uncluttered visual field

### 12.2 Arena Readability Goals

The arena should support:
- easy reading of player positions
- easy reading of enemy spawns
- easy reading of spell effects
- minimal distraction

### 12.3 Spawn Indicators

Enemy spawns should be visually announced using:
- red/dark circular spawn markers
- short delay before enemy appears
- optional brief portal or smoke effect

---

## 13. UI-Related Readability

Since the camera is far away, characters must be readable through additional UI cues.

### 13.1 Overhead Elements

Recommended:
- player name
- health bar
- optional class icon
- optional resource bar only if readable

### 13.2 Ground Indicators

Recommended:
- player identity ring
- selection ring
- ally target highlight
- enemy target highlight

Suggested highlight colors:
- selected enemy: red
- selected ally: blue or gold
- local player ring: player-specific color

### 13.3 Class Icons

Recommended class icon ideas:

- Warrior: sword or axe
- Hunter: bow
- Priest: holy spark / cross-like icon
- Mage: star / staff / arcane symbol

These do not need to be complex.

---

## 14. MVP Implementation Guidance

The MVP should not require custom external art assets to be playable.

The coding agent should be able to implement the initial visuals using programmatic geometry.

### 14.1 Babylon.js Primitive Mesh Approach

Recommended Babylon.js primitives:
- `MeshBuilder.CreateBox`
- `MeshBuilder.CreateCylinder`
- `MeshBuilder.CreateSphere`
- simple planes if necessary
- simple emissive materials
- simple particle systems
- simple billboard effects if useful

### 14.2 Character Factory Structure

Recommended structure:

```text
client/src/art/
  characterFactory.ts
  enemyFactory.ts
  effectFactory.ts
  materials.ts
  colors.ts
```

Suggested creation functions:

```text
createWarriorModel(scene)
createHunterModel(scene)
createPriestModel(scene)
createMageModel(scene)

createGoblinModel(scene)
createRunnerModel(scene)
createArcherModel(scene)
createBruteModel(scene)
createShamanModel(scene)
createBossModel(scene)
```

Each character/enemy model should return a root node such as:

```text
TransformNode characterRoot
```

### 14.3 Effects Factory Structure

Suggested effect functions:

```text
playSlashArc()
playTauntPulse()

playArrowProjectile()
playPowerShotImpact()

playHealBeam()
playHealPulse()
playSmiteImpact()

playFireballProjectile()
playFireballImpact()
playFrostboltProjectile()
playFrostSlowEffect()

playSpawnTelegraph()
playBossGroundSlamTelegraph()
playBossSummonEffect()
```

---

## 15. Animation Guidance

The MVP does not need a complex skeletal animation system.

Simple transform-based animations are acceptable.

### 15.1 Required Animation Set

Each player class should have:
- idle
- move/run
- auto-attack
- cast
- hit reaction optional
- death later if needed

Each enemy should have:
- idle
- move
- basic attack
- death

### 15.2 Animation Style

Animations should be:
- snappy
- readable
- exaggerated enough to be seen from far away
- lightweight to implement

Simple rotation and translation on limbs and weapons is enough for MVP.

---

## 16. Asset Evolution Path

The initial implementation may use only procedural / primitive shapes.

Later improvements may replace them with:
- simple custom low-poly `.glb` models
- refined materials
- more polished particle effects
- slightly improved class-specific silhouettes

However, the gameplay should remain fully playable with the initial simple version.

---

## 17. Final Design Rule

The entire art direction should follow this rule:

**Simple, readable, charming, and performant beats detailed, realistic, or complex.**

If a visual feature makes the game harder to read from the gameplay camera, it should be simplified or removed.
