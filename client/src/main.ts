import { ArcRotateCamera, CascadedShadowGenerator, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Matrix, Mesh, MeshBuilder, PointerEventTypes, Scene, StandardMaterial, TransformNode, Vector3, VertexData } from "@babylonjs/core";
import "./style.css";

type Vec = { x: number; z: number };
type CastState = { abilityId: string; targetId: string | null; duration: number; remaining: number; progress: number };
type AutoAttackState = { remaining: number; interval: number; progress: number };
type PlayerState = { id: string; name: string; classId: string | null; ready: boolean; hp: number; maxHealth: number; resource: number; maxResource: number; resourceType: string | null; level: number; xp: number; dead: boolean; targetId: string | null; allyTargetId: string | null; position: Vec; facing: number; jumping: boolean; jumpProgress: number; abilities: string[]; abilitySlots?: Record<string, number>; cooldowns: Record<string, number>; globalCooldown: number; autoAttack: AutoAttackState; pendingUpgrades: Upgrade[]; stats: Record<string, number>; shield?: number; shieldRemaining?: number; casting: CastState | null };
type EnemyState = { id: string; type: string; name: string; hp: number; maxHealth: number; position: Vec; boss: boolean; alerted?: boolean; facing?: number };
type MapObject = { id: string; type: string; x: number; z: number; radius?: number; width?: number; depth?: number; blocksSight?: boolean; variant?: number };
type GroundEffect = { id: string; type: string; abilityId?: string; x: number; z: number; radius: number; remaining?: number };
type Upgrade = { id: string; name: string; choiceType?: string; abilityId?: string; description?: string };
type Ability = { id: string; name: string; slot: number; targetType: string; cooldown: number; resourceCost?: { type: string; amount: number }; castTime?: number; range?: number; description?: string; effects?: Array<{ type: string; amount?: number; school?: string; scaling?: { stat: string; coefficient: number }; duration?: number; tickInterval?: number; slowPercent?: number; radius?: number }> };
type CombatEvent = { id: number; type: string; sourceId?: string; targetId?: string; abilityId?: string; castTime?: number; duration?: number; amount?: number; school?: string };
type Snapshot = { type: string; you: string; matchState: string; countdown: number | null; players: Record<string, PlayerState>; enemies: Record<string, EnemyState>; mapObjects: MapObject[]; groundEffects?: GroundEffect[]; wave: { number: number; state: string; aliveEnemies: number; nextWaveIn?: number }; abilities: Record<string, Ability>; events: CombatEvent[] };

const classInfo: Record<string, { name: string; description: string; stats: string[] }> = {
  warrior: { name: "Warrior", description: "A durable frontliner. Great at surviving, holding enemy attention, and smashing threats up close.", stats: ["HP 180", "Rage", "Armor 35", "Melee bruiser / tank"] },
  hunter: { name: "Hunter", description: "A mobile ranged damage dealer. Keeps pressure from afar with fast shots and strong uptime.", stats: ["HP 125", "Focus", "Attack Power 22", "Ranged sustained DPS"] },
  priest: { name: "Priest", description: "A holy support caster. Heals allies, deals holy damage, and can keep a group alive through pressure.", stats: ["HP 115", "Mana 120", "Spell Power 20", "Healer / holy caster"] },
  mage: { name: "Mage", description: "A fragile elemental nuker. Firebolt burns enemies over time; Frostbolt can be learned later to help the team kite.", stats: ["HP 105", "Mana 130", "Spell Power 26", "Burst / control caster"] }
};

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `
  <canvas id="renderCanvas" data-testid="arena"></canvas>
  <section id="lobby" data-testid="lobby">
    <h1>Coop RPG Arena</h1>
    <p id="connection">Connecting...</p>
    <div id="nameField">
      <label for="playerName">Your name</label>
      <input id="playerName" type="text" maxlength="18" placeholder="Enter name" data-testid="player-name-input" />
      <div id="nameSuggestions" data-testid="name-suggestions"></div>
    </div>
    <div class="classes">
      <button data-testid="class-warrior" data-class="warrior">Warrior</button>
      <button data-testid="class-hunter" data-class="hunter">Hunter</button>
      <button data-testid="class-priest" data-class="priest">Priest</button>
      <button data-testid="class-mage" data-class="mage">Mage</button>
    </div>
    <button id="ready" data-testid="ready-button">Ready</button>
    <div id="lobbyPlayers"></div>
    <div id="classPreviewInfo" data-testid="class-preview-info"></div>
    <div id="countdown" data-testid="countdown"></div>
  </section>
  <section id="hud">
    <div id="party" data-testid="party"></div>
    <div id="target" data-testid="target-frame">No target</div>
    <div id="wave" data-testid="wave-counter">Wave 0</div>
    <div id="bars">
      <div data-testid="player-level" id="level">Level 1</div>
      <div class="bar"><span id="hp" data-testid="player-health-bar"></span><b id="hpLabel" data-testid="hp-label">HP</b></div>
      <div class="bar resource"><span id="res" data-testid="player-resource-bar"></span><b id="resLabel" data-testid="resource-label">Resource</b></div>
      <div class="bar xp"><span id="xp" data-testid="xp-bar"></span><b id="xpLabel" data-testid="xp-label">EXP</b></div>
      <div class="bar swing"><span id="swing" data-testid="auto-attack-bar"></span><b id="swingLabel" data-testid="auto-attack-label">Auto</b></div>
    </div>
    <aside id="statsPanel" data-testid="stats-panel"></aside>
    <div id="action" data-testid="action-bar">
      <button data-testid="ability-slot-1" data-slot="1">1<span class="cooldownOverlay"></span><span class="cooldownText"></span></button>
      <button data-testid="ability-slot-2" data-slot="2">2<span class="cooldownOverlay"></span><span class="cooldownText"></span></button>
      <button data-testid="ability-slot-3" data-slot="3">3<span class="cooldownOverlay"></span><span class="cooldownText"></span></button>
      <button data-testid="ability-slot-4" data-slot="4">4<span class="cooldownOverlay"></span><span class="cooldownText"></span></button>
      <button data-testid="ability-slot-q" data-slot="q">Q<span class="cooldownOverlay"></span><span class="cooldownText"></span></button>
      <button data-testid="ability-slot-e" data-slot="e">E<span class="cooldownOverlay"></span><span class="cooldownText"></span></button>
      <button data-testid="ability-slot-r" data-slot="r">R<span class="cooldownOverlay"></span><span class="cooldownText"></span></button>
    </div>
    <div id="cast" data-testid="cast-bar"><span id="castFill"></span><b id="castName"></b></div>
    <div id="overhead"></div>
    <div id="levelPanel" data-testid="level-up-panel"></div>
    <div id="abilityTooltip" data-testid="ability-tooltip"></div>
    <div id="end" data-testid="end-screen">
      <div id="endTitle"></div>
      <button id="restart" data-testid="restart-button">Back to Lobby</button>
    </div>
  </section>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas")!;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.2, 0.21, 0.22, 1);
const camera = new ArcRotateCamera("camera", -Math.PI / 2, 0.9, 42, Vector3.Zero(), scene);
camera.attachControl(canvas, false);
camera.inputs.clear();
new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene).intensity = 0.42;
const dirLight = new DirectionalLight("dirLight", new Vector3(-0.45, -1, -0.35), scene);
dirLight.position = new Vector3(18, 32, 18);
dirLight.intensity = 0.66;
const shadowGenerator = new CascadedShadowGenerator(1024, dirLight);
shadowGenerator.useBlurCloseExponentialShadowMap = true;
shadowGenerator.blurKernel = 16;
shadowGenerator.bias = 0.0005;
shadowGenerator.normalBias = 0.02;
shadowGenerator.lambda = 0.8;
shadowGenerator.cascadeBlendPercentage = 0.15;
shadowGenerator.shadowMaxZ = 55;
shadowGenerator.autoCalcDepthBounds = true;

const outerGround = MeshBuilder.CreateCylinder("outer-ground", { diameter: 110, height: 0.04, tessellation: 128 }, scene);
outerGround.position.y = -0.14;
outerGround.material = mat("outer-ground-mat", new Color3(0.21, 0.22, 0.23));
outerGround.receiveShadows = true;
const floorFade = MeshBuilder.CreateCylinder("arena-floor-fade", { diameter: 61, height: 0.035, tessellation: 128 }, scene);
floorFade.position.y = -0.12;
floorFade.material = transparentMat("arena-floor-fade-mat", new Color3(0.5, 0.52, 0.47), 0.34);
floorFade.receiveShadows = true;
const arenaMat = mat("arena", new Color3(0.72, 0.73, 0.66));
const arena = MeshBuilder.CreateCylinder("arena-floor", { diameter: 56, height: 0.15, tessellation: 96 }, scene);
arena.material = arenaMat;
arena.position.y = -0.08;
arena.receiveShadows = true;

const configuredWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
const defaultWsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8000/ws`;
// If a configured URL points to localhost but the page is served from a remote host,
// fall back to the page's host so same-network play works out of the box.
const wsUrl = configuredWsUrl && !isLocalhostOnlyUrl(configuredWsUrl) ? configuredWsUrl : defaultWsUrl;
let ws: WebSocket;
let state: Snapshot | null = null;
const meshes = new Map<string, TransformNode>();
const mapMeshes = new Map<string, TransformNode>();
const groundEffectMeshes = new Map<string, TransformNode>();
const enemyBars = new Map<string, HTMLElement>();
const playerNameLabels = new Map<string, HTMLElement>();
const input = { up: false, down: false, left: false, right: false };
const autoSwings = new Map<string, number>();
const spinVisuals = new Map<string, number>();
let lastEventId = 0;
let lastUpgradeSignature = "";
let upgradeChoiceInFlight = false;
let selectedClassId = "mage";
let classPreview: TransformNode | null = null;
let previousMatchState: string | null = null;
let audioContext: AudioContext | null = null;
let audioUnlocked = false;
let musicNodes: { oscillators: OscillatorNode[]; gains: GainNode[] } | null = null;
let musicStepTimer: number | null = null;
let lastPlayerFootstepAt = 0;
let lastEnemyFoleyAt = 0;
let reconnectTimer: number | null = null;
let reconnectDelay = 1000;
let hoveredAbilityId: string | null = null;
let hoverRangeRing: Mesh | null = null;

function isLocalhostOnlyUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function connect() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws && ws.readyState !== WebSocket.CLOSED) {
    return;
  }
  ws = new WebSocket(wsUrl);
  ws.addEventListener("open", () => {
    text("connection", "Connected");
    reconnectDelay = 1000;
    flushSendQueue();
  });
  ws.addEventListener("message", (event) => {
    state = JSON.parse(event.data) as Snapshot;
    processEvents(state.events);
    renderUi();
    renderWorld();
  });
  ws.addEventListener("close", () => {
    text("connection", "Disconnected — reconnecting...");
    reconnectTimer = window.setTimeout(() => {
      reconnectDelay = Math.min(8000, reconnectDelay * 1.5);
      connect();
    }, reconnectDelay);
  });
  ws.addEventListener("error", () => {
    text("connection", "Connection error");
  });
}

connect();

const suggestedNames = ["Aldric", "Bruna", "Cassian", "Dorin", "Elena", "Fenn", "Gorath", "Hilde", "Iris", "Joren", "Kira", "Loras", "Mira", "Nox", "Orin", "Petra", "Quinn", "Rook", "Sera", "Thane"];
const slotKeys: Record<number, string> = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "q", 6: "e", 7: "r" };
const keySlots: Record<string, number> = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, KeyQ: 5, KeyE: 6, KeyR: 7 };

function pickSuggestedName() {
  return suggestedNames[Math.floor(Math.random() * suggestedNames.length)] + " " + Math.floor(Math.random() * 99 + 1);
}

function setPlayerName(name: string) {
  const input = document.querySelector<HTMLInputElement>("#playerName")!;
  input.value = name;
  send({ type: "set_name", name: name.trim().slice(0, 18) });
}

function renderNameSuggestions() {
  const container = document.querySelector<HTMLElement>("#nameSuggestions")!;
  const picks = Array.from({ length: 5 }, () => pickSuggestedName());
  container.innerHTML = picks.map((name) => `<button type="button" data-suggested-name="${name}" data-testid="suggested-name">${name}</button>`).join("");
  container.querySelectorAll<HTMLButtonElement>("[data-suggested-name]").forEach((btn) => {
    btn.addEventListener("click", () => {
      unlockAudio();
      playUiClickSound();
      setPlayerName(btn.dataset.suggestedName || "");
    });
  });
}

document.querySelector<HTMLInputElement>("#playerName")!.addEventListener("change", () => {
  setPlayerName(document.querySelector<HTMLInputElement>("#playerName")!.value);
});
document.querySelector<HTMLInputElement>("#playerName")!.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    setPlayerName(document.querySelector<HTMLInputElement>("#playerName")!.value);
    document.querySelector<HTMLInputElement>("#playerName")!.blur();
  }
});

renderNameSuggestions();

document.querySelectorAll<HTMLButtonElement>("[data-class]").forEach((button) => {
  button.addEventListener("click", () => {
    unlockAudio();
    selectedClassId = button.dataset.class || "mage";
    updateClassPreview(selectedClassId);
    send({ type: "select_class", classId: selectedClassId });
  });
});
document.querySelector<HTMLButtonElement>("#ready")!.addEventListener("click", () => { unlockAudio(); playUiClickSound(); send({ type: "ready", ready: true }); });
document.querySelector<HTMLButtonElement>("#restart")!.addEventListener("click", () => { unlockAudio(); playUiClickSound(); send({ type: "restart_match" }); });
document.querySelector<HTMLElement>("#levelPanel")!.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-upgrade]");
  if (button?.dataset.upgrade && !upgradeChoiceInFlight) {
    unlockAudio();
    playUiClickSound();
    upgradeChoiceInFlight = true;
    document.querySelectorAll<HTMLButtonElement>("#levelPanel [data-upgrade]").forEach((upgradeButton) => {
      upgradeButton.disabled = true;
      upgradeButton.classList.add("selectedUpgrade");
    });
    send({ type: "choose_upgrade", upgradeId: button.dataset.upgrade });
  }
});
document.querySelectorAll<HTMLButtonElement>("[data-slot]").forEach((button) => {
  button.addEventListener("click", () => { unlockAudio(); cast(slotNumber(button.dataset.slot)); });
  button.addEventListener("mouseenter", () => showAbilityTooltip(button));
  button.addEventListener("mouseleave", hideAbilityTooltip);
});

