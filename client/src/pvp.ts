import "./pvp.css";
import "./pvp-mobile.css";
import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight,
  Mesh, MeshBuilder, PBRMaterial, Scene, ShadowGenerator, StandardMaterial,
  TransformNode, Vector3,
} from "@babylonjs/core";

type Vec3 = { x: number; y: number; z: number };
type PvPPlayer = {
  id: string; name: string; team: "blue" | "red" | null; classId: string | null; ready: boolean;
  spectator: boolean; disconnected: boolean; build: string[]; stats: Record<string, number>;
  abilities: string[]; abilitySlots: Record<string, number>; position: Vec3; facing: number;
  hp: number; maxHealth: number; resource: number; maxResource: number; resourceType: string | null;
  dead: boolean; targetId: string | null; allyTargetId: string | null; shield: number;
  cooldowns: Record<string, number>; globalCooldown: number; casting: { abilityId: string; remaining: number; duration: number } | null;
  stunned: boolean; slowed: boolean; statsSummary: { damage: number; healing: number; kills: number; deaths: number; revives: number };
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
};

document.title = "Klingenklamm · PvP Arena";
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <canvas id="pvpCanvas" data-testid="pvp-arena"></canvas>
  <div id="pvpLobby" data-testid="pvp-lobby">
    <header class="pvpBrand"><div class="brandMark">⚔</div><div><span>COOP RPG ARENA</span><h1>Klingenklamm</h1><p>Player versus Player · Schergrat-inspirierte Voxel-Arena</p></div><a href="/">Koop-Modus</a></header>
    <main class="lobbyGrid">
      <section class="teamPanel bluePanel"><div class="panelTitle"><span class="teamOrb"></span><h2>Team Blau</h2><b id="blueCount">0/3</b></div><div id="bluePlayers" class="teamPlayers"></div><button class="joinTeam blue" data-team="blue" data-testid="team-blue">Team Blau beitreten</button></section>
      <section class="buildPanel">
        <div class="identityRow"><label>Kämpfername<input id="pvpName" maxlength="18" value="Gladiator" data-testid="pvp-name" /></label><label>Arena<select id="arenaSelect" data-testid="arena-select"><option value="random">Zufällige Arena</option><option value="blade_ridge">Klingenklamm</option></select></label></div>
        <div class="sectionHeading"><span>1</span><div><h2>Klasse wählen</h2><p>Deine Klasse bestimmt Ressourcen und Zauberpool.</p></div></div>
        <div id="classChoices" class="classChoices" data-testid="pvp-class-choices"></div>
        <div class="sectionHeading"><span>2</span><div><h2>Build schmieden</h2><p>Zauber und Attribute kosten jeweils einen Punkt.</p></div><strong><b id="pointsUsed">0</b>/10</strong></div>
        <div class="buildTabs"><button class="active" data-tab="spells">Zauber</button><button data-tab="stats">Attribute</button><button id="resetBuild">Zurücksetzen</button></div>
        <div id="buildChoices" class="buildChoices" data-testid="pvp-build-choices"></div>
        <div class="readyRow"><span id="readyHint">Wähle Team, Klasse und zehn Punkte.</span><button id="pvpReady" data-testid="pvp-ready">Bereit</button></div>
      </section>
      <section class="teamPanel redPanel"><div class="panelTitle"><span class="teamOrb"></span><h2>Team Rot</h2><b id="redCount">0/3</b></div><div id="redPlayers" class="teamPlayers"></div><button class="joinTeam red" data-team="red" data-testid="team-red">Team Rot beitreten</button></section>
    </main>
    <div id="lobbyCountdown" data-testid="pvp-countdown"></div>
  </div>
  <div id="pvpHud" data-testid="pvp-hud" style="min-width:1px;min-height:1px">
    <div id="blueFrames" class="combatTeam blueFrames"></div><div id="redFrames" class="combatTeam redFrames"></div>
    <div id="pvpTarget" class="targetFrame">Kein Ziel</div>
    <div id="prepBanner" class="prepBanner"></div>
    <div id="eventFeed" class="eventFeed"></div>
    <div class="selfHud"><div id="selfName"></div><div class="bar hp"><i id="selfHp"></i><span id="selfHpText"></span></div><div class="bar resource"><i id="selfResource"></i><span id="selfResourceText"></span></div><div id="actionBar" class="actionBar"></div><div id="castBar" class="castBar"><i></i><span></span></div></div>
    <div id="mobileControls" data-testid="pvp-mobile-controls">
      <div class="mobileMovePad" aria-label="Bewegungssteuerung">
        <button data-move="up" aria-label="Vorwärts">▲</button>
        <button data-move="left" aria-label="Links">◀</button>
        <button data-move="down" aria-label="Rückwärts">▼</button>
        <button data-move="right" aria-label="Rechts">▶</button>
      </div>
      <div class="mobileTargetButtons">
        <button data-cycle="enemy" data-testid="pvp-mobile-enemy-target">Gegner</button>
        <button data-cycle="ally" data-testid="pvp-mobile-ally-target">Verbündeter</button>
      </div>
    </div>
  </div>
  <div id="victory" data-testid="pvp-result"><div><span>ARENA BEENDET</span><h1 id="winnerText"></h1><div id="scoreboard"></div><button id="playAgain">Zurück zur PvP-Lobby</button><a href="/">Koop-Modus</a></div></div>
  <div id="connectionStatus">Verbinde mit PvP-Server …</div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#pvpCanvas")!;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
