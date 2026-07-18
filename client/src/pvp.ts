import "./pvp.css";
import "./pvp-mobile.css";
import "./pvp-match.css";
import { renderSharedPartyFrame, updateSmoothCastBar } from "./shared-combat-ui";
import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight,
  Mesh, MeshBuilder, PBRMaterial, Scene, ShadowGenerator, StandardMaterial,
  TransformNode, Vector3,
} from "@babylonjs/core";

type Vec3 = { x: number; y: number; z: number };
type ActiveEffect = { id: string; abilityId: string; sourceId: string; kind: "buff" | "debuff"; remaining: number; permanent?: boolean; stacks?: number };
type GroundEffect = { id: string; type: string; abilityId: string; sourceId: string; x: number; y: number; z: number; radius: number; remaining: number; friendly?: boolean };
type PvPPlayer = {
  id: string; name: string; team: "blue" | "red" | null; classId: string | null; ready: boolean;
  spectator: boolean; disconnected: boolean; build: string[]; stats: Record<string, number>;
  abilities: string[]; abilitySlots: Record<string, number>; position: Vec3; facing: number;
  hp: number; maxHealth: number; resource: number; maxResource: number; resourceType: string | null;
  dead: boolean; targetId: string | null; allyTargetId: string | null; shield: number;
  cooldowns: Record<string, number>; globalCooldown: number; casting: { abilityId: string; remaining: number; duration: number } | null;
  stunned: boolean; slowed: boolean; statsSummary: { damage: number; healing: number; kills: number; deaths: number; revives: number };
  activeEffects?: ActiveEffect[]; form?: string | null;
  jumping?: boolean; jumpProgress?: number;
};
type Ability = { id: string; name: string; classId: string; targetType: string; range: number; cooldown: number; castTime?: number; description?: string; effects?: Array<{ type: string }> };
type ClassData = { id: string; name: string; description: string; resourceType: string };
type AttributeData = { name: string; stat: string; mode: string; value: number };
type PvPState = {
  you: string; reconnectToken?: string; matchState: "lobby" | "running" | "victory";
  countdown: number | null; preparation: number; winner: "blue" | "red" | null;
  selectedArena: string; maxTeamSize: number; buildPoints: number;
  attributes: Record<string, AttributeData>; classes: Record<string, ClassData>;
  abilities: Record<string, Ability>; players: Record<string, PvPPlayer>;
  events: Array<Record<string, unknown>>;
  groundEffects?: GroundEffect[];
};
type IncomingPvPState = Omit<PvPState, "attributes" | "classes" | "abilities"> & {
  attributes?: Record<string, AttributeData>; classes?: Record<string, ClassData>; abilities?: Record<string, Ability>;
};

document.title = "Klingenklamm · PvP Arena";
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <canvas id="pvpCanvas" data-testid="pvp-arena"></canvas>
  <div id="pvpLobby" data-testid="pvp-lobby">
    <header class="pvpBrand"><div class="brandMark"><img src="/favicon.svg" alt="" /></div><div><span>COOP RPG ARENA · PVP</span><h1>Klingenklamm</h1><p>Dieselben Helden. Dieselben Zauber. Eine andere Schlacht.</p></div><a href="/">Koop-Modus</a></header>
    <main class="lobbyGrid">
      <section class="teamPanel bluePanel"><div class="panelTitle"><span class="teamOrb"></span><h2>Team Blau</h2><b id="blueCount">0/3</b></div><div id="bluePlayers" class="teamPlayers"></div><button class="joinTeam blue" data-team="blue" data-testid="team-blue">Team Blau beitreten</button></section>
      <section class="buildPanel">
        <div class="identityRow"><label>Kämpfername<input id="pvpName" maxlength="18" value="Gladiator" data-testid="pvp-name" /></label><label>Arena<select id="arenaSelect" data-testid="arena-select"><option value="random">Zufällige Arena</option><option value="blade_ridge">Klingenklamm</option></select></label></div>
        <div class="sectionHeading"><span>1</span><div><h2>Klasse wählen</h2><p>Deine Klasse bestimmt Ressourcen und Zauberpool.</p></div></div>
        <div id="classChoices" class="classChoices" data-testid="pvp-class-choices"></div>
        <div class="sectionHeading"><span>2</span><div><h2>Build schmieden</h2><p>Zauber und Attribute kosten jeweils einen Punkt.</p></div><strong><b id="pointsUsed">0</b>/10</strong></div>
        <div class="buildTabs"><button class="active" data-tab="spells">Zauber</button><button data-tab="stats">Attribute</button><button id="resetBuild">Zurücksetzen</button></div>
        <div id="buildChoices" class="buildChoices" data-testid="pvp-build-choices"></div>
        <div class="readyRow"><button id="addTrainingBot" type="button" data-testid="pvp-add-bot">+ Trainingsbot</button><span id="readyHint">Wähle Team, Klasse und zehn Punkte.</span><button id="pvpReady" data-testid="pvp-ready">Bereit</button></div>
      </section>
      <section class="teamPanel redPanel"><div class="panelTitle"><span class="teamOrb"></span><h2>Team Rot</h2><b id="redCount">0/3</b></div><div id="redPlayers" class="teamPlayers"></div><button class="joinTeam red" data-team="red" data-testid="team-red">Team Rot beitreten</button></section>
    </main>
    <div id="lobbyCountdown" data-testid="pvp-countdown"></div>
  </div>
  <div id="pvpHud" data-testid="pvp-hud" style="min-width:1px;min-height:1px">
    <div id="blueFrames" class="combatTeam blueFrames" aria-label="Team Blau"></div><div id="redFrames" class="combatTeam redFrames" aria-label="Team Rot"></div>
    <div id="pvpTarget" class="targetFrame"><div class="targetSummary">Kein Ziel</div><div class="targetHealth mini"><span></span><div class="partyMeterLabel"></div></div><div id="targetEffects"></div></div>
    <div id="prepBanner" class="prepBanner"></div>
    <div id="eventFeed" class="eventFeed"></div>
    <div class="selfHud"><div id="selfEffects" class="effectRow"></div><div id="selfName"></div><div class="bar hp"><i id="selfHp"></i><span id="selfHpText"></span></div><div class="bar resource"><i id="selfResource"></i><span id="selfResourceText"></span></div></div>
    <div id="actionBar" class="actionBar" data-testid="pvp-action-bar"></div>
    <div id="castBar" class="castBar"><i></i><span></span></div>
    <div id="mobileControls" data-testid="pvp-mobile-controls">
      <div id="pvpMoveStick" data-testid="pvp-move-stick" aria-label="Charakter bewegen"><span id="pvpMoveStickKnob"></span></div>
      <div class="mobileTargetButtons">
        <button id="pvpJump" data-testid="pvp-jump-button">Springen</button>
        <button data-cycle="enemy" data-testid="pvp-mobile-enemy-target">Gegner</button>
        <button data-cycle="ally" data-testid="pvp-mobile-ally-target">Verbündeter</button>
      </div>
    </div>
  </div>
  <div id="victory" data-testid="pvp-result"><div><span>ARENA BEENDET</span><h1 id="winnerText"></h1><div id="scoreboard"></div><button id="playAgain">Zurück zur PvP-Lobby</button><a href="/">Koop-Modus</a></div></div>
  <div id="connectionStatus">Verbinde mit PvP-Server …</div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#pvpCanvas")!;