window.addEventListener("keydown", (event) => {
  unlockAudio();
  let movementChanged = false;
  if (event.code === "KeyW") input.up = true;
  if (event.code === "KeyS") input.down = true;
  if (event.code === "KeyA") input.left = true;
  if (event.code === "KeyD") input.right = true;
  movementChanged = ["KeyW", "KeyS", "KeyA", "KeyD"].includes(event.code);
  if (event.code === "Space") send({ type: "jump" });
  if (event.code === "Tab") { event.preventDefault(); send({ type: "cycle_target", ally: event.shiftKey }); }
  if (keySlots[event.code]) cast(keySlots[event.code]);
  if (movementChanged) send({ type: "input", movement: input });
});
window.addEventListener("keyup", (event) => {
  let movementChanged = false;
  if (event.code === "KeyW") input.up = false;
  if (event.code === "KeyS") input.down = false;
  if (event.code === "KeyA") input.left = false;
  if (event.code === "KeyD") input.right = false;
  movementChanged = ["KeyW", "KeyS", "KeyA", "KeyD"].includes(event.code);
  if (movementChanged) send({ type: "input", movement: input });
});
setInterval(() => { if (state?.matchState === "running") send({ type: "input", movement: input }); }, 50);

scene.onPointerObservable.add((pointerInfo) => {
  if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) return;
  unlockAudio();
  const pick = scene.pick(scene.pointerX, scene.pointerY);
  const id = pick?.pickedMesh?.metadata?.entityId;
  if (id) send({ type: "select_target", targetId: id });
});

engine.runRenderLoop(() => {
  const me = state?.players[state.you];
  if (me) camera.setTarget(new Vector3(me.position.x, 0, me.position.z));
  updateLobbyPreviewPlacement();
  animateWorld();
  updateHoverRangeIndicator();
  updateCastBar();
  updateAutoAttackBar();
  updateOverheadUi();
  scene.render();
});
updateClassPreview(selectedClassId);
window.addEventListener("resize", () => engine.resize());

function renderUi() {
  if (!state) return;
  const me = state.players[state.you];
  const you = state.you;
  document.body.dataset.mode = state.matchState;
  document.querySelector<HTMLElement>("#lobby")!.style.display = state.matchState === "lobby" ? "block" : "none";
  document.querySelector<HTMLElement>("#hud")!.style.display = state.matchState === "lobby" ? "none" : "block";
  if (classPreview) classPreview.setEnabled(state.matchState === "lobby");
  text("countdown", state.countdown ? `Starting in ${Math.ceil(state.countdown)}` : "");
  document.querySelector("#lobbyPlayers")!.innerHTML = `<h3 data-testid="lobby-player-count">Players connected: ${Object.keys(state.players).length}</h3>` + Object.values(state.players).map((p) => {
    const isYou = p.id === you;
    const className = p.classId ? classInfo[p.classId]?.name || p.classId : "choosing class";
    const status = p.ready ? "Ready" : p.classId ? "Picking..." : "Choosing name/class";
    return `<div class="lobbyPlayer${p.ready ? " ready" : ""}${isYou ? " you" : ""}" data-testid="lobby-player" data-id="${p.id}">
      <b>${p.name}${isYou ? " (you)" : ""}</b>
      <span>${className}</span>
      <span class="lobbyStatus">${status}</span>
    </div>`;
  }).join("");
  document.querySelectorAll<HTMLButtonElement>("[data-class]").forEach((btn) => {
    btn.classList.toggle("selectedClass", btn.dataset.class === (me?.classId || selectedClassId));
  });
  const nameInput = document.querySelector<HTMLInputElement>("#playerName")!;
  const isEditingName = document.activeElement === nameInput;
  if (me && !isEditingName && nameInput.value !== me.name) nameInput.value = me.name;
  if (!me) return;
  text("level", `Level ${me.level}`);
  width("hp", me.hp / me.maxHealth);
  width("res", me.resource / me.maxResource);
  width("xp", (me.xp % 100) / 100);
  text("hpLabel", `HP ${Math.round(me.hp)}/${Math.round(me.maxHealth)}`);
  text("resLabel", `${resourceLabel(me.resourceType)} ${Math.round(me.resource)}/${Math.round(me.maxResource)}`);
  text("xpLabel", `EXP ${me.xp}`);
  renderStatsPanel(me);
  const nextWaveIn = state.wave.nextWaveIn;
  if (state.wave.state === "break" && nextWaveIn !== undefined) {
    text("wave", `Wave ${state.wave.number} cleared • Prepare: ${nextWaveIn.toFixed(1)}s`);
  } else if (state.wave.state === "active" && nextWaveIn !== undefined && nextWaveIn > 0) {
    text("wave", `Wave ${state.wave.number} • ${state.wave.aliveEnemies} enemies • Next wave in ${nextWaveIn.toFixed(1)}s`);
  } else {
    text("wave", `Wave ${state.wave.number} • ${state.wave.aliveEnemies} enemies`);
  }
  document.querySelector("#party")!.innerHTML = Object.values(state.players).map((p) => `<button class="partyFrame" data-testid="party-frame" data-id="${p.id}">${p.name}<br>${p.classId || "No class"}<div class="mini"><span style="width:${Math.max(0, p.hp / p.maxHealth * 100)}%"></span></div>${p.dead ? "Down" : ""}</button>`).join("");
  document.querySelectorAll<HTMLButtonElement>(".partyFrame").forEach((b) => b.onclick = () => send({ type: "select_target", targetId: b.dataset.id }));
  const target = me.targetId ? state.enemies[me.targetId] : me.allyTargetId ? state.players[me.allyTargetId] : null;
  text("target", target ? `${target.name} ${Math.round(target.hp)}/${Math.round(target.maxHealth)}` : "No target");
  for (let slot = 1; slot <= 7; slot++) {
    const abilityId = me.abilities.find((id) => abilitySlot(me, id) === slot);
    const key = slotKeys[slot];
    const btn = document.querySelector<HTMLButtonElement>(`[data-testid="ability-slot-${key}"]`)!;
    const cooldown = abilityId ? me.cooldowns[abilityId] || 0 : 0;
    const globalCooldown = abilityId ? me.globalCooldown || 0 : 0;
    const shownCooldown = Math.max(cooldown, globalCooldown);
    btn.classList.toggle("onCooldown", shownCooldown > 0);
    btn.classList.toggle("globalCooldown", globalCooldown > 0 && cooldown <= globalCooldown);
    btn.firstChild!.textContent = abilityId ? `${key.toUpperCase()} ${state.abilities[abilityId].name}` : `${key.toUpperCase()}`;
    btn.querySelector<HTMLElement>(".cooldownText")!.textContent = shownCooldown > 0 ? formatCooldown(shownCooldown, globalCooldown > 0 && cooldown <= globalCooldown) : "";
    btn.querySelector<HTMLElement>(".cooldownOverlay")!.style.display = shownCooldown > 0 ? "block" : "none";
  }
  const panel = document.querySelector<HTMLElement>("#levelPanel")!;
  const upgradeSignature = me.pendingUpgrades.map((u) => u.id).join(",");
  if (upgradeSignature !== lastUpgradeSignature) {
    panel.innerHTML = me.pendingUpgrades.length ? (() => {
      const stats = me.pendingUpgrades.filter((u) => u.choiceType !== "spell");
      const spells = me.pendingUpgrades.filter((u) => u.choiceType === "spell");
      return `<h2>Choose Upgrade</h2><p>Choose one: max a stat or learn a new ability.</p>` +
        `<div class="upgradeColumns">` +
        `<div class="upgradeCol"><div class="upgradeColTitle">Stats</div>${stats.map((u) => renderLevelChoice(u)).join("")}</div>` +
        `<div class="upgradeCol"><div class="upgradeColTitle">Abilities</div>${spells.map((u) => renderLevelChoice(u)).join("")}</div>` +
        `</div>`;
    })() : "";
    lastUpgradeSignature = upgradeSignature;
    upgradeChoiceInFlight = false;
  }
  panel.style.display = me.pendingUpgrades.length ? "block" : "none";
  const end = document.querySelector<HTMLElement>("#end")!;
  const endTitle = document.querySelector<HTMLElement>("#endTitle")!;
  endTitle.textContent = state.matchState === "victory" ? "Victory" : state.matchState === "defeat" ? "Wipe" : "";
  end.style.display = endTitle.textContent ? "grid" : "none";
  playMatchStateSound(state.matchState);
}

function renderStatsPanel(me: PlayerState) {
  const panel = document.querySelector<HTMLElement>("#statsPanel")!;
  const orderedStats = ["maxHealth", "maxResource", "attackPower", "spellPower", "armor", "resistance", "critChance", "critMultiplier", "moveSpeed", "resourceRegen", "resourceCostMultiplier", "autoAttackDamage", "autoAttackInterval", "autoAttackRange"];
  panel.innerHTML = `<h2>Current Stats</h2>${orderedStats.map((stat) => {
    const value = me.stats?.[stat];
    if (value === undefined) return "";
    return `<div class="statRow"><span>${statLabel(stat)}</span><b>${formatStat(stat, value)}</b></div>`;
  }).join("")}`;
}

function renderLevelChoice(choice: Upgrade) {
  if (choice.choiceType === "spell" && choice.abilityId && state?.abilities[choice.abilityId]) {
    const ability = state.abilities[choice.abilityId];
    return `<button class="spellChoice" data-upgrade="${choice.id}"><b>${choice.name}</b><span>${ability.description || choice.description || abilityDescription(choice.abilityId)}</span></button>`;
  }
  return `<button data-upgrade="${choice.id}">${choice.name}</button>`;
}

function abilitySlot(player: PlayerState, abilityId: string) {
  return player.abilitySlots?.[abilityId] ?? state?.abilities[abilityId]?.slot;
}

function slotNumber(slot: string | undefined) {
  if (!slot) return NaN;
  if (slot === "q") return 5;
  if (slot === "e") return 6;
  if (slot === "r") return 7;
  return Number(slot);
}

function resourceLabel(resourceType: string | null) {
  if (!resourceType) return "Resource";
  return resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
}

function statLabel(stat: string) {
  const labels: Record<string, string> = {
    maxHealth: "Max HP",
    maxResource: "Max Resource",
    attackPower: "Attack Power",
    spellPower: "Spell Power",
    armor: "Armor",
    resistance: "Resistance",
    critChance: "Crit Chance",
    critMultiplier: "Crit Multiplier",
    moveSpeed: "Move Speed",
    resourceRegen: "Resource Regen",
    resourceCostMultiplier: "Resource Costs",
    autoAttackDamage: "Auto Damage",
    autoAttackInterval: "Auto Speed",
    autoAttackRange: "Auto Range"
  };
  return labels[stat] || stat;
}

