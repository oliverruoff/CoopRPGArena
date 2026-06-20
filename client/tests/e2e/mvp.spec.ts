import { expect, test } from "@playwright/test";

async function startMage(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("lobby")).toBeVisible();
  await page.getByTestId("class-mage").click();
  await expect(page.getByTestId("class-preview-info")).toContainText("Mage");
  await expect(page.getByTestId("class-preview-info")).toContainText("Fireball burns");
  await page.getByTestId("ready-button").click();
  await expect(page.getByTestId("wave-counter")).toContainText("Wave 1", { timeout: 7000 });
}

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "reset_match", payload: {} } });
});

test("single player can start, move, target, level, and win", async ({ page, request }) => {
  await startMage(page);
  await expect(page.getByTestId("hp-label")).toContainText("HP");
  await expect(page.getByTestId("resource-label")).toContainText("Mana");
  await expect(page.getByTestId("xp-label")).toContainText("EXP");
  await expect(page.getByTestId("stats-panel")).toContainText("Spell Power");
  const before = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" })));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" })));
  const afterMove = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const playerId = afterMove.you ?? Object.keys(afterMove.players)[0];
  expect(afterMove.players[playerId].position.z).toBeGreaterThan(before.players[playerId].position.z);

  const spawn = await (await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "spawn_enemy", payload: { type: "brute", position: { x: 2, z: 2 } } } })).json();
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "set_enemy_target", payload: { playerId, targetId: spawn.enemyId } } });
  await expect(page.getByTestId("target-frame")).toContainText("Brute");
  await page.getByTestId("ability-slot-1").hover();
  await expect(page.getByTestId("ability-tooltip")).toContainText("Cost:");
  await expect(page.getByTestId("ability-tooltip")).toContainText("burns");
  await page.getByTestId("ability-slot-1").click();
  await expect(page.getByTestId("cast-bar")).toBeVisible();
  await page.waitForTimeout(1650);
  await expect(page.getByTestId("floating-damage").first()).toBeVisible();
  await expect(page.getByTestId("enemy-hp-bar").first()).toBeVisible();
  const damaged = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(damaged.enemies[spawn.enemyId].hp).toBeLessThan(damaged.enemies[spawn.enemyId].maxHealth);

  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "give_xp", payload: { playerId, amount: 120 } } });
  await expect(page.getByTestId("level-up-panel")).toBeVisible();
  const beforeUpgrade = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  await page.getByTestId("level-up-panel").getByRole("button").first().click();
  await expect(page.getByTestId("level-up-panel")).toBeHidden();
  const afterUpgrade = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(afterUpgrade.players[playerId].stats.maxHealth).toBeGreaterThan(beforeUpgrade.players[playerId].stats.maxHealth);

  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "force_wave_start", payload: { waveNumber: 10 } } });
  const bossState = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const bossId = Object.keys(bossState.enemies)[0];
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "kill_enemy", payload: { enemyId: bossId } } });
  await expect(page.getByTestId("end-screen")).toContainText("Victory");
});

test("priest can heal ally and create threat", async ({ browser, request }) => {
  const priest = await browser.newPage();
  const warrior = await browser.newPage();
  await priest.goto("/");
  await warrior.goto("/");
  await priest.getByTestId("class-priest").click();
  await warrior.getByTestId("class-warrior").click();
  await priest.getByTestId("ready-button").click();
  await warrior.getByTestId("ready-button").click();
  await expect(priest.getByTestId("wave-counter")).toContainText("Wave 1", { timeout: 7000 });
  const state = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const priestId = Object.values<any>(state.players).find((p) => p.classId === "priest").id;
  const warriorId = Object.values<any>(state.players).find((p) => p.classId === "warrior").id;
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "spawn_enemy", payload: { type: "goblin", position: { x: 3, z: 0 } } } });
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "set_player_hp", payload: { playerId: warriorId, hp: 40 } } });
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "set_ally_target", payload: { playerId: priestId, targetId: warriorId } } });
  await priest.getByTestId("ability-slot-1").click();
  await expect(priest.getByTestId("cast-bar")).toBeVisible();
  await priest.waitForTimeout(1650);
  await expect(priest.getByTestId("floating-heal").first()).toBeVisible();
  const after = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(after.players[warriorId].hp).toBeGreaterThan(40);
  const enemy: any = Object.values(after.enemies)[0];
  expect(enemy.threat[priestId]).toBeGreaterThan(0);
  await priest.close();
  await warrior.close();
});

test("all players dead triggers defeat", async ({ page, request }) => {
  await startMage(page);
  const state = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  const playerId = Object.keys(state.players)[0];
  await request.post("http://127.0.0.1:8000/debug/action", { data: { action: "kill_player", payload: { playerId } } });
  await expect(page.getByTestId("end-screen")).toContainText("Defeat");
  await page.getByTestId("restart-button").click();
  await expect(page.getByTestId("lobby")).toBeVisible();
  await expect(page.getByTestId("class-mage")).toBeVisible();
  const restarted = await (await request.get("http://127.0.0.1:8000/debug/state")).json();
  expect(restarted.matchState).toBe("lobby");
  expect(restarted.players[playerId].classId).toBeNull();
});