const touchDevice = navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
const mobileViewport = window.innerWidth <= 900;
const reducedRendering = touchDevice || mobileViewport;
const engine = new Engine(canvas, !reducedRendering, { preserveDrawingBuffer: false, stencil: true });
engine.setHardwareScalingLevel(1 / (reducedRendering ? 1 : Math.min(window.devicePixelRatio || 1, 1.5)));
const scene = new Scene(engine);
(canvas as HTMLCanvasElement & { scene?: Scene }).scene = scene;
scene.clearColor = new Color4(0.055, 0.045, 0.065, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = 0.008;
scene.fogColor = new Color3(0.12, 0.08, 0.13);
const CAMERA_ALPHA = -Math.PI / 2;
const CAMERA_BETA = 0.9;
const DESKTOP_CAMERA_RADIUS = 44;
const MOBILE_CAMERA_RADIUS = 50;
const camera = new ArcRotateCamera("pvp-camera", CAMERA_ALPHA, CAMERA_BETA, mobileViewport ? MOBILE_CAMERA_RADIUS : DESKTOP_CAMERA_RADIUS, new Vector3(0, 2, 0), scene);
camera.inputs.clear();
camera.lowerAlphaLimit = CAMERA_ALPHA; camera.upperAlphaLimit = CAMERA_ALPHA;
camera.lowerBetaLimit = CAMERA_BETA; camera.upperBetaLimit = CAMERA_BETA;
new HemisphericLight("sky", new Vector3(0, 1, 0), scene).intensity = 0.72;
const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.4), scene); sun.position = new Vector3(20, 35, -15); sun.intensity = 1.25;
const shadows = new ShadowGenerator(reducedRendering ? 512 : 1024, sun); shadows.useBlurExponentialShadowMap = !reducedRendering; shadows.blurKernel = reducedRendering ? 4 : 18;

function material(name: string, color: Color3, roughness = 0.88) {
  const m = new PBRMaterial(name, scene); m.albedoColor = color; m.roughness = roughness; m.metallic = 0.02; return m;
}
const rockMat = material("blade-rock", new Color3(0.22, 0.17, 0.2));
const stoneMat = material("ogre-stone", new Color3(0.34, 0.28, 0.25));
const bridgeMat = material("bridge", new Color3(0.28, 0.22, 0.19));
const dirtMat = material("red-dirt", new Color3(0.35, 0.18, 0.11));
const metalMat = material("dark-metal", new Color3(0.15, 0.16, 0.18), 0.35);

function buildArena() {
  const floor = MeshBuilder.CreateGround("lower-arena", { width: 60, height: 36, subdivisions: 2 }, scene); floor.material = dirtMat; floor.receiveShadows = true;
  const bridge = MeshBuilder.CreateBox("high-bridge", { width: 36, depth: 8, height: 0.75 }, scene); bridge.position.y = 4.65; bridge.material = bridgeMat; bridge.receiveShadows = true; shadows.addShadowCaster(bridge);
  for (let x = -16; x <= 16; x += 4) {
    const band = MeshBuilder.CreateBox(`bridge-band-${x}`, { width: 0.22, depth: 8.2, height: 0.82 }, scene); band.position.set(x, 4.66, 0); band.material = metalMat;
  }
  for (const x of [-7, 7]) for (const z of [-8.5, 8.5]) {
    const ramp = MeshBuilder.CreateBox(`center-ramp-${x}-${z}`, { width: 4.6, depth: Math.sqrt(106), height: 0.45 }, scene);
    ramp.position.set(x, 2.35, z); ramp.rotation.x = z < 0 ? -Math.atan2(5, 9) : Math.atan2(5, 9); ramp.material = bridgeMat; ramp.receiveShadows = true;
  }
  for (const x of [-8, 8]) {
    const pillar = MeshBuilder.CreateCylinder(`pillar-${x}`, { diameter: 4.1, height: 5.2, tessellation: 8 }, scene); pillar.position.set(x, 2.55, 0); pillar.material = stoneMat; shadows.addShadowCaster(pillar);
    const cap = MeshBuilder.CreateCylinder(`pillar-cap-${x}`, { diameter: 5.2, height: 0.75, tessellation: 8 }, scene); cap.position.set(x, 5.2, 0); cap.material = metalMat;
    for (let i = 0; i < 4; i++) {
      const tusk = MeshBuilder.CreateCylinder(`pillar-tusk-${x}-${i}`, { diameterTop: 0, diameterBottom: 0.45, height: 2.1, tessellation: 6 }, scene);
      tusk.position.set(x + Math.cos(i * Math.PI / 2) * 2.3, 4.8, Math.sin(i * Math.PI / 2) * 2.3); tusk.rotation.z = Math.PI / 2.8; tusk.material = material(`bone-${x}-${i}`, new Color3(0.64, 0.55, 0.4));
    }
  }
  for (const side of [-1, 1]) {
    const gate = MeshBuilder.CreateBox(`gate-${side}`, { width: 1, height: 5.5, depth: 10 }, scene); gate.position.set(side * 24.7, 2.7, 0); gate.material = side < 0 ? material("blue-gate", new Color3(0.08, 0.2, 0.42), 0.45) : material("red-gate", new Color3(0.48, 0.08, 0.06), 0.45);
  }
  const rimRockCount = reducedRendering ? 30 : 48;
  for (let i = 0; i < rimRockCount; i++) {
    const angle = i / rimRockCount * Math.PI * 2; const radius = 32 + (i % 5) * 1.2;
    // Keep the Blade's Edge silhouette without letting nearby scenery cover
    // players when the fixed co-op camera follows either spawn side.
    const size = 1.8 + (i % 4) * 0.35;
    const rock = MeshBuilder.CreatePolyhedron(`rim-rock-${i}`, { type: i % 2, size }, scene);
    rock.position.set(Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius * 0.62);
    rock.scaling.y = 1.15; rock.rotation.y = angle; rock.material = rockMat;
  }
  for (const x of [-27, 27]) for (const z of [-11, 11]) {
    const brazier = MeshBuilder.CreateCylinder(`brazier-${x}-${z}`, { diameter: 1.2, height: 2.4, tessellation: 6 }, scene); brazier.position.set(x, 1.2, z); brazier.material = metalMat;
    const flameMat = new StandardMaterial(`flame-${x}-${z}`, scene); flameMat.diffuseColor = new Color3(1, 0.25, 0.03); flameMat.emissiveColor = new Color3(1, 0.16, 0.01);
    const flame = MeshBuilder.CreateSphere(`fire-${x}-${z}`, { diameter: 1.05, segments: 6 }, scene); flame.position.set(x, 2.75, z); flame.scaling.y = 1.45; flame.material = flameMat;
  }
}
buildArena();