function formatStat(stat: string, value: number) {
  if (stat === "critChance") return `${Math.round(value * 100)}%`;
  if (stat === "resourceCostMultiplier") return `${Math.round(value * 100)}%`;
  if (stat === "critMultiplier") return `${value.toFixed(1)}x`;
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function formatCooldown(value: number, global: boolean) {
  if (global && value < 1) return value.toFixed(1);
  return `${Math.ceil(value)}`;
}

function processEvents(events: CombatEvent[]) {
  if (!state) return;
  for (const event of events) {
    if (!event.id || event.id <= lastEventId) continue;
    lastEventId = event.id;
    if (event.type === "cast") { playChargeEffect(event); playCastStartSound(event); }
    if (event.type === "auto_attack") playAutoAttackEffect(event);
    if (event.type === "cast_complete") { playCastEffect(event); playCastReleaseSound(event); }
    if (event.type === "status") {
      if (event.abilityId?.includes("whirlwind") && event.sourceId) spinVisuals.set(event.sourceId, performance.now() + (event.duration || 3) * 1000);
      playStatusEffect(event); playStatusSound(event);
    }
    if (event.type === "damage") { playImpactEffect(event, false); playHitSound(event); }
    if (event.type === "heal") { playImpactEffect(event, true); playHealSound(); }
  }
}

function showAbilityTooltip(button: HTMLButtonElement) {
  if (!state) return;
  const me = state.players[state.you];
  const slot = slotNumber(button.dataset.slot);
  const abilityId = me?.abilities.find((id) => abilitySlot(me, id) === slot);
  if (!abilityId) return;
  hoveredAbilityId = abilityId;
  const ability = state.abilities[abilityId];
  const tooltip = document.querySelector<HTMLElement>("#abilityTooltip")!;
  const cost = currentAbilityCost(me, ability);
  const effectText = (ability.effects || []).map((effect) => {
    const amount = effect.amount || 0;
    const scaling = effect.scaling;
    const scaled = scaling ? me.stats[scaling.stat] * scaling.coefficient : 0;
    const total = Math.round((amount + scaled) * 10) / 10;
    if (effect.type === "damage") return `Damage: ${total} ${effect.school || ""}${effect.radius ? ` in ${effect.radius}m` : ""}`;
    if (effect.type === "aura_damage") return `Aura damage: ${total} every ${effect.tickInterval || 0}s for ${effect.duration || 0}s`;
    if (effect.type === "dot") return `DoT: ${total} ${effect.school || ""} over ${effect.duration || 0}s${effect.radius ? ` in ${effect.radius}m` : ""}`;
    if (effect.type === "heal") return `Heal: ${total}${effect.radius ? ` in ${effect.radius}m` : ""}`;
    if (effect.type === "hot") return `Heal over time: ${total}/tick for ${effect.duration || 0}s`;
    if (effect.type === "shield") return `Shield: ${total}`;
    if (effect.type === "stun") return `Freeze/Stun: ${effect.duration || 0}s${effect.radius ? ` in ${effect.radius}m` : ""}`;
    if (effect.type === "resource") return `Restore: ${total} resource`;
    if (effect.type === "auto_haste") return `Auto-shot speed x${(effect as any).multiplier || 1} for ${effect.duration || 0}s`;
    if (effect.type === "trap") return `Trap: ${total} damage, triggers in ${effect.radius || 0}m`;
    if (effect.type === "slow") return `Slow: ${Math.round((effect.slowPercent || 0) * 100)}% for ${effect.duration || 0}s`;
    return effect.type;
  }).join(" • ");
  tooltip.innerHTML = `<h3>${ability.name}</h3><p>${abilityDescription(abilityId)}</p><div>Cost: <b>${cost} ${resourceLabel(ability.resourceCost?.type || "resource")}</b></div><div>Cast: <b>${ability.castTime || 0}s</b> • Range: <b>${ability.range || "-"}</b></div>${effectText ? `<div>${effectText}</div>` : ""}`;
  const rect = button.getBoundingClientRect();
  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top - 12}px`;
  tooltip.style.display = "block";
}

function hideAbilityTooltip() {
  hoveredAbilityId = null;
  hoverRangeRing?.dispose();
  hoverRangeRing = null;
  document.querySelector<HTMLElement>("#abilityTooltip")!.style.display = "none";
}

function updateHoverRangeIndicator() {
  const me = state ? state.players[state.you] : null;
  const ability = hoveredAbilityId && state ? state.abilities[hoveredAbilityId] : null;
  if (!me || !ability || state?.matchState !== "running") {
    hoverRangeRing?.dispose();
    hoverRangeRing = null;
    return;
  }
  const radius = abilityIndicatorRadius(ability);
  if (radius <= 0) {
    hoverRangeRing?.dispose();
    hoverRangeRing = null;
    return;
  }
  if (!hoverRangeRing || hoverRangeRing.metadata?.radius !== radius) {
    hoverRangeRing?.dispose();
    hoverRangeRing = MeshBuilder.CreateTorus("hover-range-ring", { diameter: radius * 2, thickness: 0.08, tessellation: 96 }, scene);
    const material = transparentMat("hover-range-ring-mat", effectColor(ability.id, ability.effects?.[0]?.school || ""), 0.55);
    material.emissiveColor = material.diffuseColor.scale(0.8);
    hoverRangeRing.material = material;
    hoverRangeRing.isPickable = false;
    hoverRangeRing.metadata = { radius };
  }
  hoverRangeRing.position.set(me.position.x, 0.08, me.position.z);
}

function abilityIndicatorRadius(ability: Ability) {
  if ((ability.range || 0) > 0) return ability.range || 0;
  return Math.max(0, ...(ability.effects || []).map((effect) => effect.radius || 0));
}

function currentAbilityCost(player: PlayerState, ability: Ability) {
  const cost = ability.resourceCost;
  if (!cost) return 0;
  const multiplier = player.stats.resourceCostMultiplier || 1;
  return Math.round(cost.amount * multiplier * 10) / 10;
}

function abilityDescription(abilityId: string) {
  const dataDescription = state?.abilities[abilityId]?.description;
  if (dataDescription) return dataDescription;
  const descriptions: Record<string, string> = {
    warrior_strike: "A direct melee strike that spends Rage for heavy physical damage.",
    warrior_taunting_blow: "A threatening melee blow that forces attention and creates massive threat.",
    hunter_power_shot: "A charged ranged shot with high physical damage.",
    hunter_quick_shot: "A fast cheap shot for steady pressure.",
    priest_heal: "A holy cast that restores an ally and creates healer threat.",
    priest_smite: "A holy bolt that damages one enemy.",
    mage_fireball: "Launches a fire bolt that bursts, then burns the enemy over time.",
    mage_frostbolt: "Fires an icy bolt that damages and slows the enemy for 3 seconds.",
    mage_frost_nova: "Freeze nearby enemies to the ground for 2 seconds.",
    mage_meteor: "Call down a fiery impact that damages and burns an area.",
    mage_arcane_blast: "Release a costly arcane shockwave that damages nearby enemies.",
    warrior_whirlwind: "Spin for 3 seconds, damaging nearby enemies every 0.5 seconds.",
    warrior_shield_wall: "Absorb incoming damage with a defensive wall.",
    warrior_concussive_slam: "Stun one enemy with a high-threat slam.",
    hunter_multishot: "Hit clustered enemies with a fan of arrows.",
    hunter_snare_trap: "Place a visible trap that snaps shut when an enemy steps in.",
    hunter_adrenaline: "Triple auto-shot speed for 3 seconds.",
    priest_renew: "Heal an ally over time.",
    priest_sanctify: "Heal allies and burn enemies around you.",
    priest_barrier: "Shield an ally from damage."
  };
  return descriptions[abilityId] || "A class ability.";
}

function updateClassPreview(classId: string) {
  classPreview?.dispose();
  classPreview = createPreviewModel(classId);
  classPreview.scaling.setAll(2.2);
  updateLobbyPreviewPlacement();
  const info = classInfo[classId];
  document.querySelector("#classPreviewInfo")!.innerHTML = `<h2>${info.name}</h2><p>${info.description}</p>${info.stats.map((stat) => `<div>${stat}</div>`).join("")}`;
}

function updateLobbyPreviewPlacement() {
  if (!classPreview || state?.matchState !== "lobby") return;
  const forward = camera.getForwardRay(1).direction;
  const right = camera.getDirection(Vector3.Right());
  const up = camera.getDirection(Vector3.Up());
  classPreview.position = camera.position.add(forward.scale(17)).add(right.scale(6.6)).add(up.scale(1.9));
  classPreview.rotation.y += 0.01;
}

function createPreviewModel(classId: string) {
  const fake: PlayerState = { id: `preview-${classId}`, name: classInfo[classId].name, classId, ready: false, hp: 1, maxHealth: 1, resource: 0, maxResource: 1, resourceType: null, level: 1, xp: 0, dead: false, targetId: null, allyTargetId: null, position: { x: 0, z: 0 }, facing: 0, jumping: false, jumpProgress: 0, abilities: [], cooldowns: {}, globalCooldown: 0, autoAttack: { remaining: 0, interval: 1, progress: 0 }, pendingUpgrades: [], stats: {}, casting: null };
  const preview = createPlayer(fake);
  meshes.delete(fake.id);
  preview.getChildMeshes().forEach((mesh) => mesh.metadata = null);
  return preview;
}

function updateCastBar() {
  const cast = document.querySelector<HTMLElement>("#cast")!;
  const fill = document.querySelector<HTMLElement>("#castFill")!;
  const me = state?.players[state.you];
  if (!me?.casting) {
    cast.style.display = "none";
    return;
  }
  const ability = state?.abilities[me.casting.abilityId];
  cast.style.display = "block";
  fill.style.width = `${Math.max(0, Math.min(1, me.casting.progress)) * 100}%`;
  text("castName", ability?.name || "Casting");
}

function updateAutoAttackBar() {
  const fill = document.querySelector<HTMLElement>("#swing")!;
  const label = document.querySelector<HTMLElement>("#swingLabel")!;
  const me = state?.players[state.you];
  const canAuto = Boolean(me?.classId);
  if (!me || !canAuto) {
    fill.style.width = "0%";
    label.textContent = "No auto attack";
    return;
  }
  fill.style.width = `${Math.max(0, Math.min(1, me.autoAttack?.progress || 0)) * 100}%`;
  label.textContent = me.autoAttack?.remaining ? `Auto ${me.autoAttack.remaining.toFixed(1)}s` : "Auto ready";
}

function renderWorld() {
  if (!state) return;
  renderMapObjects();
  renderGroundEffects();
  const live = new Set([...Object.keys(state.players), ...Object.keys(state.enemies)]);
  for (const [id, node] of meshes) if (!live.has(id)) { node.dispose(); meshes.delete(id); removeEnemyBar(id); }
  for (const p of Object.values(state.players)) {
    let node = meshes.get(p.id);
    if (node && node.metadata?.classId !== p.classId) {
      node.dispose();
      meshes.delete(p.id);
      node = undefined;
    }
    node ||= createPlayer(p);
    const previousX = node.metadata?.x ?? p.position.x;
    const previousZ = node.metadata?.z ?? p.position.z;
    node.position.x = p.position.x;
    node.position.z = p.position.z;
    const jumpY = p.jumping ? 4 * Math.max(0, p.jumpProgress) * Math.max(0, 1 - p.jumpProgress) * 0.9 : 0;
    node.position.y = p.dead ? -0.2 : jumpY;
    node.setEnabled(state.matchState !== "lobby");
    const dx = p.position.x - previousX;
    const dz = p.position.z - previousZ;
    const moving = Math.hypot(dx, dz) > 0.03;
    if (moving) {
      node.rotation.y = Math.atan2(dx, dz);
    } else if (Math.abs(p.facing) > 0.01 || p.facing !== 0) {
      node.rotation.y = p.facing;
    }
    node.metadata = { ...(node.metadata || {}), x: p.position.x, z: p.position.z, moving, entityId: p.id, classId: p.classId };
    updateSelectionRing(node, p.id === state.you ? "self" : meTargetKind(p.id));
    updateActiveShield(node, p);
  }
  for (const e of Object.values(state.enemies)) {
    const node = meshes.get(e.id) || createEnemy(e);
    node.position.x = e.position.x;
    node.position.z = e.position.z;
    node.metadata = { ...(node.metadata || {}), entityId: e.id };
    updateSelectionRing(node, meTargetKind(e.id));
    updateEnemyFov(node, e);
  }
}

function updateActiveShield(node: TransformNode, player: PlayerState) {
  const existing = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-active-shield"));
  const shieldActive = (player.shield || 0) > 0 && (player.shieldRemaining || 0) > 0;
  if (!shieldActive) {
    existing?.dispose();
    return;
  }
  if (existing) return;
  const bubble = MeshBuilder.CreateSphere(`${player.id}-active-shield`, { diameter: 2.15, segments: 16 }, scene);
  bubble.parent = node;
  bubble.position.y = 0.96;
  const material = transparentMat(`${player.id}-active-shield-mat`, new Color3(1, 0.86, 0.18), 0.22);
  material.emissiveColor = new Color3(0.75, 0.48, 0.05);
  bubble.material = material;
  bubble.isPickable = false;
}

function renderGroundEffects() {
  if (!state) return;
  const live = new Set((state.groundEffects || []).map((effect) => effect.id));
  for (const [id, node] of groundEffectMeshes) {
    if (!live.has(id)) {
      node.dispose();
      groundEffectMeshes.delete(id);
    }
  }
  for (const effect of state.groundEffects || []) {
    let node = groundEffectMeshes.get(effect.id);
    if (!node) {
      node = createGroundEffect(effect);
      groundEffectMeshes.set(effect.id, node);
    }
    node.position.x = effect.x;
    node.position.z = effect.z;
    node.metadata = { ...(node.metadata || {}), remaining: effect.remaining };
  }
}

function createGroundEffect(effect: GroundEffect) {
  const root = new TransformNode(effect.id, scene);
  if (effect.type === "trap") {
    const disc = MeshBuilder.CreateCylinder(`${effect.id}-disc`, { diameter: effect.radius * 2, height: 0.035, tessellation: 48 }, scene);
    disc.parent = root;
    disc.position.y = 0.035;
    disc.material = transparentMat(`${effect.id}-disc-mat`, new Color3(0.32, 0.95, 0.22), 0.22);
    const jawA = box(`${effect.id}-jaw-a`, { width: effect.radius * 1.2, height: 0.12, depth: 0.18 }, new Color3(0.12, 0.28, 0.08));
    jawA.parent = root;
    jawA.position.set(0, 0.12, effect.radius * 0.24);
    const jawB = box(`${effect.id}-jaw-b`, { width: effect.radius * 1.2, height: 0.12, depth: 0.18 }, new Color3(0.12, 0.28, 0.08));
    jawB.parent = root;
    jawB.position.set(0, 0.12, -effect.radius * 0.24);
    for (let i = 0; i < 6; i++) {
      const tooth = MeshBuilder.CreateCylinder(`${effect.id}-tooth-${i}`, { diameterTop: 0, diameterBottom: 0.12, height: 0.32, tessellation: 4 }, scene);
      tooth.parent = root;
      tooth.position.set(-effect.radius * 0.48 + i * effect.radius * 0.19, 0.26, effect.radius * 0.24);
      tooth.material = mat(`${effect.id}-tooth-${i}-mat`, new Color3(0.75, 0.86, 0.55));
    }
  }
  return root;
}

function renderMapObjects() {
  if (!state) return;
  const live = new Set((state.mapObjects || []).map((object) => object.id));
  for (const [id, node] of mapMeshes) {
    if (!live.has(id)) {
      node.dispose();
      mapMeshes.delete(id);
    }
  }
  for (const object of state.mapObjects || []) {
    const signature = mapObjectSignature(object);
    const existing = mapMeshes.get(object.id);
    if (existing?.metadata?.signature === signature) continue;
    existing?.dispose();
    const node = createMapObject(object);
    node.position.x = object.x;
    node.position.z = object.z;
    node.metadata = { signature };
    mapMeshes.set(object.id, node);
    node.getChildMeshes().forEach((mesh) => {
      mesh.receiveShadows = true;
      shadowGenerator.addShadowCaster(mesh);
    });
  }
}

function mapObjectSignature(object: MapObject) {
  return [object.type, object.x, object.z, object.radius, object.width, object.depth, object.variant, object.blocksSight].join(":");
}

function createMapObject(object: MapObject) {
  const root = new TransformNode(object.id, scene);
  if (object.type === "wall") {
    const wallHeight = 3.2;
    const wall = box(`${object.id}-body`, { width: object.width || 1, height: wallHeight, depth: object.depth || 1 }, new Color3(0.42, 0.43, 0.48));
    wall.parent = root;
    wall.position.y = wallHeight / 2;
    const cap = box(`${object.id}-cap`, { width: (object.width || 1) + 0.22, height: 0.22, depth: (object.depth || 1) + 0.22 }, new Color3(0.55, 0.56, 0.62));
    cap.parent = root;
    cap.position.y = wallHeight + 0.11;
    const band = box(`${object.id}-band`, { width: (object.width || 1) + 0.06, height: 0.18, depth: (object.depth || 1) + 0.06 }, new Color3(0.28, 0.29, 0.34));
    band.parent = root;
    band.position.y = wallHeight * 0.55;
  } else if (object.type === "tree") {
    const variant = object.variant || 0;
    const scale = (object.radius || 1.0) / 1.0;
    const trunkColor = new Color3(0.34 + variant * 0.03, 0.18, 0.08);
    const trunk = MeshBuilder.CreateCylinder(`${object.id}-trunk`, { diameter: 0.5 + variant * 0.08, height: 1.6 + variant * 0.2, tessellation: 8 }, scene);
    trunk.parent = root;
    trunk.position.y = (1.6 + variant * 0.2) / 2;
    trunk.material = mat(`${object.id}-trunk-mat`, trunkColor);
    const crownColor = variant === 1 ? new Color3(0.12, 0.45, 0.18) : variant === 2 ? new Color3(0.06, 0.38, 0.14) : variant === 3 ? new Color3(0.18, 0.42, 0.1) : variant === 4 ? new Color3(0.08, 0.35, 0.16) : new Color3(0.08, 0.42, 0.16);
    if (variant === 4) {
      // Ancient tree: wide layered crown
      const lower = MeshBuilder.CreateCylinder(`${object.id}-crown-lower`, { diameterTop: 1.8, diameterBottom: 3.4, height: 1.6, tessellation: 8 }, scene);
      lower.parent = root; lower.position.y = 2.4; lower.material = mat(`${object.id}-crown-lower-mat`, crownColor);
      const upper = MeshBuilder.CreateCylinder(`${object.id}-crown-upper`, { diameterTop: 0.9, diameterBottom: 2.2, height: 1.4, tessellation: 8 }, scene);
      upper.parent = root; upper.position.y = 3.6; upper.material = mat(`${object.id}-crown-upper-mat`, crownColor);
    } else if (variant === 0) {
      const crown = MeshBuilder.CreateCylinder(`${object.id}-crown`, { diameterTop: 0.75, diameterBottom: 2.35, height: 2.35, tessellation: 7 }, scene);
      crown.parent = root; crown.position.y = 2.7; crown.material = mat(`${object.id}-crown-mat`, crownColor);
    } else {
      const crown = MeshBuilder.CreateSphere(`${object.id}-crown`, { diameter: 2.2 + variant * 0.15, segments: 7 }, scene);
      crown.parent = root; crown.position.y = 2.6; crown.material = mat(`${object.id}-crown-mat`, crownColor);
    }
    root.scaling.setAll(scale);
  } else if (object.type === "bush") {
    const variant = object.variant || 0;
    const bushColor = variant === 1 ? new Color3(0.18, 0.52, 0.12) : variant === 2 ? new Color3(0.35, 0.55, 0.14) : new Color3(0.14, 0.48, 0.16);
    const bush = MeshBuilder.CreateSphere(`${object.id}-bush`, { diameter: 1.2 + (object.radius || 0.7) * 0.6, segments: 6 }, scene);
    bush.parent = root;
    bush.position.y = 0.45 + (object.radius || 0.7) * 0.25;
    bush.material = mat(`${object.id}-bush-mat`, bushColor);
    const berries = variant === 2 ? MeshBuilder.CreateSphere(`${object.id}-berries`, { diameter: 0.16, segments: 5 }, scene) : null;
    if (berries) {
      berries.parent = root;
      berries.position.set(0.25, 0.7, 0.1);
      berries.material = mat(`${object.id}-berries-mat`, new Color3(0.85, 0.2, 0.25));
    }
  } else if (object.type === "crystal") {
    const crystal = MeshBuilder.CreateCylinder(`${object.id}-crystal`, { diameterTop: 0.18, diameterBottom: 1.15, height: 2.65, tessellation: 5 }, scene);
    crystal.parent = root;
    crystal.position.y = 1.32;
    crystal.rotation.y = Math.PI / 5;
    const material = mat(`${object.id}-crystal-mat`, new Color3(0.3, 0.92, 1));
    material.emissiveColor = new Color3(0.08, 0.38, 0.48);
    crystal.material = material;
  } else if (object.type === "well") {
    const well = MeshBuilder.CreateCylinder(`${object.id}-well`, { diameter: 2.45, height: 1.0, tessellation: 18 }, scene);
    well.parent = root;
    well.position.y = 0.5;
    well.material = mat(`${object.id}-well-mat`, new Color3(0.48, 0.5, 0.55));
    const water = MeshBuilder.CreateCylinder(`${object.id}-water`, { diameter: 1.85, height: 0.04, tessellation: 18 }, scene);
    water.parent = root;
    water.position.y = 1.03;
    water.material = transparentMat(`${object.id}-water-mat`, new Color3(0.22, 0.62, 1), 0.58);
  } else {
    const pillar = MeshBuilder.CreateCylinder(`${object.id}-pillar`, { diameter: (object.radius || 1) * 1.35, height: 2.9, tessellation: 10 }, scene);
    pillar.parent = root;
    pillar.position.y = 1.45;
    pillar.material = mat(`${object.id}-pillar-mat`, new Color3(0.58, 0.57, 0.52));
  }
  return root;
}

function meTargetKind(id: string): "enemy" | "ally" | "none" {
  const me = state?.players[state.you];
  if (!me) return "none";
  if (me.targetId === id) return "enemy";
  if (me.allyTargetId === id) return "ally";
  return "none";
}

function updateSelectionRing(node: TransformNode, kind: "self" | "enemy" | "ally" | "none") {
  const ring = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-ring"));
  if (!ring) return;
  const material = ring.material as StandardMaterial;
  const colors = {
    self: playerColor3(node.name),
    enemy: new Color3(1, 0.05, 0.03),
    ally: new Color3(1, 0.78, 0.18),
    none: new Color3(0.35, 0.38, 0.45)
  };
  material.diffuseColor = colors[kind];
  material.emissiveColor = kind === "none" ? Color3.Black() : colors[kind].scale(0.3);
  material.alpha = kind === "none" ? 0.12 : kind === "enemy" ? 0.28 : 0.24;
  const scale = kind === "enemy" || kind === "ally" ? 1.45 + Math.sin(performance.now() / 120) * 0.05 : kind === "self" ? 1.12 : 1;
  ring.scaling.set(scale, 1, scale);
  ring.isVisible = kind !== "none" || node.name.startsWith(state?.you || "---");
}

function updateEnemyFov(node: TransformNode, enemy: EnemyState) {
  const cone = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-fov")) || createFovCone(`${enemy.id}-fov`);
  cone.parent = node;
  cone.position.set(0, 0.025, 0);
  cone.rotation.y = enemy.facing || 0;
  const material = cone.material as StandardMaterial;
  const color = enemy.alerted ? new Color3(1, 0.18, 0.08) : new Color3(1, 0.72, 0.18);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(0.22);
  material.alpha = enemy.alerted ? 0.34 : 0.22;
}

function createFovCone(name: string) {
  const mesh = new Mesh(name, scene);
  const range = 12.5;
  const halfAngle = Math.PI * 62 / 180;
  const segments = 24;
  const positions = [0, 0, 0];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = -halfAngle + (halfAngle * 2 * i) / segments;
    positions.push(Math.sin(angle) * range, 0, Math.cos(angle) * range);
    if (i > 0) indices.push(0, i, i + 1);
  }
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh);
  mesh.material = transparentMat(`${name}-mat`, new Color3(1, 0.7, 0.1), 0.22);
  (mesh.material as StandardMaterial).backFaceCulling = false;
  mesh.isPickable = false;
  return mesh;
}

function animateWorld() {
  const t = performance.now() / 1000;
  let playerIsMoving = false;
  for (const [id, node] of meshes) {
    if (!state?.players[id]) continue;
    const player = state.players[id];
    const moving = Boolean(node.metadata?.moving);
    if (id === state.you && moving && state.matchState === "running") playerIsMoving = true;
    const spinning = (spinVisuals.get(id) || 0) > performance.now();
    if (spinning) node.rotation.y += 0.34;
    const casting = Boolean(player.casting);
    const autoSwing = Math.max(0, (autoSwings.get(id) || 0) - performance.now()) / 320;
    const body = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-body"));
    const head = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-head"));
    const leftArm = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-left-arm"));
    const rightArm = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-right-arm"));
    const bob = moving ? Math.abs(Math.sin(t * 10)) * 0.12 : Math.sin(t * 2) * 0.025;
    if (body) {
      body.position.y = 0.7 + bob;
      body.rotation.z = moving ? Math.sin(t * 10) * 0.08 : 0;
    }
    if (head) head.position.y = 1.45 + bob * 0.8;
    if (leftArm && rightArm) {
      if (spinning) {
        leftArm.rotation.x = -1.35;
        rightArm.rotation.x = -1.35;
        leftArm.rotation.z = -0.75;
        rightArm.rotation.z = 0.75;
      } else if (casting) {
        const pulse = Math.sin(t * 14) * 0.12;
        leftArm.rotation.x = -1.95 + pulse;
        rightArm.rotation.x = -1.95 - pulse;
        leftArm.rotation.z = -0.55;
        rightArm.rotation.z = 0.55;
        leftArm.position.y = 1.1 + Math.abs(pulse) * 0.25;
        rightArm.position.y = 1.1 + Math.abs(pulse) * 0.25;
      } else if (autoSwing > 0) {
        const swing = Math.sin((1 - autoSwing) * Math.PI);
        rightArm.rotation.x = -1.6 * swing - 0.18;
        rightArm.rotation.z = 0.35 + swing * 0.35;
        leftArm.rotation.x = moving ? Math.sin(t * 10) * 0.35 : -0.05;
        leftArm.rotation.z = -0.16;
        rightArm.position.y = 0.95 + swing * 0.18 + bob * 0.45;
        leftArm.position.y = 0.92 + bob * 0.6;
      } else {
        leftArm.rotation.x = moving ? Math.sin(t * 10) * 0.55 : -0.06;
        rightArm.rotation.x = moving ? -Math.sin(t * 10) * 0.55 : -0.06;
        leftArm.rotation.z = -0.16;
        rightArm.rotation.z = 0.16;
        leftArm.position.y = 0.92 + bob * 0.6;
        rightArm.position.y = 0.92 + bob * 0.6;
      }
    }
    const shield = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-active-shield"));
    if (shield) {
      const pulse = 1 + Math.sin(t * 8) * 0.045;
      shield.scaling.setAll(pulse);
    }
  }
  for (const [id, node] of meshes) {
    const enemy = state?.enemies[id];
    if (!enemy) continue;
    const body = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-body"));
    const head = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-head"));
    const leftFist = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-left-fist") || mesh.name.endsWith("-left-claw"));
    const rightFist = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-right-fist") || mesh.name.endsWith("-right-claw"));
    const speedBob = enemy.alerted ? 8.5 : 3.5;
    const bob = Math.abs(Math.sin(t * speedBob + id.length)) * (enemy.alerted ? 0.13 : 0.055);
    if (body) {
      body.position.y = Number(body.metadata?.baseY || body.position.y) + bob;
      body.rotation.z = Math.sin(t * speedBob + id.length) * (enemy.alerted ? 0.08 : 0.03);
    }
    if (head) head.position.y = Number(head.metadata?.baseY || head.position.y) + bob * 0.8;
    if (leftFist) leftFist.rotation.x = Math.sin(t * speedBob) * 0.55;
    if (rightFist) rightFist.rotation.x = -Math.sin(t * speedBob) * 0.55;
  }
  playAmbientFoley(playerIsMoving);
}

function createPlayer(p: PlayerState) {
  const root = new TransformNode(p.id, scene);
  root.metadata = { entityId: p.id, classId: p.classId };
  const color = p.classId === "warrior" ? new Color3(0.7, 0.15, 0.1) : p.classId === "hunter" ? new Color3(0.1, 0.45, 0.18) : p.classId === "priest" ? new Color3(0.95, 0.9, 0.72) : new Color3(0.15, 0.2, 0.85);
  const body = box(`${p.id}-body`, { width: 0.8, height: 1.0, depth: 0.45 }, color); body.parent = root; body.position.y = 0.7;
  const head = box(`${p.id}-head`, { width: 0.52, height: 0.45, depth: 0.52 }, new Color3(0.85, 0.64, 0.45)); head.parent = root; head.position.y = 1.45;
  const leftArm = box(`${p.id}-left-arm`, { width: 0.2, height: 0.74, depth: 0.22 }, color.scale(0.85)); leftArm.parent = root; leftArm.position.set(-0.58, 0.92, 0); leftArm.rotation.z = -0.16;
  const rightArm = box(`${p.id}-right-arm`, { width: 0.2, height: 0.74, depth: 0.22 }, color.scale(0.85)); rightArm.parent = root; rightArm.position.set(0.58, 0.92, 0); rightArm.rotation.z = 0.16;
  addClassDetails(root, p.id, p.classId, color);
  const ring = MeshBuilder.CreateCylinder(`${p.id}-ring`, { diameter: 1.45, height: 0.025, tessellation: 48 }, scene); ring.parent = root; ring.material = transparentMat(`${p.id}-ringmat`, new Color3(0.1, 0.55, 1), 0.22); ring.metadata = { entityId: p.id };
  ring.position.y = 0.015;
  root.getChildMeshes().forEach((mesh) => shadowGenerator.addShadowCaster(mesh));
  meshes.set(p.id, root);
  markEntityMeshes(root, p.id);
  return root;
}

function markEntityMeshes(root: TransformNode, entityId: string) {
  root.metadata = { ...(root.metadata || {}), entityId };
  root.getChildMeshes().forEach((mesh) => {
    mesh.metadata = { ...(mesh.metadata || {}), entityId };
  });
}

function addClassDetails(root: TransformNode, id: string, classId: string | null, baseColor: Color3) {
  if (classId === "warrior") {
    const leftShoulder = box(`${id}-left-shoulder`, { width: 0.34, height: 0.2, depth: 0.38 }, new Color3(0.42, 0.42, 0.46)); leftShoulder.parent = root; leftShoulder.position.set(-0.52, 1.23, 0);
    const rightShoulder = box(`${id}-right-shoulder`, { width: 0.34, height: 0.2, depth: 0.38 }, new Color3(0.42, 0.42, 0.46)); rightShoulder.parent = root; rightShoulder.position.set(0.52, 1.23, 0);
    const sword = box(`${id}-sword`, { width: 0.1, height: 1.1, depth: 0.08 }, new Color3(0.8, 0.82, 0.86)); sword.parent = root; sword.position.set(0.72, 0.8, -0.16); sword.rotation.z = -0.35;
    const shield = box(`${id}-shield`, { width: 0.5, height: 0.64, depth: 0.12 }, new Color3(0.24, 0.26, 0.32)); shield.parent = root; shield.position.set(-0.75, 0.86, -0.02); shield.rotation.z = 0.22;
    const crest = box(`${id}-shield-crest`, { width: 0.18, height: 0.42, depth: 0.13 }, new Color3(0.95, 0.78, 0.16)); crest.parent = root; crest.position.set(-0.76, 0.86, -0.09); crest.rotation.z = 0.22;
  } else if (classId === "hunter") {
    const quiver = box(`${id}-quiver`, { width: 0.28, height: 0.82, depth: 0.24 }, new Color3(0.32, 0.18, 0.08)); quiver.parent = root; quiver.position.set(-0.28, 0.95, -0.34); quiver.rotation.z = 0.25;
    const bow = MeshBuilder.CreateTorus(`${id}-bow`, { diameter: 0.72, thickness: 0.035, tessellation: 24 }, scene); bow.parent = root; bow.position.set(0.74, 0.93, 0.08); bow.rotation.z = Math.PI / 2; bow.scaling.y = 1.8; bow.material = mat(`${id}-bow-mat`, new Color3(0.42, 0.24, 0.1));
    for (let i = 0; i < 3; i++) { const arrow = box(`${id}-quiver-arrow-${i}`, { width: 0.035, height: 0.58, depth: 0.035 }, new Color3(0.92, 0.82, 0.58)); arrow.parent = root; arrow.position.set(-0.35 + i * 0.07, 1.36, -0.42); arrow.rotation.z = 0.22; }
    const hood = MeshBuilder.CreateCylinder(`${id}-hood`, { diameterTop: 0.34, diameterBottom: 0.62, height: 0.32, tessellation: 6 }, scene); hood.parent = root; hood.position.y = 1.65; hood.material = mat(`${id}-hood-mat`, baseColor.scale(0.75));
  } else if (classId === "priest") {
    const halo = MeshBuilder.CreateTorus(`${id}-halo`, { diameter: 0.68, thickness: 0.035, tessellation: 36 }, scene); halo.parent = root; halo.position.y = 1.85; halo.rotation.x = Math.PI / 2; halo.material = mat(`${id}-halo-mat`, new Color3(1, 0.86, 0.28));
    const sash = box(`${id}-sash`, { width: 0.14, height: 1.08, depth: 0.48 }, new Color3(0.95, 0.78, 0.22)); sash.parent = root; sash.position.y = 0.72; sash.rotation.z = -0.28;
    const book = box(`${id}-book`, { width: 0.34, height: 0.24, depth: 0.1 }, new Color3(0.42, 0.18, 0.09)); book.parent = root; book.position.set(-0.72, 0.88, -0.08); book.rotation.z = -0.15;
    const stole = box(`${id}-stole`, { width: 0.46, height: 0.08, depth: 0.5 }, new Color3(1, 0.95, 0.72)); stole.parent = root; stole.position.y = 1.18;
  } else {
    const hat = MeshBuilder.CreateCylinder(`${id}-hat`, { diameterTop: 0.08, diameterBottom: 0.72, height: 0.72, tessellation: 4 }, scene); hat.parent = root; hat.position.y = 1.95; hat.rotation.y = Math.PI / 4; hat.material = mat(`${id}-hat-mat`, baseColor.scale(0.7));
    const staff = box(`${id}-staff`, { width: 0.08, height: 1.45, depth: 0.08 }, new Color3(0.38, 0.2, 0.08)); staff.parent = root; staff.position.set(0.74, 0.86, 0.05); staff.rotation.z = 0.18;
    const gem = MeshBuilder.CreateSphere(`${id}-staff-gem`, { diameter: 0.22, segments: 8 }, scene); gem.parent = root; gem.position.set(0.88, 1.58, 0.05); gem.material = mat(`${id}-staff-gem-mat`, new Color3(0.45, 0.95, 1));
    const cape = box(`${id}-cape`, { width: 0.72, height: 0.92, depth: 0.08 }, baseColor.scale(0.48)); cape.parent = root; cape.position.set(0, 0.78, 0.33); cape.rotation.x = -0.12;
    const beltGem = MeshBuilder.CreateSphere(`${id}-belt-gem`, { diameter: 0.16, segments: 8 }, scene); beltGem.parent = root; beltGem.position.set(0, 0.72, -0.26); beltGem.material = mat(`${id}-belt-gem-mat`, new Color3(0.9, 0.35, 1));
  }
}

function createEnemy(e: EnemyState) {
  const root = new TransformNode(e.id, scene);
  root.metadata = { entityId: e.id };
  const color = enemyColor(e.type, e.boss);
  const size = e.boss ? 2.2 : e.type === "brute" ? 1.4 : 0.9;
  const body = box(`${e.id}-body`, { width: size, height: size, depth: size }, color); body.parent = root; body.position.y = size / 2; body.metadata = { entityId: e.id, baseY: body.position.y };
  const head = box(`${e.id}-head`, { width: size * 0.72, height: size * 0.46, depth: size * 0.62 }, color.scale(1.12)); head.parent = root; head.position.y = size * 1.12; head.metadata = { entityId: e.id, baseY: head.position.y };
  addEnemyDetails(root, e, size, color);
  const ring = MeshBuilder.CreateCylinder(`${e.id}-ring`, { diameter: size * 1.55, height: 0.025, tessellation: 48 }, scene); ring.parent = root; ring.material = transparentMat(`${e.id}-ringmat`, new Color3(0.9, 0.1, 0.08), 0.24); ring.metadata = { entityId: e.id };
  ring.position.y = 0.015;
  root.getChildMeshes().forEach((mesh) => shadowGenerator.addShadowCaster(mesh));
  meshes.set(e.id, root);
  markEntityMeshes(root, e.id);
  return root;
}

function addEnemyDetails(root: TransformNode, e: EnemyState, size: number, color: Color3) {
  if (e.boss) {
    const crown = MeshBuilder.CreateCylinder(`${e.id}-crown`, { diameterTop: size * 0.35, diameterBottom: size * 0.85, height: size * 0.38, tessellation: 6 }, scene); crown.parent = root; crown.position.y = size * 1.55; crown.material = mat(`${e.id}-crown-mat`, new Color3(0.18, 0.02, 0.02));
    const leftHorn = MeshBuilder.CreateCylinder(`${e.id}-left-horn`, { diameterTop: 0, diameterBottom: size * 0.18, height: size * 0.82, tessellation: 5 }, scene); leftHorn.parent = root; leftHorn.position.set(-size * 0.48, size * 1.65, 0); leftHorn.rotation.z = 0.75; leftHorn.material = mat(`${e.id}-left-horn-mat`, new Color3(0.95, 0.88, 0.65));
    const rightHorn = MeshBuilder.CreateCylinder(`${e.id}-right-horn`, { diameterTop: 0, diameterBottom: size * 0.18, height: size * 0.82, tessellation: 5 }, scene); rightHorn.parent = root; rightHorn.position.set(size * 0.48, size * 1.65, 0); rightHorn.rotation.z = -0.75; rightHorn.material = mat(`${e.id}-right-horn-mat`, new Color3(0.95, 0.88, 0.65));
    const chest = box(`${e.id}-boss-chest`, { width: size * 1.05, height: size * 0.24, depth: size * 1.08 }, new Color3(0.08, 0.08, 0.1)); chest.parent = root; chest.position.y = size * 0.78;
    const banner = box(`${e.id}-boss-banner`, { width: size * 0.22, height: size * 1.05, depth: size * 0.08 }, new Color3(0.55, 0.02, 0.02)); banner.parent = root; banner.position.set(0, size * 1.0, size * 0.68);
    return;
  }
  if (e.type === "goblin") {
    const leftEar = MeshBuilder.CreateCylinder(`${e.id}-left-ear`, { diameterTop: 0, diameterBottom: size * 0.2, height: size * 0.42, tessellation: 4 }, scene); leftEar.parent = root; leftEar.position.set(-size * 0.48, size * 1.2, 0); leftEar.rotation.z = 1.15; leftEar.material = mat(`${e.id}-left-ear-mat`, color.scale(1.18));
    const rightEar = MeshBuilder.CreateCylinder(`${e.id}-right-ear`, { diameterTop: 0, diameterBottom: size * 0.2, height: size * 0.42, tessellation: 4 }, scene); rightEar.parent = root; rightEar.position.set(size * 0.48, size * 1.2, 0); rightEar.rotation.z = -1.15; rightEar.material = mat(`${e.id}-right-ear-mat`, color.scale(1.18));
    const dagger = box(`${e.id}-dagger`, { width: size * 0.08, height: size * 0.62, depth: size * 0.06 }, new Color3(0.82, 0.86, 0.78)); dagger.parent = root; dagger.position.set(size * 0.58, size * 0.58, -size * 0.18); dagger.rotation.z = -0.55;
    const nose = box(`${e.id}-nose`, { width: size * 0.14, height: size * 0.1, depth: size * 0.18 }, color.scale(0.9)); nose.parent = root; nose.position.set(0, size * 1.15, -size * 0.38);
  } else if (e.type === "runner") {
    const crest = MeshBuilder.CreateCylinder(`${e.id}-crest`, { diameterTop: 0, diameterBottom: size * 0.38, height: size * 0.55, tessellation: 5 }, scene); crest.parent = root; crest.position.y = size * 1.5; crest.rotation.x = -0.35; crest.material = mat(`${e.id}-crest-mat`, new Color3(1, 0.82, 0.22));
    const leftBoot = box(`${e.id}-left-boot`, { width: size * 0.22, height: size * 0.18, depth: size * 0.48 }, new Color3(0.18, 0.12, 0.08)); leftBoot.parent = root; leftBoot.position.set(-size * 0.24, size * 0.1, size * 0.18);
    const rightBoot = box(`${e.id}-right-boot`, { width: size * 0.22, height: size * 0.18, depth: size * 0.48 }, new Color3(0.18, 0.12, 0.08)); rightBoot.parent = root; rightBoot.position.set(size * 0.24, size * 0.1, -size * 0.18);
    const tail = MeshBuilder.CreateCylinder(`${e.id}-tail`, { diameterTop: size * 0.08, diameterBottom: size * 0.14, height: size * 0.8, tessellation: 6 }, scene); tail.parent = root; tail.position.set(0, size * 0.48, size * 0.62); tail.rotation.x = 1.1; tail.material = mat(`${e.id}-tail-mat`, color.scale(0.9));
  } else if (e.type === "archer") {
    const hood = MeshBuilder.CreateCylinder(`${e.id}-hood`, { diameterTop: size * 0.25, diameterBottom: size * 0.7, height: size * 0.5, tessellation: 5 }, scene); hood.parent = root; hood.position.y = size * 1.37; hood.material = mat(`${e.id}-hood-mat`, new Color3(0.04, 0.16, 0.07));
    const bow = MeshBuilder.CreateTorus(`${e.id}-enemy-bow`, { diameter: size * 0.78, thickness: size * 0.035, tessellation: 24 }, scene); bow.parent = root; bow.position.set(size * 0.7, size * 0.75, 0); bow.rotation.z = Math.PI / 2; bow.scaling.y = 1.6; bow.material = mat(`${e.id}-enemy-bow-mat`, new Color3(0.38, 0.22, 0.08));
    const arrow = box(`${e.id}-arrow`, { width: size * 0.05, height: size * 0.9, depth: size * 0.05 }, new Color3(0.9, 0.82, 0.55)); arrow.parent = root; arrow.position.set(-size * 0.34, size * 0.92, -size * 0.32); arrow.rotation.z = 0.35;
    const cloak = box(`${e.id}-cloak`, { width: size * 0.76, height: size * 0.78, depth: size * 0.08 }, new Color3(0.03, 0.11, 0.05)); cloak.parent = root; cloak.position.set(0, size * 0.68, size * 0.48); cloak.rotation.x = -0.12;
  } else if (e.type === "shaman") {
    const mask = box(`${e.id}-mask`, { width: size * 0.58, height: size * 0.42, depth: size * 0.12 }, new Color3(0.92, 0.86, 0.58)); mask.parent = root; mask.position.set(0, size * 1.15, -size * 0.34);
    const staff = box(`${e.id}-shaman-staff`, { width: size * 0.08, height: size * 1.45, depth: size * 0.08 }, new Color3(0.24, 0.12, 0.05)); staff.parent = root; staff.position.set(size * 0.62, size * 0.72, 0); staff.rotation.z = -0.2;
    const orb = MeshBuilder.CreateSphere(`${e.id}-orb`, { diameter: size * 0.24, segments: 8 }, scene); orb.parent = root; orb.position.set(size * 0.48, size * 1.45, 0); const orbMat = mat(`${e.id}-orb-mat`, new Color3(0.72, 0.2, 1)); orbMat.emissiveColor = new Color3(0.42, 0.05, 0.72); orb.material = orbMat;
    const charms = box(`${e.id}-charms`, { width: size * 0.52, height: size * 0.08, depth: size * 0.1 }, new Color3(0.94, 0.72, 0.24)); charms.parent = root; charms.position.set(0, size * 0.88, -size * 0.52);
  } else if (e.type === "brute") {
    const leftFist = box(`${e.id}-left-fist`, { width: size * 0.32, height: size * 0.32, depth: size * 0.36 }, color.scale(0.82)); leftFist.parent = root; leftFist.position.set(-size * 0.72, size * 0.42, 0);
    const rightFist = box(`${e.id}-right-fist`, { width: size * 0.32, height: size * 0.32, depth: size * 0.36 }, color.scale(0.82)); rightFist.parent = root; rightFist.position.set(size * 0.72, size * 0.42, 0);
    const belt = box(`${e.id}-belt`, { width: size * 1.05, height: size * 0.16, depth: size * 1.08 }, new Color3(0.12, 0.07, 0.03)); belt.parent = root; belt.position.y = size * 0.48;
    const spikes = box(`${e.id}-back-spikes`, { width: size * 0.9, height: size * 0.14, depth: size * 0.18 }, new Color3(0.14, 0.14, 0.16)); spikes.parent = root; spikes.position.set(0, size * 1.05, size * 0.58); spikes.rotation.x = 0.35;
  }
}

function updateOverheadUi() {
  if (!state) return;
  for (const [id, element] of enemyBars) {
    if (!state.enemies[id]) removeEnemyBar(id);
    else element.dataset.live = "false";
  }
  for (const [id, element] of playerNameLabels) {
    if (!state.players[id]) removePlayerNameLabel(id);
  }
  for (const player of Object.values(state.players)) {
    if (state.matchState === "lobby") {
      removePlayerNameLabel(player.id);
      continue;
    }
    const node = meshes.get(player.id);
    if (!node) continue;
    const element = playerNameLabels.get(player.id) || createPlayerNameLabel(player);
    const head = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-head"));
    const headWorldPos = head ? head.getAbsolutePosition() : node.position.add(new Vector3(0, 2.05, 0));
    const screen = projectToScreen(headWorldPos.add(new Vector3(0, 0.35, 0)));
    element.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -50%)`;
    element.style.display = screen.visible ? "block" : "none";
  }
  for (const enemy of Object.values(state.enemies)) {
    const damaged = enemy.hp < enemy.maxHealth;
    if (!damaged) {
      removeEnemyBar(enemy.id);
      continue;
    }
    const node = meshes.get(enemy.id);
    if (!node) continue;
    const element = enemyBars.get(enemy.id) || createEnemyBar(enemy);
    const screen = projectToScreen(node.position.add(new Vector3(0, enemy.boss ? 2.7 : enemy.type === "brute" ? 2.0 : 1.45, 0)));
    element.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -100%)`;
    element.style.display = screen.visible ? "block" : "none";
    const currentPercent = Math.max(0, enemy.hp / enemy.maxHealth) * 100;
    const fill = element.querySelector<HTMLElement>(".enemyHpFill")!;
    const loss = element.querySelector<HTMLElement>(".enemyHpLoss")!;
    const previousPercent = Number(element.dataset.hpPercent || "100");
    fill.style.width = `${currentPercent}%`;
    if (currentPercent < previousPercent) {
      loss.style.transition = "none";
      loss.style.width = `${previousPercent}%`;
      window.setTimeout(() => {
        loss.style.transition = "width 620ms cubic-bezier(0.22, 0.8, 0.22, 1)";
        loss.style.width = `${currentPercent}%`;
      }, 80);
    } else {
      loss.style.width = `${currentPercent}%`;
    }
    element.dataset.hpPercent = `${currentPercent}`;
    element.querySelector<HTMLElement>(".enemyHpName")!.textContent = enemy.name;
    element.dataset.live = "true";
  }
}

function createEnemyBar(enemy: EnemyState) {
  const element = document.createElement("div");
  element.className = "enemyHpBar";
  element.dataset.testid = "enemy-hp-bar";
  element.dataset.enemyId = enemy.id;
  element.innerHTML = `<div class="enemyHpName"></div><div class="enemyHpTrack"><span class="enemyHpLoss"></span><span class="enemyHpFill"></span></div>`;
  element.dataset.hpPercent = `${Math.max(0, enemy.hp / enemy.maxHealth) * 100}`;
  document.querySelector("#overhead")!.appendChild(element);
  enemyBars.set(enemy.id, element);
  return element;
}

function removeEnemyBar(id: string) {
  enemyBars.get(id)?.remove();
  enemyBars.delete(id);
}

function createPlayerNameLabel(player: PlayerState) {
  const element = document.createElement("div");
  element.className = `playerNameLabel${player.id === state?.you ? " self" : ""}`;
  element.dataset.testid = "player-name-label";
  element.dataset.playerId = player.id;
  element.textContent = player.name;
  document.querySelector("#overhead")!.appendChild(element);
  playerNameLabels.set(player.id, element);
  return element;
}

function removePlayerNameLabel(id: string) {
  playerNameLabels.get(id)?.remove();
  playerNameLabels.delete(id);
}

function projectToScreen(position: Vector3) {
  const projected = Vector3.Project(position, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
  return { x: projected.x, y: projected.y, visible: projected.z >= 0 && projected.z <= 1 };
}

function playCastEffect(event: CombatEvent) {
  const source = event.sourceId ? meshes.get(event.sourceId) : null;
  const target = event.targetId ? meshes.get(event.targetId) : null;
  if (!source || !target) return;
  const ability = event.abilityId ? state?.abilities[event.abilityId] : null;
  const color = effectColor(event.abilityId || "", event.school || "");
  if (event.abilityId?.includes("frost_nova")) {
    frostRing(source.position, 4.2, 900);
  } else if (event.abilityId?.includes("whirlwind")) {
    slashRing(source.position, 760);
  } else if (event.abilityId?.includes("snare_trap")) {
    trapBurst(source.position, 4.0, 850);
  } else if (event.abilityId?.includes("sanctify")) {
    holyRing(source.position, 5.0, 1000);
  } else if (event.abilityId?.includes("arcane_blast")) {
    expandingDisc("arcane-blast", source.position, 4.0, new Color3(0.78, 0.22, 1), 900, 0.34);
  } else if (event.abilityId?.includes("shield_wall") || event.abilityId?.includes("barrier")) {
    shieldBubble(target.position, color, 900);
  } else if (event.abilityId?.includes("adrenaline")) {
    focusPulse(source.position, 700);
  } else if (ability?.targetType === "ally") {
    beam(source.position, target.position, color, 450);
  } else if (event.abilityId?.includes("smite")) {
    lightningStrike(target.position, 420);
  } else if (event.abilityId?.includes("meteor")) {
    meteorStrike(target.position, 850, 10);
  } else if (event.abilityId?.includes("multishot")) {
    multiArrow(source.position, target.position);
  } else if (event.abilityId?.includes("power_shot")) {
    bigArrow(source.position, target.position, new Color3(0.95, 0.12, 0.12), 380);
  } else if (event.abilityId?.includes("quick_shot")) {
    bigArrow(source.position, target.position, new Color3(0.62, 0.18, 0.95), 300);
  } else if (event.abilityId?.includes("frostbolt")) {
    frostBolt(source.position, target.position);
  } else {
    projectile(source.position, target.position, color, 450);
    if (event.abilityId?.includes("fireball")) fireBurst(target.position, 650);
    if (event.abilityId?.includes("frostbolt")) frostSpikes(target.position, 700);
  }
}

function playStatusEffect(event: CombatEvent) {
  const target = event.targetId ? meshes.get(event.targetId) : null;
  if (!target) return;
  if (event.abilityId?.includes("fireball")) fireBurst(target.position, 900);
  if (event.abilityId?.includes("frost")) frostSpikes(target.position, 900);
  if (event.abilityId?.includes("renew") || event.abilityId?.includes("barrier")) holyRing(target.position, 1.2, 700);
}

function playAutoAttackEffect(event: CombatEvent) {
  const source = event.sourceId ? meshes.get(event.sourceId) : null;
  const target = event.targetId ? meshes.get(event.targetId) : null;
  if (!source || !target) return;
  autoSwings.set(event.sourceId || "", performance.now() + 320);
  const sourcePlayer = event.sourceId ? state?.players[event.sourceId] : null;
  const sourceEnemy = event.sourceId ? state?.enemies[event.sourceId] : null;
  const isArrow = sourcePlayer?.classId === "hunter" || sourceEnemy?.type === "archer";
  if (isArrow) {
    arrow(source.position, target.position, new Color3(0.95, 0.75, 0.22), 180);
    hunterTwang(0, 0.035);
  } else {
    slashArc(target.position, 260);
    if (sourcePlayer?.classId === "warrior") warriorClang(0.04);
    else if (sourcePlayer?.classId === "priest") priestChoir(0.025);
    else if (sourcePlayer?.classId === "mage") mageSparkle();
  }
}

function playImpactEffect(event: CombatEvent, healing: boolean) {
  const target = event.targetId ? meshes.get(event.targetId) : null;
  if (!target) return;
  const color = healing ? new Color3(1, 0.85, 0.25) : effectColor(event.abilityId || "", event.school || "");
  if (event.amount) spawnFloatingNumber(target, event, healing);
  const pieces = Array.from({ length: healing ? 8 : 14 }, (_, index) => {
    const piece = MeshBuilder.CreateBox(`pixel-shard-${event.id}-${index}`, { size: healing ? 0.18 : 0.14 }, scene);
    piece.position = target.position.add(new Vector3((Math.random() - 0.5) * 0.7, 1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.7));
    const material = mat(`pixel-shard-${event.id}-${index}-mat`, color);
    material.emissiveColor = color.scale(0.65);
    piece.material = material;
    return { piece, material, velocity: new Vector3((Math.random() - 0.5) * 4, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 4), spin: Math.random() * 0.25 };
  });
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = (performance.now() - started) / 520;
    for (const shard of pieces) {
      shard.piece.position.addInPlace(shard.velocity.scale(scene.getEngine().getDeltaTime() / 1000));
      shard.velocity.y -= 7 * scene.getEngine().getDeltaTime() / 1000;
      shard.piece.rotation.x += shard.spin;
      shard.piece.rotation.z += shard.spin * 0.7;
      shard.material.alpha = Math.max(0, 1 - progress);
    }
    if (progress >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      pieces.forEach((shard) => shard.piece.dispose());
    }
  });
}

function spawnFloatingNumber(target: TransformNode, event: CombatEvent, healing: boolean) {
  const element = document.createElement("div");
  element.className = healing ? "floatingNumber healNumber" : "floatingNumber damageNumber";
  element.dataset.testid = healing ? "floating-heal" : "floating-damage";
  element.textContent = `${healing ? "+" : ""}${Math.round(event.amount || 0)}`;
  const color = playerCombatColor(event.sourceId || "");
  if (color) {
    element.style.color = color;
    element.style.textShadow = `-1px -1px 0 rgba(0,0,0,0.85), 1px -1px 0 rgba(0,0,0,0.85), -1px 1px 0 rgba(0,0,0,0.85), 1px 1px 0 rgba(0,0,0,0.85), 0 0 8px ${color}`;
  }
  document.querySelector("#overhead")!.appendChild(element);
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = (performance.now() - started) / 950;
    const screen = projectToScreen(target.position.add(new Vector3(0, 1.65 + progress * 1.15, 0)));
    element.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -50%)`;
    element.style.opacity = `${Math.max(0, 1 - progress)}`;
    element.style.display = screen.visible ? "block" : "none";
    if (progress >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      element.remove();
    }
  });
}