(canvas as HTMLCanvasElement & { scene?: Scene }).scene = scene;
scene.clearColor = new Color4(0.055, 0.045, 0.065, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = 0.008;
scene.fogColor = new Color3(0.12, 0.08, 0.13);
const camera = new ArcRotateCamera("pvp-camera", -Math.PI / 2, 0.92, 54, new Vector3(0, 2, 0), scene);
camera.lowerRadiusLimit = 35; camera.upperRadiusLimit = 65; camera.lowerBetaLimit = 0.6; camera.upperBetaLimit = 1.25;
camera.attachControl(canvas, true);
new HemisphericLight("sky", new Vector3(0, 1, 0), scene).intensity = 0.72;
const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.4), scene); sun.position = new Vector3(20, 35, -15); sun.intensity = 1.25;
const shadows = new ShadowGenerator(1024, sun); shadows.useBlurExponentialShadowMap = true; shadows.blurKernel = 18;

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
  const slope = Math.atan2(5, 8);
  const endRamps: Array<[number, number]> = [[-22, -slope], [22, slope]];
  for (const [x, rotation] of endRamps) {
    const ramp = MeshBuilder.CreateBox(`end-ramp-${x}`, { width: Math.sqrt(89), depth: 8, height: 0.5 }, scene); ramp.position.set(x, 2.35, 0); ramp.rotation.z = rotation; ramp.material = bridgeMat; ramp.receiveShadows = true;
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
  for (let i = 0; i < 55; i++) {
    const angle = i / 55 * Math.PI * 2; const radius = 32 + (i % 5) * 1.2;
    const rock = MeshBuilder.CreatePolyhedron(`rim-rock-${i}`, { type: i % 2, size: 2.6 + (i % 4) }, scene);
    rock.position.set(Math.cos(angle) * radius, 0.7 + (i % 3), Math.sin(angle) * radius * 0.62); rock.scaling.y = 1.7; rock.rotation.y = angle; rock.material = rockMat;
  }
  for (const x of [-27, 27]) for (const z of [-11, 11]) {
    const brazier = MeshBuilder.CreateCylinder(`brazier-${x}-${z}`, { diameter: 1.2, height: 2.4, tessellation: 6 }, scene); brazier.position.set(x, 1.2, z); brazier.material = metalMat;
    const flameMat = new StandardMaterial(`flame-${x}-${z}`, scene); flameMat.diffuseColor = new Color3(1, 0.25, 0.03); flameMat.emissiveColor = new Color3(1, 0.16, 0.01);
    const flame = MeshBuilder.CreateSphere(`fire-${x}-${z}`, { diameter: 1.05, segments: 6 }, scene); flame.position.set(x, 2.75, z); flame.scaling.y = 1.45; flame.material = flameMat;
  }
}
buildArena();