let state: PvPState | null = null;
let previousState: PvPState | null = null;
let snapshotReceivedAt = 0;
let ws: WebSocket;
let activeTab: "spells" | "stats" = "spells";
let lobbySignature = "";
let actionBarSignature = "";
let lastEventId = 0;
let castBarVisualProgress = 0;
let visualCastAbilityId = "";
const playerNodes = new Map<string, TransformNode>();
const groundEffectNodes = new Map<string, TransformNode>();
const JUMP_DURATION_SECONDS = 0.36;

function wsUrl() {
  const override = new URLSearchParams(location.search).get("backend");
  const base = override || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:8000`;
  const token = localStorage.getItem("coop-rpg-pvp-token");
  return `${base.replace(/^http/, "ws")}/ws/pvp${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}
function connect() {
  ws = new WebSocket(wsUrl());
  ws.onopen = () => document.querySelector("#connectionStatus")?.classList.add("hidden");
  ws.onclose = () => { document.querySelector("#connectionStatus")?.classList.remove("hidden"); setTimeout(connect, 1200); };
  ws.onmessage = (event) => {
    const incoming = JSON.parse(event.data) as IncomingPvPState;
    previousState = state;
    state = {
      ...incoming,
      attributes: incoming.attributes ?? state?.attributes ?? {},
      classes: incoming.classes ?? state?.classes ?? {},
      abilities: incoming.abilities ?? state?.abilities ?? {},
    };
    snapshotReceivedAt = performance.now();
    if (state.reconnectToken) localStorage.setItem("coop-rpg-pvp-token", state.reconnectToken);
    render();
  };
}
function send(message: Record<string, unknown>) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); }
connect();

document.querySelector<HTMLInputElement>("#pvpName")!.addEventListener("change", e => send({ type: "set_name", name: (e.target as HTMLInputElement).value }));
document.querySelector("#pvpLobby")!.addEventListener("click", event => {
  const element = event.target as HTMLElement;
  const team = element.closest<HTMLButtonElement>("[data-team]")?.dataset.team;
  const classId = element.closest<HTMLButtonElement>("[data-class]")?.dataset.class;
  const choice = element.closest<HTMLButtonElement>("[data-choice]")?.dataset.choice;
  const tab = element.closest<HTMLButtonElement>("[data-tab]")?.dataset.tab;
  if (team) send({ type: "select_team", team });
  if (classId) send({ type: "select_class", classId });
  if (choice) send({ type: "toggle_build", choice });
  if (tab === "spells" || tab === "stats") { activeTab = tab; lobbySignature = ""; renderLobby(); }
});
document.querySelector("#resetBuild")!.addEventListener("click", () => send({ type: "reset_build" }));
document.querySelector("#pvpReady")!.addEventListener("click", () => send({ type: "ready", ready: !state?.players[state.you]?.ready }));
document.querySelector("#arenaSelect")!.addEventListener("change", e => send({ type: "select_arena", arenaId: (e.target as HTMLSelectElement).value }));
document.querySelector("#playAgain")!.addEventListener("click", () => send({ type: "restart_match" }));

function render() {
  if (!state) return;
  document.body.classList.toggle("inMatch", state.matchState !== "lobby");
  document.body.classList.toggle("matchOver", state.matchState === "victory");
  if (state.matchState === "lobby") renderLobby();
  else renderCombat();
  renderEvents();
}

