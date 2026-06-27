import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Matrix, Mesh, MeshBuilder, PointerEventTypes, Scene, StandardMaterial, TransformNode, Vector3, VertexData } from "@babylonjs/core";
import "./style.css";

type Vec = { x: number; z: number };
type CastState = { abilityId: string; targetId: string | null; duration: number; remaining: number; progress: number };
type AutoAttackState = { remaining: number; interval: number; progress: number };
type PlayerState = { id: string; name: string; classId: string | null; ready: boolean; spectator?: boolean; hp: number; maxHealth: number; resource: number; maxResource: number; resourceType: string | null; level: number; xp: number; dead: boolean; targetId: string | null; allyTargetId: string | null; position: Vec; facing: number; jumping: boolean; jumpProgress: number; abilities: string[]; abilitySlots?: Record<string, number>; cooldowns: Record<string, number>; globalCooldown: number; autoAttack: AutoAttackState; pendingUpgrades: Upgrade[]; stats: Record<string, number>; baseStats?: Record<string, number>; shield?: number; shieldRemaining?: number; casting: CastState | null; stealthed?: boolean; stealthRemaining?: number; iceBlocked?: boolean; sprinting?: boolean; form?: string | null; lobbyUpgradePoints?: number; lobbyUpgrades?: Upgrade[] };
type EnemyState = { id: string; type: string; name: string; hp: number; maxHealth: number; position: Vec; boss: boolean; alerted?: boolean; facing?: number };
type MapObject = { id: string; type: string; x: number; z: number; radius?: number; width?: number; depth?: number; blocksSight?: boolean; variant?: number; rotation?: number };
type GroundEffect = { id: string; type: string; abilityId?: string; x: number; z: number; radius: number; remaining?: number; totemType?: string };
type Upgrade = { id: string; name: string; choiceType?: string; abilityId?: string; description?: string; stat?: string; mode?: string; value?: number };
type ClassData = { id: string; name: string; description: string; resourceType: string; startingResource: number; baseStats: Record<string, number>; statGrowth: Record<string, number>; startingAbilities: string[] };
type Ability = { id: string; name: string; classId: string; slot: number; targetType: string; cooldown: number; resourceCost?: { type: string; amount: number }; castTime?: number; range?: number; requiredForm?: string; description?: string; effects?: Array<{ type: string; amount?: number; school?: string; scaling?: { stat: string; coefficient: number }; duration?: number; tickInterval?: number; slowPercent?: number; radius?: number; multiplier?: number; add?: number; stat?: string; center?: string; behindDistance?: number; stopDistance?: number; stunDuration?: number; form?: string; statMultipliers?: Record<string, number>; statAdds?: Record<string, number> }> };
type CombatEvent = { id: number; type: string; sourceId?: string; targetId?: string; abilityId?: string; castTime?: number; duration?: number; amount?: number; school?: string; status?: string; critical?: boolean; x?: number; z?: number; radius?: number };
type MatchStats = { name: string; classId: string | null; spectator: boolean; level: number; damageDealt: number; healingDone: number; damageTaken: number; kills: number; deaths: number; biggestHit: number };
type Snapshot = { type: string; you: string; reconnectToken?: string; matchState: string; countdown: number | null; players: Record<string, PlayerState>; enemies: Record<string, EnemyState>; mapObjects: MapObject[]; mapRevision?: number; groundEffects?: GroundEffect[]; wave: { number: number; state: string; aliveEnemies: number; nextWaveIn?: number }; abilities: Record<string, Ability>; classes: Record<string, ClassData>; upgrades: Upgrade[]; events: CombatEvent[]; matchStats: Record<string, MatchStats> };
type IncomingSnapshot = Omit<Snapshot, "mapObjects" | "abilities" | "classes" | "upgrades" | "matchStats"> & { mapObjects?: MapObject[]; abilities?: Record<string, Ability>; classes?: Record<string, ClassData>; upgrades?: Upgrade[]; matchStats?: Record<string, MatchStats>; reconnectToken?: string };

const classInfo: Record<string, { name: string; description: string; stats: string[] }> = {
  warrior: { name: "Warrior", description: "A durable frontliner. Great at surviving, holding enemy attention, and smashing threats up close.", stats: ["HP 162", "Rage", "Armor 32", "Melee bruiser / tank"] },
  hunter: { name: "Hunter", description: "A mobile ranged damage dealer. Keeps pressure from afar with fast shots and strong uptime.", stats: ["HP 112", "Focus", "Attack Power 20", "Ranged sustained DPS"] },
  priest: { name: "Priest", description: "A holy support caster. Heals allies, deals holy damage, and can keep a group alive through pressure.", stats: ["HP 103", "Mana 120", "Spell Power 18", "Healer / holy caster"] },
  mage: { name: "Mage", description: "A fragile elemental nuker. Firebolt burns enemies over time; Frostbolt can be learned later to help the team kite.", stats: ["HP 94", "Mana 130", "Spell Power 23", "Burst / control caster"] },
  rogue: { name: "Rogue", description: "A fast dual-dagger assassin. Backstep blinks behind a target for a brutal strike, while Vanish drops enemy attention for a short window.", stats: ["HP 106", "Energy", "Attack Power 22", "Dual-dagger assassin"] },
  druid: { name: "Druid", description: "A shapeshifting hybrid. Bear Form turns the druid into a durable bruiser, while Cat Form becomes a fast melee predator.", stats: ["HP 118", "Mana 115", "Hybrid scaling", "Bear / Cat shapeshifter"] },
  shaman: { name: "Shaman", description: "A spiritual caster bonded to the elements. Calls down lightning, heals allies with totems, and wades into melee with elemental strikes.", stats: ["HP 108", "Mana 120", "Spell Power 19 / Attack Power 9", "Lightning + Totem caster"] }
};
const SNAPSHOT_INTERVAL_MS = 1000 / 15;
const JUMP_DURATION_SECONDS = 0.36;

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
      <button data-testid="class-rogue" data-class="rogue">Rogue</button>
      <button data-testid="class-druid" data-class="druid">Druid</button>
      <button data-testid="class-shaman" data-class="shaman">Shaman</button>
    </div>
    <div id="lobbyUpgrades" data-testid="lobby-upgrades">
      <h3>Stat Upgrades <span id="lobbyUpgradePoints" data-testid="lobby-upgrade-points">3</span></h3>
      <p>Distribute 3 stat upgrades before readying up.</p>
      <div id="lobbyUpgradeChoices" data-testid="lobby-upgrade-choices"></div>
      <button id="resetLobbyUpgrades" data-testid="reset-lobby-upgrades">Reset Upgrades</button>
    </div>
    <button id="ready" data-testid="ready-button">Ready</button>
    <div id="lobbyPlayers"></div>
    <div id="countdown" data-testid="countdown"></div>
  </section>
  <div id="classPreviewInfo" data-testid="class-preview-info"></div>
  <div id="statTooltip" data-testid="stat-tooltip"></div>
  <section id="hud">
    <div id="party" data-testid="party"></div>
    <div id="target" data-testid="target-frame">No target</div>
    <div id="wave" data-testid="wave-counter">Wave 0</div>
    <button id="endMatch" data-testid="end-match-button">End Game</button>
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
      <div id="endScoreboard"></div>
      <button id="restart" data-testid="restart-button">Back to Lobby</button>
    </div>
  </section>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas")!;
const urlParams = new URLSearchParams(window.location.search);
const qualityOverride = (urlParams.get("quality") || urlParams.get("q") || "").toLowerCase();
const lowSpecMode = qualityOverride === "low";
const engine = new Engine(canvas, !lowSpecMode);
const scene = new Scene(engine);
(canvas as any).engine = engine;
(canvas as any).scene = scene;
scene.clearColor = new Color4(0.13, 0.16, 0.17, 1);
const camera = new ArcRotateCamera("camera", -Math.PI / 2, 0.9, 42, Vector3.Zero(), scene);
camera.attachControl(canvas, false);
camera.inputs.clear();
new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene).intensity = 0.5;
const dirLight = new DirectionalLight("dirLight", new Vector3(-0.45, -1, -0.35), scene);
dirLight.position = new Vector3(18, 32, 18);
dirLight.intensity = 0.72;

const palette = {
  void: new Color3(0.13, 0.16, 0.17),
  outerGround: new Color3(0.18, 0.22, 0.2),
  arenaBase: new Color3(0.61, 0.66, 0.54),
  arenaWarm: new Color3(0.74, 0.69, 0.52),
  arenaMoss: new Color3(0.32, 0.47, 0.29),
  stone: new Color3(0.44, 0.46, 0.45),
  stoneLight: new Color3(0.58, 0.59, 0.55),
  bark: new Color3(0.31, 0.19, 0.1),
  leaf: new Color3(0.13, 0.42, 0.2),
  leafDark: new Color3(0.07, 0.29, 0.18),
  leafGold: new Color3(0.37, 0.47, 0.18),
  shadow: new Color3(0.05, 0.07, 0.06),
  magic: new Color3(0.34, 0.9, 0.96)
};

const outerGround = MeshBuilder.CreateCylinder("outer-ground", { diameter: 110, height: 0.04, tessellation: 128 }, scene);
outerGround.position.y = -0.14;
outerGround.material = mat("outer-ground-mat", palette.outerGround);
outerGround.receiveShadows = false;
const floorFade = MeshBuilder.CreateCylinder("arena-floor-fade", { diameter: 61, height: 0.035, tessellation: 128 }, scene);
floorFade.position.y = -0.12;
floorFade.material = transparentMat("arena-floor-fade-mat", palette.arenaMoss, 0.26);
floorFade.receiveShadows = false;
const arenaMat = mat("arena", palette.arenaBase);
const arena = MeshBuilder.CreateCylinder("arena-floor", { diameter: 56, height: 0.15, tessellation: 96 }, scene);
arena.material = arenaMat;
arena.position.y = -0.08;
arena.receiveShadows = false;
createGroundDressing();

const configuredWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
const defaultWsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8000/ws`;
// If a configured URL points to localhost but the page is served from a remote host,
// fall back to the page's host so same-network play works out of the box.
const wsUrl = configuredWsUrl && !isLocalhostOnlyUrl(configuredWsUrl) ? configuredWsUrl : defaultWsUrl;
let ws: WebSocket;
const sendQueue: unknown[] = [];
let state: Snapshot | null = null;
let previousState: Snapshot | null = null;
let snapshotReceivedAt = 0;
let uiDirty = true;
let lastUiRenderAt = 0;
let staticWorldDirty = true;
let lastStaticWorldSignature = "";
const meshes = new Map<string, TransformNode>();
const mapMeshes = new Map<string, TransformNode>();
const groundEffectMeshes = new Map<string, TransformNode>();
const enemyBars = new Map<string, HTMLElement>();
const playerNameLabels = new Map<string, HTMLElement>();
const input = { up: false, down: false, left: false, right: false };
const autoSwings = new Map<string, number>();
const autoSwingHands = new Map<string, "left" | "right">();
const spinVisuals = new Map<string, number>();
let lastEventId = 0;
let lastUpgradeSignature = "";
let upgradeChoiceInFlight = false;
let selectedClassId: string | null = null;
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
let localPlayerName: string | null = null;
let optimisticAllyTargetId: string | null = null;
let lastClassPreviewInfoSignature = "";
let castBarVisualProgress = 0;
let autoAttackVisualProgress = 0;

function isLocalhostOnlyUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // Treat explicit non-default ports as user-supplied overrides (e.g. VITE_WS_URL=ws://127.0.0.1:8001).
    // Only fall back to the default port when the user is on the loopback hostname with the same
    // port as the page (so a same-origin dev server on a remote host still finds the backend).
    const isLoopback = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (!isLoopback) return false;
    return u.port === window.location.port;
  } catch {
    return false;
  }
}

function getWsUrl(): string {
  const base = configuredWsUrl && !isLocalhostOnlyUrl(configuredWsUrl) ? configuredWsUrl : defaultWsUrl;
  const token = localStorage.getItem("cooprpg_reconnect_token");
  if (!token) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}

function connect() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws && ws.readyState !== WebSocket.CLOSED) {
    return;
  }
  ws = new WebSocket(getWsUrl());
  ws.addEventListener("open", () => {
    text("connection", "Connected");
    reconnectDelay = 1000;
    flushSendQueue();
  });
  ws.addEventListener("message", (event) => {
    previousState = state;
    const incoming = JSON.parse(event.data) as IncomingSnapshot;
    if (incoming.reconnectToken) {
      localStorage.setItem("cooprpg_reconnect_token", incoming.reconnectToken);
    }
    const incomingHasStatic = incoming.mapObjects !== undefined;
    state = mergeSnapshot(incoming);
    const staticWorldSignature = worldStaticSignature(state);
    snapshotReceivedAt = performance.now();
    uiDirty = true;
    const matchStarted = previousState?.matchState === "lobby" && state.matchState === "running";
    staticWorldDirty = matchStarted || incomingHasStatic || staticWorldSignature !== lastStaticWorldSignature;
    if (matchStarted) lastStaticWorldSignature = "";
    else lastStaticWorldSignature = staticWorldSignature;
    processEvents(state.events);
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
  localPlayerName = name.trim().slice(0, 18);
  input.value = localPlayerName;
  send({ type: "set_name", name: localPlayerName });
}

function targetPartyPlayer(playerId: string) {
  if (!state?.players[playerId]) return;
  optimisticAllyTargetId = playerId;
  const me = state.players[state.you];
  if (me) {
    me.allyTargetId = playerId;
    me.targetId = null;
  }
  markSelectedPartyFrame(playerId);
  text("target", `${state.players[playerId].name} ${Math.round(state.players[playerId].hp)}/${Math.round(state.players[playerId].maxHealth)}`);
  unlockAudio();
  playUiClickSound();
  send({ type: "select_target", targetId: playerId });
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

document.querySelector<HTMLInputElement>("#playerName")!.addEventListener("input", () => {
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
    selectedClassId = button.dataset.class || null;
    if (!selectedClassId) return;
    updateClassPreview(selectedClassId);
    send({ type: "select_class", classId: selectedClassId });
  });
});
document.querySelector<HTMLButtonElement>("#ready")!.addEventListener("click", () => {
  if (!selectedClassId) return;
  unlockAudio();
  playUiClickSound();
  send({ type: "ready", ready: true });
});
document.querySelector<HTMLButtonElement>("#restart")!.addEventListener("click", () => { unlockAudio(); playUiClickSound(); send({ type: "restart_match" }); });
document.querySelector<HTMLButtonElement>("#endMatch")!.addEventListener("click", () => {
  if (!window.confirm("End the current game and return everyone to the lobby?")) return;
  unlockAudio();
  playUiClickSound();
  send({ type: "restart_match" });
});
document.querySelector<HTMLElement>("#party")!.addEventListener("pointerdown", (event) => {
  const frame = (event.target as HTMLElement).closest<HTMLElement>(".partyFrame");
  if (!frame?.dataset.id) return;
  event.preventDefault();
  event.stopPropagation();
  targetPartyPlayer(frame.dataset.id);
});
document.querySelector<HTMLElement>("#party")!.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const frame = (event.target as HTMLElement).closest<HTMLElement>(".partyFrame");
  if (!frame?.dataset.id) return;
  event.preventDefault();
  targetPartyPlayer(frame.dataset.id);
});
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
document.querySelector<HTMLElement>("#lobbyUpgradeChoices")!.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-lobby-upgrade]");
  if (button?.dataset.lobbyUpgrade) {
    unlockAudio();
    playUiClickSound();
    send({ type: "choose_lobby_upgrade", upgradeId: button.dataset.lobbyUpgrade });
  }
});

(function bindClassPreviewStatTooltips() {
  const container = document.querySelector<HTMLElement>("#classPreviewInfo");
  if (!container) return;
  const attach = () => {
    container.querySelectorAll<HTMLElement>("[data-stat-tooltip]").forEach((el) => {
      if (el.dataset.statTooltipBound) return;
      el.dataset.statTooltipBound = "1";
      el.addEventListener("mouseenter", () => {
        if (state?.matchState !== "lobby") return;
        showStatTooltip(el, el.dataset.statTooltip!);
      });
      el.addEventListener("mouseleave", () => {
        if (state?.matchState !== "lobby") return;
        hideStatTooltip();
      });
    });
  };
  attach();
  const observer = new MutationObserver(attach);
  observer.observe(container, { childList: true, subtree: true });
})();
document.querySelector<HTMLButtonElement>("#resetLobbyUpgrades")!.addEventListener("click", () => {
  unlockAudio();
  playUiClickSound();
  send({ type: "reset_lobby_upgrades" });
});
document.querySelectorAll<HTMLButtonElement>("[data-slot]").forEach((button) => {
  button.setAttribute("draggable", "true");
  button.addEventListener("click", () => { unlockAudio(); cast(slotNumber(button.dataset.slot)); });
  button.addEventListener("mouseenter", () => showAbilityTooltip(button));
  button.addEventListener("mouseleave", hideAbilityTooltip);
  button.addEventListener("dragstart", (event) => {
    const abilityId = button.dataset.abilityId;
    if (!abilityId || !(event instanceof DragEvent) || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", abilityId);
    button.classList.add("dragSource");
    if (event.dataTransfer.setDragImage) {
      event.dataTransfer.setDragImage(button, 38, 29);
    }
  });
  button.addEventListener("dragend", () => {
    button.classList.remove("dragSource");
    document.querySelectorAll<HTMLButtonElement>("#action button").forEach((b) => b.classList.remove("dragOver"));
  });
  button.addEventListener("dragover", (event) => {
    if (!(event instanceof DragEvent)) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = "move";
    document.querySelectorAll<HTMLButtonElement>("#action button").forEach((b) => b.classList.remove("dragOver"));
    button.classList.add("dragOver");
  });
  button.addEventListener("dragleave", () => {
    button.classList.remove("dragOver");
  });
  button.addEventListener("drop", (event) => {
    if (!(event instanceof DragEvent) || !event.dataTransfer) return;
    event.preventDefault();
    button.classList.remove("dragOver");
    const sourceAbilityId = event.dataTransfer.getData("text/plain");
    const targetSlot = slotNumber(button.dataset.slot);
    if (!sourceAbilityId || !Number.isFinite(targetSlot)) return;
    send({ type: "set_ability_slot", abilityId: sourceAbilityId, slot: targetSlot });
  });
});

function isTypingInTextField(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}

window.addEventListener("keydown", (event) => {
  if (state?.players[state.you]?.spectator) return;
  if (isTypingInTextField()) return;
  if (state?.matchState !== "running") return;
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
  if (state?.players[state.you]?.spectator) return;
  if (isTypingInTextField()) return;
  if (state?.matchState !== "running") return;
  let movementChanged = false;
  if (event.code === "KeyW") input.up = false;
  if (event.code === "KeyS") input.down = false;
  if (event.code === "KeyA") input.left = false;
  if (event.code === "KeyD") input.right = false;
  movementChanged = ["KeyW", "KeyS", "KeyA", "KeyD"].includes(event.code);
  if (movementChanged) send({ type: "input", movement: input });
});
setInterval(() => { if (state?.matchState === "running" && !state?.players[state.you]?.spectator) send({ type: "input", movement: input }); }, 50);

scene.onPointerObservable.add((pointerInfo) => {
  if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) return;
  if (state?.players[state.you]?.spectator) return;
  unlockAudio();
  const pick = scene.pick(scene.pointerX, scene.pointerY);
  const id = pick?.pickedMesh?.metadata?.entityId;
  if (!id) return;
  if (state?.players[id]) {
    targetPartyPlayer(id);
    return;
  }
  optimisticAllyTargetId = null;
  send({ type: "select_target", targetId: id });
});

engine.runRenderLoop(() => {
  const currentState = state;
  const me = currentState?.players[currentState.you];
  if (me && !me.spectator) {
    const position = interpolatedPosition(currentState.you, me.position, "player");
    camera.setTarget(new Vector3(position.x, 0, position.z));
  } else if (me?.spectator && currentState?.matchState === "running") {
    const active = Object.values(currentState.players).filter((p) => !p.spectator);
    if (active.length) {
      const avgX = active.reduce((sum, p) => sum + p.position.x, 0) / active.length;
      const avgZ = active.reduce((sum, p) => sum + p.position.z, 0) / active.length;
      camera.setTarget(new Vector3(avgX, 0, avgZ));
    }
  }
  canvas.style.filter = me?.dead ? "grayscale(1) contrast(0.9) brightness(0.72)" : "";
  renderPendingUi();
  renderWorld();
  updateLobbyPreviewPlacement();
  animateWorld();
  updateHoverRangeIndicator();
  updateCastBar();
  updateAutoAttackBar();
  updateOverheadUi();
  scene.render();
});
document.querySelector("#classPreviewInfo")!.innerHTML = `<h2>Choose a class</h2><p>Select a class to preview it and enable Ready.</p>`;
window.addEventListener("resize", () => engine.resize());

function renderUi() {
  if (!state) return;
  const me = state.players[state.you];
  const you = state.you;
  const isSpectator = me?.spectator === true;
  const wasLobby = document.body.dataset.mode === "lobby";
  document.body.dataset.mode = state.matchState;
  document.body.dataset.spectator = isSpectator ? "true" : "false";
  document.querySelector<HTMLElement>("#lobby")!.style.display = state.matchState === "lobby" ? "block" : "none";
  document.querySelector<HTMLElement>("#hud")!.style.display = state.matchState === "lobby" ? "none" : "block";
  document.querySelector<HTMLElement>("#classPreviewInfo")!.style.display = state.matchState === "lobby" ? "block" : "none";
  if (wasLobby && state.matchState !== "lobby") {
    document.querySelector<HTMLElement>("#statTooltip")!.style.display = "none";
    hideStatTooltip();
  }
  if (classPreview) classPreview.setEnabled(state.matchState === "lobby" && !isSpectator);
  text("countdown", state.countdown ? `Starting in ${Math.ceil(state.countdown)}` : "");
  const currentState = state;
  document.querySelector("#lobbyPlayers")!.innerHTML = `<h3 data-testid="lobby-player-count">Players connected: ${Object.keys(currentState.players).length}</h3>` + Object.values(currentState.players).map((p) => {
    const isYou = p.id === you;
    const classes = currentState.classes;
    const className = p.spectator ? "spectator" : p.classId ? classes[p.classId]?.name || p.classId : "choosing class";
    const status = p.spectator ? "Spectator" : p.ready ? "Ready" : p.classId ? "Picking..." : "Choosing name/class";
    return `<div class="lobbyPlayer${p.ready ? " ready" : ""}${isYou ? " you" : ""}${p.spectator ? " spectator" : ""}" data-testid="lobby-player" data-id="${p.id}">
      <b>${p.name}${isYou ? " (you)" : ""}</b>
      <span>${className}</span>
      <span class="lobbyStatus">${status}</span>
    </div>`;
  }).join("");
  document.querySelectorAll<HTMLButtonElement>("[data-class]").forEach((btn) => {
    btn.classList.toggle("selectedClass", Boolean(me?.classId) && btn.dataset.class === me?.classId);
    btn.disabled = isSpectator && currentState.matchState === "lobby";
  });
  const readyButton = document.querySelector<HTMLButtonElement>("#ready")!;
  const lobbyUpgradePoints = (me?.lobbyUpgradePoints ?? 0);
  const hasClass = Boolean(me?.classId);
  readyButton.disabled = isSpectator || !hasClass || lobbyUpgradePoints > 0;
  const lobbyUpgradesPanel = document.querySelector<HTMLElement>("#lobbyUpgrades")!;
  lobbyUpgradesPanel.style.display = hasClass && !isSpectator ? "block" : "none";
  text("lobbyUpgradePoints", `${lobbyUpgradePoints}`);
  const lobbyUpgradeChoices = document.querySelector<HTMLElement>("#lobbyUpgradeChoices")!;
  const lobbyUpgradesSignature = (me?.lobbyUpgrades || []).map((u) => u.id).join(",") + "|" + lobbyUpgradePoints;
  if (lobbyUpgradeChoices.dataset.signature !== lobbyUpgradesSignature) {
    lobbyUpgradeChoices.dataset.signature = lobbyUpgradesSignature;
    if (hasClass && lobbyUpgradePoints > 0) {
      lobbyUpgradeChoices.innerHTML = state.upgrades.map((u) => renderLobbyUpgradeChoice(u)).join("");
    } else if (hasClass && lobbyUpgradePoints === 0) {
      lobbyUpgradeChoices.innerHTML = `<div class="lobbyUpgradesDone">All upgrades spent. Ready up!</div>`;
    } else {
      lobbyUpgradeChoices.innerHTML = "";
    }
  }
  if (hasClass && me?.classId) {
    const previewInfoSignature = `${me.classId}|${JSON.stringify(me.stats)}|${Object.keys(state.abilities).length}`;
    if (previewInfoSignature !== lastClassPreviewInfoSignature) {
      renderClassPreviewInfo(me.classId);
      lastClassPreviewInfoSignature = previewInfoSignature;
    }
  }
  const nameInput = document.querySelector<HTMLInputElement>("#playerName")!;
  nameInput.disabled = isSpectator && state.matchState === "lobby";
  const isEditingName = document.activeElement === nameInput;
  if (me && !isEditingName && localPlayerName === null && nameInput.value !== me.name) nameInput.value = me.name;
  if (state.matchState === "lobby") {
    text("connection", isSpectator ? "Spectator mode — waiting for the next match" : "Connected");
  }
  if (!me) return;
  const bars = document.querySelector<HTMLElement>("#bars")!;
  const action = document.querySelector<HTMLElement>("#action")!;
  const cast = document.querySelector<HTMLElement>("#cast")!;
  const statsPanel = document.querySelector<HTMLElement>("#statsPanel")!;
  const levelPanel = document.querySelector<HTMLElement>("#levelPanel")!;
  const targetFrame = document.querySelector<HTMLElement>("#target")!;
  const party = document.querySelector<HTMLElement>("#party")!;
  if (isSpectator) {
    bars.style.display = "none";
    action.style.display = "none";
    cast.style.display = "none";
    statsPanel.style.display = "none";
    levelPanel.style.display = "none";
    targetFrame.style.display = "none";
    party.style.pointerEvents = "none";
  } else {
    bars.style.display = "grid";
    action.style.display = "flex";
    statsPanel.style.display = "block";
    targetFrame.style.display = "block";
    party.style.pointerEvents = "auto";
  }
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
  const selectedAllyId = me.allyTargetId || optimisticAllyTargetId;
  document.querySelector("#party")!.innerHTML = Object.values(state.players).filter((p) => !p.spectator).map((p) => renderPartyFrame(p, selectedAllyId)).join("");
  const target = me.targetId ? state.enemies[me.targetId] : me.allyTargetId ? state.players[me.allyTargetId] : null;
  text("target", target ? `${target.name} ${Math.round(target.hp)}/${Math.round(target.maxHealth)}` : "No target");
  for (let slot = 1; slot <= 7; slot++) {
    const abilityId = me.abilities.find((id) => abilitySlot(me, id) === slot);
    const key = slotKeys[slot];
    const btn = document.querySelector<HTMLButtonElement>(`[data-testid="ability-slot-${key}"]`)!;
    const cooldown = abilityId ? me.cooldowns[abilityId] || 0 : 0;
    const globalCooldown = abilityId ? me.globalCooldown || 0 : 0;
    const shownCooldown = Math.max(cooldown, globalCooldown);
    btn.dataset.abilityId = abilityId || "";
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
  const restartButton = document.querySelector<HTMLButtonElement>("#restart")!;
  const endMatchButton = document.querySelector<HTMLButtonElement>("#endMatch")!;
  endTitle.textContent = state.matchState === "victory" ? "Victory" : state.matchState === "defeat" ? "Wipe" : "";
  restartButton.style.display = "inline-block";
  endMatchButton.style.display = state.matchState === "running" && !isSpectator ? "inline-block" : "none";
  end.style.display = endTitle.textContent ? "grid" : "none";
  const scoreboard = document.querySelector<HTMLElement>("#endScoreboard")!;
  scoreboard.innerHTML = endTitle.textContent ? renderScoreboard(state.matchStats, state.players, state.you) : "";
  playMatchStateSound(state.matchState);
}

function mergeSnapshot(incoming: IncomingSnapshot): Snapshot {
  return {
    ...incoming,
    mapObjects: incoming.mapObjects ?? state?.mapObjects ?? [],
    abilities: incoming.abilities ?? state?.abilities ?? {},
    classes: incoming.classes ?? state?.classes ?? {},
    upgrades: incoming.upgrades ?? state?.upgrades ?? [],
    matchStats: incoming.matchStats ?? state?.matchStats ?? {},
  };
}

function renderPendingUi() {
  if (!uiDirty) return;
  const now = performance.now();
  const interval = state?.matchState === "running" ? 100 : 50;
  if (now - lastUiRenderAt < interval) return;
  renderUi();
  uiDirty = false;
  lastUiRenderAt = now;
}

function interpolatedPosition(id: string, current: Vec, kind: "player" | "enemy"): Vec {
  const previous = kind === "player" ? previousState?.players[id]?.position : previousState?.enemies[id]?.position;
  if (!previous || !snapshotReceivedAt) return current;
  const alpha = Math.min(1, Math.max(0, (performance.now() - snapshotReceivedAt) / SNAPSHOT_INTERVAL_MS));
  return {
    x: previous.x + (current.x - previous.x) * alpha,
    z: previous.z + (current.z - previous.z) * alpha
  };
}

function lerpValue(current: number, target: number, amount: number) {
  return current + (target - current) * amount;
}

function angleDelta(current: number, target: number) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function lerpAngle(current: number, target: number, amount: number) {
  return current + angleDelta(current, target) * amount;
}

function worldStaticSignature(snapshot: Snapshot) {
  const map = snapshot.mapObjects.map((object) => mapObjectSignature(object)).join("|");
  const effects = (snapshot.groundEffects || []).map((effect) => `${effect.id}:${effect.type}:${effect.x}:${effect.z}:${effect.radius}`).join("|");
  return `${map}#${effects}`;
}

function renderStatsPanel(me: PlayerState) {
  const panel = document.querySelector<HTMLElement>("#statsPanel")!;
  const orderedStats = ["maxHealth", "maxResource", "attackPower", "spellPower", "armor", "resistance", "critChance", "critMultiplier", "moveSpeed", "resourceRegen", "resourceCostMultiplier", "autoAttackDamage", "autoAttackInterval", "autoAttackRange", "cooldownReduction", "castSpeed"];
  panel.innerHTML = `<h2>Current Stats</h2>${orderedStats.map((stat) => {
    const value = me.stats?.[stat];
    if (value === undefined) return "";
    const base = me.baseStats?.[stat];
    const improvement = base !== undefined && value !== base ? formatStatImprovement(stat, value, base) : "";
    return `<div class="statRow"><span>${statLabel(stat)}</span><b>${formatStat(stat, value)}${improvement ? ` <em class="statImprovement">${improvement}</em>` : ""}</b></div>`;
  }).join("")}`;
}