let state: PvPState | null = null;
let ws: WebSocket;
let activeTab: "spells" | "stats" = "spells";
let lobbySignature = "";
let actionBarSignature = "";
let lastEventId = 0;
const playerNodes = new Map<string, TransformNode>();

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
    state = JSON.parse(event.data) as PvPState;
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
  syncPlayers();
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
  const frame = (p: PvPPlayer) => `<button data-player-id="${p.id}" class="combatFrame ${p.dead ? "dead" : ""} ${p.id === me.targetId || p.id === me.allyTargetId ? "targeted" : ""}"><div><b>${escapeHtml(p.name)}</b><small>${p.classId ? state!.classes[p.classId]?.name : ""}</small></div><span>${Math.ceil(p.hp)} / ${Math.ceil(p.maxHealth)}</span><i style="width:${p.hp / Math.max(1, p.maxHealth) * 100}%"></i></button>`;
  const blue = Object.values(state.players).filter(p => p.team === "blue" && !p.spectator), red = Object.values(state.players).filter(p => p.team === "red" && !p.spectator);
  document.querySelector("#blueFrames")!.innerHTML = blue.map(frame).join(""); document.querySelector("#redFrames")!.innerHTML = red.map(frame).join("");
  document.querySelectorAll<HTMLButtonElement>(".combatFrame").forEach(button => button.onclick = () => send({ type: "select_target", targetId: button.dataset.playerId }));
  const target = state.players[me.targetId || me.allyTargetId || ""];
  document.querySelector("#pvpTarget")!.innerHTML = target ? `<b>${escapeHtml(target.name)}</b><span>${target.dead ? "TOT · wiederbelebbar" : `${Math.ceil(target.hp)} / ${Math.ceil(target.maxHealth)}`}</span>` : "Kein Ziel";
  document.querySelector("#prepBanner")!.textContent = state.preparation > 0 ? `Tore öffnen in ${Math.ceil(state.preparation)}` : "";
  scene.getMeshByName("gate--1")?.setEnabled(state.preparation > 0);
  scene.getMeshByName("gate-1")?.setEnabled(state.preparation > 0);
  document.querySelector("#selfName")!.innerHTML = `<b>${escapeHtml(me.name)}</b><span>${state.classes[me.classId || ""]?.name || ""}</span>`;
  (document.querySelector("#selfHp") as HTMLElement).style.width = `${me.hp / Math.max(1, me.maxHealth) * 100}%`; document.querySelector("#selfHpText")!.textContent = `${Math.ceil(me.hp)} HP${me.shield ? ` + ${Math.ceil(me.shield)}` : ""}`;
  (document.querySelector("#selfResource") as HTMLElement).style.width = `${me.resource / Math.max(1, me.maxResource) * 100}%`; document.querySelector("#selfResourceText")!.textContent = `${Math.ceil(me.resource)} ${me.resourceType || ""}`;
  const slots = Array.from({ length: 10 }, (_, i) => i + 1);
  const slotAbilities = slots.map(slot => Object.entries(me.abilitySlots).find(([, assigned]) => assigned === slot)?.[0] || "");
  const nextActionBarSignature = slotAbilities.join("|");
  if (nextActionBarSignature !== actionBarSignature) {
    actionBarSignature = nextActionBarSignature;
    document.querySelector("#actionBar")!.innerHTML = slots.map((slot, index) => {
      const abilityId = slotAbilities[index]; const a = abilityId ? state!.abilities[abilityId] : null;
      return `<button data-slot="${slot}" data-ability-id="${abilityId}" ${a ? "" : "disabled"}><kbd>${slot === 10 ? 0 : slot}</kbd><b>${a?.name || ""}</b><i hidden></i></button>`;
    }).join("");
    document.querySelectorAll<HTMLButtonElement>("#actionBar button[data-slot]").forEach(button => button.onclick = () => castSlot(Number(button.dataset.slot)));
  }
  document.querySelectorAll<HTMLButtonElement>("#actionBar button[data-ability-id]").forEach(button => {
    const cooldown = me.cooldowns[button.dataset.abilityId || ""] || 0;
    const overlay = button.querySelector<HTMLElement>("i")!;
    overlay.hidden = cooldown <= 0;
    overlay.textContent = cooldown > 0 ? cooldown.toFixed(1) : "";
  });
  const cast = document.querySelector<HTMLElement>("#castBar")!; cast.classList.toggle("visible", Boolean(me.casting));
  if (me.casting) { const progress = 1 - me.casting.remaining / Math.max(0.01, me.casting.duration); (cast.querySelector("i") as HTMLElement).style.width = `${progress * 100}%`; cast.querySelector("span")!.textContent = state.abilities[me.casting.abilityId]?.name || "Wirken"; }
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
    if (p.spectator) continue; let node = playerNodes.get(p.id); if (!node) { node = createPlayer(p); playerNodes.set(p.id, node); }
    const target = new Vector3(p.position.x, p.position.y, p.position.z); node.position = Vector3.Lerp(node.position, target, 0.32); node.rotation.y = p.facing; node.scaling.y = p.dead ? 0.28 : 1; node.setEnabled(true);
    const ring = node.getChildMeshes().find(m => m.name.endsWith("-ring")); if (ring) ring.isVisible = p.id === state.players[state.you]?.targetId || p.id === state.players[state.you]?.allyTargetId;
  }
}