function renderLobby() {
  if (!state) return;
  const me = state.players[state.you]; if (!me) return;
  const signature = JSON.stringify([state.matchState, state.countdown, state.selectedArena, activeTab, Object.values(state.players).map(p => [p.id, p.name, p.team, p.classId, p.ready, p.build]), me.id]);
  if (signature === lobbySignature) return; lobbySignature = signature;
  const teamPlayers = (team: string) => Object.values(state!.players).filter(p => p.team === team && !p.spectator);
  const playerCard = (p: PvPPlayer) => `<div class="lobbyPlayer ${p.id === state!.you ? "you" : ""}"><span>${p.ready ? "✓" : "·"}</span><div><b>${escapeHtml(p.name)}</b><small>${p.classId ? state!.classes[p.classId]?.name : "Keine Klasse"}</small></div><em>${p.build.length}/10</em></div>`;
  const blue = teamPlayers("blue"), red = teamPlayers("red");
  const opposingTeam = me.team === "blue" ? "red" : me.team === "red" ? "blue" : null;
  const botButton = document.querySelector<HTMLButtonElement>("#addTrainingBot")!;
  const hasTrainingBot = Object.values(state.players).some(player => player.name === "Trainingsbot");
  botButton.disabled = !opposingTeam;
  botButton.textContent = hasTrainingBot ? "− Trainingsbot entfernen" : "+ Trainingsbot";
  botButton.onclick = () => send({ type: hasTrainingBot ? "remove_training_bot" : "add_training_bot", classId: "warrior" });
  document.querySelector("#bluePlayers")!.innerHTML = blue.map(playerCard).join("") || `<div class="emptyTeam">Warte auf Kämpfer …</div>`;
  document.querySelector("#redPlayers")!.innerHTML = red.map(playerCard).join("") || `<div class="emptyTeam">Warte auf Kämpfer …</div>`;
  document.querySelector("#blueCount")!.textContent = `${blue.length}/${state.maxTeamSize}`;
  document.querySelector("#redCount")!.textContent = `${red.length}/${state.maxTeamSize}`;
  document.querySelectorAll(".joinTeam").forEach(button => button.classList.toggle("selected", (button as HTMLElement).dataset.team === me.team));
  document.querySelector("#classChoices")!.innerHTML = Object.values(state.classes).map(c => `<button data-class="${c.id}" data-testid="pvp-class-${c.id}" class="${me.classId === c.id ? "selected" : ""}"><span>${classIcon(c.id)}</span><b>${c.name}</b></button>`).join("");
  document.querySelector("#pointsUsed")!.textContent = String(me.build.length);
  document.querySelectorAll(".buildTabs [data-tab]").forEach(button => button.classList.toggle("active", (button as HTMLElement).dataset.tab === activeTab));
  if (activeTab === "spells") {
    const spells = Object.values(state.abilities).filter(a => a.classId === me.classId);
    document.querySelector("#buildChoices")!.innerHTML = spells.length ? spells.map(a => {
      const choice = `spell:${a.id}`, selected = me.build.includes(choice);
      return `<button data-choice="${choice}" class="buildChoice ${selected ? "selected" : ""}" data-testid="pvp-spell-${a.id}"><span>${abilityGlyph(a)}</span><div><b>${a.name}</b><small>${a.description || a.targetType}</small></div><em>${selected ? "✓" : "+1"}</em></button>`;
    }).join("") : `<div class="buildEmpty">Wähle zuerst eine Klasse.</div>`;
  } else {
    document.querySelector("#buildChoices")!.innerHTML = Object.entries(state.attributes).map(([id, attr]) => {
      const ranks = me.build.filter(c => c === `stat:${id}`).length;
      return `<button data-choice="stat:${id}" class="buildChoice ${ranks ? "selected" : ""}" data-testid="pvp-stat-${id}"><span>◆</span><div><b>${attr.name}</b><small>${attributeText(attr)} pro Punkt</small></div><em>${ranks ? `Rang ${ranks}` : "+1"}</em></button>`;
    }).join("");
  }
  const valid = Boolean(me.team && me.classId && me.build.length === state.buildPoints);
  const ready = document.querySelector<HTMLButtonElement>("#pvpReady")!; ready.disabled = !valid && !me.ready; ready.classList.toggle("active", me.ready); ready.textContent = me.ready ? "Nicht bereit" : "Bereit";
  document.querySelector("#readyHint")!.textContent = me.ready ? "Build gesperrt – bereit zum Kampf." : !me.team ? "Wähle dein Team." : !me.classId ? "Wähle deine Klasse." : me.build.length < 10 ? `Noch ${10 - me.build.length} Build-Punkte vergeben.` : "Bereit für die Arena.";
  document.querySelector("#lobbyCountdown")!.textContent = state.countdown !== null ? `Kampf beginnt in ${Math.ceil(state.countdown)}` : "";
  document.querySelector<HTMLSelectElement>("#arenaSelect")!.value = state.selectedArena;
}

function renderCombat() {
  if (!state) return; const me = state.players[state.you]; if (!me) return;
  const frame = (p: PvPPlayer) => renderSharedPartyFrame(p,p.id===me.targetId||p.id===me.allyTargetId,renderEffects(p.activeEffects),"button").replace("<button ",`<button data-player-id="${p.id}" `);
  const blue = Object.values(state.players).filter(p => p.team === "blue" && !p.spectator), red = Object.values(state.players).filter(p => p.team === "red" && !p.spectator);
  document.querySelector("#blueFrames")!.innerHTML = blue.map(frame).join(""); document.querySelector("#redFrames")!.innerHTML = red.map(frame).join("");
  document.querySelectorAll<HTMLButtonElement>(".combatFrame").forEach(button => button.onclick = () => send({ type: "select_target", targetId: button.dataset.playerId }));
  const target = state.players[me.targetId || me.allyTargetId || ""];
  const targetFrame=document.querySelector<HTMLElement>("#pvpTarget")!;
  targetFrame.querySelector<HTMLElement>(".targetSummary")!.textContent=target ? `${target.name} ${Math.round(target.hp)}/${Math.round(target.maxHealth)}` : "Kein Ziel";
  const targetHealth=targetFrame.querySelector<HTMLElement>(".targetHealth")!; targetHealth.style.display=target?"block":"none";
  targetHealth.querySelector<HTMLElement>(":scope > span")!.style.width=`${target ? Math.max(0,target.hp/Math.max(1,target.maxHealth)*100):0}%`;
  targetHealth.querySelector<HTMLElement>(".partyMeterLabel")!.textContent=target ? `HP ${Math.round(target.hp)}/${Math.round(target.maxHealth)}` : "";
  document.querySelector("#targetEffects")!.innerHTML=target ? renderEffects(target.activeEffects) : "";
  document.querySelector("#prepBanner")!.textContent = state.preparation > 0 ? `Tore öffnen in ${Math.ceil(state.preparation)}` : "";
  scene.getMeshByName("gate--1")?.setEnabled(state.preparation > 0);
  scene.getMeshByName("gate-1")?.setEnabled(state.preparation > 0);
  document.querySelector("#selfName")!.innerHTML = `<b>${escapeHtml(me.name)}</b><span>${state.classes[me.classId || ""]?.name || ""}</span>`;
  document.querySelector("#selfEffects")!.innerHTML = renderEffects(me.activeEffects);
  (document.querySelector("#selfHp") as HTMLElement).style.width = `${me.hp / Math.max(1, me.maxHealth) * 100}%`; document.querySelector("#selfHpText")!.textContent = `${Math.ceil(me.hp)} HP${me.shield ? ` + ${Math.ceil(me.shield)}` : ""}`;
  (document.querySelector("#selfResource") as HTMLElement).style.width = `${me.resource / Math.max(1, me.maxResource) * 100}%`; document.querySelector("#selfResourceText")!.textContent = `${Math.ceil(me.resource)} ${me.resourceType || ""}`;
  const slots = Array.from({ length: 10 }, (_, i) => i + 1);
  const slotKeys = ["1", "2", "3", "4", "Q", "E", "R", "F", "G", "C"];
  const slotAbilities = slots.map(slot => Object.entries(me.abilitySlots).find(([, assigned]) => assigned === slot)?.[0] || "");
  const nextActionBarSignature = slotAbilities.join("|");
  if (nextActionBarSignature !== actionBarSignature) {
    actionBarSignature = nextActionBarSignature;
    document.querySelector("#actionBar")!.innerHTML = slots.map((slot, index) => {
      const abilityId = slotAbilities[index]; const a = abilityId ? state!.abilities[abilityId] : null;
      const hue = a ? abilityHue(a) : 215;
      return `<button data-slot="${slot}" data-ability-id="${abilityId}" style="--ability-hue:${hue}" ${a ? "" : "disabled"} data-testid="pvp-ability-slot-${slot}"><span class="abilityKey">${slotKeys[index]}</span><span class="abilityName">${a?.name || "Leer"}</span><span class="cooldownOverlay" hidden></span><span class="cooldownText"></span></button>`;
    }).join("");
    document.querySelectorAll<HTMLButtonElement>("#actionBar button[data-slot]").forEach(button => button.onclick = () => castSlot(Number(button.dataset.slot)));
  }
  document.querySelectorAll<HTMLButtonElement>("#actionBar button[data-ability-id]").forEach(button => {
    const cooldown = me.cooldowns[button.dataset.abilityId || ""] || 0;
    const overlay = button.querySelector<HTMLElement>(".cooldownOverlay")!;
    const cooldownText = button.querySelector<HTMLElement>(".cooldownText")!;
    const shownCooldown = Math.max(cooldown, me.globalCooldown || 0);
    button.classList.toggle("onCooldown", shownCooldown > 0);
    overlay.hidden = shownCooldown <= 0;
    cooldownText.textContent = shownCooldown > 0 ? shownCooldown.toFixed(1) : "";
  });
  if (state.matchState === "victory") renderVictory();
}