function renderScoreboard(matchStats: Record<string, MatchStats>, players: Record<string, PlayerState>, you: string) {
  const rows = Object.entries(matchStats).sort(([, a], [, b]) => b.damageDealt - a.damageDealt || b.healingDone - a.healingDone);
  return `<table class="scoreboardTable">
    <thead>
      <tr>
        <th>Player</th>
        <th>Role</th>
        <th class="num">Level</th>
        <th class="num">Kills</th>
        <th class="num">Deaths</th>
        <th class="num">Damage</th>
        <th class="num">Healing</th>
        <th class="num">Taken</th>
        <th class="num">Biggest Hit</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(([id, s]) => {
        const isYou = id === you;
        const role = s.spectator ? "Spectator" : s.classId ? (state?.classes[s.classId]?.name || s.classId) : "—";
        return `<tr class="${s.spectator ? "spectatorRow" : ""}${isYou ? " youRow" : ""}">
          <td><b>${escapeHtml(s.name)}</b>${isYou ? " (you)" : ""}</td>
          <td>${role}</td>
          <td class="num">${s.level}</td>
          <td class="num">${s.kills}</td>
          <td class="num">${s.deaths}</td>
          <td class="num damage">${formatScoreboardNumber(s.damageDealt)}</td>
          <td class="num heal">${formatScoreboardNumber(s.healingDone)}</td>
          <td class="num taken">${formatScoreboardNumber(s.damageTaken)}</td>
          <td class="num crit">${formatScoreboardNumber(s.biggestHit)}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>`;
}

function formatScoreboardNumber(value: number) {
  return Math.round(value).toLocaleString();
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatStatImprovement(stat: string, current: number, base: number) {
  if (current === base) return "";
  const diff = current - base;
  if (stat === "critChance" || stat === "cooldownReduction") {
    const pct = Math.round(diff * 100);
    return `(${pct >= 0 ? "+" : ""}${pct}%)`;
  }
  if (stat === "resourceCostMultiplier" || stat === "castSpeed") {
    const sign = diff >= 0 ? "+" : "";
    return `(${sign}${diff.toFixed(2)})`;
  }
  if (stat === "critMultiplier") {
    const sign = diff >= 0 ? "+" : "";
    return `(${sign}${diff.toFixed(1)}x)`;
  }
  const pct = base !== 0 ? Math.round((diff / base) * 100) : 0;
  return `(${pct >= 0 ? "+" : ""}${pct}%)`;
}

function renderLobbyUpgradeChoice(choice: Upgrade) {
  return `<button data-lobby-upgrade="${choice.id}" data-testid="lobby-upgrade-${choice.id}">${choice.name}</button>`;
}

function renderLevelChoice(choice: Upgrade) {
  if (choice.choiceType === "spell" && choice.abilityId && state?.abilities[choice.abilityId]) {
    const ability = state.abilities[choice.abilityId];
    return `<button class="spellChoice" data-upgrade="${choice.id}"><b>${choice.name}</b><span>${ability.description || choice.description || abilityDescription(choice.abilityId)}</span></button>`;
  }
  return `<button data-upgrade="${choice.id}">${choice.name}</button>`;
}

function renderPartyFrame(player: PlayerState, selectedAllyId: string | null) {
  const selected = selectedAllyId === player.id;
  const hpPercent = Math.max(0, player.hp / player.maxHealth * 100);
  return `<div class="partyFrame${selected ? " selectedTarget" : ""}${player.dead ? " dead" : ""}" role="button" tabindex="0" aria-pressed="${selected}" data-testid="party-frame" data-id="${player.id}">
    <b>${player.name}</b><br>
    <span>${player.classId || "No class"}</span>
    <div class="mini"><span style="width:${hpPercent}%"></span></div>
    ${player.dead ? `<span class="partyState">Down</span>` : ""}
  </div>`;
}

function markSelectedPartyFrame(playerId: string) {
  document.querySelectorAll<HTMLElement>("#party .partyFrame").forEach((frame) => {
    const selected = frame.dataset.id === playerId;
    frame.classList.toggle("selectedTarget", selected);
    frame.setAttribute("aria-pressed", String(selected));
  });
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
    autoAttackRange: "Auto Range",
    cooldownReduction: "CD Reduction",
    castSpeed: "Cast Speed"
  };
  return labels[stat] || stat;
}

function formatStat(stat: string, value: number) {
  if (stat === "critChance" || stat === "cooldownReduction") return `${Math.round(value * 100)}%`;
  if (stat === "resourceCostMultiplier") return `${Math.round(value * 100)}%`;
  if (stat === "critMultiplier") return `${value.toFixed(1)}x`;
  if (stat === "castSpeed") return `${value.toFixed(2)}`;
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

const STAT_DESCRIPTIONS: Record<string, { title: string; body: string; formula: string; usedBy?: string[] }> = {
  maxHealth: {
    title: "Max Health",
    body: "The size of your health pool. You die when it reaches 0.",
    formula: "HP is clamped between 0 and maxHealth. Healing and HoTs cannot push HP past this cap."
  },
  maxResource: {
    title: "Max Resource",
    body: "The cap on your class resource (Mana, Rage, Energy or Focus).",
    formula: "Resource regen and Restore effects are clamped at maxResource. Higher cap = more spells before having to wait."
  },
  attackPower: {
    title: "Attack Power",
    body: "Boosts your auto attack and every physical ability that scales with it.",
    formula: "Auto attack: damage = autoAttackDamage + max(attackPower × 0.35, spellPower × 0.2).\nEach physical effect: final += attackPower × its coefficient.",
    usedBy: ["Strike", "Taunting Blow", "Whirlwind", "Concussive Slam", "Charge", "Thunder Clap", "Power Shot", "Quick Shot", "Multishot", "Snare Trap", "Explosive Shot", "Arrow Barrage", "Backstep", "Poisoned Blades", "Kidney Shot", "Blade Flurry", "Eviscerate", "Maul", "Rake"]
  },
  spellPower: {
    title: "Spell Power",
    body: "Boosts spell damage, healing, HoTs, DoTs and shields that scale with it.",
    formula: "Each spell effect: final += spellPower × its coefficient.\nAuto attack: damage = autoAttackDamage + max(attackPower × 0.35, spellPower × 0.2).",
    usedBy: ["Heal", "Smite", "Renew", "Sanctify", "Barrier", "Resurrection", "Shadow Word: Pain", "Firebolt", "Frostbolt", "Frost Nova", "Meteor", "Arcane Blast", "Arcane Missiles", "Moonfire", "Rejuvenation"]
  },
  armor: {
    title: "Armor",
    body: "Reduces physical damage you take.",
    formula: "Physical damage taken = raw × 100 / (100 + armor).\nEach point of armor is worth more the lower your total is."
  },
  resistance: {
    title: "Resistance",
    body: "Reduces magical damage you take.",
    formula: "Magical damage taken = raw × 100 / (100 + resistance)."
  },
  critChance: {
    title: "Crit Chance",
    body: "Chance for any damage or heal to land as a critical strike.",
    formula: "On a crit the hit is multiplied by critMultiplier (default 1.5x). Cat Form adds +8%, Bear Form subtracts 2%."
  },
  critMultiplier: {
    title: "Crit Multiplier",
    body: "Damage multiplier applied on every critical strike.",
    formula: "Crit damage = base hit × critMultiplier."
  },
  moveSpeed: {
    title: "Move Speed",
    body: "How fast you move across the arena, in units per second.",
    formula: "Each tick the position advances by moveSpeed × dt. Sprint multiplies this by 1.75."
  },
  resourceRegen: {
    title: "Resource Regen",
    body: "Resource restored passively per second.",
    formula: "Resource += resourceRegen × dt every tick, capped at maxResource. Rage is generated by hitting and being hit instead."
  },
  resourceCostMultiplier: {
    title: "Resource Cost",
    body: "Multiplier applied to every ability's resource cost.",
    formula: "Effective cost = base cost × resourceCostMultiplier. Lower is cheaper (the upgrade applies ×0.85)."
  },
  autoAttackDamage: {
    title: "Auto Damage",
    body: "Base damage of your auto attack before stat scaling.",
    formula: "Final auto damage = autoAttackDamage + max(attackPower × 0.35, spellPower × 0.2), then crit / mitigation."
  },
  autoAttackInterval: {
    title: "Auto Speed",
    body: "Seconds between two auto attacks.",
    formula: "Effective interval = autoAttackInterval / haste multiplier. Adrenaline (Hunter) sets the multiplier to 3 for 3 seconds."
  },
  autoAttackRange: {
    title: "Auto Range",
    body: "Maximum distance at which your auto attack can land.",
    formula: "Auto attack fires only when the target is within autoAttackRange and in line of sight."
  },
  cooldownReduction: {
    title: "Cooldown Reduction",
    body: "Percentage shaved off every ability cooldown.",
    formula: "Effective cooldown = base × (1 - cooldownReduction). Global cooldown uses the same factor."
  },
  castSpeed: {
    title: "Cast Speed",
    body: "How quickly casts finish.",
    formula: "Effective cast time = base / castSpeed. Higher is faster."
  }
};

function statTooltipInfo(stat: string) {
  return STAT_DESCRIPTIONS[stat] || { title: statLabel(stat), body: "", formula: "" };
}

let statTooltipHideTimer: number | null = null;
function showStatTooltip(target: HTMLElement, stat: string) {
  const tooltip = document.querySelector<HTMLElement>("#statTooltip");
  if (!tooltip) return;
  const info = statTooltipInfo(stat);
  const usedBy = info.usedBy && info.usedBy.length
    ? `<div class="usedBy"><b>Used by</b><span>${info.usedBy.join(", ")}</span></div>`
    : "";
  tooltip.innerHTML = `<h3>${escapeHtml(info.title)}</h3>${info.body ? `<p>${escapeHtml(info.body)}</p>` : ""}${info.formula ? `<div class="formula">${escapeHtml(info.formula)}</div>` : ""}${usedBy}`;
  tooltip.style.visibility = "hidden";
  tooltip.style.display = "block";
  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const margin = 12;
  let top = targetRect.top - tooltipRect.height - margin;
  let placement: "above" | "below" = "above";
  if (top < 8) {
    top = targetRect.bottom + margin;
    placement = "below";
  }
  if (top + tooltipRect.height > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - tooltipRect.height - 8);
  }
  let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
  left = Math.max(8, Math.min(window.innerWidth - tooltipRect.width - 8, left));
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.dataset.placement = placement;
  tooltip.style.visibility = "visible";
  if (statTooltipHideTimer !== null) {
    clearTimeout(statTooltipHideTimer);
    statTooltipHideTimer = null;
  }
}

function hideStatTooltip() {
  if (statTooltipHideTimer !== null) clearTimeout(statTooltipHideTimer);
  statTooltipHideTimer = window.setTimeout(() => {
    const tooltip = document.querySelector<HTMLElement>("#statTooltip");
    if (tooltip) tooltip.style.display = "none";
    statTooltipHideTimer = null;
  }, 80);
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
      if ((event.abilityId?.includes("whirlwind") || event.abilityId?.includes("blade_flurry")) && event.sourceId) spinVisuals.set(event.sourceId, performance.now() + (event.duration || 3) * 1000);
      playStatusEffect(event); playStatusSound(event);
    }
    if (event.type === "ground_impact" && event.abilityId?.includes("boss_triple_meteor") && event.x !== undefined && event.z !== undefined) {
      meteorStrike(new Vector3(event.x, 0, event.z), 850, 6);
      expandingDisc("boss-meteor-impact", new Vector3(event.x, 0, event.z), event.radius || 3.5, new Color3(1, 0.16, 0.02), 700, 0.34);
    }
    if (event.type === "damage") { if (event.abilityId?.includes("arcane_missiles")) playArcaneMissileTick(event); playImpactEffect(event, false); playHitSound(event); }
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
    if (effect.type === "channel_damage") return `Channel: ${total} ${effect.school || ""} every ${effect.tickInterval || 0}s while casting`;
    if (effect.type === "heal") return `Heal: ${total}${effect.radius ? ` in ${effect.radius}m` : ""}`;
    if (effect.type === "hot") return `Heal over time: ${total}/tick for ${effect.duration || 0}s`;
    if (effect.type === "shield") return `Shield: ${total}`;
    if (effect.type === "stun") return `Freeze/Stun: ${effect.duration || 0}s${effect.radius ? ` in ${effect.radius}m` : ""}`;
    if (effect.type === "resource") return `Restore: ${total} resource`;
    if (effect.type === "auto_haste") return `Auto-shot speed x${(effect as any).multiplier || 1} for ${effect.duration || 0}s`;
    if (effect.type === "stat_buff") return `${statLabel(effect.stat || "stat")} x${effect.multiplier || 1} for ${effect.duration || 0}s`;
    if (effect.type === "immobilize") return `Immobilized for ${effect.duration || 0}s`;
    if (effect.type === "trap") return `Trap: ${total} damage, triggers in ${effect.radius || 0}m`;
    if (effect.type === "backstep") return `Backstep: ${total} ${effect.school || "physical"} damage behind the target`;
    if (effect.type === "charge") return `Charge: ${total} ${effect.school || "physical"} damage${effect.stunDuration ? `, stun ${effect.stunDuration}s` : ""}`;
    if (effect.type === "revive") return `Revive: ${total} health`;
    if (effect.type === "stealth") return `Vanish: undetectable for ${effect.duration || 0}s`;
    if (effect.type === "shapeshift") return effect.form ? `Shapeshift: ${effect.form}` : "Return to humanoid form";
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
  if (!me || me.spectator || !ability || state?.matchState !== "running") {
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
    priest_barrier: "Shield an ally from damage.",
    rogue_backstep: "Blink behind your target and strike from its back for heavy physical damage.",
    rogue_poisoned_blades: "Cut the target and poison it over time.",
    rogue_kidney_shot: "A precise dagger strike that briefly stuns one enemy.",
    rogue_blade_flurry: "Whirl with both daggers, cutting nearby enemies.",
    rogue_vanish: "Disappear for 5 seconds so enemies cannot discover or target you.",
    druid_bear_form: "Shift into a bear: much tougher, slower, and better at brawling in melee.",
    druid_cat_form: "Shift into a cat: faster movement, faster claws, and much higher crit pressure.",
    druid_humanoid_form: "Return to humanoid form, removing Bear or Cat Form stat changes.",
    druid_moonfire: "Call lunar nature magic onto an enemy, dealing instant damage and a short damage over time.",
    druid_maul: "A heavy bear swipe that hits hard and creates extra threat.",
    druid_rake: "A cat-form claw rake that cuts the enemy and leaves a bleed.",
    druid_rejuvenation: "A light nature HoT that steadily mends an ally.",
    shaman_lightning_bolt: "Hurl a crackling bolt of storm energy at an enemy, then watch the static eat at them.",
    shaman_healing_wave: "A slow but strong current of restorative water magic on one ally.",
    shaman_primal_strike: "Imbue your weapon with storm and strike an enemy up close. Cheap and instant.",
    shaman_chain_lightning: "Fork of lightning that strikes the target, then leaps to up to three more enemies.",
    shaman_healing_stream_totem: "Slam a totem that pulses healing water at the most injured nearby ally.",
    shaman_searing_totem: "Summon a fire totem that hurls flame at the nearest enemy every 1.2s.",
    shaman_earthbind_totem: "Drop a stone totem that pulses slowing earth magic, dragging down nearby enemies.",
    shaman_frost_shock: "A freezing instant strike that chills the target and slows their movement.",
    warrior_charge: "Rush into melee, slam the enemy, and briefly stun them.",
    warrior_thunder_clap: "Stomp the ground with a thunderous shockwave, damaging and slowing nearby enemies.",
    hunter_arrow_barrage: "Rain a hail of arrows over the target area.",
    hunter_explosive_shot: "Fire an explosive arrow that bursts and burns enemies.",
    priest_resurrection: "Call a fallen ally back to life with holy light.",
    priest_shadow_word_pain: "Brand an enemy with shadow pain over time.",
    mage_ice_block: "Encase yourself in solid ice and absorb huge damage.",
    mage_arcane_missiles: "Channel a volley of arcane bolts into one enemy.",
    rogue_sprint: "Massively increase movement speed for a short time.",
    rogue_eviscerate: "A brutal finishing strike for heavy physical damage."
  };
  return descriptions[abilityId] || "A class ability.";
}

function updateClassPreview(classId: string) {
  classPreview?.dispose();
  classPreview = createPreviewModel(classId);
  classPreview.scaling.setAll(2.2);
  updateLobbyPreviewPlacement();
  renderClassPreviewInfo(classId);
  lastClassPreviewInfoSignature = `${classId}|${JSON.stringify(state?.players[state.you]?.stats || {})}|${Object.keys(state?.abilities || {}).length}`;
}

function renderClassPreviewInfo(classId: string) {
  const cls = state?.classes?.[classId];
  const fallback = classInfo[classId];
  const name = cls?.name || fallback.name;
  const description = cls?.description || fallback.description;
  const statRows = renderClassStatRows(classId);
  const abilities = Object.values(state?.abilities || {})
    .filter((a) => a.classId === classId)
    .sort((a, b) => a.slot - b.slot);
  const abilitiesHtml = abilities.length
    ? `<div class="classAbilities"><h3>Spells</h3>${abilities.map((a) => renderClassAbility(a)).join("")}</div>`
    : "";
  document.querySelector("#classPreviewInfo")!.innerHTML = `<h2>${name}</h2><p>${description}</p><h3>Current Class Stats</h3><div class="classStats">${statRows}</div>${abilitiesHtml}`;
}

function renderClassStatRows(classId: string) {
  const cls = state?.classes?.[classId];
  const me = state?.players[state.you];
  const currentStats = me?.classId === classId && me.stats ? me.stats : cls?.baseStats || {};
  const baseStats = me?.classId === classId && me.baseStats ? me.baseStats : cls?.baseStats || {};
  return [
    { label: "HP", stat: "maxHealth" },
    { label: "Resource", stat: "maxResource" },
    { label: "Attack Power", stat: "attackPower" },
    { label: "Spell Power", stat: "spellPower" },
    { label: "Armor", stat: "armor" },
    { label: "Resistance", stat: "resistance" },
    { label: "Crit Chance", stat: "critChance" },
    { label: "Move Speed", stat: "moveSpeed" },
    { label: "Auto Damage", stat: "autoAttackDamage" },
    { label: "Cooldown Reduction", stat: "cooldownReduction" },
    { label: "Cast Speed", stat: "castSpeed" }
  ].filter((row) => currentStats[row.stat] !== undefined).map((row) => {
    const value = currentStats[row.stat];
    const base = baseStats[row.stat];
    const improvement = base !== undefined && value !== base ? formatStatImprovement(row.stat, value, base) : "";
    return `<div data-stat-tooltip="${row.stat}"><span>${row.label}</span><b>${formatStat(row.stat, value)}${improvement ? ` <em class="statImprovement">${improvement}</em>` : ""}</b></div>`;
  }).join("");
}

function renderClassAbility(ability: Ability) {
  const key = slotKeys[ability.slot] || String(ability.slot);
  const cost = ability.resourceCost ? `${ability.resourceCost.amount} ${resourceLabel(ability.resourceCost.type)}` : "None";
  const effects = (ability.effects || []).map((effect) => formatAbilityEffectSummary(effect)).filter(Boolean).join(" • ");
  return `<div class="classAbility">
    <div class="classAbilityHeader"><b>${ability.name}</b><span class="classAbilityKey">${key.toUpperCase()}</span></div>
    <div class="classAbilityTags"><span>${ability.targetType}</span><span>${ability.range || "-"}m</span><span>${ability.cooldown || 0}s CD</span><span>${ability.castTime || 0}s cast</span><span>${cost}</span></div>
    <p>${ability.description || abilityDescription(ability.id)}</p>
    ${effects ? `<div class="classAbilityEffects">${effects}</div>` : ""}
  </div>`;
}

function formatAbilityEffectSummary(effect: NonNullable<Ability["effects"]>[number]) {
  if (effect.type === "damage") return `${effect.amount || 0} ${effect.school || ""} damage${effect.radius ? ` in ${effect.radius}m` : ""}`;
  if (effect.type === "dot") return `${effect.amount || 0} ${effect.school || ""} DoT over ${effect.duration || 0}s`;
  if (effect.type === "channel_damage") return `${effect.amount || 0} ${effect.school || ""} every ${effect.tickInterval || 0}s while casting`;
  if (effect.type === "heal") return `${effect.amount || 0} heal${effect.radius ? ` in ${effect.radius}m` : ""}`;
  if (effect.type === "hot") return `${effect.amount || 0} HoT over ${effect.duration || 0}s`;
  if (effect.type === "shield") return `${effect.amount || 0} shield for ${effect.duration || 0}s`;
  if (effect.type === "stun") return `stun ${effect.duration || 0}s${effect.radius ? ` in ${effect.radius}m` : ""}`;
  if (effect.type === "slow") return `slow ${Math.round((effect.slowPercent || 0) * 100)}% for ${effect.duration || 0}s`;
  if (effect.type === "aura_damage") return `aura ${effect.amount || 0} damage for ${effect.duration || 0}s`;
  if (effect.type === "auto_haste") return `auto attack haste x${effect.multiplier || 1} for ${effect.duration || 0}s`;
  if (effect.type === "stat_buff") return `${effect.stat || "stat"} x${effect.multiplier || 1} for ${effect.duration || 0}s`;
  if (effect.type === "immobilize") return `immobile for ${effect.duration || 0}s`;
  if (effect.type === "trap") return `trap ${effect.radius || 0}m for ${effect.duration || 0}s`;
  if (effect.type === "backstep") return `${effect.amount || 0} backstep damage`;
  if (effect.type === "charge") return `${effect.amount || 0} charge damage${effect.stunDuration ? ` + ${effect.stunDuration}s stun` : ""}`;
  if (effect.type === "revive") return `revive for ${effect.amount || 0} health`;
  if (effect.type === "stealth") return `vanish ${effect.duration || 0}s`;
  if (effect.type === "shapeshift") return effect.form ? `shift into ${effect.form}` : "return to humanoid form";
  return "";
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
  const cls = state?.classes?.[classId];
  const fallback = classInfo[classId];
  const fake: PlayerState = { id: `preview-${classId}`, name: cls?.name || fallback.name, classId, ready: false, hp: 1, maxHealth: 1, resource: 0, maxResource: 1, resourceType: null, level: 1, xp: 0, dead: false, targetId: null, allyTargetId: null, position: { x: 0, z: 0 }, facing: 0, jumping: false, jumpProgress: 0, abilities: [], cooldowns: {}, globalCooldown: 0, autoAttack: { remaining: 0, interval: 1, progress: 0 }, pendingUpgrades: [], stats: {}, casting: null };
  const preview = createPlayer(fake);
  meshes.delete(fake.id);
  preview.getChildMeshes().forEach((mesh) => mesh.metadata = null);
  return preview;
}

function updateCastBar() {
  const cast = document.querySelector<HTMLElement>("#cast")!;
  const fill = document.querySelector<HTMLElement>("#castFill")!;
  const me = state?.players[state.you];
  if (!me?.casting || me.spectator) {
    cast.style.display = "none";
    castBarVisualProgress = 0;
    fill.style.transform = "scaleX(0)";
    return;
  }
  const ability = state?.abilities[me.casting.abilityId];
  const elapsed = Math.max(0, (performance.now() - snapshotReceivedAt) / 1000);
  const duration = Math.max(0.01, me.casting.duration);
  const remaining = Math.max(0, me.casting.remaining - elapsed);
  const progress = Math.max(0, Math.min(1, 1 - remaining / duration));
  castBarVisualProgress = Math.max(castBarVisualProgress, progress);
  cast.style.display = "block";
  fill.style.transform = `scaleX(${castBarVisualProgress})`;
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
    autoAttackVisualProgress = 0;
    return;
  }
  const elapsed = Math.max(0, (performance.now() - snapshotReceivedAt) / 1000);
  const interval = Math.max(0.01, me.autoAttack?.interval || 0.01);
  const remaining = Math.max(0, (me.autoAttack?.remaining || 0) - elapsed);
  const progress = Math.max(0, Math.min(1, 1 - remaining / interval));
  autoAttackVisualProgress = progress < autoAttackVisualProgress - 0.2 ? progress : Math.max(autoAttackVisualProgress, progress);
  fill.style.width = `${autoAttackVisualProgress * 100}%`;
  label.textContent = remaining > 0 ? `Auto ${remaining.toFixed(1)}s` : "Auto ready";
}

function renderWorld() {
  if (!state) return;
  if (staticWorldDirty) {
    renderMapObjects();
    renderGroundEffects();
    staticWorldDirty = false;
  }
  const live = new Set([...Object.keys(state.players), ...Object.keys(state.enemies)]);
  for (const [id, node] of meshes) if (!live.has(id)) { node.dispose(); meshes.delete(id); removeEnemyBar(id); }
  for (const p of Object.values(state.players)) {
    if (p.spectator) {
      const existing = meshes.get(p.id);
      if (existing) { existing.dispose(); meshes.delete(p.id); removePlayerNameLabel(p.id); }
      continue;
    }
    let node = meshes.get(p.id);
    if (node && (node.metadata?.classId !== p.classId || node.metadata?.form !== (p.form || null))) {
      node.dispose();
      meshes.delete(p.id);
      node = undefined;
    }
    node ||= createPlayer(p);
    const position = interpolatedPosition(p.id, p.position, "player");
    node.position.x = position.x;
    node.position.z = position.z;
    const jumpElapsed = Math.max(0, (performance.now() - snapshotReceivedAt) / 1000);
    const jumpProgress = p.jumping ? Math.min(1, Math.max(0, p.jumpProgress) + jumpElapsed / JUMP_DURATION_SECONDS) : 1;
    const jumpY = p.jumping ? 4 * jumpProgress * (1 - jumpProgress) * 0.9 : 0;
    const targetY = p.dead ? 0.45 : jumpY;
    node.position.y = lerpValue(node.position.y, targetY, p.jumping ? 0.42 : 0.3);
    node.setEnabled(state.matchState !== "lobby");
    const previous = previousState?.players[p.id]?.position;
    const serverDx = previous ? p.position.x - previous.x : 0;
    const serverDz = previous ? p.position.z - previous.z : 0;
    const inputDx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const inputDz = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const inputMoving = !p.dead && p.id === state.you && Math.hypot(inputDx, inputDz) > 0;
    const serverMoving = Math.hypot(serverDx, serverDz) > 0.025;
    const moving = !p.dead && (inputMoving || serverMoving);
    let targetFacing = Number(node.metadata?.visualFacing ?? node.rotation.y);
    if (inputMoving) {
      targetFacing = Math.atan2(inputDx, inputDz);
    } else if (serverMoving) {
      targetFacing = Math.atan2(serverDx, serverDz);
    } else if (Math.abs(p.facing) > 0.01 || p.facing !== 0) {
      targetFacing = p.facing;
    }
    const visualFacing = lerpAngle(Number(node.metadata?.visualFacing ?? node.rotation.y), targetFacing, moving ? 0.28 : 0.16);
    node.rotation.y = visualFacing;
    node.rotation.x = lerpValue(node.rotation.x, p.dead ? Math.PI / 2 : 0, 0.22);
    node.metadata = { ...(node.metadata || {}), x: position.x, z: position.z, moving, visualFacing, entityId: p.id, classId: p.classId, form: p.form || null };
    updateSelectionRing(node, p.id === state.you ? "self" : meTargetKind(p.id));
    updateActiveShield(node, p);
    updateIceBlockVisual(node, p);
    updateSprintTrail(node, p, moving);
    updateStealthVisual(node, p);
  }
  for (const e of Object.values(state.enemies)) {
    const node = meshes.get(e.id) || createEnemy(e);
    const position = interpolatedPosition(e.id, e.position, "enemy");
    node.position.x = position.x;
    node.position.z = position.z;
    node.metadata = { ...(node.metadata || {}), entityId: e.id };
    updateSelectionRing(node, meTargetKind(e.id));
    updateEnemyFov(node, e);
  }
}

function updateActiveShield(node: TransformNode, player: PlayerState) {
  const existing = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-active-shield"));
  const shieldActive = !player.iceBlocked && (player.shield || 0) > 0 && (player.shieldRemaining || 0) > 0;
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

function updateIceBlockVisual(node: TransformNode, player: PlayerState) {
  const existing = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-ice-block"));
  if (!player.iceBlocked) {
    existing?.dispose();
    return;
  }
  if (existing) return;
  const block = MeshBuilder.CreateBox(`${player.id}-ice-block`, { width: 1.45, height: 2.15, depth: 1.45 }, scene);
  block.parent = node;
  block.position.y = 1.02;
  block.rotation.y = Math.PI / 4;
  const material = transparentMat(`${player.id}-ice-block-mat`, new Color3(0.28, 0.9, 1), 0.48);
  material.emissiveColor = new Color3(0.08, 0.45, 0.72);
  block.material = material;
  block.isPickable = false;
}

function updateSprintTrail(node: TransformNode, player: PlayerState, moving: boolean) {
  if (!player.sprinting || !moving) return;
  const now = performance.now();
  if (now - Number(node.metadata?.lastSprintTrailAt || 0) < 70) return;
  node.metadata = { ...(node.metadata || {}), lastSprintTrailAt: now };
  const facing = Number(node.metadata?.visualFacing ?? node.rotation.y);
  const trail = MeshBuilder.CreateBox("rogue-sprint-trail", { width: 0.72, height: 0.035, depth: 1.55 }, scene);
  trail.position.set(node.position.x - Math.sin(facing) * 0.62, 0.12, node.position.z - Math.cos(facing) * 0.62);
  trail.rotation.y = facing;
  const material = transparentMat("rogue-sprint-trail-mat", new Color3(1, 0.05, 0.02), 0.34);
  material.emissiveColor = new Color3(0.72, 0.02, 0.01);
  trail.material = material;
  trail.isPickable = false;
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = (performance.now() - started) / 420;
    trail.scaling.z = 1 + progress * 0.45;
    material.alpha = Math.max(0, 0.34 * (1 - progress));
    if (progress >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      trail.dispose();
    }
  });
}

function updateStealthVisual(node: TransformNode, player: PlayerState) {
  const multiplier = player.stealthed ? 0.32 : 1;
  for (const mesh of node.getChildMeshes()) {
    const material = mesh.material as StandardMaterial | null;
    if (!material) continue;
    const metadata = (material.metadata || {}) as { baseAlpha?: number };
    if (metadata.baseAlpha === undefined) {
      metadata.baseAlpha = material.alpha ?? 1;
      material.metadata = metadata;
    }
    material.alpha = metadata.baseAlpha * multiplier;
  }
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
  } else if (effect.type === "totem") {
    buildTotemModel(root, effect.id, effect.totemType || "healing");
  } else if (effect.type === "boss_meteor") {
    const disc = MeshBuilder.CreateCylinder(`${effect.id}-disc`, { diameter: effect.radius * 2, height: 0.04, tessellation: 72 }, scene);
    disc.parent = root;
    disc.position.y = 0.055;
    const discMat = transparentMat(`${effect.id}-disc-mat`, new Color3(1, 0.12, 0.02), 0.22);
    discMat.emissiveColor = new Color3(0.75, 0.05, 0.01);
    disc.material = discMat;
    const ring = MeshBuilder.CreateTorus(`${effect.id}-ring`, { diameter: effect.radius * 2, thickness: 0.08, tessellation: 72 }, scene);
    ring.parent = root;
    ring.position.y = 0.12;
    ring.rotation.x = Math.PI / 2;
    const ringMat = mat(`${effect.id}-ring-mat`, new Color3(1, 0.34, 0.04));
    ringMat.emissiveColor = new Color3(1, 0.12, 0.02);
    ring.material = ringMat;
    const started = performance.now();
    const observer = scene.onBeforeRenderObservable.add(() => {
      if (!groundEffectMeshes.has(effect.id)) {
        scene.onBeforeRenderObservable.remove(observer);
        return;
      }
      const elapsed = performance.now() - started;
      const pulse = 0.5 + Math.sin(elapsed * 0.014) * 0.5;
      const remaining = Number(root.metadata?.remaining ?? 0);
      const urgency = remaining <= 0 ? 1 : Math.max(0, Math.min(1, 1 - remaining / 2));
      discMat.alpha = 0.14 + pulse * 0.12 + urgency * 0.12;
      ringMat.alpha = 0.55 + pulse * 0.35;
      ring.scaling.setAll(1 + pulse * 0.04 + urgency * 0.08);
    });
  }
  return root;
}

function buildTotemModel(root: TransformNode, id: string, totemType: string) {
  // Shared wooden totem body
  const wood = new Color3(0.34, 0.2, 0.1);
  const darkWood = new Color3(0.18, 0.1, 0.05);
  const baseDisc = MeshBuilder.CreateCylinder(`${id}-base`, { diameterTop: 0.42, diameterBottom: 0.5, height: 0.06, tessellation: 12 }, scene);
  baseDisc.parent = root; baseDisc.position.y = 0.03;
  baseDisc.material = mat(`${id}-base-mat`, darkWood);
  const trunk = MeshBuilder.CreateCylinder(`${id}-trunk`, { diameterTop: 0.16, diameterBottom: 0.22, height: 0.6, tessellation: 6 }, scene);
  trunk.parent = root; trunk.position.y = 0.36;
  trunk.material = mat(`${id}-trunk-mat`, wood);
  // Wrapping cord
  const cord = MeshBuilder.CreateCylinder(`${id}-cord`, { diameterTop: 0.19, diameterBottom: 0.19, height: 0.08, tessellation: 8 }, scene);
  cord.parent = root; cord.position.y = 0.18;
  cord.material = mat(`${id}-cord-mat`, new Color3(0.9, 0.84, 0.55));
  // Carved skull on top
  const skullColor = new Color3(0.92, 0.86, 0.72);
  const skull = box(`${id}-skull`, { width: 0.2, height: 0.16, depth: 0.18 }, skullColor);
  skull.parent = root; skull.position.y = 0.74;
  const eyeL = box(`${id}-skull-eye-l`, { width: 0.05, height: 0.05, depth: 0.04 }, new Color3(0.05, 0.05, 0.06));
  eyeL.parent = root; eyeL.position.set(-0.04, 0.76, -0.085);
  const eyeR = box(`${id}-skull-eye-r`, { width: 0.05, height: 0.05, depth: 0.04 }, new Color3(0.05, 0.05, 0.06));
  eyeR.parent = root; eyeR.position.set(0.04, 0.76, -0.085);
  // Fetish feathers on the side
  for (let i = 0; i < 2; i++) {
    const feather = box(`${id}-feather-${i}`, { width: 0.05, height: 0.32, depth: 0.022 }, new Color3(0.92, 0.62, 0.18));
    feather.parent = root;
    feather.position.set(-0.1 + i * 0.2, 0.62, 0.04);
    feather.rotation.x = 0.8;
  }
  // Floating elemental orb above the skull + ground aura
  const aura = MeshBuilder.CreateCylinder(`${id}-aura`, { diameter: 0.95, height: 0.02, tessellation: 48 }, scene);
  aura.parent = root; aura.position.y = 0.04;
  let auraColor: Color3;
  let orbColor: Color3;
  let orbEmissive: Color3;
  if (totemType === "healing") {
    auraColor = new Color3(0.32, 0.78, 0.88);
    orbColor = new Color3(0.55, 0.95, 1);
    orbEmissive = new Color3(0.22, 0.62, 0.78);
  } else if (totemType === "searing") {
    auraColor = new Color3(1, 0.45, 0.1);
    orbColor = new Color3(1, 0.75, 0.18);
    orbEmissive = new Color3(0.85, 0.32, 0.02);
  } else {
    // earthbind
    auraColor = new Color3(0.62, 0.42, 0.22);
    orbColor = new Color3(0.85, 0.62, 0.28);
    orbEmissive = new Color3(0.45, 0.28, 0.08);
  }
  aura.material = transparentMat(`${id}-aura-mat`, auraColor, 0.22);
  const orb = MeshBuilder.CreateSphere(`${id}-orb`, { diameter: 0.18, segments: 12 }, scene);
  orb.parent = root; orb.position.y = 0.96;
  const orbMat = mat(`${id}-orb-mat`, orbColor);
  orbMat.emissiveColor = orbEmissive;
  orb.material = orbMat;
  // Save references for animation
  root.metadata = { ...(root.metadata || {}), orb, aura };
}

function createGroundDressing() {
  const patches = [
    { x: -11.5, z: -7.2, sx: 7.8, sz: 4.2, color: palette.arenaMoss, alpha: 0.13, rot: 0.45 },
    { x: 12.8, z: 8.6, sx: 6.2, sz: 3.4, color: palette.arenaMoss, alpha: 0.12, rot: -0.35 },
    { x: 4.2, z: -14.5, sx: 8.2, sz: 3.6, color: palette.arenaWarm, alpha: 0.14, rot: 0.2 },
    { x: -17.4, z: 10.8, sx: 6.4, sz: 3.0, color: palette.arenaWarm, alpha: 0.12, rot: -0.85 },
    { x: 0, z: 0, sx: 10.5, sz: 6.0, color: palette.arenaWarm, alpha: 0.08, rot: 0.7 }
  ];
  patches.forEach((patch, index) => {
    const disc = MeshBuilder.CreateCylinder(`ground-patch-${index}`, { diameter: 1, height: 0.025, tessellation: 16 }, scene);
    disc.position.set(patch.x, 0.018 + index * 0.001, patch.z);
    disc.scaling.set(patch.sx, 1, patch.sz);
    disc.rotation.y = patch.rot;
    disc.material = transparentMat(`ground-patch-${index}-mat`, patch.color, patch.alpha);
    disc.isPickable = false;
  });

  for (let i = 0; i < 28; i++) {
    const angle = i * Math.PI * 2 / 28;
    const dist = i % 2 === 0 ? 25.8 : 24.9;
    const stone = MeshBuilder.CreateBox(`arena-edge-stone-${i}`, { width: 0.62 + (i % 3) * 0.12, height: 0.12, depth: 0.32 }, scene);
    stone.position.set(Math.cos(angle) * dist, 0.05, Math.sin(angle) * dist);
    stone.rotation.y = -angle + Math.PI / 2 + (i % 4 - 1.5) * 0.08;
    stone.material = mat(`arena-edge-stone-${i}-mat`, i % 5 === 0 ? palette.stoneLight : palette.stone);
    stone.isPickable = false;
  }

  // Grass disabled
  // createGrassMesh("arena-field-grass", null, 52, lowSpecMode ? 160 : 360, palette.leafDark.scale(1.02), false);
  // createGrassMesh("arena-edge-grass", null, 26.2, lowSpecMode ? 58 : 118, palette.leafDark.scale(1.08), true);
}

function addContactShadow(parent: TransformNode, name: string, diameter: number, alpha = 0.16, flatten = 1) {
  const shadow = MeshBuilder.CreateCylinder(name, { diameter, height: 0.018, tessellation: 28 }, scene);
  shadow.parent = parent;
  shadow.position.y = 0.018;
  shadow.scaling.z = flatten;
  shadow.material = transparentMat(`${name}-mat`, palette.shadow, alpha);
  shadow.isPickable = false;
  return shadow;
}

function addPropGrass(parent: TransformNode, object: MapObject, diameter: number, count: number) {
  // grass disabled
}

function createGrassMesh(name: string, parent: TransformNode | null, spread: number, count: number, color: Color3, ringOnly: boolean) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.22;
    const radius = ringOnly ? spread + Math.sin(i * 78.233) * 1.35 : Math.sqrt((i * 37.719) % 1) * spread * 0.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const bladeAngle = angle + Math.PI / 2 + Math.sin(i * 4.17) * 0.8;
    const width = 0.09 + ((i * 13) % 7) * 0.012;
    const height = 0.34 + ((i * 17) % 9) * 0.045;
    const lean = 0.08 + ((i * 19) % 5) * 0.018;
    const dx = Math.cos(bladeAngle) * width;
    const dz = Math.sin(bladeAngle) * width;
    const lx = Math.cos(bladeAngle + Math.PI / 2) * lean;
    const lz = Math.sin(bladeAngle + Math.PI / 2) * lean;
    const base = positions.length / 3;
    positions.push(
      x - dx, 0.035, z - dz,
      x + dx, 0.035, z + dz,
      x + dx * 0.22 + lx, height, z + dz * 0.22 + lz,
      x - dx * 0.22 + lx, height * 0.92, z - dz * 0.22 + lz
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.applyToMesh(mesh, true);
  mesh.parent = parent;
  mesh.isPickable = false;
  const material = mat(`${name}-mat`, color);
  material.backFaceCulling = false;
  material.specularColor = Color3.Black();
  mesh.material = material;
  return mesh;
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
      mesh.receiveShadows = false;
    });
  }
}

function mapObjectSignature(object: MapObject) {
  return [object.type, object.x, object.z, object.radius, object.width, object.depth, object.variant, object.rotation, object.blocksSight].join(":");
}

function createMapObject(object: MapObject) {
  const root = new TransformNode(object.id, scene);
  root.rotation.y = object.type === "wall" ? 0 : object.rotation || 0;
  if (object.type === "wall") {
    const wallHeight = 3.2;
    const width = object.width || 1;
    const depth = object.depth || 1;
    const longAxis = width >= depth ? "x" : "z";
    const length = Math.max(width, depth);
    const thickness = Math.min(width, depth);
    addContactShadow(root, `${object.id}-shadow`, length * 1.15, 0.18, 0.72);
    const wall = box(`${object.id}-body`, { width, height: wallHeight, depth }, palette.stone);
    wall.parent = root;
    wall.position.y = wallHeight / 2;
    const cap = box(`${object.id}-cap`, { width: width + 0.22, height: 0.22, depth: depth + 0.22 }, palette.stoneLight);
    cap.parent = root;
    cap.position.y = wallHeight + 0.11;
    const band = box(`${object.id}-band`, { width: width + 0.06, height: 0.18, depth: depth + 0.06 }, palette.stone.scale(0.62));
    band.parent = root;
    band.position.y = wallHeight * 0.55;
    const moss = box(`${object.id}-moss`, { width: width * 0.84, height: 0.08, depth: depth + 0.1 }, palette.leafDark);
    moss.parent = root;
    moss.position.y = wallHeight + 0.25;
    const merlonCount = Math.max(3, Math.floor(length / 1.15));
    const merlonStep = length / merlonCount;
    for (let i = 0; i < merlonCount; i++) {
      if (i % 2 === 1 && merlonCount > 4) continue;
      const offset = -length / 2 + merlonStep * (i + 0.5);
      const merlon = box(`${object.id}-merlon-${i}`, longAxis === "x"
        ? { width: merlonStep * 0.58, height: 0.62, depth: thickness + 0.34 }
        : { width: thickness + 0.34, height: 0.62, depth: merlonStep * 0.58 }, palette.stoneLight.scale(0.95));
      merlon.parent = root;
      merlon.position.y = wallHeight + 0.52;
      if (longAxis === "x") merlon.position.x = offset;
      else merlon.position.z = offset;
    }
    for (const side of [-1, 1]) {
      const tower = box(`${object.id}-end-tower-${side}`, longAxis === "x"
        ? { width: 0.75, height: wallHeight + 0.35, depth: thickness + 0.55 }
        : { width: thickness + 0.55, height: wallHeight + 0.35, depth: 0.75 }, palette.stone.scale(1.04));
      tower.parent = root;
      tower.position.y = (wallHeight + 0.35) / 2;
      if (longAxis === "x") tower.position.x = side * length / 2;
      else tower.position.z = side * length / 2;
      const towerCap = box(`${object.id}-end-cap-${side}`, longAxis === "x"
        ? { width: 0.95, height: 0.2, depth: thickness + 0.78 }
        : { width: thickness + 0.78, height: 0.2, depth: 0.95 }, palette.stoneLight);
      towerCap.parent = root;
      towerCap.position.y = wallHeight + 0.5;
      if (longAxis === "x") towerCap.position.x = side * length / 2;
      else towerCap.position.z = side * length / 2;
    }
    const layerCount = 4;
    for (let i = 1; i <= layerCount; i++) {
      const layer = box(`${object.id}-stone-layer-${i}`, longAxis === "x"
        ? { width: length + 0.08, height: 0.055, depth: thickness + 0.08 }
        : { width: thickness + 0.08, height: 0.055, depth: length + 0.08 }, palette.stone.scale(i % 2 ? 0.78 : 0.9));
      layer.parent = root;
      layer.position.y = i * wallHeight / (layerCount + 1);
    }
    addPropGrass(root, object, Math.max(width, depth) * 0.95, 14);
  } else if (object.type === "tree") {
    const variant = object.variant || 0;
    const scale = (object.radius || 1.0) / 1.0;
    addContactShadow(root, `${object.id}-shadow`, 2.6, 0.2);
    const trunkHeight = 1.45 + variant * 0.16;
    const trunk = MeshBuilder.CreateCylinder(`${object.id}-trunk`, { diameterTop: 0.36 + variant * 0.03, diameterBottom: 0.56 + variant * 0.06, height: trunkHeight, tessellation: 7 }, scene);
    trunk.parent = root;
    trunk.position.y = trunkHeight / 2;
    trunk.rotation.z = (variant - 2) * 0.035;
    trunk.material = mat(`${object.id}-trunk-mat`, palette.bark.scale(0.92 + variant * 0.04));
    const rootA = box(`${object.id}-root-a`, { width: 1.0, height: 0.16, depth: 0.18 }, palette.bark.scale(0.8));
    rootA.parent = root; rootA.position.set(0.28, 0.1, 0.24); rootA.rotation.y = 0.55;
    const rootB = box(`${object.id}-root-b`, { width: 0.82, height: 0.14, depth: 0.16 }, palette.bark.scale(0.72));
    rootB.parent = root; rootB.position.set(-0.26, 0.09, -0.18); rootB.rotation.y = -0.85;
    const crownColor = variant === 2 ? palette.leafDark : variant === 3 ? palette.leafGold : palette.leaf;
    if (variant === 4) {
      const lower = MeshBuilder.CreateCylinder(`${object.id}-crown-lower`, { diameterTop: 1.8, diameterBottom: 3.4, height: 1.6, tessellation: 8 }, scene);
      lower.parent = root; lower.position.y = 2.4; lower.material = mat(`${object.id}-crown-lower-mat`, crownColor);
      const upper = MeshBuilder.CreateCylinder(`${object.id}-crown-upper`, { diameterTop: 0.9, diameterBottom: 2.2, height: 1.4, tessellation: 8 }, scene);
      upper.parent = root; upper.position.y = 3.6; upper.material = mat(`${object.id}-crown-upper-mat`, crownColor);
    } else if (variant === 0) {
      const crown = MeshBuilder.CreateCylinder(`${object.id}-crown`, { diameterTop: 0.75, diameterBottom: 2.35, height: 2.35, tessellation: 7 }, scene);
      crown.parent = root; crown.position.y = 2.7; crown.material = mat(`${object.id}-crown-mat`, crownColor);
    } else {
      const lower = MeshBuilder.CreateSphere(`${object.id}-crown-lower`, { diameter: 2.0 + variant * 0.14, segments: 7 }, scene);
      lower.parent = root; lower.position.set(-0.18, 2.35, 0.04); lower.scaling.y = 0.82; lower.material = mat(`${object.id}-crown-lower-mat`, crownColor);
      const upper = MeshBuilder.CreateSphere(`${object.id}-crown-upper`, { diameter: 1.55 + variant * 0.1, segments: 7 }, scene);
      upper.parent = root; upper.position.set(0.26, 3.05, -0.12); upper.scaling.y = 0.95; upper.material = mat(`${object.id}-crown-upper-mat`, crownColor.scale(1.08));
    }
    root.scaling.setAll(scale);
    addPropGrass(root, object, 2.2, 10);
  } else if (object.type === "bush") {
    const variant = object.variant || 0;
    const radius = object.radius || 0.7;
    addContactShadow(root, `${object.id}-shadow`, radius * 1.9, 0.12);
    const bushColor = variant === 1 ? palette.leaf.scale(1.1) : variant === 2 ? palette.leafGold : palette.leafDark.scale(1.18);
    for (let i = 0; i < 3; i++) {
      const bush = MeshBuilder.CreateSphere(`${object.id}-bush-${i}`, { diameter: radius * (1.0 + i * 0.18), segments: 6 }, scene);
      bush.parent = root;
      bush.position.set((i - 1) * radius * 0.38, 0.38 + i * 0.08, i % 2 ? radius * 0.18 : -radius * 0.12);
      bush.scaling.y = 0.72;
      bush.material = mat(`${object.id}-bush-${i}-mat`, bushColor.scale(0.9 + i * 0.08));
    }
    const berries = variant === 2 ? MeshBuilder.CreateSphere(`${object.id}-berries`, { diameter: 0.16, segments: 5 }, scene) : null;
    if (berries) {
      berries.parent = root;
      berries.position.set(0.25, 0.7, 0.1);
      berries.material = mat(`${object.id}-berries-mat`, new Color3(0.85, 0.2, 0.25));
    }
    addPropGrass(root, object, radius * 1.35, 5);
  } else if (object.type === "crystal") {
    addContactShadow(root, `${object.id}-shadow`, 1.8, 0.14);
    const crystal = MeshBuilder.CreateCylinder(`${object.id}-crystal`, { diameterTop: 0.18, diameterBottom: 1.15, height: 2.65, tessellation: 5 }, scene);
    crystal.parent = root;
    crystal.position.y = 1.32;
    crystal.rotation.y = Math.PI / 5;
    const material = mat(`${object.id}-crystal-mat`, new Color3(0.3, 0.92, 1));
    material.emissiveColor = new Color3(0.08, 0.38, 0.48);
    crystal.material = material;
  } else if (object.type === "tube") {
    const variant = object.variant || 0;
    const radius = object.radius || 0.85;
    addContactShadow(root, `${object.id}-shadow`, radius * 2.0, 0.16);
    const tube = MeshBuilder.CreateCylinder(`${object.id}-tube`, { diameter: radius * 1.55, height: 2.4 + variant * 0.25, tessellation: 16 }, scene);
    tube.parent = root;
    tube.position.y = (2.4 + variant * 0.25) / 2;
    tube.material = mat(`${object.id}-tube-mat`, variant === 1 ? new Color3(0.38, 0.42, 0.46) : variant === 2 ? new Color3(0.28, 0.46, 0.5) : new Color3(0.44, 0.45, 0.48));
    const rimColor = new Color3(0.18, 0.2, 0.23);
    for (const y of [0.14, 2.26 + variant * 0.25]) {
      const rim = MeshBuilder.CreateTorus(`${object.id}-tube-rim-${y}`, { diameter: radius * 1.56, thickness: 0.16, tessellation: 16 }, scene);
      rim.parent = root;
      rim.position.y = y;
      rim.material = mat(`${object.id}-tube-rim-${y}-mat`, rimColor);
    }
  } else if (object.type === "well") {
    addContactShadow(root, `${object.id}-shadow`, 2.8, 0.18);
    const well = MeshBuilder.CreateCylinder(`${object.id}-well`, { diameter: 2.45, height: 1.0, tessellation: 18 }, scene);
    well.parent = root;
    well.position.y = 0.5;
    well.material = mat(`${object.id}-well-mat`, new Color3(0.48, 0.5, 0.55));
    const water = MeshBuilder.CreateCylinder(`${object.id}-water`, { diameter: 1.85, height: 0.04, tessellation: 18 }, scene);
    water.parent = root;
    water.position.y = 1.03;
    water.material = transparentMat(`${object.id}-water-mat`, new Color3(0.22, 0.62, 1), 0.58);
    addPropGrass(root, object, 2.5, 10);
  } else if (object.type === "rock") {
    const radius = object.radius || 0.8;
    addContactShadow(root, `${object.id}-shadow`, radius * 1.85, 0.15);
    const main = MeshBuilder.CreateSphere(`${object.id}-rock-main`, { diameter: radius * 1.45, segments: 6 }, scene);
    main.parent = root; main.position.y = radius * 0.46; main.scaling.set(1.18, 0.62, 0.86); main.material = mat(`${object.id}-rock-main-mat`, palette.stone);
    const chip = MeshBuilder.CreateSphere(`${object.id}-rock-chip`, { diameter: radius * 0.8, segments: 5 }, scene);
    chip.parent = root; chip.position.set(radius * 0.42, radius * 0.36, -radius * 0.16); chip.scaling.set(0.82, 0.48, 0.7); chip.material = mat(`${object.id}-rock-chip-mat`, palette.stoneLight.scale(0.9));
    addPropGrass(root, object, radius * 1.5, 5);
  } else if (object.type === "ruin") {
    const radius = object.radius || 1.5;
    addContactShadow(root, `${object.id}-shadow`, radius * 2.25, 0.17, 0.8);
    const base = box(`${object.id}-base`, { width: radius * 1.8, height: 0.28, depth: radius * 1.2 }, palette.stone.scale(0.86));
    base.parent = root; base.position.y = 0.14;
    const slab = box(`${object.id}-slab`, { width: radius * 1.25, height: 1.15, depth: 0.32 }, palette.stone);
    slab.parent = root; slab.position.set(-radius * 0.22, 0.78, 0); slab.rotation.z = 0.12;
    const broken = box(`${object.id}-broken`, { width: radius * 0.58, height: 0.72, depth: 0.3 }, palette.stoneLight.scale(0.9));
    broken.parent = root; broken.position.set(radius * 0.58, 0.5, radius * 0.16); broken.rotation.z = -0.22;
    const rune = MeshBuilder.CreateCylinder(`${object.id}-rune`, { diameter: radius * 0.55, height: 0.035, tessellation: 6 }, scene);
    rune.parent = root; rune.position.set(-radius * 0.22, 1.38, -0.18); rune.rotation.x = Math.PI / 2; rune.material = transparentMat(`${object.id}-rune-mat`, palette.magic, 0.46);
    addPropGrass(root, object, radius * 1.8, 10);
  } else {
    addContactShadow(root, `${object.id}-shadow`, (object.radius || 1) * 1.8, 0.15);
    const pillar = MeshBuilder.CreateCylinder(`${object.id}-pillar`, { diameter: (object.radius || 1) * 1.35, height: 2.9, tessellation: 10 }, scene);
    pillar.parent = root;
    pillar.position.y = 1.45;
    pillar.material = mat(`${object.id}-pillar-mat`, new Color3(0.58, 0.57, 0.52));
    addPropGrass(root, object, (object.radius || 1) * 1.5, 6);
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
  const cone = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-fov")) as Mesh | undefined || createFovCone(`${enemy.id}-fov`);
  updateFovCone(cone, enemy);
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
  mesh.material = transparentMat(`${name}-mat`, new Color3(1, 0.7, 0.1), 0.22);
  (mesh.material as StandardMaterial).backFaceCulling = false;
  mesh.isPickable = false;
  return mesh;
}

function updateFovCone(mesh: Mesh, enemy: EnemyState) {
  const range = 11;
  const halfAngle = Math.PI * 55 / 180;
  const segments = 36;
  const positions = [0, 0, 0];
  const indices: number[] = [];
  const mapObs = state?.mapObjects || [];
  const ex = enemy.position.x;
  const ez = enemy.position.z;
  const facing = enemy.facing || 0;
  for (let i = 0; i <= segments; i++) {
    const angle = -halfAngle + (halfAngle * 2 * i) / segments;
    const localX = Math.sin(angle) * range;
    const localZ = Math.cos(angle) * range;
    const world = rotateFovPoint(localX, localZ, facing);
    const hit = losHitDist(ex, ez, ex + world.x, ez + world.z, mapObs);
    const visibleDistance = Math.max(0.5, Math.min(range, hit === null ? range : hit - 0.18));
    positions.push(Math.sin(angle) * visibleDistance, 0, Math.cos(angle) * visibleDistance);
    if (i > 0) indices.push(0, i, i + 1);
  }
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, true);
}

function rotateFovPoint(x: number, z: number, facing: number) {
  const s = Math.sin(facing);
  const c = Math.cos(facing);
  return { x: x * c + z * s, z: z * c - x * s };
}

function losHitDist(x1: number, z1: number, x2: number, z2: number, mapObs: MapObject[]): number | null {
  let best: number | null = null;
  for (const obj of mapObs) {
    if (!obj.blocksSight) continue;
    const hit = segHitDist(x1, z1, x2, z2, obj);
    if (hit !== null && (best === null || hit < best)) best = hit;
  }
  return best;
}

function segHitDist(x1: number, z1: number, x2: number, z2: number, obj: MapObject): number | null {
  if (obj.width != null && obj.depth != null) {
    const minX = obj.x - obj.width / 2;
    const maxX = obj.x + obj.width / 2;
    const minZ = obj.z - obj.depth / 2;
    const maxZ = obj.z + obj.depth / 2;
    const dx = x2 - x1;
    const dz = z2 - z1;
    let tMin = 0;
    let tMax = 1;
    for (const [start, delta, low, high] of [[x1, dx, minX, maxX], [z1, dz, minZ, maxZ]] as [number, number, number, number][]) {
      if (Math.abs(delta) < 0.0001) {
        if (start < low || start > high) return null;
      } else {
        const t1 = (low - start) / delta;
        const t2 = (high - start) / delta;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
        if (tMin > tMax) return null;
      }
    }
    return tMin * Math.hypot(dx, dz);
  }
  const r = obj.radius || 0.8;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lSq = dx * dx + dz * dz;
  if (lSq <= 0) return Math.hypot(obj.x - x1, obj.z - z1) <= r ? 0 : null;
  const t = Math.max(0, Math.min(1, ((obj.x - x1) * dx + (obj.z - z1) * dz) / lSq));
  const cx = x1 + t * dx;
  const cz = z1 + t * dz;
  if (Math.hypot(obj.x - cx, obj.z - cz) <= r) return t * Math.hypot(dx, dz);
  return null;
}

function animateWorld() {
  const t = performance.now() / 1000;
  const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
  const poseBlend = Math.min(1, dt * 18);
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
    const moveBlend = Number(node.metadata?.moveBlend || 0) + ((moving ? 1 : 0) - Number(node.metadata?.moveBlend || 0)) * Math.min(1, dt * 12);
    const gaitPhase = Number(node.metadata?.gaitPhase || 0) + dt * (3.5 + moveBlend * 6.5);
    node.metadata = { ...(node.metadata || {}), moveBlend, gaitPhase };
    const gait = Math.sin(gaitPhase);
    const bob = Math.abs(gait) * 0.12 * moveBlend + Math.sin(t * 2) * 0.025 * (1 - moveBlend);
    if (body) {
      body.position.y = lerpValue(body.position.y, 0.7 + bob, poseBlend);
      body.rotation.z = lerpValue(body.rotation.z, gait * 0.08 * moveBlend, poseBlend);
    }
    if (head) head.position.y = lerpValue(head.position.y, 1.45 + bob * 0.8, poseBlend);
    if (leftArm && rightArm) {
      let leftX = gait * 0.55 * moveBlend - 0.06 * (1 - moveBlend);
      let rightX = -gait * 0.55 * moveBlend - 0.06 * (1 - moveBlend);
      let leftZ = -0.16;
      let rightZ = 0.16;
      let leftY = 0.92 + bob * 0.6;
      let rightY = 0.92 + bob * 0.6;
      if (spinning) {
        leftX = -1.35;
        rightX = -1.35;
        leftZ = -0.75;
        rightZ = 0.75;
      } else if (casting) {
        const pulse = Math.sin(t * 14) * 0.12;
        leftX = -1.95 + pulse;
        rightX = -1.95 - pulse;
        leftZ = -0.55;
        rightZ = 0.55;
        leftY = 1.1 + Math.abs(pulse) * 0.25;
        rightY = 1.1 + Math.abs(pulse) * 0.25;
      } else if (autoSwing > 0) {
        const swing = Math.sin((1 - autoSwing) * Math.PI);
        const hand = player.classId === "rogue" ? autoSwingHands.get(id) || "right" : "right";
        if (hand === "left") {
          leftX = -1.6 * swing - 0.18;
          leftZ = -0.35 - swing * 0.35;
          rightX = -gait * 0.35 * moveBlend - 0.05 * (1 - moveBlend);
          leftY = 0.95 + swing * 0.18 + bob * 0.45;
        } else {
          rightX = -1.6 * swing - 0.18;
          rightZ = 0.35 + swing * 0.35;
          leftX = gait * 0.35 * moveBlend - 0.05 * (1 - moveBlend);
          rightY = 0.95 + swing * 0.18 + bob * 0.45;
        }
      }
      leftArm.rotation.x = lerpValue(leftArm.rotation.x, leftX, poseBlend);
      rightArm.rotation.x = lerpValue(rightArm.rotation.x, rightX, poseBlend);
      leftArm.rotation.z = lerpValue(leftArm.rotation.z, leftZ, poseBlend);
      rightArm.rotation.z = lerpValue(rightArm.rotation.z, rightZ, poseBlend);
      leftArm.position.x = lerpValue(leftArm.position.x, Number(leftArm.metadata?.restX ?? -0.58), poseBlend);
      rightArm.position.x = lerpValue(rightArm.position.x, Number(rightArm.metadata?.restX ?? 0.58), poseBlend);
      leftArm.position.y = lerpValue(leftArm.position.y, leftY, poseBlend);
      rightArm.position.y = lerpValue(rightArm.position.y, rightY, poseBlend);
      leftArm.position.z = lerpValue(leftArm.position.z, 0, poseBlend);
      rightArm.position.z = lerpValue(rightArm.position.z, 0, poseBlend);
    }
    const shield = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-active-shield"));
    if (shield) {
      const pulse = 1 + Math.sin(t * 8) * 0.045;
      shield.scaling.setAll(pulse);
    }
    const iceBlockMesh = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-ice-block"));
    if (iceBlockMesh) {
      const pulse = 1 + Math.sin(t * 6) * 0.025;
      iceBlockMesh.scaling.setAll(pulse);
      iceBlockMesh.rotation.y += dt * 0.25;
    }
    const halo = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-halo"));
    if (halo) {
      halo.rotation.z += dt * 0.7;
      const material = halo.material as StandardMaterial;
      material.emissiveColor = new Color3(0.58, 0.44, 0.08).scale(0.8 + Math.sin(t * 3.2) * 0.18);
    }
    const staffGem = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-staff-gem"));
    if (staffGem) {
      const material = staffGem.material as StandardMaterial;
      material.emissiveColor = new Color3(0.16, 0.48, 0.7).scale(0.85 + Math.sin(t * 4.4) * 0.22);
    }
    for (const orb of node.getChildMeshes().filter((mesh) => mesh.name.includes("-arcane-orb-"))) {
      orb.position.y = 1.18 + Math.sin(t * 2.8 + orb.name.length) * 0.08;
      orb.rotation.y += dt * 1.4;
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
  for (const [, node] of mapMeshes) {
    const crystal = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-crystal"));
    if (crystal) {
      crystal.rotation.y += dt * 0.35;
      const material = crystal.material as StandardMaterial;
      material.emissiveColor = palette.magic.scale(0.28 + Math.sin(t * 2.2) * 0.08);
    }
    const water = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-water"));
    if (water) {
      water.rotation.y += dt * 0.18;
      const material = water.material as StandardMaterial;
      material.alpha = 0.48 + Math.sin(t * 1.7) * 0.08;
    }
    const rune = node.getChildMeshes().find((mesh) => mesh.name.endsWith("-rune"));
    if (rune) {
      const material = rune.material as StandardMaterial;
      material.alpha = 0.32 + Math.sin(t * 2.4) * 0.12;
    }
  }
  playAmbientFoley(playerIsMoving);
  for (const [, node] of groundEffectMeshes) {
    const orb = node.metadata?.orb as Mesh | undefined;
    const aura = node.metadata?.aura as Mesh | undefined;
    if (orb) {
      const phase = t * 2.2 + node.position.x * 0.6 + node.position.z * 0.4;
      orb.position.y = 0.96 + Math.sin(phase) * 0.08;
      const orbMat = orb.material as StandardMaterial;
      if (orbMat?.emissiveColor) {
        const base = orbMat.diffuseColor;
        orbMat.emissiveColor = base.scale(0.55 + (Math.sin(phase * 1.4) * 0.5 + 0.5) * 0.55);
      }
    }
    if (aura) {
      const mat = aura.material as StandardMaterial;
      if (mat) {
        const base = (node.metadata?.auraBaseAlpha as number) ?? 0.22;
        mat.alpha = base + Math.sin(t * 1.8 + node.position.z) * 0.08;
      }
    }
  }
}

function createPlayer(p: PlayerState) {
  const root = new TransformNode(p.id, scene);
  root.metadata = { entityId: p.id, classId: p.classId, form: p.form || null };
  if (p.classId === "druid" && p.form) {
    createDruidFormModel(root, p.id, p.form);
    const ring = MeshBuilder.CreateCylinder(`${p.id}-ring`, { diameter: p.form === "bear" ? 1.9 : 1.45, height: 0.025, tessellation: 48 }, scene); ring.parent = root; ring.material = transparentMat(`${p.id}-ringmat`, new Color3(0.1, 0.55, 1), 0.22); ring.metadata = { entityId: p.id };
    ring.position.y = 0.015;
    meshes.set(p.id, root);
    markEntityMeshes(root, p.id);
    return root;
  }
  const color = p.classId === "warrior" ? new Color3(0.7, 0.15, 0.1) : p.classId === "hunter" ? new Color3(0.1, 0.45, 0.18) : p.classId === "priest" ? new Color3(0.95, 0.9, 0.72) : p.classId === "rogue" ? new Color3(0.16, 0.12, 0.2) : p.classId === "druid" ? new Color3(0.22, 0.43, 0.18) : p.classId === "shaman" ? new Color3(0.16, 0.42, 0.6) : new Color3(0.15, 0.2, 0.85);
  const build = playerBuild(p.classId);
  addContactShadow(root, `${p.id}-contact-shadow`, 1.25, 0.2, 0.78);
  const body = box(`${p.id}-body`, { width: build.bodyWidth, height: build.bodyHeight, depth: build.bodyDepth }, color); body.parent = root; body.position.y = 0.7;
  const head = box(`${p.id}-head`, { width: build.headWidth, height: 0.45, depth: build.headDepth }, build.skin); head.parent = root; head.position.y = 1.45;
  const leftArm = box(`${p.id}-left-arm`, { width: build.armWidth, height: build.armHeight, depth: build.armDepth }, color.scale(0.85)); leftArm.parent = root; leftArm.position.set(-build.armX, 0.92, 0); leftArm.rotation.z = -0.16; leftArm.metadata = { restX: -build.armX };
  const rightArm = box(`${p.id}-right-arm`, { width: build.armWidth, height: build.armHeight, depth: build.armDepth }, color.scale(0.85)); rightArm.parent = root; rightArm.position.set(build.armX, 0.92, 0); rightArm.rotation.z = 0.16; rightArm.metadata = { restX: build.armX };
  addClassDetails(root, p.id, p.classId, color);
  const ring = MeshBuilder.CreateCylinder(`${p.id}-ring`, { diameter: 1.45, height: 0.025, tessellation: 48 }, scene); ring.parent = root; ring.material = transparentMat(`${p.id}-ringmat`, new Color3(0.1, 0.55, 1), 0.22); ring.metadata = { entityId: p.id };
  ring.position.y = 0.015;
  meshes.set(p.id, root);
  markEntityMeshes(root, p.id);
  return root;
}

function createDruidFormModel(root: TransformNode, id: string, form: string) {
  if (form === "bear") {
    addContactShadow(root, `${id}-bear-contact-shadow`, 1.85, 0.24, 0.82);
    const fur = new Color3(0.28, 0.16, 0.08);
    const body = box(`${id}-bear-body`, { width: 1.35, height: 0.86, depth: 1.05 }, fur); body.parent = root; body.position.y = 0.62;
    const hump = box(`${id}-bear-hump`, { width: 0.9, height: 0.42, depth: 0.78 }, fur.scale(0.82)); hump.parent = root; hump.position.set(0, 1.02, -0.1);
    const head = box(`${id}-bear-head`, { width: 0.72, height: 0.52, depth: 0.6 }, fur.scale(1.08)); head.parent = root; head.position.set(0, 0.94, 0.66);
    const snout = box(`${id}-bear-snout`, { width: 0.42, height: 0.22, depth: 0.26 }, new Color3(0.16, 0.09, 0.05)); snout.parent = root; snout.position.set(0, 0.86, 1.02);
    for (const side of [-1, 1]) {
      const ear = MeshBuilder.CreateCylinder(`${id}-bear-ear-${side}`, { diameterTop: 0.06, diameterBottom: 0.22, height: 0.22, tessellation: 8 }, scene); ear.parent = root; ear.position.set(side * 0.26, 1.25, 0.62); ear.material = mat(`${id}-bear-ear-${side}-mat`, fur.scale(0.9));
      const legFront = box(`${id}-bear-front-leg-${side}`, { width: 0.26, height: 0.6, depth: 0.28 }, fur.scale(0.75)); legFront.parent = root; legFront.position.set(side * 0.42, 0.28, 0.36);
      const legBack = box(`${id}-bear-back-leg-${side}`, { width: 0.3, height: 0.58, depth: 0.32 }, fur.scale(0.72)); legBack.parent = root; legBack.position.set(side * 0.46, 0.28, -0.42);
    }
  } else {
    addContactShadow(root, `${id}-cat-contact-shadow`, 1.35, 0.2, 0.78);
    const fur = new Color3(0.09, 0.08, 0.07);
    const body = box(`${id}-cat-body`, { width: 0.96, height: 0.48, depth: 1.12 }, fur); body.parent = root; body.position.y = 0.52;
    const head = box(`${id}-cat-head`, { width: 0.46, height: 0.36, depth: 0.44 }, fur.scale(1.16)); head.parent = root; head.position.set(0, 0.72, 0.7);
    const tail = MeshBuilder.CreateCylinder(`${id}-cat-tail`, { diameterTop: 0.08, diameterBottom: 0.12, height: 0.8, tessellation: 8 }, scene); tail.parent = root; tail.position.set(0, 0.66, -0.78); tail.rotation.x = -1.0; tail.material = mat(`${id}-cat-tail-mat`, fur);
    for (const side of [-1, 1]) {
      const ear = MeshBuilder.CreateCylinder(`${id}-cat-ear-${side}`, { diameterTop: 0, diameterBottom: 0.18, height: 0.28, tessellation: 4 }, scene); ear.parent = root; ear.position.set(side * 0.18, 0.98, 0.7); ear.rotation.z = side * -0.32; ear.material = mat(`${id}-cat-ear-${side}-mat`, fur.scale(1.08));
      const frontLeg = box(`${id}-cat-front-leg-${side}`, { width: 0.16, height: 0.44, depth: 0.18 }, fur.scale(0.82)); frontLeg.parent = root; frontLeg.position.set(side * 0.32, 0.24, 0.34);
      const backLeg = box(`${id}-cat-back-leg-${side}`, { width: 0.18, height: 0.42, depth: 0.2 }, fur.scale(0.78)); backLeg.parent = root; backLeg.position.set(side * 0.34, 0.24, -0.38);
    }
  }
}

function playerBuild(classId: string | null) {
  if (classId === "warrior") return { bodyWidth: 0.92, bodyHeight: 1.02, bodyDepth: 0.52, headWidth: 0.56, headDepth: 0.54, armWidth: 0.26, armHeight: 0.78, armDepth: 0.26, armX: 0.68, skin: new Color3(0.78, 0.55, 0.38) };
  if (classId === "hunter") return { bodyWidth: 0.72, bodyHeight: 0.96, bodyDepth: 0.42, headWidth: 0.48, headDepth: 0.5, armWidth: 0.18, armHeight: 0.76, armDepth: 0.2, armX: 0.52, skin: new Color3(0.84, 0.62, 0.43) };
  if (classId === "priest") return { bodyWidth: 0.82, bodyHeight: 1.06, bodyDepth: 0.48, headWidth: 0.5, headDepth: 0.5, armWidth: 0.2, armHeight: 0.72, armDepth: 0.22, armX: 0.58, skin: new Color3(0.88, 0.68, 0.5) };
  if (classId === "rogue") return { bodyWidth: 0.66, bodyHeight: 0.92, bodyDepth: 0.38, headWidth: 0.46, headDepth: 0.46, armWidth: 0.16, armHeight: 0.72, armDepth: 0.18, armX: 0.5, skin: new Color3(0.78, 0.56, 0.42) };
  if (classId === "druid") return { bodyWidth: 0.76, bodyHeight: 1.0, bodyDepth: 0.46, headWidth: 0.5, headDepth: 0.5, armWidth: 0.2, armHeight: 0.74, armDepth: 0.22, armX: 0.56, skin: new Color3(0.76, 0.56, 0.38) };
  if (classId === "shaman") return { bodyWidth: 0.78, bodyHeight: 1.02, bodyDepth: 0.48, headWidth: 0.5, headDepth: 0.5, armWidth: 0.2, armHeight: 0.78, armDepth: 0.22, armX: 0.58, skin: new Color3(0.74, 0.56, 0.4) };
  return { bodyWidth: 0.74, bodyHeight: 0.98, bodyDepth: 0.44, headWidth: 0.5, headDepth: 0.5, armWidth: 0.18, armHeight: 0.74, armDepth: 0.2, armX: 0.54, skin: new Color3(0.84, 0.64, 0.48) };
}

function markEntityMeshes(root: TransformNode, entityId: string) {
  root.metadata = { ...(root.metadata || {}), entityId };
  root.getChildMeshes().forEach((mesh) => {
    mesh.metadata = { ...(mesh.metadata || {}), entityId };
  });
}

function addClassDetails(root: TransformNode, id: string, classId: string | null, baseColor: Color3) {
  const leftArm = root.getChildMeshes().find((mesh) => mesh.name.endsWith("-left-arm"));
  const rightArm = root.getChildMeshes().find((mesh) => mesh.name.endsWith("-right-arm"));
  if (classId === "warrior") {
    const leftShoulder = box(`${id}-left-shoulder`, { width: 0.46, height: 0.24, depth: 0.46 }, new Color3(0.42, 0.42, 0.46)); leftShoulder.parent = root; leftShoulder.position.set(-0.63, 1.24, 0); leftShoulder.rotation.z = -0.12;
    const rightShoulder = box(`${id}-right-shoulder`, { width: 0.32, height: 0.18, depth: 0.38 }, new Color3(0.32, 0.31, 0.33)); rightShoulder.parent = root; rightShoulder.position.set(0.62, 1.22, 0); rightShoulder.rotation.z = 0.18;
    const chestStrap = box(`${id}-chest-strap`, { width: 0.18, height: 1.1, depth: 0.54 }, new Color3(0.22, 0.11, 0.04)); chestStrap.parent = root; chestStrap.position.set(-0.08, 0.77, -0.03); chestStrap.rotation.z = -0.48;
    const belt = box(`${id}-belt`, { width: 0.96, height: 0.14, depth: 0.56 }, new Color3(0.18, 0.1, 0.04)); belt.parent = root; belt.position.y = 0.43;
    const sword = box(`${id}-sword`, { width: 0.12, height: 1.18, depth: 0.08 }, new Color3(0.8, 0.82, 0.86)); sword.parent = rightArm || root; sword.position.set(0.06, -0.52, -0.18); sword.rotation.z = -0.18;
    const swordGrip = box(`${id}-sword-grip`, { width: 0.34, height: 0.08, depth: 0.1 }, new Color3(0.18, 0.1, 0.04)); swordGrip.parent = sword; swordGrip.position.set(0, -0.48, 0); swordGrip.rotation.z = Math.PI / 2;
    const shield = box(`${id}-shield`, { width: 0.5, height: 0.64, depth: 0.12 }, new Color3(0.24, 0.26, 0.32)); shield.parent = leftArm || root; shield.position.set(-0.12, -0.12, -0.16); shield.rotation.z = 0.18;
    const crest = box(`${id}-shield-crest`, { width: 0.18, height: 0.42, depth: 0.13 }, new Color3(0.95, 0.78, 0.16)); crest.parent = shield; crest.position.set(0, 0, -0.08);
    const boots = box(`${id}-heavy-boots`, { width: 0.9, height: 0.18, depth: 0.52 }, new Color3(0.12, 0.08, 0.05)); boots.parent = root; boots.position.y = 0.1;
  } else if (classId === "hunter") {
    const cloak = box(`${id}-cloak`, { width: 0.66, height: 0.9, depth: 0.08 }, new Color3(0.04, 0.18, 0.08)); cloak.parent = root; cloak.position.set(0, 0.76, 0.31); cloak.rotation.x = -0.14;
    const quiver = box(`${id}-quiver`, { width: 0.28, height: 0.86, depth: 0.24 }, new Color3(0.32, 0.18, 0.08)); quiver.parent = root; quiver.position.set(-0.28, 0.95, -0.34); quiver.rotation.z = 0.25;
    const bowPath = Array.from({ length: 17 }, (_, i) => {
      const angle = -Math.PI * 0.72 + (Math.PI * 1.44 * i) / 16;
      return new Vector3(Math.cos(angle) * 0.24, Math.sin(angle) * 0.72, 0);
    });
    const bow = MeshBuilder.CreateTube(`${id}-bow`, { path: bowPath, radius: 0.035, tessellation: 8 }, scene); bow.parent = rightArm || root; bow.position.set(0.12, -0.12, -0.16); bow.rotation.set(0, 0, 0); bow.material = mat(`${id}-bow-mat`, new Color3(0.42, 0.24, 0.1));
    for (let i = 0; i < 3; i++) { const arrow = box(`${id}-quiver-arrow-${i}`, { width: 0.035, height: 0.58, depth: 0.035 }, new Color3(0.92, 0.82, 0.58)); arrow.parent = root; arrow.position.set(-0.35 + i * 0.07, 1.36, -0.42); arrow.rotation.z = 0.22; }
    const hood = MeshBuilder.CreateCylinder(`${id}-hood`, { diameterTop: 0.34, diameterBottom: 0.62, height: 0.32, tessellation: 6 }, scene); hood.parent = root; hood.position.y = 1.65; hood.material = mat(`${id}-hood-mat`, baseColor.scale(0.75));
    const chestBand = box(`${id}-chest-band`, { width: 0.12, height: 0.92, depth: 0.46 }, new Color3(0.45, 0.29, 0.08)); chestBand.parent = root; chestBand.position.set(0.05, 0.78, -0.04); chestBand.rotation.z = 0.42;
    const knife = box(`${id}-knife`, { width: 0.07, height: 0.48, depth: 0.06 }, new Color3(0.78, 0.82, 0.76)); knife.parent = leftArm || root; knife.position.set(-0.04, -0.52, -0.16); knife.rotation.z = 0.28;
  } else if (classId === "priest") {
    const robeSkirt = MeshBuilder.CreateCylinder(`${id}-robe-skirt`, { diameterTop: 0.76, diameterBottom: 0.98, height: 0.62, tessellation: 6 }, scene); robeSkirt.parent = root; robeSkirt.position.y = 0.34; robeSkirt.material = mat(`${id}-robe-skirt-mat`, new Color3(0.93, 0.9, 0.78));
    const halo = MeshBuilder.CreateTorus(`${id}-halo`, { diameter: 0.68, thickness: 0.035, tessellation: 36 }, scene); halo.parent = root; halo.position.y = 1.85; halo.rotation.x = Math.PI / 2; halo.material = mat(`${id}-halo-mat`, new Color3(1, 0.86, 0.28));
    (halo.material as StandardMaterial).emissiveColor = new Color3(0.55, 0.42, 0.08);
    const sash = box(`${id}-sash`, { width: 0.14, height: 1.08, depth: 0.48 }, new Color3(0.95, 0.78, 0.22)); sash.parent = root; sash.position.y = 0.72; sash.rotation.z = -0.28;
    const book = box(`${id}-book`, { width: 0.34, height: 0.24, depth: 0.1 }, new Color3(0.42, 0.18, 0.09)); book.parent = leftArm || root; book.position.set(-0.18, -0.12, -0.14); book.rotation.z = -0.1;
    const bookClasp = box(`${id}-book-clasp`, { width: 0.08, height: 0.26, depth: 0.12 }, new Color3(0.98, 0.78, 0.22)); bookClasp.parent = book; bookClasp.position.set(0, 0, -0.06);
    const stole = box(`${id}-stole`, { width: 0.46, height: 0.08, depth: 0.5 }, new Color3(1, 0.95, 0.72)); stole.parent = root; stole.position.y = 1.18;
    const prayerBeads = MeshBuilder.CreateTorus(`${id}-prayer-beads`, { diameter: 0.46, thickness: 0.025, tessellation: 18 }, scene); prayerBeads.parent = root; prayerBeads.position.set(0, 1.03, -0.25); prayerBeads.scaling.y = 0.65; prayerBeads.material = mat(`${id}-prayer-beads-mat`, new Color3(0.88, 0.72, 0.24));
    const glow = MeshBuilder.CreateCylinder(`${id}-holy-glow`, { diameter: 1.18, height: 0.02, tessellation: 48 }, scene); glow.parent = root; glow.position.y = 0.04; glow.material = transparentMat(`${id}-holy-glow-mat`, new Color3(1, 0.88, 0.38), 0.16);
  } else if (classId === "mage") {
    const collar = MeshBuilder.CreateCylinder(`${id}-collar`, { diameterTop: 0.92, diameterBottom: 0.6, height: 0.28, tessellation: 5 }, scene); collar.parent = root; collar.position.y = 1.22; collar.rotation.y = Math.PI / 5; collar.material = mat(`${id}-collar-mat`, new Color3(0.1, 0.07, 0.28));
    const hat = MeshBuilder.CreateCylinder(`${id}-hat`, { diameterTop: 0.08, diameterBottom: 0.72, height: 0.72, tessellation: 4 }, scene); hat.parent = root; hat.position.y = 1.95; hat.rotation.y = Math.PI / 4; hat.material = mat(`${id}-hat-mat`, baseColor.scale(0.7));
    const hatBand = box(`${id}-hat-band`, { width: 0.62, height: 0.08, depth: 0.62 }, new Color3(0.86, 0.26, 0.08)); hatBand.parent = root; hatBand.position.y = 1.65; hatBand.rotation.y = Math.PI / 4;
    const staff = box(`${id}-staff`, { width: 0.08, height: 1.45, depth: 0.08 }, new Color3(0.38, 0.2, 0.08)); staff.parent = rightArm || root; staff.position.set(0.2, -0.12, 0.06); staff.rotation.z = 0.16;
    const gem = MeshBuilder.CreateSphere(`${id}-staff-gem`, { diameter: 0.22, segments: 8 }, scene); gem.parent = staff; gem.position.set(0.12, 0.72, 0); gem.material = mat(`${id}-staff-gem-mat`, new Color3(0.45, 0.95, 1));
    (gem.material as StandardMaterial).emissiveColor = new Color3(0.16, 0.48, 0.7);
    const cape = box(`${id}-cape`, { width: 0.72, height: 0.92, depth: 0.08 }, baseColor.scale(0.48)); cape.parent = root; cape.position.set(0, 0.78, 0.33); cape.rotation.x = -0.12;
    const beltGem = MeshBuilder.CreateSphere(`${id}-belt-gem`, { diameter: 0.16, segments: 8 }, scene); beltGem.parent = root; beltGem.position.set(0, 0.72, -0.26); beltGem.material = mat(`${id}-belt-gem-mat`, new Color3(0.9, 0.35, 1));
    for (const side of [-1, 1]) {
      const orb = MeshBuilder.CreateSphere(`${id}-arcane-orb-${side}`, { diameter: 0.12, segments: 8 }, scene);
      orb.parent = root; orb.position.set(side * 0.46, 1.18, -0.28); const orbMat = mat(`${id}-arcane-orb-${side}-mat`, new Color3(0.6, 0.3, 1)); orbMat.emissiveColor = new Color3(0.28, 0.12, 0.62); orb.material = orbMat;
    }
  } else if (classId === "rogue") {
    const hood = MeshBuilder.CreateCylinder(`${id}-shadow-hood`, { diameterTop: 0.32, diameterBottom: 0.58, height: 0.34, tessellation: 6 }, scene); hood.parent = root; hood.position.y = 1.62; hood.material = mat(`${id}-shadow-hood-mat`, baseColor.scale(0.62));
    const mask = box(`${id}-mask`, { width: 0.42, height: 0.12, depth: 0.05 }, new Color3(0.04, 0.035, 0.055)); mask.parent = root; mask.position.set(0, 1.43, -0.24);
    const cloak = box(`${id}-shadow-cloak`, { width: 0.58, height: 0.84, depth: 0.07 }, new Color3(0.06, 0.04, 0.08)); cloak.parent = root; cloak.position.set(0, 0.72, 0.28); cloak.rotation.x = -0.18;
    const sash = box(`${id}-rogue-sash`, { width: 0.11, height: 0.86, depth: 0.4 }, new Color3(0.34, 0.08, 0.42)); sash.parent = root; sash.position.set(-0.02, 0.75, -0.02); sash.rotation.z = 0.36;
    for (const side of [-1, 1]) {
      const arm = side < 0 ? leftArm : rightArm;
      const dagger = box(`${id}-dagger-${side}`, { width: 0.055, height: 0.72, depth: 0.045 }, new Color3(0.78, 0.82, 0.86)); dagger.parent = arm || root; dagger.position.set(side * 0.08, -0.5, -0.16); dagger.rotation.z = side * -0.22;
      const grip = box(`${id}-dagger-grip-${side}`, { width: 0.16, height: 0.055, depth: 0.06 }, new Color3(0.12, 0.07, 0.04)); grip.parent = dagger; grip.position.set(0, -0.3, 0); grip.rotation.z = Math.PI / 2;
    }
    const shadow = MeshBuilder.CreateCylinder(`${id}-rogue-shadow`, { diameter: 1.0, height: 0.018, tessellation: 40 }, scene); shadow.parent = root; shadow.position.y = 0.035; shadow.material = transparentMat(`${id}-rogue-shadow-mat`, new Color3(0.38, 0.12, 0.6), 0.14);
  } else if (classId === "druid") {
    const leafMantle = box(`${id}-leaf-mantle`, { width: 0.84, height: 0.16, depth: 0.52 }, new Color3(0.1, 0.31, 0.09)); leafMantle.parent = root; leafMantle.position.y = 1.18;
    const vine = box(`${id}-vine-sash`, { width: 0.1, height: 0.98, depth: 0.48 }, new Color3(0.18, 0.42, 0.13)); vine.parent = root; vine.position.set(0.08, 0.76, -0.02); vine.rotation.z = -0.38;
    const antlerColor = new Color3(0.62, 0.48, 0.28);
    function createAntler(side: number) {
      const base = MeshBuilder.CreateCylinder(`${id}-antler-base-${side}`, { diameterTop: 0.07, diameterBottom: 0.12, height: 0.32, tessellation: 6 }, scene);
      base.parent = root; base.position.set(side * 0.16, 1.88, -0.02); base.rotation.z = side * 0.52; base.rotation.x = -0.22; base.material = mat(`${id}-antler-base-${side}-mat`, antlerColor);
      const mid = MeshBuilder.CreateCylinder(`${id}-antler-mid-${side}`, { diameterTop: 0.05, diameterBottom: 0.08, height: 0.34, tessellation: 6 }, scene);
      mid.parent = root; mid.position.set(side * 0.32, 2.04, 0.02); mid.rotation.z = side * 0.42; mid.rotation.x = 0.12; mid.material = mat(`${id}-antler-mid-${side}-mat`, antlerColor);
      const tip = MeshBuilder.CreateCylinder(`${id}-antler-tip-${side}`, { diameterTop: 0.02, diameterBottom: 0.05, height: 0.3, tessellation: 6 }, scene);
      tip.parent = root; tip.position.set(side * 0.46, 2.2, 0.02); tip.rotation.z = side * 0.26; tip.rotation.x = 0.18; tip.material = mat(`${id}-antler-tip-${side}-mat`, antlerColor);
      const browTine = MeshBuilder.CreateCylinder(`${id}-antler-brow-${side}`, { diameterTop: 0.02, diameterBottom: 0.05, height: 0.22, tessellation: 5 }, scene);
      browTine.parent = root; browTine.position.set(side * 0.26, 1.96, -0.04); browTine.rotation.z = side * -0.35; browTine.rotation.x = -0.3; browTine.material = mat(`${id}-antler-brow-${side}-mat`, antlerColor);
      const frontTine = MeshBuilder.CreateCylinder(`${id}-antler-front-${side}`, { diameterTop: 0.015, diameterBottom: 0.04, height: 0.2, tessellation: 5 }, scene);
      frontTine.parent = root; frontTine.position.set(side * 0.4, 2.1, 0.06); frontTine.rotation.z = side * 0.05; frontTine.rotation.x = 0.52; frontTine.material = mat(`${id}-antler-front-${side}-mat`, antlerColor);
    }
    createAntler(-1);
    createAntler(1);
    const charm = MeshBuilder.CreateSphere(`${id}-nature-charm`, { diameter: 0.16, segments: 8 }, scene); charm.parent = root; charm.position.set(0, 1.04, -0.28); const charmMat = mat(`${id}-nature-charm-mat`, new Color3(0.45, 0.95, 0.28)); charmMat.emissiveColor = new Color3(0.12, 0.42, 0.08); charm.material = charmMat;
  } else if (classId === "shaman") {
    const featherColor = new Color3(0.92, 0.62, 0.18);
    const furColor = new Color3(0.32, 0.22, 0.16);
    const boneColor = new Color3(0.92, 0.86, 0.72);
    const turquoise = new Color3(0.18, 0.74, 0.78);
    // Fur mantle over the shoulders
    const mantle = box(`${id}-shaman-mantle`, { width: 0.86, height: 0.22, depth: 0.5 }, furColor); mantle.parent = root; mantle.position.y = 1.18;
    // Tribal chest band (tied diagonally)
    const band = box(`${id}-shaman-band`, { width: 0.12, height: 1.05, depth: 0.5 }, turquoise); band.parent = root; band.position.set(0.06, 0.78, -0.02); band.rotation.z = 0.42;
    // Bone necklace
    const necklace = MeshBuilder.CreateTorus(`${id}-shaman-necklace`, { diameter: 0.5, thickness: 0.022, tessellation: 16 }, scene);
    necklace.parent = root; necklace.position.set(0, 1.0, -0.22); necklace.scaling.y = 0.55;
    necklace.material = mat(`${id}-shaman-necklace-mat`, boneColor);
    // Two feathers sticking up from the back of the head
    for (let i = 0; i < 2; i++) {
      const feather = box(`${id}-shaman-feather-${i}`, { width: 0.06, height: 0.42, depth: 0.025 }, featherColor);
      feather.parent = root;
      feather.position.set(-0.08 + i * 0.16, 1.78, -0.18);
      feather.rotation.x = 0.45 + i * 0.18;
      feather.rotation.z = (i === 0 ? 0.18 : -0.18);
    }
    // Face mask / war paint bar
    const warpaint = box(`${id}-shaman-warpaint`, { width: 0.44, height: 0.08, depth: 0.04 }, new Color3(0.9, 0.32, 0.08));
    warpaint.parent = root; warpaint.position.set(0, 1.49, -0.24);
    // Tribal totem staff (in right hand)
    const staff = box(`${id}-shaman-staff`, { width: 0.08, height: 1.55, depth: 0.08 }, new Color3(0.28, 0.16, 0.08));
    staff.parent = rightArm || root; staff.position.set(0.2, -0.2, 0.06); staff.rotation.z = 0.18;
    // Carved animal skull at the top of the staff
    const skull = box(`${id}-shaman-skull`, { width: 0.18, height: 0.16, depth: 0.16 }, boneColor);
    skull.parent = staff; skull.position.set(0, 0.78, 0);
    const eyeL = box(`${id}-shaman-skull-eye-l`, { width: 0.05, height: 0.05, depth: 0.04 }, turquoise); eyeL.parent = skull; eyeL.position.set(-0.04, 0.02, -0.07);
    const eyeR = box(`${id}-shaman-skull-eye-r`, { width: 0.05, height: 0.05, depth: 0.04 }, turquoise); eyeR.parent = skull; eyeR.position.set(0.04, 0.02, -0.07);
    // Glowing turquoise element at the tip (the elemental focus)
    const focusGem = MeshBuilder.CreateSphere(`${id}-shaman-focus`, { diameter: 0.16, segments: 10 }, scene);
    const focusMat = mat(`${id}-shaman-focus-mat`, new Color3(0.55, 0.95, 1)); focusMat.emissiveColor = new Color3(0.22, 0.62, 0.78);
    focusGem.material = focusMat;
    focusGem.parent = staff; focusGem.position.set(0, 0.62, 0);
    // Small belt pouch
    const pouch = box(`${id}-shaman-pouch`, { width: 0.22, height: 0.18, depth: 0.12 }, furColor);
    pouch.parent = root; pouch.position.set(-0.32, 0.62, 0.06);
    pouch.rotation.z = 0.18;
    // Elemental aura at the feet (subtle, matches turquoise)
    const aura = MeshBuilder.CreateCylinder(`${id}-shaman-aura`, { diameter: 1.35, height: 0.02, tessellation: 48 }, scene);
    aura.parent = root; aura.position.y = 0.025;
    const auraMat = transparentMat(`${id}-shaman-aura-mat`, new Color3(0.32, 0.78, 0.88), 0.18);
    aura.material = auraMat;
  }
}

function createEnemy(e: EnemyState) {
  const root = new TransformNode(e.id, scene);
  root.metadata = { entityId: e.id };
  const color = enemyColor(e.type, e.boss);
  const size = e.boss ? 2.2 : e.type === "brute" ? 1.4 : 0.9;
  addContactShadow(root, `${e.id}-contact-shadow`, size * 1.7, e.boss ? 0.24 : 0.2, 0.82);
  const body = box(`${e.id}-body`, { width: size, height: size, depth: size }, color); body.parent = root; body.position.y = size / 2; body.metadata = { entityId: e.id, baseY: body.position.y };
  const head = box(`${e.id}-head`, { width: size * 0.72, height: size * 0.46, depth: size * 0.62 }, color.scale(1.12)); head.parent = root; head.position.y = size * 1.12; head.metadata = { entityId: e.id, baseY: head.position.y };
  addEnemyIdentityDetails(root, e, size, color);
  addEnemyDetails(root, e, size, color);
  const ring = MeshBuilder.CreateCylinder(`${e.id}-ring`, { diameter: size * 1.55, height: 0.025, tessellation: 48 }, scene); ring.parent = root; ring.material = transparentMat(`${e.id}-ringmat`, new Color3(0.9, 0.1, 0.08), 0.24); ring.metadata = { entityId: e.id };
  ring.position.y = 0.015;
  meshes.set(e.id, root);
  markEntityMeshes(root, e.id);
  return root;
}

function addEnemyIdentityDetails(root: TransformNode, e: EnemyState, size: number, color: Color3) {
  const eyeColor = e.boss ? new Color3(1, 0.08, 0.02) : e.type === "shaman" ? new Color3(0.8, 0.28, 1) : e.type === "archer" ? new Color3(1, 0.78, 0.18) : new Color3(0.9, 1, 0.42);
  for (const side of [-1, 1]) {
    const eye = MeshBuilder.CreateBox(`${e.id}-eye-${side}`, { width: size * 0.1, height: size * 0.065, depth: size * 0.035 }, scene);
    eye.parent = root;
    eye.position.set(side * size * 0.17, size * 1.18, -size * 0.33);
    const eyeMat = mat(`${e.id}-eye-${side}-mat`, eyeColor);
    eyeMat.emissiveColor = eyeColor.scale(e.boss ? 0.9 : 0.65);
    eye.material = eyeMat;
  }
  const footColor = color.scale(0.7);
  for (const side of [-1, 1]) {
    const foot = box(`${e.id}-foot-${side}`, { width: size * 0.28, height: size * 0.14, depth: size * 0.42 }, footColor);
    foot.parent = root;
    foot.position.set(side * size * 0.24, size * 0.08, -size * 0.2);
    foot.rotation.y = side * 0.12;
  }
  if (e.type === "goblin") {
    const teeth = box(`${e.id}-teeth`, { width: size * 0.28, height: size * 0.06, depth: size * 0.045 }, new Color3(0.96, 0.9, 0.72));
    teeth.parent = root; teeth.position.set(0, size * 1.03, -size * 0.36);
    const satchel = box(`${e.id}-satchel`, { width: size * 0.32, height: size * 0.28, depth: size * 0.16 }, new Color3(0.28, 0.14, 0.06));
    satchel.parent = root; satchel.position.set(-size * 0.45, size * 0.56, size * 0.18); satchel.rotation.z = -0.18;
  } else if (e.type === "runner") {
    root.scaling.z = 1.18;
    root.scaling.x = 0.86;
    const snout = box(`${e.id}-snout`, { width: size * 0.28, height: size * 0.18, depth: size * 0.34 }, color.scale(0.88));
    snout.parent = root; snout.position.set(0, size * 1.1, -size * 0.48);
    for (const side of [-1, 1]) {
      const claw = MeshBuilder.CreateCylinder(`${e.id}-claw-${side}`, { diameterTop: 0, diameterBottom: size * 0.08, height: size * 0.24, tessellation: 4 }, scene);
      claw.parent = root; claw.position.set(side * size * 0.25, size * 0.11, -size * 0.48); claw.rotation.x = Math.PI / 2; claw.material = mat(`${e.id}-claw-${side}-mat`, new Color3(0.92, 0.86, 0.65));
    }
  } else if (e.type === "archer") {
    const quiver = box(`${e.id}-enemy-quiver`, { width: size * 0.22, height: size * 0.72, depth: size * 0.18 }, new Color3(0.24, 0.12, 0.05));
    quiver.parent = root; quiver.position.set(-size * 0.32, size * 0.78, size * 0.48); quiver.rotation.z = 0.18;
    for (let i = 0; i < 3; i++) {
      const arrow = box(`${e.id}-enemy-quiver-arrow-${i}`, { width: size * 0.035, height: size * 0.48, depth: size * 0.035 }, new Color3(0.88, 0.78, 0.52));
      arrow.parent = root; arrow.position.set(-size * (0.38 - i * 0.06), size * 1.12, size * 0.54); arrow.rotation.z = 0.2;
    }
  } else if (e.type === "shaman") {
    const pendant = MeshBuilder.CreateSphere(`${e.id}-pendant`, { diameter: size * 0.18, segments: 7 }, scene);
    pendant.parent = root; pendant.position.set(0, size * 0.74, -size * 0.53);
    const pendantMat = mat(`${e.id}-pendant-mat`, eyeColor); pendantMat.emissiveColor = eyeColor.scale(0.55); pendant.material = pendantMat;
    for (const side of [-1, 1]) {
      const bone = box(`${e.id}-bone-${side}`, { width: size * 0.08, height: size * 0.34, depth: size * 0.06 }, new Color3(0.86, 0.8, 0.62));
      bone.parent = root; bone.position.set(side * size * 0.34, size * 0.82, -size * 0.48); bone.rotation.z = side * 0.38;
    }
  } else if (e.type === "brute") {
    const leftPlate = box(`${e.id}-left-plate`, { width: size * 0.38, height: size * 0.22, depth: size * 0.48 }, new Color3(0.18, 0.17, 0.16));
    leftPlate.parent = root; leftPlate.position.set(-size * 0.52, size * 0.98, 0); leftPlate.rotation.z = -0.18;
    const rightPlate = box(`${e.id}-right-plate`, { width: size * 0.38, height: size * 0.22, depth: size * 0.48 }, new Color3(0.18, 0.17, 0.16));
    rightPlate.parent = root; rightPlate.position.set(size * 0.52, size * 0.98, 0); rightPlate.rotation.z = 0.18;
  }
  if (e.boss) {
    const jaw = box(`${e.id}-boss-jaw`, { width: size * 0.62, height: size * 0.16, depth: size * 0.18 }, color.scale(0.72));
    jaw.parent = root; jaw.position.set(0, size * 1.0, -size * 0.42);
    const gem = MeshBuilder.CreateSphere(`${e.id}-boss-gem`, { diameter: size * 0.18, segments: 8 }, scene);
    gem.parent = root; gem.position.set(0, size * 1.55, -size * 0.36);
    const gemMat = mat(`${e.id}-boss-gem-mat`, eyeColor); gemMat.emissiveColor = eyeColor; gem.material = gemMat;
  }
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
    if (player.spectator) {
      removePlayerNameLabel(player.id);
      continue;
    }
    if (state.matchState === "lobby") {
      removePlayerNameLabel(player.id);
      continue;
    }
    const node = meshes.get(player.id);
    if (!node) continue;
    const element = playerNameLabels.get(player.id) || createPlayerNameLabel(player);
    element.textContent = player.name;
    const screen = projectToScreen(node.position.add(new Vector3(0, playerNameHeight(player), 0)));
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

function playerNameHeight(player: PlayerState) {
  if (player.classId === "druid" && player.form === "bear") return 1.75;
  if (player.classId === "druid" && player.form === "cat") return 1.35;
  return 2.05;
}

function projectToScreen(position: Vector3) {
  camera.getViewMatrix(true);
  const renderWidth = engine.getRenderWidth();
  const renderHeight = engine.getRenderHeight();
  const projected = Vector3.Project(position, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(renderWidth, renderHeight));
  const x = projected.x * (canvas.clientWidth / renderWidth);
  const y = projected.y * (canvas.clientHeight / renderHeight);
  return {
    x,
    y,
    visible: projected.z >= 0 && projected.z <= 1 && x >= 0 && x <= canvas.clientWidth && y >= 0 && y <= canvas.clientHeight
  };
}

function playCastEffect(event: CombatEvent) {
  const source = event.sourceId ? meshes.get(event.sourceId) : null;
  const target = event.targetId ? meshes.get(event.targetId) : null;
  if (!source || !target) return;
  const ability = event.abilityId ? state?.abilities[event.abilityId] : null;
  const color = effectColor(event.abilityId || "", event.school || "");
  if (event.abilityId?.includes("frost_nova")) {
    frostRing(source.position, 4.2, 900);
  } else if (event.abilityId?.includes("warrior_charge")) {
    slashRing(target.position, 520);
    expandingDisc("charge-impact", target.position, 2.0, new Color3(1, 0.22, 0.05), 520, 0.3);
  } else if (event.abilityId?.includes("thunder_clap")) {
    expandingDisc("thunder-clap", source.position, 4.0, new Color3(1, 0.48, 0.12), 760, 0.36);
  } else if (event.abilityId?.includes("arrow_barrage")) {
    arrowBarrage(target.position, 5.2, 900);
  } else if (event.abilityId?.includes("explosive_shot")) {
    bigArrow(source.position, target.position, new Color3(1, 0.36, 0.04), 320);
    fireBurst(target.position, 760);
  } else if (event.abilityId?.includes("resurrection")) {
    holyRing(target.position, 2.1, 1200);
    beam(source.position, target.position, new Color3(1, 0.9, 0.34), 700);
  } else if (event.abilityId?.includes("shadow_word_pain")) {
    shadowRing(target.position, 1.4, 800);
  } else if (event.abilityId?.includes("ice_block")) {
    frostSpikes(target.position, 700);
  } else if (event.abilityId?.includes("arcane_missiles")) {
    expandingDisc("arcane-channel", source.position, 1.1, new Color3(0.8, 0.28, 1), 420, 0.22);
  } else if (event.abilityId?.includes("sprint")) {
    shadowRing(source.position, 2.1, 650);
  } else if (event.abilityId?.includes("eviscerate")) {
    slashArc(target.position, 420);
    shadowRing(target.position, 1.2, 480);
  } else if (event.abilityId?.includes("rejuvenation")) {
    natureRing(target.position, 1.4, 850);
  } else if (event.abilityId?.includes("druid_bear_form")) {
    expandingDisc("bear-form", source.position, 1.9, new Color3(0.62, 0.36, 0.12), 650, 0.34);
  } else if (event.abilityId?.includes("druid_cat_form")) {
    expandingDisc("cat-form", source.position, 1.45, new Color3(0.34, 0.92, 0.2), 520, 0.28);
  } else if (event.abilityId?.includes("druid_humanoid_form")) {
    expandingDisc("humanoid-form", source.position, 1.6, new Color3(0.7, 0.95, 0.62), 520, 0.3);
  } else if (event.abilityId?.includes("whirlwind")) {
    slashRing(source.position, 760);
  } else if (event.abilityId?.includes("snare_trap")) {
    trapBurst(source.position, 4.0, 850);
  } else if (event.abilityId?.includes("shaman_lightning_bolt")) {
    lightningBolt(source.position, target.position, new Color3(0.55, 0.85, 1), 360);
  } else if (event.abilityId?.includes("shaman_chain_lightning")) {
    chainLightning(source.position, target.position, new Color3(0.55, 0.85, 1), 480);
  } else if (event.abilityId?.includes("shaman_frost_shock")) {
    frostRing(target.position, 1.6, 520);
    projectile(source.position, target.position, new Color3(0.2, 0.85, 1), 220);
  } else if (event.abilityId?.includes("shaman_healing_stream_totem") || event.abilityId?.includes("shaman_searing_totem") || event.abilityId?.includes("shaman_earthbind_totem")) {
    totemSummonEffect(source.position, event.abilityId || "");
  } else if (event.abilityId?.includes("shaman_healing_wave")) {
    beam(source.position, target.position, new Color3(0.32, 0.92, 0.78), 720);
  } else if (event.abilityId?.includes("shaman_primal_strike")) {
    slashRing(target.position, 420);
    expandingDisc("primal-strike", target.position, 1.3, new Color3(0.4, 0.95, 0.5), 460, 0.26);
  } else if (event.abilityId?.includes("sanctify")) {
    holyRing(source.position, 5.0, 1000);
  } else if (event.abilityId?.includes("arcane_blast")) {
    expandingDisc("arcane-blast", source.position, 4.0, new Color3(0.78, 0.22, 1), 900, 0.34);
  } else if (event.abilityId?.includes("blade_flurry")) {
    bladeFlurryBurst(source.position, 2.7, 900);
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
  } else if (event.abilityId?.includes("moonfire")) {
    moonfireStrike(target.position, 1000);
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
  if (event.abilityId?.includes("renew") || event.abilityId?.includes("barrier") || event.abilityId?.includes("resurrection")) holyRing(target.position, 1.2, 700);
  if (event.abilityId?.includes("rejuvenation")) natureRing(target.position, 1.25, 700);
  if (event.abilityId?.includes("sprint")) shadowRing(target.position, 1.7, 650);
  if (event.abilityId?.includes("vanish")) shadowRing(target.position, 1.7, 650);
}

function playAutoAttackEffect(event: CombatEvent) {
  const source = event.sourceId ? meshes.get(event.sourceId) : null;
  const target = event.targetId ? meshes.get(event.targetId) : null;
  if (!source || !target) return;
  autoSwings.set(event.sourceId || "", performance.now() + 320);
  const sourcePlayer = event.sourceId ? state?.players[event.sourceId] : null;
  const sourceEnemy = event.sourceId ? state?.enemies[event.sourceId] : null;
  if (sourcePlayer?.classId === "rogue" && event.sourceId) {
    autoSwingHands.set(event.sourceId, autoSwingHands.get(event.sourceId) === "left" ? "right" : "left");
  }
  const isArrow = sourcePlayer?.classId === "hunter" || sourceEnemy?.type === "archer";
  if (isArrow) {
    arrow(source.position, target.position, new Color3(0.95, 0.75, 0.22), 180);
    hunterTwang(0, 0.035);
  } else {
    slashArc(target.position, 260);
    if (sourcePlayer?.classId === "warrior") warriorClang(0.04);
    else if (sourcePlayer?.classId === "rogue") rogueSlice(0.04);
    else if (sourcePlayer?.classId === "priest") priestChoir(0.025);
    else if (sourcePlayer?.classId === "mage") mageSparkle();
  }
}

function playImpactEffect(event: CombatEvent, healing: boolean) {
  const target = event.targetId ? meshes.get(event.targetId) : null;
  if (!target) return;
  const color = healing ? new Color3(1, 0.85, 0.25) : effectColor(event.abilityId || "", event.school || "");
  const critical = !healing && Boolean(event.critical);
  if (event.amount) spawnFloatingNumber(target, event, healing);
  if (critical) spawnCriticalBurst(target, event, color);
  const pieces = Array.from({ length: critical ? 26 : healing ? 8 : 14 }, (_, index) => {
    const piece = MeshBuilder.CreateBox(`pixel-shard-${event.id}-${index}`, { size: critical ? 0.2 : healing ? 0.18 : 0.14 }, scene);
    piece.position = target.position.add(new Vector3((Math.random() - 0.5) * (critical ? 1.05 : 0.7), 1 + Math.random() * (critical ? 0.85 : 0.5), (Math.random() - 0.5) * (critical ? 1.05 : 0.7)));
    const material = mat(`pixel-shard-${event.id}-${index}-mat`, color);
    material.emissiveColor = color.scale(critical ? 1.25 : 0.65);
    piece.material = material;
    return { piece, material, velocity: new Vector3((Math.random() - 0.5) * (critical ? 7 : 4), (critical ? 2.6 : 1.5) + Math.random() * (critical ? 3.2 : 2), (Math.random() - 0.5) * (critical ? 7 : 4)), spin: Math.random() * (critical ? 0.45 : 0.25) };
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

function spawnCriticalBurst(target: TransformNode, event: CombatEvent, color: Color3) {
  const ring = MeshBuilder.CreateTorus(`crit-ring-${event.id}`, { diameter: 1.15, thickness: 0.055, tessellation: 48 }, scene);
  ring.position = target.position.add(new Vector3(0, 1.05, 0));
  ring.rotation.x = Math.PI / 2;
  const material = mat(`crit-ring-${event.id}-mat`, color);
  material.emissiveColor = new Color3(1, 0.82, 0.22);
  ring.material = material;
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = (performance.now() - started) / 360;
    const scale = 1 + progress * 2.4;
    ring.scaling.set(scale, scale, scale);
    ring.position.y = target.position.y + 1.05 + progress * 0.18;
    material.alpha = Math.max(0, 1 - progress);
    if (progress >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      ring.dispose();
    }
  });
}

function playArcaneMissileTick(event: CombatEvent) {
  const source = event.sourceId ? meshes.get(event.sourceId) : null;
  const target = event.targetId ? meshes.get(event.targetId) : null;
  if (!source || !target) return;
  projectile(source.position.add(new Vector3((Math.random() - 0.5) * 0.35, 0.15, (Math.random() - 0.5) * 0.35)), target.position, new Color3(0.8, 0.28, 1), 260);
}

function spawnFloatingNumber(target: TransformNode, event: CombatEvent, healing: boolean) {
  const element = document.createElement("div");
  element.className = healing ? "floatingNumber healNumber" : `floatingNumber damageNumber${event.critical ? " critNumber" : ""}`;
  element.dataset.testid = healing ? "floating-heal" : "floating-damage";
  element.textContent = `${event.critical ? "CRIT " : healing ? "+" : ""}${Math.round(event.amount || 0)}`;
  const color = playerCombatColor(event.sourceId || "");
  if (color) {
    element.style.color = event.critical ? "#fff3a3" : color;
    element.style.textShadow = event.critical ? `-2px -2px 0 #4b0a0a, 2px -2px 0 #4b0a0a, -2px 2px 0 #4b0a0a, 2px 2px 0 #4b0a0a, 0 0 10px ${color}, 0 0 22px #facc15` : `-1px -1px 0 rgba(0,0,0,0.85), 1px -1px 0 rgba(0,0,0,0.85), -1px 1px 0 rgba(0,0,0,0.85), 1px 1px 0 rgba(0,0,0,0.85), 0 0 8px ${color}`;
  }
  document.querySelector("#overhead")!.appendChild(element);
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = (performance.now() - started) / (event.critical ? 1180 : 950);
    const punch = event.critical ? 1 + Math.sin(Math.min(1, progress) * Math.PI) * 0.42 : 1;
    const sway = event.critical ? Math.sin(progress * Math.PI * 2.2) * 10 : 0;
    const screen = projectToScreen(target.position.add(new Vector3(0, (event.critical ? 1.95 : 1.65) + progress * (event.critical ? 1.35 : 1.15), 0)));
    element.style.transform = `translate(${screen.x + sway}px, ${screen.y}px) translate(-50%, -50%) scale(${punch})`;
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

