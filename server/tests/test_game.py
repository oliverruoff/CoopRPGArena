import asyncio
import math

from app.game import Game


def test_mitigation_reduces_damage():
    assert round(Game._mitigate(100, 100), 2) == 50


def test_lobby_start_and_spawn_enemy():
    asyncio.run(_lobby_start_and_spawn_enemy())


async def _lobby_start_and_spawn_enemy():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    await game.handle_message(p.id, {"type": "ready", "ready": True})
    async with game._lock:
        game._start_match_locked()
    state = await game.snapshot(p.id)
    assert state["matchState"] == "running"
    assert state["players"][p.id]["classId"] == "mage"
    assert state["enemies"]


def test_healing_creates_threat():
    asyncio.run(_healing_creates_threat())


async def _healing_creates_threat():
    game = Game()
    priest = await game.add_player()
    warrior = await game.add_player()
    await game.handle_message(priest.id, {"type": "select_class", "classId": "priest"})
    await game.handle_message(warrior.id, {"type": "select_class", "classId": "warrior"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 3, "z": 0})
        w = game.players[warrior.id]
        w.hp = 40
        pr = game.players[priest.id]
        pr.ally_target_id = warrior.id
        pr.x = 0
        pr.z = 0
        w.x = 1
        w.z = 0
        game._cast_ability_locked(pr, 1)
        assert pr.casting is not None
        pr.casting["endAt"] = 0
        casting = pr.casting
        pr.casting = None
        game._finish_cast_locked(pr, casting["abilityId"], casting["targetId"])
        assert w.hp > 40
        assert enemy.threat[priest.id] > 0


def test_movement_cancels_cast():
    asyncio.run(_movement_cancels_cast())


async def _movement_cancels_cast():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 3, "z": 0})
        m = game.players[mage.id]
        m.x = 0
        m.z = 0
        m.target_id = enemy.id
        game._cast_ability_locked(m, 1)
        assert m.casting is not None
    await game.handle_message(mage.id, {"type": "input", "movement": {"up": True}})
    state = await game.snapshot(mage.id)
    assert state["players"][mage.id]["casting"] is None
    assert state["enemies"][enemy.id]["hp"] == state["enemies"][enemy.id]["maxHealth"]


def test_same_spell_recast_does_not_restart_cast():
    asyncio.run(_same_spell_recast_does_not_restart_cast())


async def _same_spell_recast_does_not_restart_cast():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("goblin", {"x": 3, "z": 0})
        player = game.players[mage.id]
        player.x = 0
        player.z = 0
        player.resource = 100
        player.target_id = enemy.id
        game._cast_ability_locked(player, 1)
        first_end = player.casting["endAt"]
        player.casting["endAt"] -= 0.5
        game._cast_ability_locked(player, 1)
        assert player.casting["endAt"] == first_end - 0.5


def test_duplicate_upgrade_selection_does_not_stack():
    asyncio.run(_duplicate_upgrade_selection_does_not_stack())


async def _duplicate_upgrade_selection_does_not_stack():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        player = game.players[mage.id]
        player.pending_upgrades = game.upgrades[:3]
        before = player.stats["maxHealth"]
        game._choose_upgrade_locked(player, "max_health")
        after_once = player.stats["maxHealth"]
        game._choose_upgrade_locked(player, "max_health")
        game._choose_upgrade_locked(player, "max_health")
        assert after_once > before
        assert player.stats["maxHealth"] == after_once


def test_mage_fireball_dot_and_frostbolt_slow():
    asyncio.run(_mage_fireball_dot_and_frostbolt_slow())


async def _mage_fireball_dot_and_frostbolt_slow():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 3, "z": 0})
        player = game.players[mage.id]
        player.x = 0
        player.z = 0
        player.target_id = enemy.id
        game._finish_cast_locked(player, "mage_fireball", enemy.id)
        assert enemy.dots
        hp_after_fireball = enemy.hp
        enemy.dots[0]["nextTick"] = 0
        game._tick_dots_locked(enemy, 1)
        assert enemy.hp < hp_after_fireball
        player.global_cooldown_until = 0
        player.cooldowns = {}
        game._finish_cast_locked(player, "mage_frostbolt", enemy.id)
        assert enemy.slow_percent > 0
        assert enemy.slow_until > 0