function renderVictory() {
  if (!state) return;
  document.querySelector("#winnerText")!.textContent = `Team ${state.winner === "blue" ? "Blau" : "Rot"} siegt`;
  document.querySelector("#scoreboard")!.innerHTML = Object.values(state.players).filter(p => !p.spectator && p.team).sort((a, b) => a.team!.localeCompare(b.team!)).map(p => `<div class="scoreRow ${p.team}"><b>${escapeHtml(p.name)}</b><span>${state!.classes[p.classId || ""]?.name || ""}</span><em>${p.statsSummary.kills} K · ${p.statsSummary.deaths} T · ${p.statsSummary.revives} W</em><small>${Math.round(p.statsSummary.damage)} Schaden · ${Math.round(p.statsSummary.healing)} Heilung</small></div>`).join("");
}

function syncPlayers() {
  if (!state) return; const live = new Set(Object.keys(state.players));
  for (const [id, node] of playerNodes) if (!live.has(id) || state!.players[id].spectator || state!.matchState === "lobby") { node.dispose(); playerNodes.delete(id); }
  if (state.matchState === "lobby") return;
  for (const p of Object.values(state.players)) {
    if (p.spectator) continue; let node = playerNodes.get(p.id); if (!node) { node = createPlayer(p); node.position.copyFromFloats(p.position.x, p.position.y, p.position.z); playerNodes.set(p.id, node); }
    const position = interpolatedPlayerPosition(p.id, p.position);
    const jumpElapsed=Math.max(0,(performance.now()-snapshotReceivedAt)/1000);
    const jumpProgress=p.jumping?Math.min(1,Math.max(0,p.jumpProgress||0)+jumpElapsed/JUMP_DURATION_SECONDS):1;
    const jumpY=p.jumping?4*jumpProgress*(1-jumpProgress)*.9:0;
    node.position.copyFromFloats(position.x, position.y+jumpY, position.z);
    node.rotation.y += Math.atan2(Math.sin(p.facing - node.rotation.y), Math.cos(p.facing - node.rotation.y)) * 0.28;
    node.scaling.y += ((p.dead ? 0.28 : 1) - node.scaling.y) * 0.22; node.setEnabled(true);
    const ring = node.getChildMeshes().find(m => m.name.endsWith("-ring")); if (ring) ring.isVisible = p.id === state.players[state.you]?.targetId || p.id === state.players[state.you]?.allyTargetId;
  }
}

function interpolatedPlayerPosition(id: string, current: Vec3): Vec3 {
  const previous = previousState?.players[id]?.position;
  if (!previous || !snapshotReceivedAt) return current;
  const alpha = Math.min(1, Math.max(0, (performance.now() - snapshotReceivedAt) / (1000 / 15)));
  return {
    x: previous.x + (current.x - previous.x) * alpha,
    y: previous.y + (current.y - previous.y) * alpha,
    z: previous.z + (current.z - previous.z) * alpha,
  };
}

function createPlayer(p: PvPPlayer) {
  const root = new TransformNode(`player-${p.id}`, scene); const teamColor = p.team === "blue" ? new Color3(0.08, 0.38, 1) : new Color3(0.95, 0.08, 0.05); const classColor = classColour(p.classId || "");
  const build = playerBuild(p.classId);
  const body = modelBox(`${p.id}-body`, build.body, classColor, root, 0, .72, 0);
  const head = modelBox(`${p.id}-head`, build.head, build.skin, root, 0, 1.47, 0);
  const leftArm = modelBox(`${p.id}-left-arm`, build.arm, classColor.scale(.84), root, -build.armX, .94, 0); leftArm.rotation.z = -.16;
  const rightArm = modelBox(`${p.id}-right-arm`, build.arm, classColor.scale(.84), root, build.armX, .94, 0); rightArm.rotation.z = .16;
  addClassModel(root, p.id, p.classId, classColor, leftArm, rightArm);
  [body, head, leftArm, rightArm].forEach(mesh => { mesh.metadata = { playerId: p.id }; shadows.addShadowCaster(mesh); });
  const ringMat = new StandardMaterial(`${p.id}-ring-mat`, scene); ringMat.emissiveColor = teamColor; ringMat.diffuseColor = teamColor;
  const ring = MeshBuilder.CreateTorus(`${p.id}-ring`, { diameter: 1.65, thickness: 0.08, tessellation: 32 }, scene); ring.parent = root; ring.position.y = 0.06; ring.material = ringMat; ring.isVisible = false;
  root.getChildMeshes().forEach(mesh => mesh.metadata = { ...(mesh.metadata || {}), playerId: p.id });
  return root;
}