function moonfireStrike(center: Vector3, duration: number) {
  const beam = MeshBuilder.CreateCylinder("moonfire-beam", { diameter: 0.52, height: 7.5, tessellation: 32 }, scene);
  beam.position = center.add(new Vector3(0, 4.0, 0));
  const beamMat = transparentMat("moonfire-beam-mat", new Color3(0.72, 0.95, 1), 0.42);
  beamMat.emissiveColor = new Color3(0.46, 0.85, 0.95);
  beam.material = beamMat;
  const core = MeshBuilder.CreateCylinder("moonfire-core", { diameter: 0.16, height: 7.8, tessellation: 24 }, scene);
  core.position = center.add(new Vector3(0, 4.0, 0));
  const coreMat = transparentMat("moonfire-core-mat", new Color3(0.88, 1, 0.78), 0.74);
  coreMat.emissiveColor = new Color3(0.65, 1, 0.45);
  core.material = coreMat;
  const ground = MeshBuilder.CreateTorus("moonfire-ground", { diameter: 1.35, thickness: 0.055, tessellation: 48 }, scene);
  ground.position = center.add(new Vector3(0, 0.08, 0));
  ground.rotation.x = Math.PI / 2;
  const groundMat = transparentMat("moonfire-ground-mat", new Color3(0.65, 1, 0.36), 0.58);
  groundMat.emissiveColor = new Color3(0.3, 0.8, 0.15);
  ground.material = groundMat;
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = (performance.now() - started) / duration;
    const pulse = 0.9 + Math.sin(progress * Math.PI * 7) * 0.08;
    beam.scaling.x = pulse;
    beam.scaling.z = pulse;
    core.rotation.y += 0.11;
    ground.rotation.z += 0.08;
    ground.scaling.setAll(1 + progress * 0.35);
    beamMat.alpha = Math.max(0, 0.42 * (1 - progress));
    coreMat.alpha = Math.max(0, 0.74 * (1 - progress));
    groundMat.alpha = Math.max(0, 0.58 * (1 - progress));
    if (progress >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      beam.dispose();
      core.dispose();
      ground.dispose();
    }
  });
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