def test_global_cooldown_is_exposed_in_snapshot():
    asyncio.run(_global_cooldown_is_exposed_in_snapshot())


async def _global_cooldown_is_exposed_in_snapshot():
    game = Game()
    warrior = await game.add_player()
    await game.handle_message(warrior.id, {"type": "select_class", "classId": "warrior"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 1, "z": 0})
        player = game.players[warrior.id]
        player.x = 0
        player.z = 0
        player.resource = 100
        player.target_id = enemy.id
        game._cast_ability_locked(player, 1)
    state = await game.snapshot(warrior.id)
    assert state["players"][warrior.id]["globalCooldown"] > 0


def test_casters_can_close_range_auto_attack():
    asyncio.run(_casters_can_close_range_auto_attack())


async def _casters_can_close_range_auto_attack():
    game = Game()
    priest = await game.add_player()
    await game.handle_message(priest.id, {"type": "select_class", "classId": "priest"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 1.2, "z": 0})
        player = game.players[priest.id]
        player.x = 0
        player.z = 0
        player.target_id = enemy.id
        player.auto_attack_at = 0
        before = enemy.hp
        game._tick_players_locked(1, 0)
        assert enemy.hp < before
        assert enemy.alerted
        assert enemy.target_id == player.id


def test_auto_attack_timer_only_resets_when_attack_lands():
    asyncio.run(_auto_attack_timer_only_resets_when_attack_lands())


async def _auto_attack_timer_only_resets_when_attack_lands():
    game = Game()
    warrior = await game.add_player()
    await game.handle_message(warrior.id, {"type": "select_class", "classId": "warrior"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 8, "z": 0})
        player = game.players[warrior.id]
        player.x = 0
        player.z = 0
        player.target_id = enemy.id
        player.auto_attack_at = 0
        game._tick_players_locked(1, 0)
        assert player.auto_attack_at == 0


def test_unalerted_enemies_patrol_to_distant_points():
    asyncio.run(_unalerted_enemies_patrol_to_distant_points())


async def _unalerted_enemies_patrol_to_distant_points():
    game = Game()
    player_ref = await game.add_player()
    await game.handle_message(player_ref.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("goblin", {"x": 18, "z": 0})
        enemy.wander_until = 0
        game._wander_enemy_locked(enemy, 1, 0.1)
        assert math.hypot(enemy.wander_x - enemy.x, enemy.wander_z - enemy.z) > 1.4


def test_walls_block_spell_and_enemy_vision():
    asyncio.run(_walls_block_spell_and_enemy_vision())


async def _walls_block_spell_and_enemy_vision():
    game = Game()
    mage = await game.add_player()
    await game.handle_message(mage.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        game.enemies.clear()
        enemy = game.spawn_enemy_locked("brute", {"x": 0, "z": -4})
        player = game.players[mage.id]
        player.x = 0
        player.z = -8
        player.target_id = enemy.id
        enemy.facing = math.pi
        before = enemy.hp
        game._finish_cast_locked(player, "mage_fireball", enemy.id)
        assert enemy.hp == before
        assert not game._enemy_can_see_locked(enemy, player)


def test_restart_after_defeat_returns_players_to_lobby():
    asyncio.run(_restart_after_defeat_returns_players_to_lobby())


async def _restart_after_defeat_returns_players_to_lobby():
    game = Game()
    p = await game.add_player()
    await game.handle_message(p.id, {"type": "select_class", "classId": "mage"})
    async with game._lock:
        game._start_match_locked()
        player = game.players[p.id]
        player.hp = 0
        player.dead = True
        game._check_end_states_locked()
    await game.handle_message(p.id, {"type": "restart_match"})
    state = await game.snapshot(p.id)
    assert state["matchState"] == "lobby"
    assert state["players"][p.id]["classId"] is None
    assert state["players"][p.id]["ready"] is False
    assert state["enemies"] == {}