function playerBuild(classId: string | null) {
  const specs: Record<string, [number,number,number,number,number,number,number,number,number,number,number,number]> = {
    warrior:[.92,1.02,.52,.56,.54,.26,.78,.26,.68,.78,.55,.38], hunter:[.72,.96,.42,.48,.5,.18,.76,.2,.52,.84,.62,.43], priest:[.82,1.06,.48,.5,.5,.2,.72,.22,.58,.88,.68,.5],
    rogue:[.66,.92,.38,.46,.46,.16,.72,.18,.5,.78,.56,.42], druid:[.76,1,.46,.5,.5,.2,.74,.22,.56,.76,.56,.38], shaman:[.78,1.02,.48,.5,.5,.2,.78,.22,.58,.74,.56,.4], paladin:[.9,1.04,.54,.54,.52,.24,.78,.24,.66,.82,.62,.44], mage:[.74,.98,.44,.5,.5,.18,.74,.2,.54,.84,.64,.48]
  };
  const s=specs[classId || "mage"] || specs.mage;
  return { body:{width:s[0],height:s[1],depth:s[2]},head:{width:s[3],height:.45,depth:s[4]},arm:{width:s[5],height:s[6],depth:s[7]},armX:s[8],skin:new Color3(s[9],s[10],s[11]) };
}
function modelBox(name: string, size: { width: number; height: number; depth: number }, color: Color3, parent: TransformNode, x: number, y: number, z: number) {
  const mesh = MeshBuilder.CreateBox(name, size, scene); mesh.parent = parent; mesh.position.set(x, y, z); mesh.material = material(`${name}-mat`, color); return mesh;
}
function addClassModel(root: TransformNode, id: string, classId: string | null, color: Color3, leftArm: Mesh, rightArm: Mesh) {
  const part = (name: string, size: { width: number; height: number; depth: number }, tint: Color3, x: number, y: number, z: number, parent: TransformNode = root) => modelBox(`${id}-${name}`, size, tint, parent, x, y, z);
  if (classId === "warrior") {
    const ls=part("left-shoulder",{width:.46,height:.24,depth:.46},new Color3(.42,.42,.46),-.63,1.24,0);ls.rotation.z=-.12; const rs=part("right-shoulder",{width:.32,height:.18,depth:.38},new Color3(.32,.31,.33),.62,1.22,0);rs.rotation.z=.18;
    const strap=part("chest-strap",{width:.18,height:1.1,depth:.54},new Color3(.22,.11,.04),-.08,.77,-.03);strap.rotation.z=-.48; part("belt",{width:.96,height:.14,depth:.56},new Color3(.18,.1,.04),0,.43,0);
    const sword=part("sword",{width:.12,height:1.18,depth:.08},new Color3(.8,.82,.86),.06,-.52,-.18,rightArm);sword.rotation.z=-.18; const shield=part("shield",{width:.5,height:.64,depth:.12},new Color3(.24,.26,.32),-.12,-.12,-.16,leftArm);shield.rotation.z=.18; part("shield-crest",{width:.18,height:.42,depth:.13},new Color3(.95,.78,.16),0,0,-.08,shield);
  }
  else if (classId === "hunter") { part("cloak",{width:.66,height:.9,depth:.08},new Color3(.04,.18,.08),0,.76,.31); const quiver=part("quiver",{width:.28,height:.86,depth:.24},new Color3(.32,.18,.08),-.28,.95,-.34);quiver.rotation.z=.25; const path=Array.from({length:17},(_,i)=>{const a=-Math.PI*.72+Math.PI*1.44*i/16;return new Vector3(Math.cos(a)*.24,Math.sin(a)*.72,0)});const bow=MeshBuilder.CreateTube(`${id}-bow`,{path,radius:.035,tessellation:8},scene);bow.parent=rightArm;bow.position.set(.12,-.12,-.16);bow.material=material(`${id}-bow-mat`,new Color3(.42,.24,.1)); }
  else if (classId === "priest") { const skirt=MeshBuilder.CreateCylinder(`${id}-robe-skirt`,{diameterTop:.76,diameterBottom:.98,height:.62,tessellation:6},scene); skirt.parent=root; skirt.position.y=.34; skirt.material=material(`${id}-robe-skirt-mat`,new Color3(.93,.9,.78)); const halo=MeshBuilder.CreateTorus(`${id}-halo`,{diameter:.68,thickness:.035,tessellation:36},scene); halo.parent=root; halo.position.y=1.85; halo.rotation.x=Math.PI/2; halo.material=material(`${id}-halo-mat`,new Color3(1,.86,.28)); const sash=part("sash",{width:.14,height:1.08,depth:.48},new Color3(.95,.78,.22),0,.72,0);sash.rotation.z=-.28; part("book",{width:.34,height:.24,depth:.1},new Color3(.42,.18,.09),-.18,-.12,-.14,leftArm); }
  else if (classId === "mage") { const collar=MeshBuilder.CreateCylinder(`${id}-collar`,{diameterTop:.92,diameterBottom:.6,height:.28,tessellation:5},scene);collar.parent=root;collar.position.y=1.22;collar.rotation.y=Math.PI/5;collar.material=material(`${id}-collar-mat`,new Color3(.1,.07,.28)); const hat=MeshBuilder.CreateCylinder(`${id}-hat`,{diameterTop:.08,diameterBottom:.72,height:.72,tessellation:4},scene);hat.parent=root;hat.position.y=1.95;hat.rotation.y=Math.PI/4;hat.material=material(`${id}-hat-mat`,color.scale(.7)); part("hat-band",{width:.62,height:.08,depth:.62},new Color3(.86,.26,.08),0,1.65,0).rotation.y=Math.PI/4; const staff=part("staff",{width:.08,height:1.45,depth:.08},new Color3(.38,.2,.08),.2,-.12,.06,rightArm);staff.rotation.z=.16; const gem=MeshBuilder.CreateSphere(`${id}-staff-gem`,{diameter:.22,segments:8},scene);gem.parent=staff;gem.position.set(.12,.72,0);gem.material=material(`${id}-staff-gem-mat`,new Color3(.45,.95,1)); part("cape",{width:.72,height:.92,depth:.08},color.scale(.48),0,.78,.33).rotation.x=-.12; }
  else if (classId === "rogue") { part("hood",{width:.58,height:.32,depth:.54},color.scale(.55),0,1.64,0); for(const side of [-1,1]) part(`dagger-${side}`,{width:.06,height:.72,depth:.05},new Color3(.82,.84,.88),side*.06,-.5,-.16,side<0?leftArm:rightArm); }
  else if (classId === "druid") { for(const side of [-1,1]) { const antler=MeshBuilder.CreateCylinder(`${id}-antler-${side}`,{diameter:.08,height:.65,tessellation:6},scene); antler.parent=root; antler.position.set(side*.3,1.88,0); antler.rotation.z=side*.3; antler.material=material(`${id}-antler-${side}-mat`,new Color3(.35,.2,.08)); } }
  else if (classId === "shaman") { part("shoulders",{width:1.18,height:.22,depth:.54},new Color3(.24,.38,.46),0,1.23,0); const orb=MeshBuilder.CreateSphere(`${id}-storm-orb`,{diameter:.24,segments:8},scene); orb.parent=rightArm; orb.position.set(.05,-.5,-.15); orb.material=material(`${id}-orb-mat`,new Color3(.2,.72,1)); }
  else if (classId === "paladin") { part("pauldrons",{width:1.35,height:.24,depth:.65},new Color3(.72,.66,.44),0,1.24,0); part("mace",{width:.14,height:1.22,depth:.14},new Color3(.55,.52,.42),.08,-.5,-.16,rightArm); const halo=MeshBuilder.CreateTorus(`${id}-holy-ring`,{diameter:.72,thickness:.04,tessellation:28},scene); halo.parent=root; halo.position.y=1.86; halo.rotation.x=Math.PI/2; halo.material=material(`${id}-holy-ring-mat`,new Color3(1,.75,.18)); }
}