function lightningBolt(from: Vector3, to: Vector3, color: Color3, duration: number) {
  // A jagged, crackling beam made of small white-blue boxes that flash on/off.
  const start = from.add(new Vector3(0, 1.05, 0));
  const end = to.add(new Vector3(0, 1.0, 0));
  const segments = 7;
  const points: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = Vector3.Lerp(start, end, t);
    if (i > 0 && i < segments) {
      p.x += (Math.random() - 0.5) * 0.55;
      p.y += (Math.random() - 0.5) * 0.55;
      p.z += (Math.random() - 0.5) * 0.55;
    }
    points.push(p);
  }
  const segmentMeshes: Mesh[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dir = b.subtract(a);
    const len = dir.length();
    const seg = MeshBuilder.CreateBox("lightning-bolt-seg", { width: 0.16, height: 0.16, depth: len }, scene);
    seg.position = a.add(dir.scale(0.5));
    const angleY = Math.atan2(dir.x, dir.z);
    const angleX = -Math.asin(dir.y / len);
    seg.rotation.set(angleX, angleY, (Math.random() - 0.5) * 0.6);
    const material = mat("lightning-bolt-seg-mat", color);
    material.emissiveColor = new Color3(0.6, 0.85, 1);
    seg.material = material;
    segmentMeshes.push(seg);
  }
  // Glowing tip orb
  const tip = MeshBuilder.CreateSphere("lightning-bolt-tip", { diameter: 0.42, segments: 10 }, scene);
  tip.position = end;
  const tipMat = mat("lightning-bolt-tip-mat", new Color3(0.85, 0.95, 1));
  tipMat.emissiveColor = new Color3(0.6, 0.85, 1);
  tip.material = tipMat;
  // Brief impact flash
  const flash = MeshBuilder.CreateSphere("lightning-bolt-flash", { diameter: 1.4, segments: 12 }, scene);
  flash.position = end;
  const flashMat = mat("lightning-bolt-flash-mat", color);
  flashMat.emissiveColor = new Color3(0.7, 0.9, 1);
  flash.material = flashMat;
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const p = (performance.now() - started) / duration;
    // Flicker intensity
    const flicker = 0.7 + Math.sin(performance.now() * 0.04) * 0.3;
    for (const m of segmentMeshes) {
      const mm = m.material as StandardMaterial;
      if (mm) mm.alpha = Math.max(0, flicker * (1 - p));
    }
    if (flash) {
      flash.scaling.setAll(1 + p * 1.6);
      (flash.material as StandardMaterial).alpha = Math.max(0, (1 - p) * 0.85);
    }
    if (tip) {
      tip.scaling.setAll(1 + Math.sin(performance.now() * 0.02) * 0.2);
      (tip.material as StandardMaterial).alpha = Math.max(0, 1 - p);
    }
    if (p >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      for (const m of segmentMeshes) m.dispose();
      tip.dispose();
      flash.dispose();
    }
  });
}

