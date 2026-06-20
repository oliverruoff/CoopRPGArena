import { chromium, Page } from "@playwright/test";
import { request } from "http";

async function postAction(action: string, payload: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
    const body = JSON.stringify({ action, payload });
    const req = request({
      hostname: "127.0.0.1",
      port: 8000,
      path: "/debug/action",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve());
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getState(): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: 8000, path: "/debug/state", method: "GET" }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  await postAction("reset_match", {});

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: "/Users/oliverruoff/Documents/develop/CoopRPGArena/media", size: { width: 1280, height: 720 } }
  });
  const page = await context.newPage();

  await page.goto("http://127.0.0.1:5173/");
  await page.getByTestId("player-name-input").evaluate((el: HTMLInputElement) => { el.value = "Aldric"; el.dispatchEvent(new Event("change")); });
  await page.getByTestId("class-mage").evaluate((el: HTMLElement) => el.click());
  await page.getByTestId("ready-button").evaluate((el: HTMLElement) => el.click());
  await page.waitForSelector("[data-testid='wave-counter']", { state: "visible", timeout: 14000 });

  const state0 = await getState();
  const hostId = Object.values<any>(state0.players).find((p: any) => p.classId === "mage")?.id;

  // Add 4 bots with distinct classes and learn some abilities for visual variety
  const bots: { id: string; classId: string }[] = [];
  for (const classId of ["warrior", "hunter", "priest", "mage"]) {
    const res = await new Promise<any>((resolve, reject) => {
      const body = JSON.stringify({ action: "add_bot", payload: { classId } });
      const req = request({ hostname: "127.0.0.1", port: 8000, path: "/debug/action", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => resolve(JSON.parse(data || "{}")));
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });
    bots.push({ id: res.playerId, classId });
  }
  await page.waitForTimeout(1500);

  // Grant XP so everyone can learn spells and become stronger
  const state1 = await getState();
  for (const id of Object.keys(state1.players)) {
    await postAction("give_xp", { playerId: id, amount: 500 });
  }
  await page.waitForTimeout(500);

  // Let bots learn an ability so the action looks varied
  for (const bot of bots) {
    const state = await getState();
    const choices = state.players[bot.id].pendingUpgrades;
    const spell = choices.find((c: any) => c.choiceType === "spell");
    if (spell) await postAction("choose_upgrade", { playerId: bot.id, upgradeId: spell.id });
  }

  // Spawn a manageable group of enemies near the center
  const spawns = [
    { type: "brute", x: 2, z: 2 },
    { type: "brute", x: -3, z: 1 },
    { type: "runner", x: 0, z: 4 },
    { type: "shaman", x: 3, z: -2 },
    { type: "archer", x: -2, z: -3 },
  ];
  for (const s of spawns) {
    await postAction("spawn_enemy", { type: s.type, position: { x: s.x, z: s.z } });
  }

  // Pull camera back and up for a cinematic group view
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const engine = (canvas as any).engine;
    if (!engine) return;
    const scene = engine.scenes?.[0];
    if (!scene) return;
    const cam = scene.activeCamera;
    if (cam) { cam.radius = 38; cam.beta = 0.55; cam.alpha = -Math.PI / 2; }
  });

  const abilityByClass: Record<string, string[]> = {
    warrior: ["1", "2", "3"],
    hunter: ["1", "2", "4"],
    priest: ["1", "3", "4"],
    mage: ["1", "2", "4"]
  };

  for (let round = 0; round < 6; round++) {
    const state2 = await getState();
    for (const player of Object.values<any>(state2.players)) {
      const slots = abilityByClass[player.classId] || ["1"];
      await postAction("cast_ability", { playerId: player.id, slot: Number(slots[round % slots.length]) });
    }
    await page.waitForTimeout(2400);
  }

  await page.waitForTimeout(2500);
  await context.close();
  await browser.close();
  console.log("Video saved to /Users/oliverruoff/Documents/develop/CoopRPGArena/media");
}

main().catch((err) => { console.error(err); process.exit(1); });