function playerCombatColor(sourceId: string) {
  if (!state?.players[sourceId]) return null;
  const ids = Object.keys(state.players).sort();
  const palette = ["#60a5fa", "#f97316", "#a78bfa", "#22c55e", "#f43f5e"];
  return palette[Math.max(0, ids.indexOf(sourceId)) % palette.length];
}

function playerColor3(sourceId: string) {
  return Color3.FromHexString(playerCombatColor(sourceId) || "#60a5fa");
}

function playChargeEffect(event: CombatEvent) {
  const source = event.sourceId ? meshes.get(event.sourceId) : null;
  if (!source) return;
  const color = effectColor(event.abilityId || "", event.school || "");
  const ring = MeshBuilder.CreateTorus(`charge-${event.id}`, { diameter: 1.3, thickness: 0.04 }, scene);
  ring.position = source.position.add(new Vector3(0, 0.08, 0));
  ring.rotation.x = Math.PI / 2;
  const material = mat(`charge-${event.id}-mat`, color);
  material.emissiveColor = color.scale(0.5);
  ring.material = material;
  const started = performance.now();
  const duration = Math.max(250, (event.castTime || 0.5) * 1000);
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = (performance.now() - started) / duration;
    ring.position.x = source.position.x;
    ring.position.z = source.position.z;
    ring.scaling.setAll(1 + progress * 0.7);
    material.alpha = Math.max(0, 1 - progress);
    if (progress >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      ring.dispose();
    }
  });
}