function chainLightning(from: Vector3, to: Vector3, color: Color3, duration: number) {
  // Initial bolt: lightningBolt
  lightningBolt(from, to, color, duration);
  // Side sparks arcing off the impact point
  for (let i = 0; i < 6; i++) {
    const dir = new Vector3(Math.cos((Math.PI * 2 * i) / 6), 0.2 + Math.random() * 0.4, Math.sin((Math.PI * 2 * i) / 6)).scale(1.2 + Math.random() * 0.8);
    const spark = MeshBuilder.CreateBox("chain-spark", { width: 0.08, height: 0.08, depth: 0.6 }, scene);
    spark.position = to.add(new Vector3(0, 1.0, 0));
    spark.lookAt(to.add(dir.add(new Vector3(0, 1.0, 0))));
    const m = mat("chain-spark-mat", color);
    m.emissiveColor = new Color3(0.65, 0.9, 1);
    spark.material = m;
    const start = performance.now();
    const sparkDur = 280 + Math.random() * 200;
    const observer = scene.onBeforeRenderObservable.add(() => {
      const p = (performance.now() - start) / sparkDur;
      spark.position = to.add(new Vector3(0, 1.0, 0)).add(dir.scale(p));
      m.alpha = Math.max(0, 1 - p);
      if (p >= 1) {
        scene.onBeforeRenderObservable.remove(observer);
        spark.dispose();
      }
    });
  }
  // Big flash on impact
  const flash = MeshBuilder.CreateSphere("chain-flash", { diameter: 2.0, segments: 12 }, scene);
  flash.position = to.add(new Vector3(0, 1.0, 0));
  const fm = mat("chain-flash-mat", color);
  fm.emissiveColor = new Color3(0.75, 0.95, 1);
  flash.material = fm;
  const start = performance.now();
  const obs = scene.onBeforeRenderObservable.add(() => {
    const p = (performance.now() - start) / 480;
    flash.scaling.setAll(1 + p * 2.4);
    fm.alpha = Math.max(0, (1 - p) * 0.9);
    if (p >= 1) {
      scene.onBeforeRenderObservable.remove(obs);
      flash.dispose();
    }
  });
}