scene.onPointerDown = (_, info) => { const id = (info?.pickedMesh as Mesh | undefined)?.metadata?.playerId as string | undefined; if (id) send({ type: "select_target", targetId: id }); };
const movement: Record<string, boolean> = {};
const keyMap: Record<string, string> = { KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };
const abilityKeyMap: Record<string, number> = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, KeyQ: 5, KeyE: 6, KeyR: 7, KeyF: 8, KeyG: 9, KeyC: 10 };
window.addEventListener("keydown", event => {
  if (!state || state.matchState !== "running" || (event.target as HTMLElement).matches("input,select")) return;
  if (keyMap[event.code] && !movement[keyMap[event.code]]) { movement[keyMap[event.code]] = true; send({ type: "input", movement }); }
  if (event.code === "Tab") { event.preventDefault(); send({ type: "cycle_target", ally: event.shiftKey }); }
  if (event.code === "Space") { event.preventDefault(); send({ type: "jump" }); }
  if (abilityKeyMap[event.code]) castSlot(abilityKeyMap[event.code]);
});
window.addEventListener("keyup", event => { if (keyMap[event.code]) { movement[keyMap[event.code]] = false; send({ type: "input", movement }); } });
setInterval(() => { if (state?.matchState === "running" && !state.players[state.you]?.spectator) send({ type: "input", movement }); }, 50);

const moveStick = document.querySelector<HTMLElement>("#pvpMoveStick")!;
const moveStickKnob = document.querySelector<HTMLElement>("#pvpMoveStickKnob")!;
let movePointerId: number | null = null;
function updateTouchMovement(event: PointerEvent) {
  const rect = moveStick.getBoundingClientRect();
  const radius = rect.width * 0.34;
  let dx = event.clientX - (rect.left + rect.width / 2);
  let dy = event.clientY - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy);
  if (distance > radius) { dx = dx / distance * radius; dy = dy / distance * radius; }
  moveStickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  const deadZone = radius * 0.22;
  movement.left = dx < -deadZone; movement.right = dx > deadZone;
  movement.up = dy < -deadZone; movement.down = dy > deadZone;
  send({ type: "input", movement });
}
function stopTouchMovement(pointerId?: number) {
  if (pointerId !== undefined && movePointerId !== pointerId) return;
  movePointerId = null;
  movement.up = movement.down = movement.left = movement.right = false;
  moveStickKnob.style.transform = "translate(0, 0)";
  send({ type: "input", movement });
}
moveStick.addEventListener("pointerdown", event => { if (state?.matchState !== "running") return; event.preventDefault(); movePointerId = event.pointerId; updateTouchMovement(event); });
window.addEventListener("pointermove", event => { if (event.pointerId === movePointerId) { event.preventDefault(); updateTouchMovement(event); } }, { passive: false });
window.addEventListener("pointerup", event => stopTouchMovement(event.pointerId));
window.addEventListener("pointercancel", event => stopTouchMovement(event.pointerId));
window.addEventListener("blur", () => { if (movePointerId !== null) stopTouchMovement(); });
document.querySelector<HTMLButtonElement>("[data-cycle=enemy]")!.addEventListener("click", () => send({ type: "cycle_target", ally: false }));
document.querySelector<HTMLButtonElement>("[data-cycle=ally]")!.addEventListener("click", () => send({ type: "cycle_target", ally: true }));
document.querySelector<HTMLButtonElement>("#pvpJump")!.addEventListener("click", () => send({ type: "jump" }));
function castSlot(slot: number) { const me = state?.players[state.you]; const target = me ? state?.players[me.targetId || ""] : null; send({ type: "cast_ability", abilitySlot: slot, groundPosition: target?.position || me?.position }); }

function renderEvents() {
  if (!state) return; const events = state.events.filter(e => Number(e.id) > lastEventId); if (!events.length) return; lastEventId = Math.max(lastEventId, ...events.map(e => Number(e.id)));
  const feed = document.querySelector("#eventFeed")!;
  for (const event of events.slice(-4)) {
    playCombatEffect(event);
    const line = document.createElement("div"); const source = state.players[String(event.sourceId || "")]; const target = state.players[String(event.targetId || "")];
    line.textContent = event.type === "damage" ? `${source?.name || "?"} → ${target?.name || "?"}: ${event.amount}` : event.type === "heal" ? `${source?.name || "?"} heilt ${target?.name || "?"}: ${event.amount}` : event.type === "revive" ? `${source?.name || "?"} belebt ${target?.name || "?"} wieder` : event.type === "death" ? `${target?.name || "?"} fällt` : "";
    if (line.textContent) { feed.appendChild(line); setTimeout(() => line.remove(), 4000); }
  }
}

