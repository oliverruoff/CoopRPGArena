from __future__ import annotations

import asyncio
import json
import math
import random
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).parent / "game_data"
MAX_TEAM_SIZE = 3
BUILD_POINTS = 10
PVP_DAMAGE_MULTIPLIER = 0.8
PREPARATION_SECONDS = 5.0


def load_json(name: str) -> Any:
    return json.loads((DATA_DIR / name).read_text())


PVP_ATTRIBUTES: dict[str, dict[str, Any]] = {
    "max_health": {"name": "Max Health", "stat": "maxHealth", "mode": "mult", "value": 1.08},
    "max_resource": {"name": "Max Resource", "stat": "maxResource", "mode": "mult", "value": 1.08},
    "attack_power": {"name": "Attack Power", "stat": "attackPower", "mode": "mult", "value": 1.08},
    "spell_power": {"name": "Spell Power", "stat": "spellPower", "mode": "mult", "value": 1.08},
    "armor": {"name": "Armor", "stat": "armor", "mode": "mult", "value": 1.10},
    "resistance": {"name": "Magic Resistance", "stat": "resistance", "mode": "mult", "value": 1.10},
    "crit": {"name": "Critical Strike", "stat": "critChance", "mode": "add", "value": 0.02},
    "move_speed": {"name": "Move Speed", "stat": "moveSpeed", "mode": "mult", "value": 1.035},
    "resource_regen": {"name": "Resource Regeneration", "stat": "resourceRegen", "mode": "mult", "value": 1.12},
    "resource_cost": {"name": "Resource Efficiency", "stat": "resourceCostMultiplier", "mode": "mult", "value": 0.96},
    "cooldown": {"name": "Cooldown Reduction", "stat": "cooldownReduction", "mode": "add", "value": 0.025},
    "cast_speed": {"name": "Cast Speed", "stat": "castSpeed", "mode": "mult", "value": 1.035},
}


@dataclass
class PvPPlayer:
    id: str
    name: str
    reconnect_token: str = field(default_factory=secrets.token_urlsafe)
    team: str | None = None
    class_id: str | None = None
    ready: bool = False
    spectator: bool = False
    disconnected_at: float | None = None
    build: list[str] = field(default_factory=list)
    stats: dict[str, float] = field(default_factory=dict)
    abilities: list[str] = field(default_factory=list)
    ability_slots: dict[str, int] = field(default_factory=dict)
    x: float = 0
    y: float = 0
    z: float = 0
    vx: float = 0
    vy: float = 0
    vz: float = 0
    facing: float = 0
    hp: float = 1
    resource: float = 0
    dead: bool = False
    input: dict[str, bool] = field(default_factory=dict)
    target_id: str | None = None
    ally_target_id: str | None = None
    cooldowns: dict[str, float] = field(default_factory=dict)
    global_cooldown_until: float = 0
    auto_attack_at: float = 0
    casting: dict[str, Any] | None = None
    shield: float = 0
    shield_until: float = 0
    stun_until: float = 0
    slow_until: float = 0
    slow_percent: float = 0
    dots: list[dict[str, Any]] = field(default_factory=list)
    hots: list[dict[str, Any]] = field(default_factory=list)
    stat_buffs: list[dict[str, Any]] = field(default_factory=list)
    active_effects: list[dict[str, Any]] = field(default_factory=list)
    stealth_until: float = 0
    shapeshift_form: str | None = None
    shapeshift_previous: dict[str, float] = field(default_factory=dict)
    damage_dealt: float = 0
    healing_done: float = 0
    damage_taken: float = 0
    kills: int = 0
    deaths: int = 0
    revives: int = 0
    is_bot: bool = False
    jump_until: float = 0