function totemSummonEffect(center: Vector3, abilityId: string) {
  let orbColor: Color3;
  let auraColor: Color3;
  if (abilityId.includes("healing_stream")) {
    orbColor = new Color3(0.55, 0.95, 1);
    auraColor = new Color3(0.32, 0.78, 0.88);
  } else if (abilityId.includes("searing")) {
    orbColor = new Color3(1, 0.75, 0.18);
    auraColor = new Color3(1, 0.45, 0.1);
  } else {
    orbColor = new Color3(0.85, 0.62, 0.28);
    auraColor = new Color3(0.62, 0.42, 0.22);
  }
  // Vertical beam of light where the totem lands
  const beam = MeshBuilder.CreateCylinder("totem-summon-beam", { diameterTop: 0.18, diameterBottom: 0.6, height: 2.2, tessellation: 14 }, scene);
  beam.position = center.add(new Vector3(0, 1.1, 0));
  const bm = mat("totem-summon-beam-mat", orbColor);
  bm.emissiveColor = orbColor.scale(0.85);
  beam.material = bm;
  // Ground ring that pushes outward
  const ring = MeshBuilder.CreateTorus("totem-summon-ring", { diameter: 0.5, thickness: 0.08, tessellation: 36 }, scene);
  ring.position = center.add(new Vector3(0, 0.05, 0));
  ring.rotation.x = Math.PI / 2;
  const rm = mat("totem-summon-ring-mat", auraColor);
  rm.emissiveColor = auraColor.scale(0.7);
  ring.material = rm;
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const p = (performance.now() - started) / 900;
    beam.scaling.y = 1 + Math.sin(p * Math.PI) * 0.3;
    bm.alpha = Math.max(0, 1 - p);
    const ringScale = 1 + p * 4.5;
    ring.scaling.set(ringScale, ringScale, ringScale);
    rm.alpha = Math.max(0, (1 - p) * 0.85);
    if (p >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      beam.dispose();
      ring.dispose();
    }
  });
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