function createPlayer(p: PvPPlayer) {
  const root = new TransformNode(`player-${p.id}`, scene); const teamColor = p.team === "blue" ? new Color3(0.08, 0.38, 1) : new Color3(0.95, 0.08, 0.05); const classColor = classColour(p.classId || "");
  const body = MeshBuilder.CreateBox(`${p.id}-body`, { width: 0.85, height: 1.35, depth: 0.55 }, scene); body.position.y = 1.05; body.parent = root; body.material = material(`${p.id}-class`, classColor); body.metadata = { playerId: p.id }; shadows.addShadowCaster(body);
  const head = MeshBuilder.CreateBox(`${p.id}-head`, { size: 0.62 }, scene); head.position.y = 2.02; head.parent = root; head.material = material(`${p.id}-skin`, new Color3(0.65, 0.45, 0.3)); head.metadata = { playerId: p.id }; shadows.addShadowCaster(head);
  const shoulders = MeshBuilder.CreateBox(`${p.id}-shoulders`, { width: 1.25, height: 0.28, depth: 0.72 }, scene); shoulders.position.y = 1.58; shoulders.parent = root; shoulders.material = material(`${p.id}-team`, teamColor, 0.4); shoulders.metadata = { playerId: p.id };
  const ringMat = new StandardMaterial(`${p.id}-ring-mat`, scene); ringMat.emissiveColor = teamColor; ringMat.diffuseColor = teamColor;
  const ring = MeshBuilder.CreateTorus(`${p.id}-ring`, { diameter: 1.65, thickness: 0.08, tessellation: 32 }, scene); ring.parent = root; ring.position.y = 0.06; ring.material = ringMat; ring.isVisible = false;
  return root;
}