class PvPGame:
    """Independent authoritative 1v1–3v3 arena simulation."""

    def __init__(self) -> None:
        self.classes = load_json("classes.json")
        self.abilities = load_json("abilities.json")
        self.constants = load_json("constants.json")
        self.players: dict[str, PvPPlayer] = {}
        self.match_state = "lobby"
        self.countdown_until: float | None = None
        self.gates_open_at: float | None = None
        self.winner: str | None = None
        self.selected_arena = "blade_ridge"
        self.events: list[dict[str, Any]] = []
        self.ground_effects: list[dict[str, Any]] = []
        self._event_seq = 0
        self._player_seq = 0
        self._effect_seq = 0
        self._last_tick = time.monotonic()
        self._lock = asyncio.Lock()

    async def reset(self) -> None:
        async with self._lock:
            self.players.clear()
            self.match_state = "lobby"
            self.countdown_until = None
            self.gates_open_at = None
            self.winner = None
            self.events.clear()
            self.ground_effects.clear()
            self._player_seq = 0

    def add_player_locked(self, reconnect_token: str | None = None) -> PvPPlayer:
        if reconnect_token:
            existing = next((p for p in self.players.values() if p.reconnect_token == reconnect_token), None)
            if existing:
                existing.disconnected_at = None
                return existing
        self._player_seq += 1
        player = PvPPlayer(id=f"pvp_player_{self._player_seq}", name=f"Gladiator {self._player_seq}")
        if self.match_state != "lobby":
            player.spectator = True
        self.players[player.id] = player
        return player

    async def add_player(self, reconnect_token: str | None = None) -> PvPPlayer:
        async with self._lock:
            return self.add_player_locked(reconnect_token)

    async def remove_player(self, player_id: str) -> None:
        async with self._lock:
            player = self.players.get(player_id)
            if not player:
                return
            if self.match_state == "lobby":
                self.players.pop(player_id, None)
                self._update_countdown_locked()
            else:
                player.disconnected_at = time.monotonic()

    async def handle_message(self, player_id: str, msg: dict[str, Any]) -> None:
        async with self._lock:
            player = self.players.get(player_id)
            if not player:
                return
            typ = msg.get("type")
            if typ == "set_name":
                name = str(msg.get("name", "")).strip()
                if name:
                    player.name = name[:18]
            elif typ == "select_team" and self.match_state == "lobby" and not player.spectator:
                team = msg.get("team")
                if team in {"blue", "red"} and (player.team == team or self._team_count_locked(team) < MAX_TEAM_SIZE):
                    player.team = team
                    player.ready = False
                    self._update_countdown_locked()
            elif typ == "select_class" and self.match_state == "lobby" and not player.spectator:
                class_id = msg.get("classId")
                if class_id in self.classes:
                    player.class_id = class_id
                    player.build.clear()
                    player.ready = False
                    self._preview_stats_locked(player)
                    self._update_countdown_locked()
            elif typ == "toggle_build" and self.match_state == "lobby" and not player.spectator:
                self._toggle_build_locked(player, str(msg.get("choice", "")))
            elif typ == "reset_build" and self.match_state == "lobby":
                player.build.clear()
                player.ready = False
                self._preview_stats_locked(player)
                self._update_countdown_locked()
            elif typ == "select_arena" and self.match_state == "lobby":
                arena = msg.get("arenaId")
                if arena in {"random", "blade_ridge"}:
                    self.selected_arena = arena
            elif typ == "ready" and self.match_state == "lobby" and not player.spectator:
                player.ready = bool(msg.get("ready")) and self._valid_build_locked(player)
                self._update_countdown_locked()
            elif typ == "add_training_bot" and self.match_state == "lobby" and not player.spectator:
                if player.team not in {"blue", "red"}:
                    player.team = "blue" if self._team_count_locked("blue") < MAX_TEAM_SIZE else "red"
                    player.ready = False
                team = "red" if player.team != "red" else "blue"
                if not any(p.is_bot and p.team == team for p in self.players.values()):
                    self._add_bot_locked(team, str(msg.get("classId", "warrior")), "Training Bot", True)
            elif typ == "remove_training_bot" and self.match_state == "lobby":
                for bot_id in [pid for pid, candidate in self.players.items() if candidate.is_bot]:
                    self.players.pop(bot_id, None)
                self._update_countdown_locked()
            elif typ == "input" and self.match_state == "running" and not player.dead and not player.spectator:
                movement = msg.get("movement", {})
                player.input = movement if isinstance(movement, dict) else {}
                if player.casting and any(player.input.values()):
                    self._emit_locked({"type": "cast_cancelled", "sourceId": player.id, "abilityId": player.casting["abilityId"]})
                    player.casting = None
            elif typ == "jump" and self.match_state == "running" and not player.dead and not player.spectator:
                if time.monotonic() >= player.stun_until:
                    player.jump_until = time.monotonic() + 0.36
            elif typ == "select_target" and self.match_state == "running":
                self._select_target_locked(player, str(msg.get("targetId", "")))
            elif typ == "cycle_target" and self.match_state == "running":
                self._cycle_target_locked(player, bool(msg.get("ally")))
            elif typ == "cast_ability" and self.match_state == "running":
                ground = msg.get("groundPosition")
                self._cast_locked(player, int(msg.get("abilitySlot", 1)), ground if isinstance(ground, dict) else None)
            elif typ == "restart_match" and self.match_state == "victory":
                self._restart_lobby_locked()

    def _team_count_locked(self, team: str) -> int:
        return sum(1 for p in self.players.values() if p.team == team and not p.spectator and p.disconnected_at is None)

    def _valid_build_locked(self, player: PvPPlayer) -> bool:
        return bool(player.class_id in self.classes and player.team in {"blue", "red"} and len(player.build) == BUILD_POINTS)

    def _toggle_build_locked(self, player: PvPPlayer, choice: str) -> None:
        if not player.class_id:
            return
        if choice.startswith("spell:"):
            ability_id = choice[6:]
            ability = self.abilities.get(ability_id)
            if not ability or ability.get("classId") != player.class_id:
                return
            if choice in player.build:
                player.build.remove(choice)
            elif len(player.build) < BUILD_POINTS:
                player.build.append(choice)
        elif choice.startswith("stat:") and choice[5:] in PVP_ATTRIBUTES and len(player.build) < BUILD_POINTS:
            player.build.append(choice)
        player.ready = False
        self._preview_stats_locked(player)
        self._update_countdown_locked()

    def _preview_stats_locked(self, player: PvPPlayer) -> None:
        if not player.class_id:
            player.stats = {}
            return
        stats = dict(self.classes[player.class_id]["baseStats"])
        for choice in player.build:
            if not choice.startswith("stat:"):
                continue
            upgrade = PVP_ATTRIBUTES[choice[5:]]
            stat = upgrade["stat"]
            stats[stat] = stats.get(stat, 0) * upgrade["value"] if upgrade["mode"] == "mult" else stats.get(stat, 0) + upgrade["value"]
        stats["moveSpeed"] = min(stats.get("moveSpeed", 5), 7.25)
        stats["cooldownReduction"] = min(stats.get("cooldownReduction", 0), 0.35)
        stats["castSpeed"] = min(stats.get("castSpeed", 1), 1.5)
        stats["resourceCostMultiplier"] = max(stats.get("resourceCostMultiplier", 1), 0.65)
        player.stats = stats

    def _all_ready_locked(self) -> bool:
        active = [p for p in self.players.values() if not p.spectator and p.disconnected_at is None and p.team in {"blue", "red"}]
        return bool(active) and any(p.team == "blue" for p in active) and any(p.team == "red" for p in active) and all(p.ready and self._valid_build_locked(p) for p in active)

    def _update_countdown_locked(self) -> None:
        if self._all_ready_locked():
            self.countdown_until = self.countdown_until or time.monotonic() + 3
        else:
            self.countdown_until = None

    def _start_match_locked(self) -> None:
        if not self._all_ready_locked():
            self.countdown_until = None
            return
        self.match_state = "running"
        self.countdown_until = None
        self.gates_open_at = time.monotonic() + PREPARATION_SECONDS
        self.winner = None
        self.events.clear()
        self.ground_effects.clear()
        for team in ("blue", "red"):
            members = [p for p in self.players.values() if p.team == team and not p.spectator and p.disconnected_at is None]
            for index, player in enumerate(members):
                self._preview_stats_locked(player)
                player.abilities = [choice[6:] for choice in player.build if choice.startswith("spell:")]
                player.ability_slots = {ability_id: index + 1 for index, ability_id in enumerate(player.abilities)}
                player.x = -26 if team == "blue" else 26
                player.y = 0
                player.z = (index - (len(members) - 1) / 2) * 3
                player.facing = math.pi / 2 if team == "blue" else -math.pi / 2
                player.hp = player.stats["maxHealth"]
                data = self.classes[player.class_id or "warrior"]
                player.resource = player.stats["maxResource"] if data.get("startingResource", 0) > 0 else 0
                player.dead = False
                player.input = {}
                player.target_id = None
                player.ally_target_id = None
                player.cooldowns.clear()
                player.global_cooldown_until = 0
                player.auto_attack_at = self.gates_open_at + player.stats.get("autoAttackInterval", 1.5)
                player.casting = None
                player.shield = 0
                player.dots.clear()
                player.hots.clear()
                player.stat_buffs.clear()
                player.active_effects.clear()
                player.stealth_until = 0
                player.shapeshift_form = None
                player.shapeshift_previous.clear()
                player.jump_until = 0
                player.damage_dealt = player.healing_done = player.damage_taken = 0
                player.kills = player.deaths = player.revives = 0

    def _restart_lobby_locked(self) -> None:
        self.match_state = "lobby"
        self.winner = None
        self.gates_open_at = None
        self.events.clear()
        self.ground_effects.clear()
        for player_id in [pid for pid, p in self.players.items() if p.disconnected_at is not None]:
            self.players.pop(player_id, None)
        for player in self.players.values():
            player.ready = player.is_bot
            player.dead = False
            player.hp = max(1, player.stats.get("maxHealth", 1))
            player.input = {}

    async def tick(self) -> None:
        async with self._lock:
            now = time.monotonic()
            dt = min(0.1, now - self._last_tick)
            self._last_tick = now
            if self.match_state == "lobby" and self.countdown_until and now >= self.countdown_until:
                self._start_match_locked()
            if self.match_state != "running":
                return
            for player in list(self.players.values()):
                self._tick_player_locked(player, now, dt)
            self._tick_ground_effects_locked(now)
            self._check_winner_locked()

    def _tick_player_locked(self, player: PvPPlayer, now: float, dt: float) -> None:
        if player.dead or player.spectator or player.disconnected_at is not None:
            return
        self._expire_buffs_locked(player, now)
        self._tick_periodics_locked(player, now)
        if player.is_bot:
            self._drive_bot_locked(player)
        if player.shield_until and now >= player.shield_until:
            player.shield = 0
            player.shield_until = 0
        player.resource = min(player.stats.get("maxResource", 100), player.resource + player.stats.get("resourceRegen", 0) * dt)
        gates_open = self.gates_open_at is None or now >= self.gates_open_at
        if gates_open and now >= player.stun_until:
            dx = (1 if player.input.get("right") else 0) - (1 if player.input.get("left") else 0)
            dz = (1 if player.input.get("up") else 0) - (1 if player.input.get("down") else 0)
            length = math.hypot(dx, dz) or 1
            if dx or dz:
                player.facing = math.atan2(dx, dz)
            slow = 1 - player.slow_percent if now < player.slow_until else 1
            speed = player.stats.get("moveSpeed", 5) * slow
            player.x += dx / length * speed * dt
            player.z += dz / length * speed * dt
            self._resolve_arena_position_locked(player, dt)
        if now >= player.auto_attack_at and player.target_id in self.players:
            target = self.players[player.target_id]
            if self._is_enemy_locked(player, target) and not target.dead and now >= target.stealth_until:
                attack_range = player.stats.get("autoAttackRange", 2)
                if self._distance(player, target) <= attack_range and self._has_los_locked(player, target):
                    raw = player.stats.get("autoAttackDamage", 5) + max(player.stats.get("attackPower", 0) * 0.35, player.stats.get("spellPower", 0) * 0.2)
                    self._damage_locked(player, target, raw, "physical", "auto_attack")
                    self._emit_locked({"type": "auto_attack", "sourceId": player.id, "targetId": target.id})
                    player.auto_attack_at = now + player.stats.get("autoAttackInterval", 1.5)
        if player.casting and now >= player.casting["endAt"]:
            cast = player.casting
            player.casting = None
            self._finish_cast_locked(player, cast["abilityId"], cast.get("targetId"), cast.get("groundPosition"), True)

    def _drive_bot_locked(self, player: PvPPlayer) -> None:
        """Small deterministic sparring AI for testing the arena without a second browser."""
        enemies = [p for p in self.players.values() if self._is_enemy_locked(player, p) and not p.dead]
        if not enemies:
            player.input = {}
            return
        target = min(enemies, key=lambda candidate: self._distance(player, candidate))
        player.target_id, player.ally_target_id = target.id, None
        distance = self._distance(player, target)
        desired_range = max(1.7, min(8.0, player.stats.get("autoAttackRange", 2) * 0.85))
        player.input = {
            "right": target.x > player.x + 0.25 and distance > desired_range,
            "left": target.x < player.x - 0.25 and distance > desired_range,
            "up": target.z > player.z + 0.25 and distance > desired_range,
            "down": target.z < player.z - 0.25 and distance > desired_range,
        }

    def _resolve_arena_position_locked(self, player: PvPPlayer, dt: float) -> None:
        player.x = max(-29, min(29, player.x))
        player.z = max(-17, min(17, player.z))
        # Two lower-level pillars. They do not collide with actors already on the bridge.
        if player.y < 3.8:
            for px in (-8.0, 8.0):
                dx, dz = player.x - px, player.z
                dist = math.hypot(dx, dz)
                if dist < 2.15:
                    scale = 2.15 / max(0.01, dist)
                    player.x = px + dx * scale
                    player.z = dz * scale
        target_y = self._surface_height_locked(player.x, player.z, player.y)
        if target_y < player.y - 0.2:
            player.y = max(target_y, player.y - 14 * dt)
        else:
            player.y = target_y

    @staticmethod
    def _surface_height_locked(x: float, z: float, current_y: float) -> float:
        # End ramps.
        if -26 <= x <= -18 and abs(z) <= 4:
            return (x + 26) / 8 * 5
        if 18 <= x <= 26 and abs(z) <= 4:
            return (26 - x) / 8 * 5
        # Four central ramps.
        if any(abs(x - center) <= 2.3 for center in (-7.0, 7.0)) and 4 <= abs(z) <= 13:
            return max(0, (13 - abs(z)) / 9 * 5)
        if abs(x) <= 18 and abs(z) <= 4 and current_y > 2.2:
            return 5
        return 0

    def _select_target_locked(self, player: PvPPlayer, target_id: str) -> None:
        target = self.players.get(target_id)
        if not target or target.spectator:
            return
        if self._is_enemy_locked(player, target):
            player.target_id, player.ally_target_id = target.id, None
        elif target.team == player.team:
            player.ally_target_id, player.target_id = target.id, None

    def _cycle_target_locked(self, player: PvPPlayer, ally: bool) -> None:
        candidates = [p for p in self.players.values() if not p.spectator and p.team == player.team and p.id != player.id] if ally else [p for p in self.players.values() if self._is_enemy_locked(player, p) and not p.dead]
        candidates.sort(key=lambda p: self._distance(player, p))
        ids = [p.id for p in candidates]
        current = player.ally_target_id if ally else player.target_id
        next_id = ids[0] if ids and current not in ids else ids[(ids.index(current) + 1) % len(ids)] if ids else (player.id if ally else None)
        if ally:
            player.ally_target_id, player.target_id = next_id, None
        else:
            player.target_id, player.ally_target_id = next_id, None

    def _cast_locked(self, player: PvPPlayer, slot: int, ground_position: dict[str, Any] | None) -> None:
        if player.dead or player.spectator or (self.gates_open_at and time.monotonic() < self.gates_open_at):
            return
        ability_id = next((aid for aid, assigned in player.ability_slots.items() if assigned == slot), None)
        if not ability_id or player.casting:
            return
        ability = self.abilities[ability_id]
        now = time.monotonic()
        if not self._ability_form_allowed_locked(player, ability):
            return
        if now < player.global_cooldown_until or now < player.cooldowns.get(ability_id, 0):
            return
        cost = ability.get("resourceCost", {}).get("amount", 0) * player.stats.get("resourceCostMultiplier", 1)
        if player.resource < cost:
            return
        if ability["targetType"] == "ground":
            if not ground_position:
                ground_position = {"x": player.x, "z": player.z}
            gx, gz = float(ground_position.get("x", player.x)), float(ground_position.get("z", player.z))
            if math.hypot(gx - player.x, gz - player.z) > ability.get("range", 0):
                return
            ground_position = {"x": gx, "z": gz}
        target = self._ability_target_locked(player, ability)
        if ability["targetType"] != "ground":
            if not target or self._distance(player, target) > ability.get("range", 0) or (target is not player and not self._has_los_locked(player, target)):
                return
        cast_time = ability.get("castTime", 0) / max(0.1, player.stats.get("castSpeed", 1))
        target_id = target.id if target else None
        if cast_time > 0:
            gcd = self.constants["globalCooldown"] * (1 - player.stats.get("cooldownReduction", 0)) if ability.get("globalCooldown") else 0
            player.global_cooldown_until = now + gcd
            player.casting = {"abilityId": ability_id, "targetId": target_id, "groundPosition": ground_position, "endAt": now + cast_time, "duration": cast_time}
            self._emit_locked({"type": "cast", "sourceId": player.id, "targetId": target_id, "abilityId": ability_id, "castTime": cast_time})
        else:
            self._finish_cast_locked(player, ability_id, target_id, ground_position, False)

    def _ability_target_locked(self, player: PvPPlayer, ability: dict[str, Any]) -> PvPPlayer | None:
        if ability["targetType"] == "self":
            return player
        if ability["targetType"] == "enemy":
            target = self.players.get(player.target_id or "")
            return target if target and self._is_enemy_locked(player, target) and not target.dead else None
        if ability["targetType"] == "ally":
            target = self.players.get(player.ally_target_id or "") or player
            return target if target.team == player.team else player
        return None

    @staticmethod
    def _ability_form_allowed_locked(player: PvPPlayer, ability: dict[str, Any]) -> bool:
        """Keep druid form requirements identical to the cooperative ruleset."""
        required = ability.get("requiredForm")
        if required is None:
            return True
        if required == "none":
            return player.shapeshift_form is None
        return player.shapeshift_form == required

    def _finish_cast_locked(self, player: PvPPlayer, ability_id: str, target_id: str | None, ground: dict[str, Any] | None, started: bool) -> None:
        ability = self.abilities[ability_id]
        now = time.monotonic()
        cost = ability.get("resourceCost", {}).get("amount", 0) * player.stats.get("resourceCostMultiplier", 1)
        if player.dead or player.resource < cost or now < player.cooldowns.get(ability_id, 0):
            return
        target = self.players.get(target_id or "") if target_id else player if ability["targetType"] == "self" else None
        if ability["targetType"] == "ally" and (not target or target.team != player.team):
            target = player
        if ability["targetType"] == "enemy" and (not target or not self._is_enemy_locked(player, target) or target.dead):
            return
        if target and self._distance(player, target) > ability.get("range", 0):
            return
        if target is not None and target is not player and not self._has_los_locked(player, target):
            return
        player.resource -= cost
        cdr = player.stats.get("cooldownReduction", 0)
        player.cooldowns[ability_id] = now + ability.get("cooldown", 0) * (1 - cdr)
        if ability.get("globalCooldown") and not started:
            player.global_cooldown_until = now + self.constants["globalCooldown"] * (1 - cdr)
        self._emit_locked({"type": "cast_complete", "sourceId": player.id, "targetId": target.id if target else None, "abilityId": ability_id})
        for effect in ability.get("effects", []):
            self._apply_effect_locked(player, target, ability, effect, ground)

    def _apply_effect_locked(self, source: PvPPlayer, target: PvPPlayer | None, ability: dict[str, Any], effect: dict[str, Any], ground: dict[str, Any] | None) -> None:
        typ = effect.get("type")
        amount = effect.get("amount", 0) + source.stats.get(effect.get("scaling", {}).get("stat", ""), 0) * effect.get("scaling", {}).get("coefficient", 0)
        if typ == "totem" and effect.get("totemType") == "healing":
            amount = effect.get("healAmount", 0) + source.stats.get(effect.get("healScaling", {}).get("stat", ""), 0) * effect.get("healScaling", {}).get("coefficient", 0)
        elif typ == "totem" and effect.get("totemType") == "searing":
            amount = effect.get("damageAmount", 0) + source.stats.get(effect.get("damageScaling", {}).get("stat", ""), 0) * effect.get("damageScaling", {}).get("coefficient", 0)
        radius = effect.get("radius", 0)
        enemies = self._enemy_effect_targets_locked(source, target, radius)
        allies = self._ally_effect_targets_locked(source, target, radius)
        if typ in {"damage", "cone_damage", "chain_lightning", "channel_damage"}:
            limit = effect.get("jumps", 0) + 1 if typ == "chain_lightning" else len(enemies)
            for victim in enemies[:limit]:
                self._damage_locked(source, victim, amount, effect.get("school", "physical"), ability["id"])
        elif typ == "execute_damage":
            for victim in enemies:
                mult = effect.get("executeMultiplier", 2.5) if victim.hp / max(1, victim.stats["maxHealth"]) <= effect.get("executeThreshold", 0.35) else 1
                self._damage_locked(source, victim, amount * mult, effect.get("school", "physical"), ability["id"])
        elif typ in {"backstep", "charge"}:
            if enemies:
                victim = enemies[0]
                dx, dz = victim.x - source.x, victim.z - source.z
                length = math.hypot(dx, dz) or 1
                source.x, source.z = victim.x - dx / length * 1.4, victim.z - dz / length * 1.4
                source.y = victim.y
                self._damage_locked(source, victim, amount, effect.get("school", "physical"), ability["id"])
        elif typ == "dot":
            for victim in enemies:
                victim.dots = [d for d in victim.dots if not (d["sourceId"] == source.id and d["abilityId"] == ability["id"])]
                victim.dots.append({"sourceId": source.id, "abilityId": ability["id"], "amount": amount, "school": effect.get("school", "magic"), "nextTick": time.monotonic() + effect.get("tickInterval", 1), "endAt": time.monotonic() + effect.get("duration", 3), "tickInterval": effect.get("tickInterval", 1)})
                self._status_locked(source, victim, ability["id"], "debuff", effect.get("duration", 3))
        elif typ in {"slow", "cone_slow"}:
            for victim in enemies:
                victim.slow_percent = max(victim.slow_percent, effect.get("slowPercent", 0.3))
                victim.slow_until = max(victim.slow_until, time.monotonic() + min(4, effect.get("duration", 3)))
                self._status_locked(source, victim, ability["id"], "debuff", min(4, effect.get("duration", 3)))
        elif typ == "stun":
            for victim in enemies:
                victim.stun_until = max(victim.stun_until, time.monotonic() + min(4, effect.get("duration", 2)))
                victim.casting = None
                self._status_locked(source, victim, ability["id"], "debuff", min(4, effect.get("duration", 2)))
        elif typ in {"heal", "heal_percent"}:
            for ally in allies:
                if ally.dead:
                    continue
                raw = ally.stats["maxHealth"] * effect.get("percent", 0) if typ == "heal_percent" else amount
                healed = min(raw, ally.stats["maxHealth"] - ally.hp)
                ally.hp += healed
                source.healing_done += healed
                self._emit_locked({"type": "heal", "sourceId": source.id, "targetId": ally.id, "amount": round(healed, 1), "abilityId": ability["id"]})
        elif typ == "hot":
            for ally in allies:
                if ally.dead:
                    continue
                ally.hots = [h for h in ally.hots if not (h["sourceId"] == source.id and h["abilityId"] == ability["id"])]
                ally.hots.append({"sourceId": source.id, "abilityId": ability["id"], "amount": amount, "nextTick": time.monotonic() + effect.get("tickInterval", 1), "endAt": time.monotonic() + effect.get("duration", 4), "tickInterval": effect.get("tickInterval", 1)})
                self._status_locked(source, ally, ability["id"], "buff", effect.get("duration", 4))
        elif typ == "revive" and target and target.team == source.team and target.dead:
            target.dead = False
            target.hp = max(1, min(target.stats["maxHealth"], amount or target.stats["maxHealth"] * 0.35))
            target.resource = min(target.stats["maxResource"], target.stats["maxResource"] * 0.25)
            source.revives += 1
            self._emit_locked({"type": "revive", "sourceId": source.id, "targetId": target.id, "amount": round(target.hp, 1), "abilityId": ability["id"]})
        elif typ == "shield":
            for ally in allies:
                ally.shield = max(ally.shield, amount)
                ally.shield_until = max(ally.shield_until, time.monotonic() + effect.get("duration", 6))
                self._status_locked(source, ally, ability["id"], "buff", effect.get("duration", 6))
        elif typ == "stat_buff":
            for ally in allies:
                stat = effect.get("stat")
                if not stat:
                    continue
                previous = ally.stats.get(stat, 0)
                ally.stats[stat] = previous * effect.get("multiplier", 1) + effect.get("add", 0)
                ally.stat_buffs.append({"stat": stat, "previous": previous, "endAt": time.monotonic() + effect.get("duration", 4), "abilityId": ability["id"]})
                self._status_locked(source, ally, ability["id"], "buff", effect.get("duration", 4))
        elif typ == "auto_haste":
            previous = source.stats.get("autoAttackInterval", 1.5)
            source.stats["autoAttackInterval"] = previous / max(1, effect.get("multiplier", 1))
            source.auto_attack_at = min(source.auto_attack_at, time.monotonic() + source.stats["autoAttackInterval"])
            source.stat_buffs.append({"stat": "autoAttackInterval", "previous": previous, "endAt": time.monotonic() + effect.get("duration", 3), "abilityId": ability["id"]})
            self._status_locked(source, source, ability["id"], "buff", effect.get("duration", 3))
        elif typ == "resource":
            source.resource = min(source.stats.get("maxResource", 100), source.resource + amount)
        elif typ == "immobilize":
            source.input = {}
            source.stun_until = max(source.stun_until, time.monotonic() + effect.get("duration", 4))
            self._status_locked(source, source, ability["id"], "buff", effect.get("duration", 4))
        elif typ == "stealth":
            duration = effect.get("duration", 5)
            source.stealth_until = max(source.stealth_until, time.monotonic() + duration)
            source.target_id = None
            for opponent in self.players.values():
                if self._is_enemy_locked(source, opponent) and opponent.target_id == source.id:
                    opponent.target_id = None
            self._status_locked(source, source, ability["id"], "buff", duration)
        elif typ == "shapeshift":
            for stat, previous in source.shapeshift_previous.items():
                source.stats[stat] = previous
            source.shapeshift_previous.clear()
            requested_form = effect.get("form")
            source.shapeshift_form = None if source.shapeshift_form == requested_form else requested_form
            if source.shapeshift_form:
                for stat, multiplier in effect.get("statMultipliers", {}).items():
                    source.shapeshift_previous[stat] = source.stats.get(stat, 0)
                    source.stats[stat] = source.stats.get(stat, 0) * multiplier
                for stat, add in effect.get("statAdds", {}).items():
                    if stat not in source.shapeshift_previous:
                        source.shapeshift_previous[stat] = source.stats.get(stat, 0)
                    source.stats[stat] = source.stats.get(stat, 0) + add
                self._status_locked(source, source, ability["id"], "buff", 86400)
        elif typ in {"aura_damage", "ground_aoe", "ground_impact", "trap", "totem"}:
            x = float(ground.get("x", source.x)) if ground else source.x
            z = float(ground.get("z", source.z)) if ground else source.z
            self._effect_seq += 1
            duration = effect.get("duration", 0.2 if typ == "ground_impact" else 5)
            self.ground_effects.append({"id": f"pvp_effect_{self._effect_seq}", "type": effect.get("groundEffectType", typ), "sourceId": source.id, "abilityId": ability["id"], "x": x, "y": self._surface_height_locked(x, z, source.y), "z": z, "radius": effect.get("radius", 3), "amount": amount, "school": effect.get("school", "physical"), "friendly": typ == "totem" and effect.get("totemType") == "healing", "oneShot": typ in {"trap", "ground_impact"}, "totem": typ == "totem", "slowPercent": effect.get("slowPercent", 0), "slowDuration": effect.get("slowDuration", 1.5), "stunDuration": effect.get("stunDuration", 0), "nextTick": time.monotonic(), "tickInterval": effect.get("tickInterval", 0.75), "expiresAt": time.monotonic() + duration})
        elif typ == "knockback":
            for victim in enemies:
                dx, dz = victim.x - source.x, victim.z - source.z
                length = math.hypot(dx, dz) or 1
                victim.x += dx / length * effect.get("distance", 4)
                victim.z += dz / length * effect.get("distance", 4)
                self._resolve_arena_position_locked(victim, 0.1)
        elif typ == "pull_ally" and target and target.team == source.team:
            target.x, target.z, target.y = source.x, source.z, source.y
        elif typ == "disengage":
            source.x -= math.sin(source.facing) * effect.get("distance", 6)
            source.z -= math.cos(source.facing) * effect.get("distance", 6)
            self._resolve_arena_position_locked(source, 0.1)

    def _enemy_effect_targets_locked(self, source: PvPPlayer, target: PvPPlayer | None, radius: float) -> list[PvPPlayer]:
        if radius:
            center = target or source
            return [p for p in self.players.values() if self._is_enemy_locked(source, p) and not p.dead and self._distance(center, p) <= radius and self._has_los_locked(center, p)]
        return [target] if target and self._is_enemy_locked(source, target) and not target.dead else []

    def _ally_effect_targets_locked(self, source: PvPPlayer, target: PvPPlayer | None, radius: float) -> list[PvPPlayer]:
        center = target or source
        if radius:
            return [p for p in self.players.values() if p.team == source.team and not p.spectator and self._distance(center, p) <= radius and self._has_los_locked(center, p)]
        return [center] if center.team == source.team else [source]

    def _damage_locked(self, source: PvPPlayer, target: PvPPlayer, raw: float, school: str, ability_id: str) -> None:
        if not self._is_enemy_locked(source, target) or target.dead:
            return
        mitigation = target.stats.get("armor" if school == "physical" else "resistance", 0)
        critical = random.random() < source.stats.get("critChance", 0)
        damage = raw * (source.stats.get("critMultiplier", 1.5) if critical else 1) * 100 / (100 + mitigation) * PVP_DAMAGE_MULTIPLIER
        absorbed = min(target.shield, damage)
        target.shield -= absorbed
        damage -= absorbed
        target.hp = max(0, target.hp - damage)
        source.damage_dealt += damage
        target.damage_taken += damage
        source.stealth_until = 0
        if source.class_id == "warrior":
            source.resource = min(source.stats.get("maxResource", 100), source.resource + damage * 0.2 + 3)
        self._emit_locked({"type": "damage", "sourceId": source.id, "targetId": target.id, "amount": round(damage, 1), "school": school, "abilityId": ability_id, "critical": critical})
        if target.hp <= 0:
            target.dead = True
            target.input = {}
            target.casting = None
            target.deaths += 1
            source.kills += 1
            self._emit_locked({"type": "death", "sourceId": source.id, "targetId": target.id})

    def _tick_periodics_locked(self, player: PvPPlayer, now: float) -> None:
        for dot in list(player.dots):
            if now >= dot["endAt"]:
                player.dots.remove(dot)
            elif now >= dot["nextTick"]:
                source = self.players.get(dot["sourceId"])
                if source and not source.dead:
                    self._damage_locked(source, player, dot["amount"], dot["school"], dot["abilityId"])
                dot["nextTick"] = now + dot["tickInterval"]
        for hot in list(player.hots):
            if now >= hot["endAt"]:
                player.hots.remove(hot)
            elif now >= hot["nextTick"]:
                source = self.players.get(hot["sourceId"])
                if source and not source.dead and source.team == player.team:
                    healed = min(hot["amount"], player.stats["maxHealth"] - player.hp)
                    player.hp += healed
                    source.healing_done += healed
                    self._emit_locked({"type": "heal", "sourceId": source.id, "targetId": player.id, "amount": round(healed, 1), "abilityId": hot["abilityId"]})
                hot["nextTick"] = now + hot["tickInterval"]

    def _tick_ground_effects_locked(self, now: float) -> None:
        for effect in list(self.ground_effects):
            if now >= effect["expiresAt"]:
                self.ground_effects.remove(effect)
                continue
            if now < effect["nextTick"]:
                continue
            source = self.players.get(effect["sourceId"])
            if source:
                candidates = [p for p in self.players.values() if not p.dead and abs(p.y - effect["y"]) < 2.2 and math.hypot(p.x - effect["x"], p.z - effect["z"]) <= effect["radius"]]
                candidates = [p for p in candidates if (p.team == source.team) == bool(effect["friendly"])]
                if effect.get("totem") and candidates:
                    candidates = [min(candidates, key=lambda p: p.hp / max(1, p.stats["maxHealth"]))] if effect["friendly"] else [min(candidates, key=lambda p: math.hypot(p.x - effect["x"], p.z - effect["z"]))]
                for target in candidates:
                    if effect["friendly"]:
                        healed = min(effect["amount"], target.stats["maxHealth"] - target.hp)
                        target.hp += healed
                        source.healing_done += healed
                    else:
                        self._damage_locked(source, target, effect["amount"], effect["school"], effect["abilityId"])
                        if effect.get("slowPercent"):
                            target.slow_percent = max(target.slow_percent, effect["slowPercent"])
                            target.slow_until = max(target.slow_until, now + effect["slowDuration"])
                        if effect.get("stunDuration"):
                            target.stun_until = max(target.stun_until, now + min(4, effect["stunDuration"]))
                            target.casting = None
                if effect.get("oneShot") and candidates:
                    self.ground_effects.remove(effect)
                    continue
            effect["nextTick"] = now + effect["tickInterval"]

    def _expire_buffs_locked(self, player: PvPPlayer, now: float) -> None:
        for buff in list(player.stat_buffs):
            if now >= buff["endAt"]:
                player.stats[buff["stat"]] = buff["previous"]
                player.stat_buffs.remove(buff)
        player.active_effects = [e for e in player.active_effects if now < e["endAt"]]

    def _status_locked(self, source: PvPPlayer, target: PvPPlayer, ability_id: str, kind: str, duration: float) -> None:
        target.active_effects = [e for e in target.active_effects if not (e["sourceId"] == source.id and e["abilityId"] == ability_id)]
        target.active_effects.append({"sourceId": source.id, "abilityId": ability_id, "kind": kind, "endAt": time.monotonic() + duration})
        self._emit_locked({"type": "status", "sourceId": source.id, "targetId": target.id, "abilityId": ability_id, "status": kind, "duration": duration})

    def _check_winner_locked(self) -> None:
        for team in ("blue", "red"):
            members = [p for p in self.players.values() if p.team == team and not p.spectator and p.disconnected_at is None]
            if members and all(p.dead for p in members):
                self.match_state = "victory"
                self.winner = "red" if team == "blue" else "blue"
                self.gates_open_at = None
                self._emit_locked({"type": "match_end", "winner": self.winner})
                return

    @staticmethod
    def _is_enemy_locked(a: PvPPlayer, b: PvPPlayer) -> bool:
        return bool(a.team and b.team and a.team != b.team and not b.spectator)

    @staticmethod
    def _distance(a: PvPPlayer, b: PvPPlayer) -> float:
        return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)

    @staticmethod
    def _has_los_locked(a: PvPPlayer, b: PvPPlayer) -> bool:
        # The bridge deck separates upper and lower combat. Its open sides remain usable.
        if (a.y > 3.5) != (b.y > 3.5):
            for step in range(1, 20):
                t = step / 20
                x = a.x + (b.x - a.x) * t
                y = a.y + (b.y - a.y) * t
                z = a.z + (b.z - a.z) * t
                if abs(x) <= 18 and abs(z) <= 4 and 4.4 <= y <= 5.2:
                    return False
        if a.y < 4 and b.y < 4:
            for px in (-8.0, 8.0):
                dx, dz = b.x - a.x, b.z - a.z
                length_sq = dx * dx + dz * dz
                if length_sq <= 0:
                    continue
                t = max(0, min(1, ((px - a.x) * dx + (0 - a.z) * dz) / length_sq))
                if math.hypot(a.x + dx * t - px, a.z + dz * t) < 2.0:
                    return False
        return True

    async def snapshot(self, player_id: str | None = None, include_static: bool = True) -> dict[str, Any]:
        async with self._lock:
            return self._snapshot_locked(player_id, include_static)

    def _snapshot_locked(self, player_id: str | None = None, include_static: bool = True) -> dict[str, Any]:
        now = time.monotonic()
        snapshot = {
            "type": "pvp_state_snapshot",
            "you": player_id,
            "reconnectToken": self.players[player_id].reconnect_token if player_id in self.players else None,
            "matchState": self.match_state,
            "countdown": max(0, round((self.countdown_until or now) - now, 1)) if self.countdown_until else None,
            "preparation": max(0, round((self.gates_open_at or now) - now, 1)) if self.gates_open_at and now < self.gates_open_at else 0,
            "winner": self.winner,
            "selectedArena": self.selected_arena,
            "maxTeamSize": MAX_TEAM_SIZE,
            "buildPoints": BUILD_POINTS,
            "players": {pid: self._player_dict_locked(p, now) for pid, p in self.players.items()},
            "groundEffects": [{**e, "remaining": max(0, round(e["expiresAt"] - now, 1))} for e in self.ground_effects],
            "events": self.events[-30:],
        }
        if include_static:
            snapshot["attributes"] = PVP_ATTRIBUTES
            snapshot["classes"] = self.classes
            snapshot["abilities"] = self.abilities
            snapshot["arena"] = self._arena_dict()
        return snapshot

    def _player_dict_locked(self, p: PvPPlayer, now: float) -> dict[str, Any]:
        return {
            "id": p.id, "name": p.name, "team": p.team, "classId": p.class_id, "ready": p.ready,
            "spectator": p.spectator, "disconnected": p.disconnected_at is not None, "build": p.build,
            "stats": p.stats, "abilities": p.abilities, "abilitySlots": p.ability_slots,
            "position": {"x": round(p.x, 2), "y": round(p.y, 2), "z": round(p.z, 2)}, "facing": round(p.facing, 2),
            "hp": round(p.hp, 1), "maxHealth": round(p.stats.get("maxHealth", 1), 1),
            "resource": round(p.resource, 1), "maxResource": round(p.stats.get("maxResource", 100), 1),
            "resourceType": self.classes.get(p.class_id or "", {}).get("resourceType"), "dead": p.dead,
            "targetId": p.target_id, "allyTargetId": p.ally_target_id, "shield": round(p.shield, 1),
            "cooldowns": {aid: max(0, round(end - now, 1)) for aid, end in p.cooldowns.items()},
            "globalCooldown": max(0, round(p.global_cooldown_until - now, 1)),
            "casting": None if not p.casting else {"abilityId": p.casting["abilityId"], "remaining": max(0, round(p.casting["endAt"] - now, 2)), "duration": p.casting["duration"]},
            "stunned": now < p.stun_until, "slowed": now < p.slow_until,
            "jumping": now < p.jump_until,
            "jumpProgress": max(0, min(1, 1 - max(0, p.jump_until - now) / 0.36)) if now < p.jump_until else 0,
            "stealthed": now < p.stealth_until, "form": p.shapeshift_form,
            "activeEffects": [{**e, "remaining": max(0, round(e["endAt"] - now, 1))} for e in p.active_effects],
            "statsSummary": {"damage": round(p.damage_dealt, 1), "healing": round(p.healing_done, 1), "kills": p.kills, "deaths": p.deaths, "revives": p.revives},
        }

    @staticmethod
    def _arena_dict() -> dict[str, Any]:
        return {
            "id": "blade_ridge", "name": "Blade Gorge",
            "bounds": {"minX": -29, "maxX": 29, "minZ": -17, "maxZ": 17},
            "bridge": {"x": 0, "z": 0, "width": 36, "depth": 8, "height": 5},
            "pillars": [{"x": -8, "z": 0, "radius": 2}, {"x": 8, "z": 0, "radius": 2}],
            "ramps": [
                {"x": -22, "z": 0, "width": 8, "depth": 8, "rotation": 0}, {"x": 22, "z": 0, "width": 8, "depth": 8, "rotation": 0},
                {"x": -7, "z": -8.5, "width": 4.6, "depth": 9, "rotation": 0}, {"x": -7, "z": 8.5, "width": 4.6, "depth": 9, "rotation": 0},
                {"x": 7, "z": -8.5, "width": 4.6, "depth": 9, "rotation": 0}, {"x": 7, "z": 8.5, "width": 4.6, "depth": 9, "rotation": 0},
            ],
        }

    async def debug_action(self, action: str, payload: dict[str, Any]) -> dict[str, Any]:
        async with self._lock:
            if action == "reset_match":
                self.players.clear(); self.match_state = "lobby"; self.countdown_until = None; self.gates_open_at = None; self.winner = None; self.events.clear(); self.ground_effects.clear()
            elif action == "add_bot":
                player = self._add_bot_locked(payload.get("team", "blue"), payload.get("classId", "warrior"), payload.get("name", "Training Bot"), bool(payload.get("ready", False)))
                return {"ok": True, "playerId": player.id}
            elif action == "start_match":
                for p in self.players.values(): p.ready = self._valid_build_locked(p)
                self._start_match_locked()
                self.gates_open_at = 0
            elif action == "set_player_hp":
                player = self.players[payload["playerId"]]
                player.hp = max(0, float(payload["hp"])); player.dead = player.hp <= 0
            elif action == "set_target":
                self._select_target_locked(self.players[payload["playerId"]], payload["targetId"])
            elif action == "cast_ability":
                self._cast_locked(self.players[payload["playerId"]], int(payload.get("slot", 1)), payload.get("groundPosition"))
            elif action == "place_player":
                p = self.players[payload["playerId"]]; p.x = float(payload.get("x", p.x)); p.y = float(payload.get("y", p.y)); p.z = float(payload.get("z", p.z))
            self._check_winner_locked()
            return {"ok": True}

    def _add_bot_locked(self, team: str, class_id: str, name: str, ready: bool) -> PvPPlayer:
        player = self.add_player_locked()
        player.name = name[:18]
        player.team = team if team in {"blue", "red"} else "red"
        player.class_id = class_id if class_id in self.classes else "warrior"
        spells = [aid for aid, ability in self.abilities.items() if ability.get("classId") == player.class_id][:BUILD_POINTS]
        player.build = [f"spell:{aid}" for aid in spells]
        while len(player.build) < BUILD_POINTS:
            player.build.append("stat:max_health")
        player.is_bot = True
        self._preview_stats_locked(player)
        player.ready = ready
        self._update_countdown_locked()
        return player

    def _emit_locked(self, event: dict[str, Any]) -> None:
        self._event_seq += 1
        self.events.append({"id": self._event_seq, **event})
        self.events = self.events[-60:]


pvp_game = PvPGame()