function projectile(from: Vector3, to: Vector3, color: Color3, duration: number) {
  const orb = MeshBuilder.CreateSphere("projectile", { diameter: 0.35, segments: 10 }, scene);
  const material = mat("projectile-mat", color);
  material.emissiveColor = color;
  orb.material = material;
  const start = from.add(new Vector3(0, 1.1, 0));
  const end = to.add(new Vector3(0, 1.0, 0));
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const p = Math.min(1, (performance.now() - started) / duration);
    orb.position = Vector3.Lerp(start, end, p);
    if (p >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      orb.dispose();
    }
  });
}

function arrow(from: Vector3, to: Vector3, color: Color3, duration: number) {
  const root = new TransformNode("arrow", scene);
  const shaft = MeshBuilder.CreateCylinder("arrow-shaft", { diameterTop: 0.045, diameterBottom: 0.06, height: 0.85, tessellation: 7 }, scene);
  shaft.parent = root;
  shaft.position.y = 0;
  shaft.rotation.x = Math.PI / 2;
  const tip = MeshBuilder.CreateCylinder("arrow-tip", { diameterTop: 0, diameterBottom: 0.14, height: 0.22, tessellation: 8 }, scene);
  tip.parent = root;
  tip.position.z = 0.52;
  tip.rotation.x = Math.PI / 2;
  const fletching1 = MeshBuilder.CreateBox("arrow-fletch-1", { width: 0.04, height: 0.22, depth: 0.01 }, scene);
  fletching1.parent = root;
  fletching1.position.set(0, 0.05, -0.42);
  const fletching2 = MeshBuilder.CreateBox("arrow-fletch-2", { width: 0.04, height: 0.01, depth: 0.22 }, scene);
  fletching2.parent = root;
  fletching2.position.set(0, -0.05, -0.42);
  const material = mat("arrow-mat", color);
  material.emissiveColor = color.scale(0.7);
  shaft.material = material;
  tip.material = material;
  const fletchMat = mat("arrow-fletch-mat", new Color3(0.85, 0.8, 0.65));
  fletching1.material = fletchMat;
  fletching2.material = fletchMat;
  const start = from.add(new Vector3(0, 1.15, 0));
  const end = to.add(new Vector3(0, 1.05, 0));
  const direction = end.subtract(start).normalize();
  root.position = start;
  root.rotation.y = Math.atan2(direction.x, direction.z);
  root.rotation.x = -Math.asin(Math.max(-1, Math.min(1, direction.y)));
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const p = Math.min(1, (performance.now() - started) / duration);
    root.position = Vector3.Lerp(start, end, p);
    if (p >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      root.dispose();
    }
  });
}

