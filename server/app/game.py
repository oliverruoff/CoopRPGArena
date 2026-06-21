from __future__ import annotations

import asyncio
import json
import math
import random
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).parent / "game_data"
ACTIVE_WAVE_SECONDS = 75
BREAK_SECONDS = 20


def load_json(name: str) -> Any:
    return json.loads((DATA_DIR / name).read_text())


@dataclass
class Player:
    id: str
    name: str
    class_id: str | None = None
    ready: bool = False
    x: float = 0
    z: float = 0
    hp: float = 1
    resource: float = 0
    level: int = 1
    xp: int = 0
    dead: bool = False
    target_id: str | None = None
    ally_target_id: str | None = None
    input: dict[str, bool] = field(default_factory=dict)
    cooldowns: dict[str, float] = field(default_factory=dict)
    global_cooldown_until: float = 0
    auto_attack_at: float = 0
    jump_until: float = 0
    stats: dict[str, float] = field(default_factory=dict)
    abilities: list[str] = field(default_factory=list)
    ability_slots: dict[str, int] = field(default_factory=dict)
    pending_upgrades: list[dict[str, Any]] = field(default_factory=list)
    upgrade_locked: bool = False
    casting: dict[str, Any] | None = None
    facing: float = 0
    shield: float = 0
    shield_until: float = 0
    hots: list[dict[str, Any]] = field(default_factory=list)
    auras: list[dict[str, Any]] = field(default_factory=list)
    auto_attack_haste_until: float = 0
    auto_attack_haste_multiplier: float = 1


@dataclass
class Enemy:
    id: str
    type: str
    name: str
    x: float
    z: float
    hp: float
    max_health: float
    damage: float
    attack_interval: float
    attack_range: float
    move_speed: float
    armor: float
    resistance: float
    xp: int
    target_id: str | None = None
    attack_at: float = 0
    threat: dict[str, float] = field(default_factory=dict)
    boss: bool = False
    slow_until: float = 0
    slow_percent: float = 0
    stun_until: float = 0
    dots: list[dict[str, Any]] = field(default_factory=list)
    alerted: bool = False
    facing: float = 0
    wander_until: float = 0
    wander_x: float = 0
    wander_z: float = 0