function bladeFlurryBurst(center: Vector3, radius: number, duration: number) {
  expandingDisc("blade-flurry-disc", center, radius, new Color3(0.5, 0.12, 0.72), duration, 0.18);
  const count = 18;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const blade = box(`blade-flurry-${i}`, { width: 0.08, height: 0.58, depth: 0.035 }, new Color3(0.82, 0.86, 0.9));
    const material = blade.material as StandardMaterial;
    material.emissiveColor = new Color3(0.45, 0.18, 0.72);
    material.alpha = 0;
    blade.position = center.add(new Vector3(Math.cos(angle) * 0.35, 0.7, Math.sin(angle) * 0.35));
    blade.rotation.y = -angle;
    blade.rotation.z = Math.PI / 2;
    const start = blade.position.clone();
    const end = center.add(new Vector3(Math.cos(angle) * radius, 0.9 + Math.sin(i) * 0.28, Math.sin(angle) * radius));
    const delay = (i % 6) * 35;
    const started = performance.now() + delay;
    const observer = scene.onBeforeRenderObservable.add(() => {
      const progress = Math.max(0, Math.min(1, (performance.now() - started) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      blade.position = Vector3.Lerp(start, end, eased);
      blade.rotation.y += 0.34;
      blade.rotation.x += 0.22;
      material.alpha = progress <= 0 ? 0 : Math.max(0, 1 - progress);
      if (progress >= 1) {
        scene.onBeforeRenderObservable.remove(observer);
        blade.dispose();
      }
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

function natureRing(center: Vector3, radius: number, duration: number) {
  expandingDisc("nature-ring", center, radius, new Color3(0.38, 0.95, 0.28), duration, 0.28);
  for (let i = 0; i < 7; i++) {
    const leaf = MeshBuilder.CreateBox("nature-leaf", { width: 0.12, height: 0.04, depth: 0.28 }, scene);
    const angle = (Math.PI * 2 * i) / 7;
    leaf.position = center.add(new Vector3(Math.cos(angle) * radius * 0.45, 0.45 + Math.random() * 0.35, Math.sin(angle) * radius * 0.45));
    leaf.rotation.y = angle;
    const material = mat("nature-leaf-mat", new Color3(0.26, 0.78, 0.16));
    material.emissiveColor = new Color3(0.08, 0.32, 0.06);
    leaf.material = material;
    animateParticle(leaf, material, new Vector3(Math.cos(angle) * 0.55, 0.55, Math.sin(angle) * 0.55), duration);
  }
}

function shadowRing(center: Vector3, radius: number, duration: number) {
  expandingDisc("shadow-ring", center, radius, new Color3(0.36, 0.08, 0.58), duration, 0.36);
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

function arrowBarrage(center: Vector3, radius: number, duration: number) {
  expandingDisc("arrow-barrage", center, radius, new Color3(0.95, 0.75, 0.22), duration, 0.18);
  for (let i = 0; i < 18; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * radius;
    const end = center.add(new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance));
    const start = end.add(new Vector3((Math.random() - 0.5) * 2.4, 7 + Math.random() * 2.5, (Math.random() - 0.5) * 2.4));
    window.setTimeout(() => arrow(start, end, new Color3(0.95, 0.75, 0.22), 180), i * 35);
  }
}

function arcaneMissiles(from: Vector3, to: Vector3) {
  for (let i = 0; i < 5; i++) {
    const offset = new Vector3((i - 2) * 0.18, Math.sin(i) * 0.15, 0);
    window.setTimeout(() => projectile(from.add(offset), to.add(new Vector3((Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4)), new Color3(0.8, 0.28, 1), 280), i * 80);
  }
}

function iceBlock(center: Vector3, duration: number) {
  const block = MeshBuilder.CreateBox("ice-block", { width: 1.35, height: 2.05, depth: 1.35 }, scene);
  block.position = center.add(new Vector3(0, 1.02, 0));
  block.rotation.y = Math.PI / 4;
  const material = transparentMat("ice-block-mat", new Color3(0.28, 0.9, 1), 0.48);
  material.emissiveColor = new Color3(0.08, 0.45, 0.72);
  block.material = material;
  frostSpikes(center, duration);
  const started = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const progress = (performance.now() - started) / duration;
    block.rotation.y += 0.015;
    block.scaling.setAll(1 + Math.sin(progress * Math.PI) * 0.08);
    material.alpha = Math.max(0, 0.48 * (1 - progress));
    if (progress >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      block.dispose();
    }
  });
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
  if (abilityId.includes("shaman") || school === "shaman") return new Color3(0.42, 0.85, 1);
  if (abilityId.includes("druid") || school === "nature") return new Color3(0.38, 0.95, 0.28);
  if (school === "bleed") return new Color3(0.78, 0.02, 0.02);
  if (abilityId.includes("heal") || abilityId.includes("priest") || school === "holy") return new Color3(1, 0.84, 0.22);
  if (abilityId.includes("arcane") || school === "arcane") return new Color3(0.8, 0.28, 1);
  if (abilityId.includes("rogue") || abilityId.includes("vanish") || school === "poison") return new Color3(0.5, 0.12, 0.72);
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
  } else if (sourceClass === "rogue") {
    rogueSlice(0.025);
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
  } else if (sourceClass === "rogue") {
    rogueSlice(0.04);
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

function rogueSlice(volume = 0.035) {
  noise(0.05, volume, 1800, 0, "highpass");
  tone(260, 0.045, "triangle", volume * 0.75, 0.015);
}

function playStatusSound(event: CombatEvent) {
  if (event.abilityId?.includes("fire") || event.abilityId?.includes("meteor")) fireWhoosh(0);
  if (event.abilityId?.includes("frost")) frostCrackle(0);
  if (event.abilityId?.includes("renew") || event.abilityId?.includes("barrier")) priestChoir(0.03);
  if (event.abilityId?.includes("vanish")) rogueSlice(0.028);
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
  } else if (sourceClass === "rogue") {
    rogueSlice(0.035);
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