function bigArrow(from: Vector3, to: Vector3, color: Color3, duration: number) {
  const root = new TransformNode("big-arrow", scene);
  const shaft = MeshBuilder.CreateCylinder("big-arrow-shaft", { diameterTop: 0.11, diameterBottom: 0.14, height: 1.6, tessellation: 7 }, scene);
  shaft.parent = root;
  shaft.rotation.x = Math.PI / 2;
  const tip = MeshBuilder.CreateCylinder("big-arrow-tip", { diameterTop: 0, diameterBottom: 0.38, height: 0.5, tessellation: 8 }, scene);
  tip.parent = root;
  tip.position.z = 1.02;
  tip.rotation.x = Math.PI / 2;
  const fletching1 = MeshBuilder.CreateBox("big-arrow-fletch-1", { width: 0.1, height: 0.5, depth: 0.02 }, scene);
  fletching1.parent = root;
  fletching1.position.set(0, 0.1, -0.78);
  const fletching2 = MeshBuilder.CreateBox("big-arrow-fletch-2", { width: 0.1, height: 0.02, depth: 0.5 }, scene);
  fletching2.parent = root;
  fletching2.position.set(0, -0.1, -0.78);
  const material = mat("big-arrow-mat", color);
  material.emissiveColor = color;
  shaft.material = material;
  tip.material = material;
  const fletchMat = mat("big-arrow-fletch-mat", color.scale(0.6));
  fletching1.material = fletchMat;
  fletching2.material = fletchMat;
  const start = from.add(new Vector3(0, 1.15, 0));
  const end = to.add(new Vector3(0, 1.05, 0));
  const direction = end.subtract(start).normalize();
  root.position = start;
  root.rotation.y = Math.atan2(direction.x, direction.z);
  root.rotation.x = -Math.asin(Math.max(-1, Math.min(1, direction.y)));
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const p = Math.min(1, (performance.now() - started) / duration);
    root.position = Vector3.Lerp(start, end, p);
    if (p >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      root.dispose();
    }
  });
}