class Game:
    def __init__(self) -> None:
        self.constants = load_json("constants.json")
        self.classes = load_json("classes.json")
        self.abilities = load_json("abilities.json")
        self.enemies_data = load_json("enemies.json")
        self.waves_data = load_json("waves.json")
        self.bosses = load_json("bosses.json")
        self.upgrades = load_json("upgrades.json")
        self.players: dict[str, Player] = {}
        self.enemies: dict[str, Enemy] = {}
        self.match_state = "lobby"
        self.wave = {"number": 0, "state": "lobby", "aliveEnemies": 0}
        self.countdown_until: float | None = None
        self.events: list[dict[str, Any]] = []
        self.map_objects: list[dict[str, Any]] = []
        self.ground_effects: list[dict[str, Any]] = []
        self._map_revision = 0
        self._event_seq = 0
        self._ground_effect_seq = 0
        self._player_seq = 0
        self._enemy_seq = 0
        self._last_tick = time.monotonic()
        self._lock = asyncio.Lock()

    async def reset(self) -> None:
        async with self._lock:
            self.players.clear()
            self.enemies.clear()
            self.match_state = "lobby"
            self.wave = {"number": 0, "state": "lobby", "aliveEnemies": 0}
            self.countdown_until = None
            self.events.clear()
            self.ground_effects.clear()
            self._map_revision = 0
            self._player_seq = 0
            self._enemy_seq = 0
            self._event_seq = 0
            self._ground_effect_seq = 0

    def add_player_locked(self) -> Player:
        if len(self.players) >= 5:
            raise ValueError("Lobby is full")
        self._player_seq += 1
        player = Player(id=f"player_{self._player_seq}", name=f"Player {self._player_seq}")
        self.players[player.id] = player
        if self.match_state == "lobby":
            self._update_countdown_locked()
        return player

    async def add_player(self) -> Player:
        async with self._lock:
            return self.add_player_locked()

    async def remove_player(self, player_id: str) -> None:
        async with self._lock:
            self.players.pop(player_id, None)
            if self.match_state == "lobby" and self.countdown_until and not self._all_ready_locked():
                self.countdown_until = None

    async def handle_message(self, player_id: str, msg: dict[str, Any]) -> None:
        async with self._lock:
            player = self.players.get(player_id)
            if not player:
                return
            typ = msg.get("type")
            if typ == "set_name" and self.match_state == "lobby":
                name = str(msg.get("name", "")).strip()
                if name:
                    player.name = name[:18]
            elif typ == "select_class" and self.match_state == "lobby":
                class_id = msg.get("classId")
                if class_id in self.classes:
                    player.class_id = class_id
                    player.ready = False
                    self._update_countdown_locked()
            elif typ == "ready" and self.match_state == "lobby":
                player.ready = bool(msg.get("ready")) and player.class_id is not None
                self._update_countdown_locked()
            elif typ == "input":
                movement = msg.get("movement", {})
                if player.casting and any(movement.values()):
                    self._cancel_cast_gcd_locked(player)
                    self._emit_locked({"type": "cast_cancelled", "sourceId": player.id, "abilityId": player.casting.get("abilityId")})
                    player.casting = None
                player.input = msg.get("movement", {}) if not player.dead else {}
            elif typ == "jump" and self.match_state == "running" and not player.dead:
                player.jump_until = time.monotonic() + 0.36
            elif typ == "select_target":
                target_id = msg.get("targetId")
                if target_id in self.enemies:
                    player.target_id = target_id
                    player.ally_target_id = None
                if target_id in self.players:
                    player.ally_target_id = target_id
                    player.target_id = None
            elif typ == "cycle_target":
                self._cycle_target_locked(player, bool(msg.get("ally")))
            elif typ == "cast_ability":
                self._cast_ability_locked(player, int(msg.get("abilitySlot", 1)))
            elif typ == "choose_upgrade":
                self._choose_upgrade_locked(player, msg.get("upgradeId"))
            elif typ == "restart_match" and self.match_state in {"defeat", "victory"}:
                self._restart_to_lobby_locked()

    def _restart_to_lobby_locked(self) -> None:
        self.enemies.clear()
        self.match_state = "lobby"
        self.wave = {"number": 0, "state": "lobby", "aliveEnemies": 0}
        self.countdown_until = None
        self.events.clear()
        self.ground_effects.clear()
        for player in self.players.values():
            player.class_id = None
            player.ready = False
            player.x = 0
            player.z = 0
            player.hp = 1
            player.resource = 0
            player.level = 1
            player.xp = 0
            player.dead = False
            player.target_id = None
            player.ally_target_id = None
            player.input = {}
            player.cooldowns = {}
            player.ability_slots = {}
            player.global_cooldown_until = 0
            player.auto_attack_at = 0
            player.jump_until = 0
            player.stats = {}
            player.abilities = []
            player.pending_upgrades = []
            player.upgrade_locked = False
            player.casting = None
            player.shield = 0
            player.shield_until = 0
            player.hots = []
            player.auras = []
            player.auto_attack_haste_until = 0
            player.auto_attack_haste_multiplier = 1

    def _all_ready_locked(self) -> bool:
        return bool(self.players) and all(p.ready and p.class_id in self.classes for p in self.players.values())

    def _update_countdown_locked(self) -> None:
        if self._all_ready_locked():
            self.countdown_until = time.monotonic() + 3
        else:
            self.countdown_until = None

    def _generate_map_locked(self) -> None:
        self.map_objects = []
        self._map_revision += 1
        arena = self.constants["arenaRadius"] - 2.2
        used: list[tuple[float, float, float]] = []
        seq = 0

        def add(type_name: str, x: float, z: float, **extra: Any) -> dict[str, Any]:
            nonlocal seq
            seq += 1
            obj: dict[str, Any] = {"id": f"{type_name}_{seq}", "type": type_name, "x": x, "z": z, "blocksMovement": True, "blocksSight": False, **extra}
            self.map_objects.append(obj)
            return obj

        def overlaps(x: float, z: float, radius: float) -> bool:
            for ux, uz, ur in used:
                if math.hypot(x - ux, z - uz) < radius + ur + 1.1:
                    return True
            return False

        def place_spot(min_r: float, max_r: float, radius: float, attempts: int = 30) -> tuple[float, float] | None:
            for _ in range(attempts):
                angle = random.random() * math.tau
                dist = random.uniform(min_r, max_r)
                x = math.cos(angle) * dist
                z = math.sin(angle) * dist
                if not overlaps(x, z, radius):
                    used.append((x, z, radius))
                    return x, z
            return None

        def add_cluster(type_name: str, count: int, min_r: float, max_r: float, radius: float, variant: int | None = None) -> None:
            for _ in range(count):
                spot = place_spot(min_r, max_r, radius)
                if not spot:
                    continue
                extra: dict[str, Any] = {"radius": radius}
                if variant is not None:
                    extra["variant"] = variant
                add(type_name, spot[0], spot[1], **extra)

        # Walls (stone hedges)
        wall_count = random.randint(2, 4)
        for _ in range(wall_count):
            spot = place_spot(4.5, arena - 2.0, max(2.5, 3.5))
            if not spot:
                continue
            width = round(random.uniform(4.0, 9.0), 2)
            depth = round(random.uniform(2.5, 2.8), 2)
            if random.random() > 0.5:
                width, depth = depth, width
            angle = random.random() * math.pi
            add("wall", spot[0], spot[1], width=width, depth=depth, radius=max(width, depth) * 0.7, blocksSight=True)

        # Trees with variants
        tree_count = random.randint(12, 18)
        for _ in range(tree_count):
            spot = place_spot(2.5, arena, 1.0)
            if not spot:
                continue
            add("tree", spot[0], spot[1], radius=round(random.uniform(0.85, 1.45), 2), variant=random.randint(0, 4))

        # Bushes
        bush_count = random.randint(8, 14)
        for _ in range(bush_count):
            spot = place_spot(2.0, arena, 0.75)
            if not spot:
                continue
            add("bush", spot[0], spot[1], radius=round(random.uniform(0.55, 1.05), 2), variant=random.randint(0, 2))

        # Rocks
        rock_count = random.randint(4, 8)
        for _ in range(rock_count):
            spot = place_spot(2.0, arena, 0.8)
            if not spot:
                continue
            add("rock", spot[0], spot[1], radius=round(random.uniform(0.55, 1.05), 2), variant=random.randint(0, 2))

        # Ruins (fewer, more sparse)
        ruin_count = random.randint(2, 4)
        for _ in range(ruin_count):
            spot = place_spot(3.0, arena - 1.0, 1.6)
            if not spot:
                continue
            add("ruin", spot[0], spot[1], radius=round(random.uniform(1.3, 2.0), 2), variant=random.randint(0, 2))

    def _start_match_locked(self) -> None:
        if any(player.ready for player in self.players.values()) and not self._all_ready_locked():
            self.countdown_until = None
            return
        if not self.players:
            self.countdown_until = None
            return
        if any(player.class_id not in self.classes for player in self.players.values()):
            self.countdown_until = None
            return
        self.match_state = "running"
        self.countdown_until = None
        self._generate_map_locked()
        radius = self.constants["playerSpawnRadius"]
        for index, player in enumerate(self.players.values()):
            angle = index * math.tau / max(1, len(self.players))
            player.x = math.cos(angle) * radius
            player.z = math.sin(angle) * radius
            data = self.classes[player.class_id]
            player.stats = dict(data["baseStats"])
            player.abilities = list(data["startingAbilities"])
            player.ability_slots = {ability_id: self.abilities[ability_id]["slot"] for ability_id in player.abilities}
            player.hp = player.stats["maxHealth"]
            player.resource = data["startingResource"]
            player.level = 1
            player.xp = 0
            player.dead = False
            player.shield = 0
            player.shield_until = 0
            player.hots = []
            player.auras = []
            player.auto_attack_haste_until = 0
            player.auto_attack_haste_multiplier = 1
            player.auto_attack_at = time.monotonic() + player.stats["autoAttackInterval"]
        self._start_wave_locked(1)

    def _start_wave_locked(self, number: int) -> None:
        now = time.monotonic()
        self.wave = {"number": number, "state": "active", "aliveEnemies": len(self.enemies), "nextWaveAt": now + ACTIVE_WAVE_SECONDS if number < 10 else None}
        for player in self.players.values():
            if player.dead:
                player.dead = False
                player.hp = player.stats.get("maxHealth", 100) * 0.6
        if number >= 10:
            self.spawn_enemy_locked("arena_overlord")
        else:
            wave = self.waves_data[number - 1]
            scale = max(1, len(self.players))
            for typ, count in wave["composition"].items():
                for _ in range(max(1, math.ceil(count * (0.45 + 0.18 * scale)))):
                    self.spawn_enemy_locked(typ)
        self.wave["aliveEnemies"] = len(self.enemies)
        # Initial spawn should avoid map objects; later waves preserve player positions.
        if number == 1:
            for player in self.players.values():
                if not player.dead:
                    self._push_out_of_map_objects_locked(player)
        for enemy in self.enemies.values():
            self._push_out_of_map_objects_locked(enemy)
            self._choose_wander_target_locked(enemy)

    def spawn_enemy_locked(self, typ: str, position: dict[str, float] | None = None) -> Enemy:
        self._enemy_seq += 1
        if typ == "boss" or typ == "arena_overlord":
            data = self.bosses["arena_overlord"]
            boss = True
        else:
            data = self.enemies_data[typ]
            boss = False
        angle = random.random() * math.tau
        radius = self.constants["enemySpawnRadius"]
        x = position.get("x", math.cos(angle) * radius) if position else math.cos(angle) * radius
        z = position.get("z", math.sin(angle) * radius) if position else math.sin(angle) * radius
        wave_number = max(1, self.wave["number"] or 1)
        health_multiplier = 1 + (wave_number - 1) * 0.12
        enemy = Enemy(
            id=f"enemy_{self._enemy_seq}", type=data["id"], name=data.get("name", data["id"].title()), x=x, z=z,
            hp=round(data["maxHealth"] * health_multiplier, 1), max_health=round(data["maxHealth"] * health_multiplier, 1),
            damage=data["damage"] * (1 + (wave_number - 1) * 0.08), attack_interval=data["attackInterval"],
            attack_range=data["attackRange"], move_speed=data["moveSpeed"], armor=data["armor"],
            resistance=data["resistance"], xp=int(data["xp"] * (1 + (wave_number - 1) * 0.05)), boss=boss,
            facing=random.random() * math.tau,
        )
        self._choose_wander_target_locked(enemy)
        self.enemies[enemy.id] = enemy
        self.wave["aliveEnemies"] = len(self.enemies)
        return enemy

    async def tick(self) -> None:
        async with self._lock:
            now = time.monotonic()
            dt = min(0.1, now - self._last_tick)
            self._last_tick = now
            if self.match_state == "lobby" and self.countdown_until and now >= self.countdown_until:
                if self._all_ready_locked():
                    self._start_match_locked()
                else:
                    self.countdown_until = None
            if self.match_state != "running":
                return
            self._tick_players_locked(now, dt)
            self._tick_ground_effects_locked(now)
            self._tick_enemies_locked(now, dt)
            self._check_end_states_locked()
            if self.match_state == "running" and self.wave.get("nextWaveAt") is not None and now >= self.wave.get("nextWaveAt", now):
                if self.wave.get("state") == "break":
                    self._start_wave_locked(min(10, self.wave["number"] + 1))
                elif self.wave.get("state") == "active" and self.wave["number"] < 10:
                    self._start_wave_locked(self.wave["number"] + 1)

    def _tick_players_locked(self, now: float, dt: float) -> None:
        for player in self.players.values():
            if player.dead:
                continue
            self._tick_hots_locked(player, now)
            self._tick_player_auras_locked(player, now)
            if player.shield_until and now >= player.shield_until:
                player.shield = 0
                player.shield_until = 0
            regen = player.stats.get("resourceRegen", 0) * dt
            player.resource = min(player.stats.get("maxResource", 100), player.resource + regen)
            dx = (1 if player.input.get("right") else 0) - (1 if player.input.get("left") else 0)
            dz = (1 if player.input.get("up") else 0) - (1 if player.input.get("down") else 0)
            length = math.hypot(dx, dz) or 1
            player.x += dx / length * player.stats.get("moveSpeed", 5) * dt
            player.z += dz / length * player.stats.get("moveSpeed", 5) * dt
            self._push_out_of_map_objects_locked(player)
            arena = self.constants["arenaRadius"] - 1
            dist = math.hypot(player.x, player.z)
            if dist > arena:
                player.x *= arena / dist
                player.z *= arena / dist
            if now >= player.auto_attack_at and player.target_id in self.enemies:
                enemy = self.enemies[player.target_id]
                auto_range = player.stats["autoAttackRange"] if player.class_id in {"warrior", "hunter"} else 2.0
                if self._distance(player, enemy) <= auto_range and not self._line_of_sight_blocked_locked(player.x, player.z, enemy.x, enemy.z):
                    dx = enemy.x - player.x
                    dz = enemy.z - player.z
                    player.facing = math.atan2(dx, dz)
                    raw = player.stats["autoAttackDamage"] + max(player.stats.get("attackPower", 0) * 0.35, player.stats.get("spellPower", 0) * 0.2)
                    self._emit_locked({"type": "auto_attack", "sourceId": player.id, "targetId": enemy.id})
                    self._damage_enemy_locked(player, enemy, raw, "physical", 1)
                    interval = player.stats["autoAttackInterval"] / (player.auto_attack_haste_multiplier if now < player.auto_attack_haste_until else 1)
                    player.auto_attack_at = now + interval
            if player.casting and now >= player.casting["endAt"]:
                casting = player.casting
                player.casting = None
                target = self.enemies.get(casting.get("targetId") or "") if casting else None
                if target:
                    dx = target.x - player.x
                    dz = target.z - player.z
                    player.facing = math.atan2(dx, dz)
                self._finish_cast_locked(player, casting["abilityId"], casting.get("targetId"), started_cast=True)

    def _tick_enemies_locked(self, now: float, dt: float) -> None:
        for enemy in list(self.enemies.values()):
            self._tick_dots_locked(enemy, now)
            if now < enemy.stun_until:
                continue
            target = self._enemy_target_locked(enemy, now)
            if not target:
                self._wander_enemy_locked(enemy, now, dt)
                continue
            enemy.target_id = target.id
            dist = self._distance(enemy, target)
            if dist > enemy.attack_range:
                speed = enemy.move_speed * (1 - enemy.slow_percent if now < enemy.slow_until else 1)
                dx = (target.x - enemy.x) / dist
                dz = (target.z - enemy.z) / dist
                enemy.facing = math.atan2(dx, dz)
                enemy.x += dx * speed * dt
                enemy.z += dz * speed * dt
                self._push_out_of_map_objects_locked(enemy)
            elif now >= enemy.attack_at:
                damage = self._mitigate(enemy.damage, target.stats.get("armor", 0))
                damage = self._damage_player_locked(target, damage)
                if target.class_id == "warrior":
                    target.resource = min(target.stats["maxResource"], target.resource + damage * 0.35)
                if target.hp <= 0:
                    target.dead = True
                    target.input = {}
                    target.casting = None
                elif target.casting:
                    target.casting["endAt"] += 0.18
                enemy.attack_at = now + enemy.attack_interval
                if enemy.type == "archer":
                    self._emit_locked({"type": "auto_attack", "sourceId": enemy.id, "targetId": target.id})
                self._emit_locked({"type": "damage", "sourceId": enemy.id, "targetId": target.id, "amount": round(damage, 1), "school": "physical"})

    def _enemy_target_locked(self, enemy: Enemy, now: float) -> Player | None:
        if now < enemy.stun_until:
            return None
        living = [p for p in self.players.values() if not p.dead]
        if not living:
            return None
        if not enemy.alerted:
            seen = [p for p in living if self._enemy_can_see_locked(enemy, p)]
            if not seen:
                enemy.target_id = None
                return None
            enemy.alerted = True
            enemy.target_id = min(seen, key=lambda p: self._distance(enemy, p)).id
            self._emit_locked({"type": "enemy_alert", "sourceId": enemy.id, "targetId": enemy.target_id})
        threatened = [(enemy.threat.get(p.id, 0), p) for p in living]
        best_threat, best = max(threatened, key=lambda item: item[0])
        if best_threat > 0:
            return best
        if enemy.target_id in self.players and not self.players[enemy.target_id].dead:
            return self.players[enemy.target_id]
        return min(living, key=lambda p: self._distance(enemy, p))

    def _enemy_can_see_locked(self, enemy: Enemy, player: Player) -> bool:
        dx = player.x - enemy.x
        dz = player.z - enemy.z
        distance = math.hypot(dx, dz)
        if distance > 11:
            return False
        if self._line_of_sight_blocked_locked(enemy.x, enemy.z, player.x, player.z):
            return False
        if distance < 2.4:
            return True
        angle_to_player = math.atan2(dx, dz)
        delta = abs(math.atan2(math.sin(angle_to_player - enemy.facing), math.cos(angle_to_player - enemy.facing)))
        return delta <= math.radians(55)

    def _wander_enemy_locked(self, enemy: Enemy, now: float, dt: float) -> None:
        if now >= enemy.wander_until or math.hypot(enemy.wander_x - enemy.x, enemy.wander_z - enemy.z) < 1.4:
            self._choose_wander_target_locked(enemy)
            enemy.wander_until = now + random.uniform(5.0, 9.0)
        dx = enemy.wander_x - enemy.x
        dz = enemy.wander_z - enemy.z
        dist_to_target = math.hypot(dx, dz) or 1
        enemy.facing = math.atan2(dx, dz)
        speed = enemy.move_speed * 0.42 * (1 - enemy.slow_percent if now < enemy.slow_until else 1)
        enemy.x += dx / dist_to_target * speed * dt
        enemy.z += dz / dist_to_target * speed * dt
        self._push_out_of_map_objects_locked(enemy)
        arena = self.constants["arenaRadius"] - 1
        dist = math.hypot(enemy.x, enemy.z)
        if dist > arena:
            enemy.x *= arena / dist
            enemy.z *= arena / dist
            self._choose_wander_target_locked(enemy)

    def _choose_wander_target_locked(self, enemy: Enemy) -> None:
        radius = random.uniform(4.0, self.constants["arenaRadius"] - 4.0)
        angle = random.random() * math.tau
        enemy.wander_x = math.cos(angle) * radius
        enemy.wander_z = math.sin(angle) * radius

    def _push_out_of_map_objects_locked(self, entity: Any) -> None:
        for _ in range(3):
            moved = False
            for obj in self.map_objects:
                if not obj.get("blocksMovement"):
                    continue
                if "width" in obj and "depth" in obj:
                    half_w = obj["width"] / 2 + 0.55
                    half_d = obj["depth"] / 2 + 0.55
                    dx = entity.x - obj["x"]
                    dz = entity.z - obj["z"]
                    if abs(dx) < half_w and abs(dz) < half_d:
                        push_x = half_w - abs(dx)
                        push_z = half_d - abs(dz)
                        if push_x < push_z:
                            entity.x = obj["x"] + (half_w if dx >= 0 else -half_w)
                        else:
                            entity.z = obj["z"] + (half_d if dz >= 0 else -half_d)
                        moved = True
                    continue
                dx = entity.x - obj["x"]
                dz = entity.z - obj["z"]
                dist = math.hypot(dx, dz)
                min_dist = obj["radius"] + 0.55
                if 0 < dist < min_dist:
                    entity.x = obj["x"] + dx / dist * min_dist
                    entity.z = obj["z"] + dz / dist * min_dist
                    moved = True
            if not moved:
                break

    def _line_of_sight_blocked_locked(self, x1: float, z1: float, x2: float, z2: float) -> bool:
        return any(obj.get("blocksSight") and self._segment_intersects_object(x1, z1, x2, z2, obj) for obj in self.map_objects)

    @staticmethod
    def _segment_intersects_object(x1: float, z1: float, x2: float, z2: float, obj: dict[str, Any]) -> bool:
        if "width" in obj and "depth" in obj:
            min_x = obj["x"] - obj["width"] / 2
            max_x = obj["x"] + obj["width"] / 2
            min_z = obj["z"] - obj["depth"] / 2
            max_z = obj["z"] + obj["depth"] / 2
            dx = x2 - x1
            dz = z2 - z1
            t_min = 0.0
            t_max = 1.0
            for start, delta, low, high in ((x1, dx, min_x, max_x), (z1, dz, min_z, max_z)):
                if abs(delta) < 0.0001:
                    if start < low or start > high:
                        return False
                else:
                    t1 = (low - start) / delta
                    t2 = (high - start) / delta
                    t_min = max(t_min, min(t1, t2))
                    t_max = min(t_max, max(t1, t2))
                    if t_min > t_max:
                        return False
            return True
        cx = obj["x"]
        cz = obj["z"]
        radius = obj.get("radius", 0.8)
        dx = x2 - x1
        dz = z2 - z1
        length_sq = dx * dx + dz * dz
        if length_sq <= 0:
            return math.hypot(cx - x1, cz - z1) <= radius
        t = max(0, min(1, ((cx - x1) * dx + (cz - z1) * dz) / length_sq))
        closest_x = x1 + dx * t
        closest_z = z1 + dz * t
        return math.hypot(cx - closest_x, cz - closest_z) <= radius

    def _cast_ability_locked(self, player: Player, slot: int) -> None:
        now = time.monotonic()
        ability_id = next((a for a in player.abilities if player.ability_slots.get(a, self.abilities[a]["slot"]) == slot), None)
        if not ability_id or player.dead:
            return
        if player.casting:
            if player.casting.get("abilityId") == ability_id:
                return
            return
        ability = self.abilities[ability_id]
        if now < player.global_cooldown_until or now < player.cooldowns.get(ability_id, 0):
            return
        cost = self._ability_cost_locked(player, ability)
        if player.resource < cost:
            return
        target = player if ability["targetType"] == "self" else self.enemies.get(player.target_id or "") if ability["targetType"] == "enemy" else self.players.get(player.ally_target_id or player.id)
        # Friendly spells that require an ally target fall back to self if no valid ally is selected.
        if ability["targetType"] == "ally" and (not target or target.id not in self.players):
            target = player
        if not target or self._distance(player, target) > ability.get("range", 0):
            return
        if target is not player and self._line_of_sight_blocked_locked(player.x, player.z, target.x, target.z):
            return
        cast_time = ability.get("castTime", 0)
        if cast_time > 0:
            dx = target.x - player.x
            dz = target.z - player.z
            player.facing = math.atan2(dx, dz)
            gcd_until = now + self.constants["globalCooldown"] if ability.get("globalCooldown") else 0
            if gcd_until:
                player.global_cooldown_until = gcd_until
            player.casting = {"abilityId": ability_id, "targetId": getattr(target, "id", None), "startAt": now, "endAt": now + cast_time, "duration": cast_time, "gcdUntil": gcd_until}
            self._emit_locked({"type": "cast", "sourceId": player.id, "targetId": getattr(target, "id", None), "abilityId": ability_id, "castTime": cast_time})
            return
        self._finish_cast_locked(player, ability_id, getattr(target, "id", None))

    def _cancel_cast_gcd_locked(self, player: Player) -> None:
        if not player.casting:
            return
        gcd_until = player.casting.get("gcdUntil", 0)
        if gcd_until and player.global_cooldown_until == gcd_until:
            player.global_cooldown_until = 0

    def _finish_cast_locked(self, player: Player, ability_id: str, target_id: str | None, started_cast: bool = False) -> None:
        now = time.monotonic()
        ability = self.abilities[ability_id]
        cost = self._ability_cost_locked(player, ability)
        if player.dead or player.resource < cost or (not started_cast and now < player.global_cooldown_until) or now < player.cooldowns.get(ability_id, 0):
            return
        target = player if ability["targetType"] == "self" else self.enemies.get(target_id or "") if ability["targetType"] == "enemy" else self.players.get(target_id or player.id)
        if ability["targetType"] == "ally" and (not target or getattr(target, "id", None) not in self.players):
            target = player
        if not target or self._distance(player, target) > ability.get("range", 0):
            return
        if target is not player and self._line_of_sight_blocked_locked(player.x, player.z, target.x, target.z):
            return
        player.resource -= cost
        player.cooldowns[ability_id] = now + ability["cooldown"]
        if ability.get("globalCooldown") and not started_cast:
            player.global_cooldown_until = now + self.constants["globalCooldown"]
        self._emit_locked({"type": "cast_complete", "sourceId": player.id, "targetId": getattr(target, "id", None), "abilityId": ability_id})
        for effect in ability["effects"]:
            amount = effect.get("amount", 0) + player.stats.get(effect.get("scaling", {}).get("stat", ""), 0) * effect.get("scaling", {}).get("coefficient", 0)
            enemy_targets = self._effect_enemy_targets_locked(player, target, effect)
            ally_targets = self._effect_ally_targets_locked(player, target, effect)
            if effect["type"] == "damage":
                for enemy in enemy_targets:
                    self._damage_enemy_locked(player, enemy, amount, effect.get("school", "physical"), ability.get("threatMultiplier", 1))
            elif effect["type"] == "dot":
                for target in enemy_targets:
                    target.dots.append({
                        "sourceId": player.id,
                        "amount": amount,
                        "school": effect.get("school", "magical"),
                        "threatMultiplier": ability.get("threatMultiplier", 1),
                        "nextTick": now + effect.get("tickInterval", 1),
                        "endAt": now + effect.get("duration", 3),
                        "tickInterval": effect.get("tickInterval", 1),
                    })
                    self._emit_locked({"type": "status", "sourceId": player.id, "targetId": target.id, "abilityId": ability_id, "status": "burning", "duration": effect.get("duration", 3)})
            elif effect["type"] == "slow":
                for target in enemy_targets:
                    target.slow_percent = max(target.slow_percent, effect.get("slowPercent", 0.3))
                    target.slow_until = max(target.slow_until, now + effect.get("duration", 3))
                    self._emit_locked({"type": "status", "sourceId": player.id, "targetId": target.id, "abilityId": ability_id, "status": "slowed", "duration": effect.get("duration", 3)})
            elif effect["type"] == "stun":
                for target in enemy_targets:
                    target.stun_until = max(target.stun_until, now + effect.get("duration", 2))
                    target.slow_percent = max(target.slow_percent, 1.0)
                    target.slow_until = max(target.slow_until, now + effect.get("duration", 2))
                    self._emit_locked({"type": "status", "sourceId": player.id, "targetId": target.id, "abilityId": ability_id, "status": "frozen", "duration": effect.get("duration", 2)})
            elif effect["type"] == "heal":
                for target in ally_targets:
                    if target.dead:
                        continue
                    healed = min(amount, target.stats["maxHealth"] - target.hp)
                    target.hp += healed
                    for enemy in self.enemies.values():
                        enemy.threat[player.id] = enemy.threat.get(player.id, 0) + healed * self.constants["healingThreatMultiplier"]
                    self._emit_locked({"type": "heal", "sourceId": player.id, "targetId": target.id, "amount": round(healed, 1), "school": "holy"})
            elif effect["type"] == "hot":
                for target in ally_targets:
                    target.hots.append({"sourceId": player.id, "amount": amount, "nextTick": now + effect.get("tickInterval", 1), "endAt": now + effect.get("duration", 4), "tickInterval": effect.get("tickInterval", 1)})
                    self._emit_locked({"type": "status", "sourceId": player.id, "targetId": target.id, "abilityId": ability_id, "status": "renewing", "duration": effect.get("duration", 4)})
            elif effect["type"] == "shield":
                for target in ally_targets:
                    target.shield = max(target.shield, amount)
                    target.shield_until = max(target.shield_until, now + effect.get("duration", 6))
                    self._emit_locked({"type": "status", "sourceId": player.id, "targetId": target.id, "abilityId": ability_id, "status": "shielded", "duration": effect.get("duration", 6)})
            elif effect["type"] == "resource":
                player.resource = min(player.stats.get("maxResource", 100), player.resource + amount)
            elif effect["type"] == "auto_haste":
                player.auto_attack_haste_multiplier = max(player.auto_attack_haste_multiplier, effect.get("multiplier", 1))
                player.auto_attack_haste_until = max(player.auto_attack_haste_until, now + effect.get("duration", 3))
                hasted_interval = player.stats["autoAttackInterval"] / player.auto_attack_haste_multiplier
                player.auto_attack_at = min(player.auto_attack_at, now + hasted_interval)
                self._emit_locked({"type": "status", "sourceId": player.id, "targetId": player.id, "abilityId": ability_id, "status": "hasted", "duration": effect.get("duration", 3)})
            elif effect["type"] == "trap":
                self._ground_effect_seq += 1
                self.ground_effects.append({
                    "id": f"ground_{self._ground_effect_seq}",
                    "type": "trap",
                    "sourceId": player.id,
                    "abilityId": ability_id,
                    "x": player.x,
                    "z": player.z,
                    "radius": effect.get("radius", 2.0),
                    "damage": amount,
                    "school": effect.get("school", "physical"),
                    "stunDuration": effect.get("stunDuration", 1.5),
                    "expiresAt": now + effect.get("duration", 12),
                })
                self._emit_locked({"type": "status", "sourceId": player.id, "targetId": player.id, "abilityId": ability_id, "status": "trap_armed", "duration": effect.get("duration", 12)})
            elif effect["type"] == "aura_damage":
                player.auras.append({
                    "abilityId": ability_id,
                    "amount": amount,
                    "school": effect.get("school", "physical"),
                    "radius": effect.get("radius", 2.6),
                    "threatMultiplier": ability.get("threatMultiplier", 1),
                    "nextTick": now,
                    "endAt": now + effect.get("duration", 3),
                    "tickInterval": effect.get("tickInterval", 0.5),
                })
                self._emit_locked({"type": "status", "sourceId": player.id, "targetId": player.id, "abilityId": ability_id, "status": "spinning", "duration": effect.get("duration", 3)})

    def _tick_ground_effects_locked(self, now: float) -> None:
        for effect in list(self.ground_effects):
            if now >= effect["expiresAt"]:
                self.ground_effects.remove(effect)
                continue
            if effect.get("type") != "trap":
                continue
            source = self.players.get(effect.get("sourceId", ""))
            if not source or source.dead:
                continue
            for enemy in list(self.enemies.values()):
                if math.hypot(enemy.x - effect["x"], enemy.z - effect["z"]) > effect["radius"]:
                    continue
                self._damage_enemy_locked(source, enemy, effect.get("damage", 0), effect.get("school", "physical"), 0.8)
                if enemy.id in self.enemies:
                    enemy.stun_until = max(enemy.stun_until, now + effect.get("stunDuration", 1.5))
                    enemy.slow_percent = max(enemy.slow_percent, 1.0)
                    enemy.slow_until = max(enemy.slow_until, now + effect.get("stunDuration", 1.5))
                    self._emit_locked({"type": "status", "sourceId": source.id, "targetId": enemy.id, "abilityId": effect.get("abilityId"), "status": "trapped", "duration": effect.get("stunDuration", 1.5)})
                if effect in self.ground_effects:
                    self.ground_effects.remove(effect)
                break

    def _effect_enemy_targets_locked(self, player: Player, target: Any, effect: dict[str, Any]) -> list[Enemy]:
        radius = effect.get("radius")
        center = player if effect.get("center") == "caster" else target
        if radius is None:
            return [target] if isinstance(target, Enemy) else []
        return [enemy for enemy in self.enemies.values() if self._distance(center, enemy) <= radius and not self._line_of_sight_blocked_locked(center.x, center.z, enemy.x, enemy.z)]

    def _effect_ally_targets_locked(self, player: Player, target: Any, effect: dict[str, Any]) -> list[Player]:
        radius = effect.get("radius")
        center = player if effect.get("center") == "caster" else target
        if radius is None:
            return [target] if isinstance(target, Player) else []
        return [ally for ally in self.players.values() if self._distance(center, ally) <= radius]

    def _tick_hots_locked(self, player: Player, now: float) -> None:
        for hot in list(player.hots):
            if now >= hot["endAt"]:
                player.hots.remove(hot)
                continue
            if now >= hot["nextTick"] and not player.dead:
                source = self.players.get(hot["sourceId"])
                healed = min(hot["amount"], player.stats["maxHealth"] - player.hp)
                player.hp += healed
                if source:
                    for enemy in self.enemies.values():
                        enemy.threat[source.id] = enemy.threat.get(source.id, 0) + healed * self.constants["healingThreatMultiplier"]
                    self._emit_locked({"type": "heal", "sourceId": source.id, "targetId": player.id, "amount": round(healed, 1), "school": "holy"})
                hot["nextTick"] = now + hot["tickInterval"]

    def _tick_player_auras_locked(self, player: Player, now: float) -> None:
        for aura in list(player.auras):
            if now >= aura["endAt"]:
                player.auras.remove(aura)
                continue
            if now >= aura["nextTick"]:
                for enemy in list(self.enemies.values()):
                    if self._distance(player, enemy) <= aura["radius"] and not self._line_of_sight_blocked_locked(player.x, player.z, enemy.x, enemy.z):
                        self._damage_enemy_locked(player, enemy, aura["amount"], aura["school"], aura["threatMultiplier"])
                aura["nextTick"] = now + aura["tickInterval"]

    @staticmethod
    def _damage_player_locked(player: Player, damage: float) -> float:
        absorbed = min(player.shield, damage)
        player.shield -= absorbed
        if player.shield <= 0:
            player.shield_until = 0
        remaining = damage - absorbed
        player.hp = max(0, player.hp - remaining)
        return remaining

    def _damage_enemy_locked(self, player: Player, enemy: Enemy, raw: float, school: str, threat_multiplier: float) -> None:
        mitigation = enemy.armor if school == "physical" else enemy.resistance
        damage = self._mitigate(raw, mitigation)
        enemy.hp = max(0, enemy.hp - damage)
        enemy.alerted = True
        enemy.target_id = player.id
        enemy.threat[player.id] = enemy.threat.get(player.id, 0) + damage * threat_multiplier
        if player.class_id == "warrior":
            player.resource = min(player.stats["maxResource"], player.resource + damage * 0.25 + 4)
        self._emit_locked({"type": "damage", "sourceId": player.id, "targetId": enemy.id, "amount": round(damage, 1), "school": school})
        if enemy.hp <= 0:
            self._kill_enemy_locked(enemy.id)

    def _tick_dots_locked(self, enemy: Enemy, now: float) -> None:
        for dot in list(enemy.dots):
            if now >= dot["endAt"]:
                enemy.dots.remove(dot)
                continue
            if now >= dot["nextTick"]:
                source = self.players.get(dot["sourceId"])
                if source and not source.dead:
                    self._damage_enemy_locked(source, enemy, dot["amount"], dot["school"], dot["threatMultiplier"])
                dot["nextTick"] = now + dot["tickInterval"]

    def _kill_enemy_locked(self, enemy_id: str) -> None:
        enemy = self.enemies.pop(enemy_id, None)
        if not enemy:
            return
        for player in self.players.values():
            self._give_xp_locked(player, enemy.xp)
        self._emit_locked({"type": "death", "targetId": enemy_id})
        self.wave["aliveEnemies"] = len(self.enemies)
        if enemy.boss:
            self.match_state = "victory"
            self.wave["state"] = "complete"
        elif not self.enemies and self.match_state == "running" and self.wave.get("state") != "break":
            now = time.monotonic()
            self.wave["nextWaveAt"] = now + BREAK_SECONDS
            self.wave["state"] = "break"

    def _give_xp_locked(self, player: Player, amount: int) -> None:
        thresholds = [100, 180, 280, 420, 600, 820, 1080, 1380, 1720, 2100, 2520]
        player.xp += amount
        while player.level < self.constants["maxLevel"] and player.xp >= thresholds[player.level - 1]:
            player.xp -= thresholds[player.level - 1]
            player.level += 1
            growth = self.classes[player.class_id or "warrior"].get("statGrowth", {})
            for stat, inc in growth.items():
                player.stats[stat] = player.stats.get(stat, 0) + inc
            player.hp = min(player.stats["maxHealth"], player.hp + growth.get("maxHealth", 0))
            player.pending_upgrades = self._level_choices_locked(player)
            player.upgrade_locked = False

    def _level_choices_locked(self, player: Player) -> list[dict[str, Any]]:
        class_id = player.class_id or "warrior"
        stat_choices = [{**upgrade, "choiceType": "stat"} for upgrade in self.upgrades]
        spell_choices = [
            {
                "id": f"learn:{ability_id}",
                "name": f"Learn {ability['name']}",
                "choiceType": "spell",
                "abilityId": ability_id,
                "description": ability.get("description", "New class spell."),
            }
            for ability_id, ability in self.abilities.items()
            if ability.get("classId") == class_id and ability_id not in player.abilities and ability.get("learnable", True)
        ]
        return stat_choices + spell_choices

    def _choose_upgrade_locked(self, player: Player, upgrade_id: str) -> None:
        if player.upgrade_locked:
            return
        upgrade = next((u for u in player.pending_upgrades if u["id"] == upgrade_id), None)
        if not upgrade:
            return
        player.upgrade_locked = True
        if upgrade.get("choiceType") == "spell":
            ability_id = upgrade.get("abilityId")
            if ability_id in self.abilities and ability_id not in player.abilities:
                player.abilities.append(ability_id)
                used_slots = set(player.ability_slots.values())
                player.ability_slots[ability_id] = next(slot for slot in [1, 2, 3, 4, 5, 6, 7] if slot not in used_slots)
        else:
            stat = upgrade["stat"]
            if upgrade["mode"] == "mult":
                player.stats[stat] = player.stats.get(stat, 0) * upgrade["value"]
            else:
                player.stats[stat] = player.stats.get(stat, 0) + upgrade["value"]
            if stat == "maxHealth":
                player.hp = min(player.stats["maxHealth"], player.hp + 20)
        player.pending_upgrades = []
        player.upgrade_locked = False

    @staticmethod
    def _ability_cost_locked(player: Player, ability: dict[str, Any]) -> float:
        cost = ability.get("resourceCost", {})
        amount = cost.get("amount", 0)
        if "amount" in cost:
            return max(0, amount * player.stats.get("resourceCostMultiplier", 1))
        return amount

    def _cycle_target_locked(self, player: Player, ally: bool) -> None:
        if ally:
            ids = [p.id for p in self.players.values() if p.id != player.id]
            current = player.ally_target_id
            player.ally_target_id = self._next_id(ids, current) if ids else player.id
            player.target_id = None
        else:
            ids = list(self.enemies)
            player.target_id = self._next_id(ids, player.target_id) if ids else None
            player.ally_target_id = None

    @staticmethod
    def _next_id(ids: list[str], current: str | None) -> str | None:
        if not ids:
            return None
        if current not in ids:
            return ids[0]
        return ids[(ids.index(current) + 1) % len(ids)]

    @staticmethod
    def _distance(a: Any, b: Any) -> float:
        return math.hypot(a.x - b.x, a.z - b.z)

    @staticmethod
    def _mitigate(raw: float, mitigation: float) -> float:
        return raw * (100 / (100 + mitigation))

    def _check_end_states_locked(self) -> None:
        if self.players and all(p.dead for p in self.players.values()):
            self.match_state = "defeat"
            self.wave["state"] = "failed"

    async def snapshot(self, player_id: str | None = None, include_static: bool = True) -> dict[str, Any]:
        async with self._lock:
            events = self.events[-20:]
            return self._snapshot_locked(player_id, events, include_static)

    def _snapshot_locked(self, player_id: str | None = None, events: list[dict[str, Any]] | None = None, include_static: bool = True) -> dict[str, Any]:
        now = time.monotonic()
        snapshot = {
            "type": "state_snapshot",
            "you": player_id,
            "matchState": self.match_state,
            "countdown": max(0, round((self.countdown_until or now) - now, 1)) if self.countdown_until else None,
            "players": {pid: self._player_dict(p, now) for pid, p in self.players.items()},
            "enemies": {eid: self._enemy_dict(e) for eid, e in self.enemies.items()},
            "wave": {**self.wave, "aliveEnemies": len(self.enemies), "nextWaveIn": max(0, round((self.wave.get("nextWaveAt", now) - now), 1)) if self.wave.get("nextWaveAt") is not None else None},
            "mapRevision": self._map_revision,
            "groundEffects": self._ground_effects_dict(now),
            "events": events or [],
        }
        if include_static:
            snapshot["mapObjects"] = self.map_objects
            snapshot["abilities"] = self.abilities
        return snapshot

    def _ground_effects_dict(self, now: float) -> list[dict[str, Any]]:
        return [
            {**effect, "remaining": max(0, round(effect.get("expiresAt", now) - now, 1))}
            for effect in self.ground_effects
            if now < effect.get("expiresAt", now)
        ]

    def _player_dict(self, p: Player, now: float) -> dict[str, Any]:
        return {
            "id": p.id, "name": p.name, "classId": p.class_id, "ready": p.ready,
            "hp": round(p.hp, 1), "maxHealth": round(p.stats.get("maxHealth", 1), 1),
            "resource": round(p.resource, 1), "maxResource": round(p.stats.get("maxResource", 100), 1),
            "resourceType": self.classes.get(p.class_id or "", {}).get("resourceType"),
            "level": p.level, "xp": p.xp, "dead": p.dead, "targetId": p.target_id,
            "allyTargetId": p.ally_target_id, "position": {"x": round(p.x, 2), "z": round(p.z, 2)}, "facing": round(p.facing, 2),
            "jumping": now < p.jump_until,
            "jumpProgress": max(0, min(1, 1 - max(0, p.jump_until - now) / 0.36)) if now < p.jump_until else 0,
            "abilities": p.abilities, "abilitySlots": p.ability_slots, "cooldowns": {ability: max(0, round(ends_at - now, 1)) for ability, ends_at in p.cooldowns.items()},
            "globalCooldown": max(0, round(p.global_cooldown_until - now, 1)),
            "autoAttack": self._auto_attack_dict(p, now),
            "pendingUpgrades": p.pending_upgrades, "stats": p.stats, "shield": round(p.shield, 1),
            "shieldRemaining": max(0, round(p.shield_until - now, 1)),
            "casting": self._casting_dict(p.casting, now),
        }

    @staticmethod
    def _auto_attack_dict(p: Player, now: float) -> dict[str, float]:
        interval = max(0.01, p.stats.get("autoAttackInterval", 0.01))
        remaining = max(0, p.auto_attack_at - now)
        return {"remaining": round(remaining, 2), "interval": interval, "progress": max(0, min(1, 1 - remaining / interval))}

    @staticmethod
    def _casting_dict(casting: dict[str, Any] | None, now: float) -> dict[str, Any] | None:
        if not casting:
            return None
        duration = max(0.01, float(casting.get("duration", 0.01)))
        remaining = max(0, float(casting["endAt"]) - now)
        return {
            "abilityId": casting.get("abilityId"),
            "targetId": casting.get("targetId"),
            "duration": duration,
            "remaining": remaining,
            "progress": max(0, min(1, 1 - remaining / duration)),
        }

    @staticmethod
    def _enemy_dict(e: Enemy) -> dict[str, Any]:
        return {
            "id": e.id, "type": e.type, "name": e.name, "hp": round(e.hp, 1), "maxHealth": round(e.max_health, 1),
            "targetId": e.target_id, "position": {"x": round(e.x, 2), "z": round(e.z, 2)}, "threat": e.threat,
            "boss": e.boss,
            "alerted": e.alerted,
            "facing": round(e.facing, 2),
            "slowed": time.monotonic() < e.slow_until,
            "burning": bool(e.dots),
        }

    async def debug_action(self, action: str, payload: dict[str, Any]) -> dict[str, Any]:
        async with self._lock:
            if action == "spawn_enemy":
                enemy = self.spawn_enemy_locked(payload.get("type", "goblin"), payload.get("position"))
                return {"ok": True, "enemyId": enemy.id}
            if action == "set_player_hp":
                p = self.players[payload["playerId"]]
                p.hp = max(0, float(payload["hp"]))
                p.dead = p.hp <= 0
            elif action == "give_xp":
                self._give_xp_locked(self.players[payload["playerId"]], int(payload["amount"]))
            elif action == "force_wave_start":
                self._start_wave_locked(int(payload.get("waveNumber", 1)))
            elif action == "force_wave_complete":
                self.enemies.clear()
                self.wave["aliveEnemies"] = 0
                for p in self.players.values():
                    if p.dead:
                        p.dead = False
                        p.hp = p.stats.get("maxHealth", 100) * 0.6
            elif action == "kill_enemy":
                self._kill_enemy_locked(payload["enemyId"])
            elif action == "kill_player":
                p = self.players[payload["playerId"]]
                p.hp = 0
                p.dead = True
                self._check_end_states_locked()
            elif action == "set_ally_target":
                self.players[payload["playerId"]].ally_target_id = payload["targetId"]
            elif action == "set_enemy_target":
                self.players[payload["playerId"]].target_id = payload["targetId"]
            elif action == "reset_match":
                self.players.clear(); self.enemies.clear(); self.ground_effects.clear(); self.match_state = "lobby"; self.wave = {"number": 0, "state": "lobby", "aliveEnemies": 0}; self.countdown_until = None
            elif action == "add_bot":
                player = self.add_player_locked()
                class_id = payload.get("classId", "warrior")
                if class_id in self.classes:
                    player.class_id = class_id
                    player.ready = True
                return {"ok": True, "playerId": player.id}
            elif action == "cast_ability":
                player = self.players.get(payload["playerId"])
                if player:
                    self._cast_ability_locked(player, int(payload.get("slot", 1)))
                return {"ok": True}
            elif action == "choose_upgrade":
                player = self.players.get(payload["playerId"])
                if player:
                    self._choose_upgrade_locked(player, str(payload.get("upgradeId", "")))
                return {"ok": True}
            return {"ok": True}

    def _emit_locked(self, event: dict[str, Any]) -> None:
        self._event_seq += 1
        self.events.append({"id": self._event_seq, **event})
        self.events = self.events[-50:]


game = Game()