function renderEffects(effects: ActiveEffect[] = []) {
  return `<span class="effectIcons">${effects.slice(0, 8).map(effect => { const ability = state?.abilities[effect.abilityId]; const hue = ability ? abilityHue(ability) : effect.kind === "buff" ? 120 : 0; return `<i class="effectIcon ${effect.kind}" style="--ability-hue:${hue}" title="${escapeHtml(ability?.name || effect.abilityId)}">${ability ? abilityGlyph(ability) : "◆"}<b>${effect.permanent ? "∞" : Math.ceil(effect.remaining)}</b></i>`; }).join("")}</span>`;
}
function entityWorldPosition(id: unknown) { const p = state?.players[String(id || "")]; return p ? new Vector3(p.position.x, p.position.y + 1.05, p.position.z) : null; }
function playCombatEffect(event: Record<string, unknown>) {
  const source = entityWorldPosition(event.sourceId), target = entityWorldPosition(event.targetId); const ability = state?.abilities[String(event.abilityId || "")];
  if (event.type === "cast" && source) pulse(source, ability ? abilityHue(ability) : 48, .55);
  if ((event.type === "cast_complete" || event.type === "auto_attack") && source && target) projectile(source, target, ability ? abilityHue(ability) : 28);
  if ((event.type === "damage" || event.type === "heal") && target) pulse(target, event.type === "heal" ? 125 : ability ? abilityHue(ability) : 8, event.type === "heal" ? .8 : .55);
}
function pulse(position: Vector3, hue: number, alpha: number) {
  const ring=MeshBuilder.CreateTorus("combat-pulse",{diameter:1.4,thickness:.08,tessellation:32},scene); ring.position=position.clone(); ring.rotation.x=Math.PI/2; const c=Color3.FromHSV(hue, .75, 1); const m=new StandardMaterial("combat-pulse-mat",scene); m.diffuseColor=c; m.emissiveColor=c; m.alpha=alpha; ring.material=m; const start=performance.now(); const observer=scene.onBeforeRenderObservable.add(()=>{ const t=(performance.now()-start)/420; ring.scaling.setAll(1+t*1.8); m.alpha=alpha*(1-t); if(t>=1){scene.onBeforeRenderObservable.remove(observer);ring.dispose();}});
}
function projectile(from: Vector3, to: Vector3, hue: number) {
  const orb=MeshBuilder.CreateSphere("spell-projectile",{diameter:.28,segments:8},scene); orb.position=from.clone(); const c=Color3.FromHSV(hue,.78,1); const m=new StandardMaterial("spell-projectile-mat",scene);m.diffuseColor=c;m.emissiveColor=c;orb.material=m; const start=performance.now(); const observer=scene.onBeforeRenderObservable.add(()=>{const t=Math.min(1,(performance.now()-start)/260);Vector3.LerpToRef(from,to,t,orb.position);orb.position.y+=Math.sin(t*Math.PI)*.65;if(t>=1){scene.onBeforeRenderObservable.remove(observer);orb.dispose();}});
}
function syncGroundEffects() {
  const effects=state?.groundEffects || []; const live=new Set(effects.map(effect=>effect.id));
  for(const [id,node] of groundEffectNodes) if(!live.has(id)){node.dispose();groundEffectNodes.delete(id);}
  for(const effect of effects){ let node=groundEffectNodes.get(effect.id); if(!node){node=new TransformNode(effect.id,scene);const disc=MeshBuilder.CreateCylinder(`${effect.id}-disc`,{diameter:effect.radius*2,height:.035,tessellation:48},scene);disc.parent=node;disc.position.y=.05;const ability=state?.abilities[effect.abilityId];const hue=ability?abilityHue(ability):effect.friendly?125:18;const c=Color3.FromHSV(hue,.72,1);const m=new StandardMaterial(`${effect.id}-mat`,scene);m.diffuseColor=c;m.emissiveColor=c.scale(.45);m.alpha=.24;disc.material=m;const rim=MeshBuilder.CreateTorus(`${effect.id}-rim`,{diameter:effect.radius*2,thickness:.07,tessellation:48},scene);rim.parent=node;rim.position.y=.1;rim.rotation.x=Math.PI/2;rim.material=m;groundEffectNodes.set(effect.id,node);} node.position.set(effect.x,effect.y,effect.z); }
}

function classIcon(id: string) { return ({ warrior: "⚔", hunter: "➶", priest: "✦", mage: "✧", rogue: "◆", druid: "♣", shaman: "ϟ", paladin: "☀" } as Record<string, string>)[id] || "◇"; }
function resourceClass(type: string | null) { return (type || "resource").toLowerCase(); }
function resourceLabel(type: string | null) { return type ? type[0].toUpperCase() + type.slice(1) : "Resource"; }
function classColour(id: string) { const c: Record<string, Color3> = { warrior: new Color3(.55,.38,.28), hunter: new Color3(.35,.55,.2), priest: new Color3(.85,.78,.65), mage: new Color3(.18,.5,.85), rogue: new Color3(.65,.58,.16), druid: new Color3(.72,.3,.08), shaman: new Color3(.12,.32,.8), paladin: new Color3(.9,.38,.6) }; return c[id] || new Color3(.5,.5,.5); }
function abilityGlyph(a: Ability) { const t = a.effects?.[0]?.type || ""; return t.includes("heal") || a.targetType === "ally" ? "✦" : t.includes("damage") ? "✹" : t.includes("shield") ? "⬡" : "◆"; }
function abilityHue(a: Ability) { const school = a.effects?.map(effect => (effect as { school?: string }).school).find(Boolean); return ({ fire: 16, frost: 202, arcane: 278, holy: 48, shadow: 282, nature: 122, physical: 28 } as Record<string, number>)[school || ""] ?? (a.targetType === "ally" ? 142 : 215); }
function attributeText(a: AttributeData) { const amount = a.mode === "mult" ? `${Math.round(Math.abs(a.value - 1) * 100)}%` : a.stat === "critChance" || a.stat === "cooldownReduction" ? `${Math.round(a.value * 100)}%` : String(a.value); return `${a.value < 1 ? "−" : "+"}${amount}`; }
function escapeHtml(text: string) { const div = document.createElement("div"); div.textContent = text; return div.innerHTML; }

function resizeGame() {
  engine.resize();
  camera.radius = window.innerWidth <= 900 && window.innerHeight >= window.innerWidth ? MOBILE_CAMERA_RADIUS : DESKTOP_CAMERA_RADIUS;
}
function updateCastBar() {
  const cast=document.querySelector<HTMLElement>("#castBar")!;
  const me=state?.players[state.you];
  const casting=me?.spectator ? null : me?.casting || null;
  const visual=updateSmoothCastBar({container:cast,fill:cast.querySelector<HTMLElement>("i")!,label:cast.querySelector<HTMLElement>("span")!,casting,snapshotReceivedAt,previousProgress:castBarVisualProgress,previousAbilityId:visualCastAbilityId,abilityName:casting ? state?.abilities[casting.abilityId]?.name || "Wirken":""});
  castBarVisualProgress=visual.progress; visualCastAbilityId=visual.abilityId;
}
engine.runRenderLoop(() => {
  syncPlayers();
  syncGroundEffects();
  updateCastBar();
  const currentState = state;
  if (currentState && currentState.matchState !== "lobby") {
    const me = currentState.players[currentState.you];
    if (me && !me.spectator) {
      const position = interpolatedPlayerPosition(me.id, me.position);
      camera.alpha = CAMERA_ALPHA; camera.beta = CAMERA_BETA;
      camera.target.copyFromFloats(position.x, Math.min(2.2, position.y * 0.28), position.z);
    } else {
      const active = Object.values(currentState.players).filter(player => !player.spectator);
      if (active.length) {
        camera.target.copyFromFloats(active.reduce((sum, player) => sum + player.position.x, 0) / active.length, 1.2, active.reduce((sum, player) => sum + player.position.z, 0) / active.length);
      }
    }
  }
  scene.render();
});
window.addEventListener("resize", resizeGame);
window.addEventListener("orientationchange", resizeGame);
window.visualViewport?.addEventListener("resize", resizeGame);
resizeGame();