function beam(from: Vector3, to: Vector3, color: Color3, duration: number) {
  const points = [from.add(new Vector3(0, 1.1, 0)), to.add(new Vector3(0, 1.1, 0))];
  const line = MeshBuilder.CreateTube("beam", { path: points, radius: 0.06 }, scene);
  const material = mat("beam-mat", color);
  material.emissiveColor = color;
  line.material = material;
  setTimeout(() => line.dispose(), duration);
}

function lightningStrike(center: Vector3, duration: number) {
  const top = center.add(new Vector3((Math.random() - 0.5) * 0.8, 7, (Math.random() - 0.5) * 0.8));
  const bottom = center.add(new Vector3(0, 1.0, 0));
  const points = [top];
  for (let i = 1; i < 6; i++) {
    const p = i / 6;
    points.push(Vector3.Lerp(top, bottom, p).add(new Vector3((Math.random() - 0.5) * 0.55, 0, (Math.random() - 0.5) * 0.55)));
  }
  points.push(bottom);
  const bolt = MeshBuilder.CreateTube("smite-lightning", { path: points, radius: 0.055 }, scene);
  const material = mat("smite-lightning-mat", new Color3(0.86, 0.92, 1));
  material.emissiveColor = new Color3(0.45, 0.72, 1);
  bolt.material = material;
  const flash = MeshBuilder.CreateCylinder("smite-flash", { diameter: 1.25, height: 0.04, tessellation: 32 }, scene);
  flash.position = center.add(new Vector3(0, 0.04, 0));
  flash.material = transparentMat("smite-flash-mat", new Color3(0.85, 0.95, 1), 0.55);
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = (performance.now() - started) / duration;
    material.alpha = Math.max(0, 1 - progress);
    (flash.material as StandardMaterial).alpha = Math.max(0, 0.55 * (1 - progress));
    flash.scaling.setAll(1 + progress * 1.8);
    if (progress >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      bolt.dispose();
      flash.dispose();
    }
  });
}

function slashArc(center: Vector3, duration: number) {
  const slash = MeshBuilder.CreateTorus("auto-slash", { diameter: 1.25, thickness: 0.035, tessellation: 36 }, scene);
  slash.position = center.add(new Vector3(0, 1.0, 0));
  slash.rotation.x = Math.PI / 2.8;
  slash.rotation.z = Math.random() * Math.PI;
  const material = mat("auto-slash-mat", new Color3(1, 0.92, 0.65));
  material.emissiveColor = new Color3(1, 0.55, 0.18);
  slash.material = material;
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = (performance.now() - started) / duration;
    slash.rotation.z += 0.18;
    slash.scaling.setAll(1 + progress * 0.45);
    material.alpha = Math.max(0, 1 - progress);
    if (progress >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      slash.dispose();
    }
  });
}

function fireBurst(center: Vector3, duration: number) {
  for (let i = 0; i < 12; i++) {
    const flame = MeshBuilder.CreateBox("fire-pixel", { size: 0.18 + Math.random() * 0.16 }, scene);
    flame.position = center.add(new Vector3((Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.9, (Math.random() - 0.5) * 1.2));
    const material = mat("fire-pixel-mat", new Color3(1, 0.25 + Math.random() * 0.35, 0.02));
    material.emissiveColor = material.diffuseColor;
    flame.material = material;
    const velocity = new Vector3((Math.random() - 0.5) * 1.6, 1 + Math.random() * 1.7, (Math.random() - 0.5) * 1.6);
    animateParticle(flame, material, velocity, duration);
  }
}

function frostBolt(from: Vector3, to: Vector3) {
  const root = new TransformNode("frostbolt", scene);
  const cone = MeshBuilder.CreateCylinder("frostbolt-cone", { diameterTop: 0.75, diameterBottom: 0.18, height: 1.45, tessellation: 12 }, scene);
  cone.parent = root;
  cone.position.z = 0.72;
  cone.rotation.x = Math.PI / 2;
  const trail = MeshBuilder.CreateCylinder("frostbolt-trail", { diameterTop: 0.32, diameterBottom: 0.1, height: 1.1, tessellation: 10 }, scene);
  trail.parent = root;
  trail.position.z = -0.35;
  trail.rotation.x = Math.PI / 2;
  const color = new Color3(0.22, 0.92, 1);
  const coneMat = mat("frostbolt-cone-mat", color);
  coneMat.emissiveColor = new Color3(0.1, 0.5, 0.8);
  cone.material = coneMat;
  const trailMat = transparentMat("frostbolt-trail-mat", color, 0.42);
  trailMat.emissiveColor = new Color3(0.08, 0.42, 0.65);
  trail.material = trailMat;
  const start = from.add(new Vector3(0, 1.1, 0));
  const end = to.add(new Vector3(0, 1.0, 0));
  const direction = end.subtract(start).normalize();
  root.position = start;
  root.rotation.y = Math.atan2(direction.x, direction.z);
  root.rotation.x = -Math.asin(Math.max(-1, Math.min(1, direction.y)));
  const started = performance.now();
  const duration = 450;
  const observer = scene.onBeforeRenderObservable.add(() => {
    const p = Math.min(1, (performance.now() - started) / duration);
    root.position = Vector3.Lerp(start, end, p);
    if (p >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      root.dispose();
      frostSpikes(end, 700);
    }
  });
}

function frostSpikes(center: Vector3, duration: number) {
  for (let i = 0; i < 9; i++) {
    const spike = MeshBuilder.CreateCylinder("frost-spike", { diameterTop: 0, diameterBottom: 0.18, height: 0.75, tessellation: 4 }, scene);
    const angle = Math.random() * Math.PI * 2;
    spike.position = center.add(new Vector3(Math.cos(angle) * (0.3 + Math.random() * 0.7), 0.35, Math.sin(angle) * (0.3 + Math.random() * 0.7)));
    spike.rotation.z = (Math.random() - 0.5) * 0.8;
    const material = mat("frost-spike-mat", new Color3(0.28, 0.9, 1));
    material.emissiveColor = new Color3(0.12, 0.5, 0.7);
    spike.material = material;
    animateParticle(spike, material, new Vector3(0, 0.15, 0), duration);
  }
}

function expandingDisc(name: string, center: Vector3, radius: number, color: Color3, duration: number, alpha = 0.42) {
  const disc = MeshBuilder.CreateCylinder(name, { diameter: radius * 2, height: 0.035, tessellation: 64 }, scene);
  disc.position = center.add(new Vector3(0, 0.045, 0));
  const material = transparentMat(`${name}-mat`, color, alpha);
  material.emissiveColor = color.scale(0.55);
  disc.material = material;
  disc.scaling.setAll(0.08);
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = (performance.now() - started) / duration;
    disc.scaling.setAll(0.08 + progress * 0.92);
    material.alpha = Math.max(0, alpha * (1 - progress));
    if (progress >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      disc.dispose();
    }
  });
}

function frostRing(center: Vector3, radius: number, duration: number) {
  expandingDisc("frost-nova-disc", center, radius, new Color3(0.28, 0.9, 1), duration, 0.36);
  for (let i = 0; i < 18; i++) {
    const angle = (Math.PI * 2 * i) / 18;
    const spike = MeshBuilder.CreateCylinder("frost-nova-spike", { diameterTop: 0, diameterBottom: 0.2, height: 0.9, tessellation: 4 }, scene);
    spike.position = center.add(new Vector3(Math.cos(angle) * radius * 0.72, 0.42, Math.sin(angle) * radius * 0.72));
    spike.rotation.z = 0.55;
    const material = mat("frost-nova-spike-mat", new Color3(0.22, 0.95, 1));
    material.emissiveColor = new Color3(0.08, 0.5, 0.75);
    spike.material = material;
    animateParticle(spike, material, new Vector3(0, 0.08, 0), duration);
  }
}

function slashRing(center: Vector3, duration: number) {
  for (let i = 0; i < 3; i++) {
    const slash = MeshBuilder.CreateTorus(`whirlwind-${i}`, { diameter: 2.6 + i * 0.55, thickness: 0.045, tessellation: 48 }, scene);
    slash.position = center.add(new Vector3(0, 0.85 + i * 0.16, 0));
    slash.rotation.x = Math.PI / 2.4;
    const material = mat(`whirlwind-${i}-mat`, new Color3(1, 0.88, 0.48));
    material.emissiveColor = new Color3(1, 0.42, 0.08);
    slash.material = material;
    const started = performance.now();
    const observer = scene.onBeforeRenderObservable.add(() => {
      const progress = (performance.now() - started) / duration;
      slash.rotation.z += 0.36 + i * 0.08;
      material.alpha = Math.max(0, 1 - progress);
      if (progress >= 1) { scene.onBeforeRenderObservable.remove(observer); slash.dispose(); }
    });
  }
}

function trapBurst(center: Vector3, radius: number, duration: number) {
  expandingDisc("trap-burst", center, radius, new Color3(0.34, 0.95, 0.24), duration, 0.3);
  for (let i = 0; i < 10; i++) {
    const tooth = MeshBuilder.CreateCylinder("trap-tooth", { diameterTop: 0.04, diameterBottom: 0.18, height: 0.5, tessellation: 5 }, scene);
    const angle = Math.random() * Math.PI * 2;
    tooth.position = center.add(new Vector3(Math.cos(angle) * Math.random() * radius, 0.25, Math.sin(angle) * Math.random() * radius));
    tooth.material = mat("trap-tooth-mat", new Color3(0.2, 0.45, 0.12));
    animateParticle(tooth, tooth.material as StandardMaterial, new Vector3(0, 0.05, 0), duration);
  }
}

function holyRing(center: Vector3, radius: number, duration: number) {
  expandingDisc("holy-ring", center, radius, new Color3(1, 0.86, 0.24), duration, 0.32);
}

function shieldBubble(center: Vector3, color: Color3, duration: number) {
  const bubble = MeshBuilder.CreateSphere("shield-bubble", { diameter: 2.0, segments: 16 }, scene);
  bubble.position = center.add(new Vector3(0, 0.95, 0));
  const material = transparentMat("shield-bubble-mat", color, 0.24);
  material.emissiveColor = color.scale(0.32);
  bubble.material = material;
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = (performance.now() - started) / duration;
    bubble.scaling.setAll(1 + Math.sin(progress * Math.PI) * 0.2);
    material.alpha = Math.max(0, 0.24 * (1 - progress));
    if (progress >= 1) { scene.onBeforeRenderObservable.remove(observer); bubble.dispose(); }
  });
}

function focusPulse(center: Vector3, duration: number) {
  expandingDisc("focus-pulse", center, 2.2, new Color3(0.2, 1, 0.32), duration, 0.34);
}

function meteorStrike(center: Vector3, duration: number, scale = 1) {
  const start = center.add(new Vector3(-4 * scale, 8 * scale, -3 * scale));
  const rock = MeshBuilder.CreateSphere("meteor", { diameter: 0.7 * scale, segments: 14 }, scene);
  const material = mat("meteor-mat", new Color3(1, 0.24, 0.02));
  material.emissiveColor = new Color3(1, 0.18, 0.01);
  rock.material = material;
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = Math.min(1, (performance.now() - started) / (duration * 0.55));
    rock.position = Vector3.Lerp(start, center.add(new Vector3(0, 0.8 * scale, 0)), progress);
    if (progress >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      rock.dispose();
      for (let i = 0; i < scale; i++) fireBurst(center.add(new Vector3((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9)), 1100);
      expandingDisc("meteor-scorch", center, 12.0, new Color3(1, 0.18, 0.02), 1200, 0.34);
    }
  });
}

function multiArrow(from: Vector3, to: Vector3) {
  for (let i = -1; i <= 1; i++) {
    arrow(from.add(new Vector3(i * 0.22, 0, 0)), to.add(new Vector3(i * 0.9, 0, 0)), new Color3(0.95, 0.75, 0.22), 210);
  }
}

function animateParticle(mesh: Mesh, material: StandardMaterial, velocity: Vector3, duration: number) {
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const progress = (performance.now() - started) / duration;
    mesh.position.addInPlace(velocity.scale(dt));
    material.alpha = Math.max(0, 1 - progress);
    if (progress >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      mesh.dispose();
    }
  });
}