scene.onPointerDown = (_, info) => { const id = (info?.pickedMesh as Mesh | undefined)?.metadata?.playerId as string | undefined; if (id) send({ type: "select_target", targetId: id }); };
const movement: Record<string, boolean> = {};
const keyMap: Record<string, string> = { KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };
window.addEventListener("keydown", event => {
  if (!state || state.matchState !== "running" || (event.target as HTMLElement).matches("input,select")) return;
  if (keyMap[event.code] && !movement[keyMap[event.code]]) { movement[keyMap[event.code]] = true; send({ type: "input", movement }); }
  if (event.code === "Tab") { event.preventDefault(); send({ type: "cycle_target", ally: event.shiftKey }); }
  if (/^Digit[0-9]$/.test(event.code)) { const n = Number(event.code.slice(5)); castSlot(n === 0 ? 10 : n); }
});
window.addEventListener("keyup", event => { if (keyMap[event.code]) { movement[keyMap[event.code]] = false; send({ type: "input", movement }); } });
document.querySelectorAll<HTMLButtonElement>("#mobileControls [data-move]").forEach(button => {
  const direction = button.dataset.move!;
  const update = (active: boolean) => {
    movement[direction] = active;
    button.classList.toggle("pressed", active);
    send({ type: "input", movement });
  };
  button.addEventListener("pointerdown", event => { event.preventDefault(); button.setPointerCapture(event.pointerId); update(true); });
  button.addEventListener("pointerup", () => update(false));
  button.addEventListener("pointercancel", () => update(false));
  button.addEventListener("lostpointercapture", () => { if (movement[direction]) update(false); });
});
document.querySelector<HTMLButtonElement>("[data-cycle=enemy]")!.addEventListener("click", () => send({ type: "cycle_target", ally: false }));
document.querySelector<HTMLButtonElement>("[data-cycle=ally]")!.addEventListener("click", () => send({ type: "cycle_target", ally: true }));
function castSlot(slot: number) { const me = state?.players[state.you]; const target = me ? state?.players[me.targetId || ""] : null; send({ type: "cast_ability", abilitySlot: slot, groundPosition: target?.position || me?.position }); }

function renderEvents() {
  if (!state) return; const events = state.events.filter(e => Number(e.id) > lastEventId); if (!events.length) return; lastEventId = Math.max(lastEventId, ...events.map(e => Number(e.id)));
  const feed = document.querySelector("#eventFeed")!;
  for (const event of events.slice(-4)) {
    const line = document.createElement("div"); const source = state.players[String(event.sourceId || "")]; const target = state.players[String(event.targetId || "")];
    line.textContent = event.type === "damage" ? `${source?.name || "?"} → ${target?.name || "?"}: ${event.amount}` : event.type === "heal" ? `${source?.name || "?"} heilt ${target?.name || "?"}: ${event.amount}` : event.type === "revive" ? `${source?.name || "?"} belebt ${target?.name || "?"} wieder` : event.type === "death" ? `${target?.name || "?"} fällt` : "";
    if (line.textContent) { feed.appendChild(line); setTimeout(() => line.remove(), 4000); }
  }
}

function classIcon(id: string) { return ({ warrior: "⚔", hunter: "➶", priest: "✦", mage: "✧", rogue: "◆", druid: "♣", shaman: "ϟ", paladin: "☀" } as Record<string, string>)[id] || "◇"; }
function classColour(id: string) { const c: Record<string, Color3> = { warrior: new Color3(.55,.38,.28), hunter: new Color3(.35,.55,.2), priest: new Color3(.85,.78,.65), mage: new Color3(.18,.5,.85), rogue: new Color3(.65,.58,.16), druid: new Color3(.72,.3,.08), shaman: new Color3(.12,.32,.8), paladin: new Color3(.9,.38,.6) }; return c[id] || new Color3(.5,.5,.5); }
function abilityGlyph(a: Ability) { const t = a.effects?.[0]?.type || ""; return t.includes("heal") || a.targetType === "ally" ? "✦" : t.includes("damage") ? "✹" : t.includes("shield") ? "⬡" : "◆"; }
function attributeText(a: AttributeData) { const amount = a.mode === "mult" ? `${Math.round(Math.abs(a.value - 1) * 100)}%` : a.stat === "critChance" || a.stat === "cooldownReduction" ? `${Math.round(a.value * 100)}%` : String(a.value); return `${a.value < 1 ? "−" : "+"}${amount}`; }
function escapeHtml(text: string) { const div = document.createElement("div"); div.textContent = text; return div.innerHTML; }

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