function effectColor(abilityId: string, school: string) {
  if (abilityId.includes("fire") || school === "fire") return new Color3(1, 0.28, 0.02);
  if (abilityId.includes("frost") || school === "frost") return new Color3(0.2, 0.85, 1);
  if (abilityId.includes("heal") || abilityId.includes("priest") || school === "holy") return new Color3(1, 0.84, 0.22);
  if (abilityId.includes("arcane") || school === "arcane") return new Color3(0.8, 0.28, 1);
  if (abilityId.includes("hunter") || abilityId.includes("trap")) return new Color3(0.36, 0.9, 0.22);
  if (school === "magical") return new Color3(0.55, 0.22, 1);
  return new Color3(1, 0.2, 0.08);
}

function unlockAudio() {
  audioContext ||= new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
  audioUnlocked = true;
}

function playMatchStateSound(matchState: string) {
  if (previousMatchState === matchState) return;
  const last = previousMatchState;
  previousMatchState = matchState;
  if (matchState === "running") startBattleMusic();
  else stopBattleMusic();
  if (!last) return;
  if (matchState === "running") playStartSound();
  if (matchState === "victory") playVictorySound();
  if (matchState === "defeat") playDefeatSound();
}

function playAmbientFoley(playerIsMoving: boolean) {
  if (!state?.players[state.you] || state.matchState !== "running") return;
  const now = performance.now();
  if (playerIsMoving && now - lastPlayerFootstepAt > 360) {
    lastPlayerFootstepAt = now;
    noise(0.055, 0.018, 170, 0, "lowpass");
    tone(58 + Math.random() * 18, 0.04, "triangle", 0.012);
  }
  const me = state.players[state.you];
  const nearby = Object.values(state.enemies).filter((enemy) => {
    const distance = Math.hypot(enemy.position.x - me.position.x, enemy.position.z - me.position.z);
    return distance < 7 && enemy.alerted;
  });
  if (nearby.length && now - lastEnemyFoleyAt > 1350) {
    lastEnemyFoleyAt = now;
    const closest = nearby.reduce((best, enemy) => {
      const distance = Math.hypot(enemy.position.x - me.position.x, enemy.position.z - me.position.z);
      return distance < best.distance ? { enemy, distance } : best;
    }, { enemy: nearby[0], distance: 999 });
    const volume = Math.max(0.012, 0.052 * (1 - closest.distance / 7));
    enemyGrowl(closest.enemy.type, volume);
  }
}

function enemyGrowl(type: string, volume: number) {
  if (type === "runner") {
    gliss(210, 360, 0.1, "sawtooth", volume * 0.75);
    noise(0.08, volume * 0.45, 720, 0.03, "bandpass");
  } else if (type === "shaman") {
    tone(155, 0.22, "triangle", volume * 0.75);
    tone(311, 0.18, "sine", volume * 0.45, 0.04);
  } else if (type === "brute") {
    gliss(105, 58, 0.22, "sawtooth", volume);
    noise(0.12, volume * 0.55, 190, 0.02, "lowpass");
  } else if (type === "archer") {
    tone(280, 0.055, "square", volume * 0.55);
    noise(0.08, volume * 0.35, 1100, 0.02, "bandpass");
  } else {
    gliss(260, 185, 0.12, "square", volume * 0.72);
  }
}

function startBattleMusic() {
  const ctx = soundContext();
  if (!ctx || musicNodes) return;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.028, ctx.currentTime + 1.5);
  master.connect(ctx.destination);
  const bass = ctx.createOscillator();
  const drone = ctx.createOscillator();
  bass.type = "triangle";
  drone.type = "sine";
  bass.frequency.setValueAtTime(55, ctx.currentTime);
  drone.frequency.setValueAtTime(110, ctx.currentTime);
  const bassGain = ctx.createGain();
  const droneGain = ctx.createGain();
  bassGain.gain.setValueAtTime(0.42, ctx.currentTime);
  droneGain.gain.setValueAtTime(0.18, ctx.currentTime);
  bass.connect(bassGain).connect(master);
  drone.connect(droneGain).connect(master);
  bass.start();
  drone.start();
  musicNodes = { oscillators: [bass, drone], gains: [master, bassGain, droneGain] };
  const pattern = [55, 55, 65.41, 73.42, 55, 82.41, 73.42, 65.41];
  let step = 0;
  musicStepTimer = window.setInterval(() => {
    const musicCtx = soundContext();
    if (!musicCtx || !musicNodes || state?.matchState !== "running") return;
    const frequency = pattern[step % pattern.length];
    step += 1;
    bass.frequency.setTargetAtTime(frequency, musicCtx.currentTime, 0.04);
    tone(frequency * 4, 0.08, "triangle", 0.01);
    if (step % 4 === 0) noise(0.05, 0.008, 260, 0, "lowpass");
  }, 520);
}

function stopBattleMusic() {
  if (musicStepTimer !== null) {
    window.clearInterval(musicStepTimer);
    musicStepTimer = null;
  }
  if (!musicNodes) return;
  const ctx = audioContext;
  const stopAt = (ctx?.currentTime || 0) + 0.8;
  musicNodes.gains[0].gain.exponentialRampToValueAtTime(0.0001, stopAt);
  musicNodes.oscillators.forEach((oscillator) => oscillator.stop(stopAt + 0.05));
  musicNodes = null;
}

function playUiClickSound() {
  tone(520, 0.04, "triangle", 0.035);
  tone(780, 0.05, "sine", 0.025, 0.015);
}

function playStartSound() {
  tone(196, 0.12, "sawtooth", 0.05);
  tone(294, 0.14, "sawtooth", 0.055, 0.08);
  tone(392, 0.22, "triangle", 0.07, 0.17);
}

function playVictorySound() {
  [392, 494, 587, 784].forEach((frequency, index) => tone(frequency, 0.18, "triangle", 0.06, index * 0.09));
  tone(988, 0.38, "sine", 0.045, 0.37);
}

function playDefeatSound() {
  tone(220, 0.28, "sawtooth", 0.07);
  tone(165, 0.34, "triangle", 0.06, 0.18);
  tone(110, 0.55, "sine", 0.08, 0.42);
  noise(0.45, 0.04, 520, 0.08);
}

function playCastStartSound(event: CombatEvent) {
  const abilityId = event.abilityId || "";
  const sourceClass = sourceClassId(event.sourceId);
  if (abilityId.includes("fireball")) {
    fireWhoosh(0);
    gliss(130, 240, 0.28, "sawtooth", 0.035);
  } else if (abilityId.includes("frostbolt")) {
    frostCrackle(0);
    gliss(900, 1600, 0.22, "sine", 0.03);
  } else if (abilityId.includes("heal")) {
    priestChoir(0.04);
  } else if (abilityId.includes("smite")) {
    holyCharge();
  } else if (abilityId.includes("shot")) {
    hunterTwang(0, 0.035);
  } else if (sourceClass === "warrior") {
    warriorGrunt(0.03);
  } else {
    tone(250, 0.08, "triangle", 0.035);
  }
}

function playCastReleaseSound(event: CombatEvent) {
  const abilityId = event.abilityId || "";
  const sourceClass = sourceClassId(event.sourceId);
  if (abilityId.includes("fireball")) {
    fireWhoosh(0);
    gliss(320, 82, 0.24, "sawtooth", 0.08);
    noise(0.22, 0.07, 520, 0.02, "lowpass");
  } else if (abilityId.includes("frostbolt")) {
    frostCrackle(0);
    tone(1450, 0.05, "sine", 0.04);
    tone(2110, 0.11, "triangle", 0.035, 0.035);
  } else if (abilityId.includes("smite")) {
    lightningSnap();
  } else if (abilityId.includes("heal") || event.school === "holy") {
    [740, 988, 1318].forEach((frequency, index) => tone(frequency, 0.16, "sine", 0.035, index * 0.045));
  } else if (abilityId.includes("shot")) {
    hunterTwang(0, 0.045);
  } else if (sourceClass === "warrior") {
    warriorClang(0.055);
  } else if (sourceClass === "priest") {
    priestChoir(0.045);
  } else if (sourceClass === "mage") {
    mageSparkle();
  } else {
    tone(180, 0.08, "square", 0.045);
  }
}

function sourceClassId(sourceId: string | undefined) {
  if (!sourceId || !state) return null;
  return state.players[sourceId]?.classId || null;
}

function warriorClang(volume = 0.05) {
  noise(0.06, volume, 1800, 0, "bandpass");
  noise(0.1, volume * 0.7, 420, 0.02, "lowpass");
  tone(165, 0.09, "square", volume, 0.01);
}

function warriorGrunt(volume = 0.04) {
  gliss(110, 75, 0.14, "sawtooth", volume);
  noise(0.08, volume * 0.6, 240, 0.03, "lowpass");
}

function hunterTwang(delay = 0, volume = 0.04) {
  gliss(880, 220, 0.09, "triangle", volume, delay);
  tone(330, 0.05, "sine", volume * 0.6, delay + 0.03);
  noise(0.04, volume * 0.35, 1400, delay + 0.01, "bandpass");
}

function priestChoir(volume = 0.035) {
  [523, 659, 784].forEach((frequency, index) => tone(frequency, 0.18, "sine", volume, index * 0.035));
  tone(1047, 0.12, "triangle", volume * 0.5, 0.08);
}

function holyCharge() {
  gliss(660, 990, 0.18, "sine", 0.035);
  tone(1320, 0.1, "triangle", 0.025, 0.08);
}

function mageSparkle() {
  [880, 1100, 1320, 1760].forEach((frequency, index) => tone(frequency, 0.06, "sine", 0.025, index * 0.02));
}

function playStatusSound(event: CombatEvent) {
  if (event.abilityId?.includes("fire") || event.abilityId?.includes("meteor")) fireWhoosh(0);
  if (event.abilityId?.includes("frost")) frostCrackle(0);
  if (event.abilityId?.includes("renew") || event.abilityId?.includes("barrier")) priestChoir(0.03);
}

function playHitSound(event: CombatEvent) {
  const hitMe = event.targetId === state?.you;
  const hitPlayer = Boolean(event.targetId && state?.players[event.targetId]);
  const sourceClass = sourceClassId(event.sourceId);
  if (hitMe) {
    noise(0.18, 0.075, 460);
    tone(92, 0.12, "sawtooth", 0.055);
  } else if (hitPlayer) {
    noise(0.11, 0.045, 620);
    tone(145, 0.06, "triangle", 0.03);
  } else if (event.abilityId?.includes("fireball")) {
    fireWhoosh(0);
    tone(118, 0.08, "sawtooth", 0.045);
  } else if (event.abilityId?.includes("frostbolt")) {
    frostCrackle(0);
    tone(930, 0.05, "sine", 0.03);
  } else if (event.abilityId?.includes("smite")) {
    lightningSnap();
  } else if (sourceClass === "warrior") {
    warriorClang(0.04);
  } else if (sourceClass === "hunter") {
    hunterTwang(0, 0.03);
  } else {
    noise(0.08, 0.04, 850);
    tone(150, 0.05, "square", 0.03);
  }
}

function playHealSound() {
  tone(660, 0.13, "sine", 0.035);
  tone(990, 0.18, "triangle", 0.035, 0.06);
}

function tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0) {
  const ctx = soundContext();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function gliss(from: number, to: number, duration: number, type: OscillatorType, volume: number, delay = 0) {
  const ctx = soundContext();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function fireWhoosh(delay = 0) {
  noise(0.28, 0.055, 420, delay, "lowpass");
  noise(0.12, 0.035, 1300, delay + 0.04, "bandpass");
}

function frostCrackle(delay = 0) {
  noise(0.11, 0.035, 2600, delay, "highpass");
  tone(1840, 0.05, "sine", 0.022, delay + 0.02);
  tone(2460, 0.04, "triangle", 0.02, delay + 0.07);
}

function lightningSnap() {
  noise(0.08, 0.08, 3200, 0, "highpass");
  gliss(1800, 420, 0.11, "sawtooth", 0.05, 0.015);
  tone(90, 0.16, "sine", 0.045, 0.04);
}

function noise(duration: number, volume: number, frequency: number, delay = 0, filterType: BiquadFilterType = "bandpass") {
  const ctx = soundContext();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency, start);
  filter.Q.setValueAtTime(1.7, start);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

function soundContext() {
  if (!audioUnlocked) return null;
  audioContext ||= new AudioContext();
  return audioContext.state === "running" ? audioContext : null;
}

function enemyColor(type: string, boss: boolean) {
  if (boss) return new Color3(0.25, 0.05, 0.04);
  if (type === "goblin") return new Color3(0.15, 0.58, 0.18);
  if (type === "runner") return new Color3(0.85, 0.45, 0.08);
  if (type === "archer") return new Color3(0.12, 0.28, 0.14);
  if (type === "shaman") return new Color3(0.42, 0.12, 0.62);
  if (type === "brute") return new Color3(0.43, 0.25, 0.16);
  return new Color3(0.25, 0.25, 0.25);
}

function box(name: string, opts: { width: number; height: number; depth: number }, color: Color3): Mesh {
  const mesh = MeshBuilder.CreateBox(name, opts, scene);
  mesh.material = mat(`${name}-mat`, color);
  return mesh;
}

function mat(name: string, color: Color3) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.alpha = 1;
  return material;
}

function transparentMat(name: string, color: Color3, alpha: number) {
  const material = mat(name, color);
  material.alpha = alpha;
  material.emissiveColor = color.scale(0.25);
  return material;
}

function cast(slot: number) { if (Number.isFinite(slot)) send({ type: "cast_ability", abilitySlot: slot }); }
const sendQueue: unknown[] = [];
function flushSendQueue() {
  while (sendQueue.length && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(sendQueue.shift()));
  }
}
function send(msg: unknown) {
  sendQueue.push(msg);
  flushSendQueue();
}
function text(id: string, value: string) { document.querySelector(`#${id}`)!.textContent = value; }
function width(id: string, value: number) { (document.querySelector(`#${id}`) as HTMLElement).style.width = `${Math.max(0, Math.min(1, value)) * 100}%`; }
