import asyncio

from app.pvp_game import BUILD_POINTS, PvPGame


def configured_player(game: PvPGame, team: str, class_id: str = "priest"):
    player = game.add_player_locked()
    player.team = team
    player.class_id = class_id
    player.build = ["stat:max_health"] * BUILD_POINTS
    game._preview_stats_locked(player)
    return player


def start_duel(game: PvPGame, blue_class: str = "priest", red_class: str = "warrior"):
    blue = configured_player(game, "blue", blue_class)
    red = configured_player(game, "red", red_class)
    blue.ready = red.ready = True
    assert game._all_ready_locked()
    game._start_match_locked()
    game.gates_open_at = 0
    return blue, red


def test_pvp_requires_two_teams_and_exactly_ten_build_points():
    game = PvPGame()
    blue = configured_player(game, "blue")
    blue.ready = True
    assert not game._all_ready_locked()
    red = configured_player(game, "red")
    red.build.pop()
    red.ready = True
    assert not game._all_ready_locked()
    red.build.append("stat:armor")
    game._preview_stats_locked(red)
    assert game._all_ready_locked()


def test_unassigned_lobby_visitor_does_not_block_ready_teams():
    game = PvPGame()
    blue = configured_player(game, "blue")
    red = configured_player(game, "red", "warrior")
    game.add_player_locked()
    blue.ready = red.ready = True
    assert game._all_ready_locked()


def test_uneven_one_versus_three_is_valid():
    game = PvPGame()
    players = [configured_player(game, "blue")]
    players += [configured_player(game, "red", "warrior") for _ in range(3)]
    for player in players:
        player.ready = True
    assert game._all_ready_locked()


def test_damage_never_hits_a_friendly_player():
    game = PvPGame()
    source, enemy = start_duel(game, "mage", "warrior")
    ally = configured_player(game, "blue", "warrior")
    ally.stats = dict(game.classes["warrior"]["baseStats"])
    ally.hp = ally.stats["maxHealth"]
    source.hp = source.stats["maxHealth"]
    enemy.hp = enemy.stats["maxHealth"]
    ally_before = ally.hp
    game._damage_locked(source, ally, 100, "fire", "test")
    assert ally.hp == ally_before
    game._damage_locked(source, enemy, 100, "fire", "test")
    assert enemy.hp < enemy.stats["maxHealth"]


def test_resurrection_only_works_on_dead_allies():
    game = PvPGame()
    priest, enemy = start_duel(game, "priest", "warrior")
    ally = configured_player(game, "blue", "mage")
    ally.stats = dict(game.classes["mage"]["baseStats"])
    ally.hp = 0
    ally.dead = True
    priest.x = ally.x = 0
    priest.z = ally.z = 10
    ability = game.abilities["priest_resurrection"]
    effect = next(effect for effect in ability["effects"] if effect["type"] == "revive")
    game._apply_effect_locked(priest, ally, ability, effect, None)
    assert not ally.dead
    assert ally.hp > 0
    assert priest.revives == 1
    enemy.hp = 0
    enemy.dead = True
    game._apply_effect_locked(priest, enemy, ability, effect, None)
    assert enemy.dead


def test_bridge_deck_blocks_spells_between_levels_but_not_on_same_level():
    game = PvPGame()
    upper, lower = start_duel(game, "mage", "warrior")
    upper.x = lower.x = 0
    upper.z, lower.z = 0, 1
    upper.y, lower.y = 5, 0
    assert not game._has_los_locked(upper, lower)
    lower.y = 5
    assert game._has_los_locked(upper, lower)


def test_outer_spawn_areas_are_flat_without_end_ramps():
    game = PvPGame()
    for x in (-26, -22, -18, 18, 22, 26):
        assert game._surface_height_locked(x, 0, 0) == 0
    assert len(game._arena_dict()["ramps"]) == 4


def test_central_ramps_block_side_entry_but_allow_climbing_from_bottom():
    game = PvPGame()
    player = configured_player(game, "blue", "warrior")

    player.x, player.z, player.y = -9.5, 7, 0
    player.x = -9.0
    game._resolve_arena_position_locked(player, 0.1, -9.5, 7)
    assert player.x == -9.5
    assert player.y == 0

    player.x, player.z, player.y = -7, 10.2, 0
    player.z = 9.8
    game._resolve_arena_position_locked(player, 0.1, -7, 10.2)
    assert player.z == 9.8
    assert 0 < player.y < 0.25


def test_central_ramps_are_shorter_and_steeper_than_before():
    game = PvPGame()
    assert game._surface_height_locked(-7, 10.1, 0) == 0
    assert game._surface_height_locked(-7, 7, 0) == 2.5
    assert all(ramp["depth"] == 6 for ramp in game._arena_dict()["ramps"])


def test_arena_exposes_the_jagged_playable_boundary():
    game = PvPGame()
    boundary = game._arena_dict()["boundary"]

    assert len(boundary) == 40
    assert max(point["x"] for point in boundary) == 29
    assert max(point["z"] for point in boundary) == 17
    assert len({round(point["x"], 1) for point in boundary if 3 < point["z"] < 6}) > 1


def test_jagged_arena_boundary_blocks_straight_and_notched_edges():
    game = PvPGame()
    player = configured_player(game, "blue", "warrior")

    player.x, player.z = 35, 0
    game._resolve_arena_position_locked(player, 0.1, 28, 0)
    assert game._is_inside_arena_boundary_locked(player.x, player.z)
    assert 28.8 < player.x < 29

    player.x, player.z = 29, 4.6
    game._resolve_arena_position_locked(player, 0.1, 28, 4.6)
    assert game._is_inside_arena_boundary_locked(player.x, player.z)
    assert player.x < 28.9


def test_arena_boundary_leaves_the_regular_interior_untouched():
    game = PvPGame()
    player = configured_player(game, "blue", "warrior")
    player.x, player.z = 24, 12

    game._resolve_arena_position_locked(player, 0.1, 23.5, 12)

    assert (player.x, player.z) == (24, 12)


def test_all_team_spawns_have_clearance_from_the_jagged_boundary():
    game = PvPGame()
    players = [configured_player(game, team, "warrior") for team in ("blue", "red") for _ in range(3)]
    for player in players:
        player.ready = True

    game._start_match_locked()

    assert game.match_state == "running"
    assert all(game._is_inside_arena_boundary_locked(player.x, player.z, clearance=1.5) for player in players)


def test_all_dead_ends_round_but_a_living_priest_can_still_revive():
    game = PvPGame()
    priest, red = start_duel(game, "priest", "warrior")
    blue_ally = configured_player(game, "blue", "mage")
    blue_ally.dead = True
    blue_ally.hp = 0
    game._check_winner_locked()
    assert game.match_state == "running"
    priest.dead = True
    priest.hp = 0
    game._check_winner_locked()
    assert game.match_state == "victory"
    assert game.winner == "red"


def test_pvp_reset_does_not_touch_coop_singleton():
    from app.game import game as coop_game

    original_state = coop_game.match_state
    pvp = PvPGame()
    configured_player(pvp, "blue")
    asyncio.run(pvp.reset())
    assert coop_game.match_state == original_state


def test_dynamic_snapshot_reuses_static_catalogs():
    game = PvPGame()
    player = configured_player(game, "blue", "mage")
    full = asyncio.run(game.snapshot(player.id))
    dynamic = asyncio.run(game.snapshot(player.id, include_static=False))

    assert {"abilities", "attributes", "classes", "arena"} <= full.keys()
    assert not ({"abilities", "attributes", "classes", "arena"} & dynamic.keys())
    assert dynamic["players"][player.id]["classId"] == "mage"


def test_druid_abilities_use_the_same_form_requirements_as_coop():
    game = PvPGame()
    druid, enemy = start_duel(game, "druid", "warrior")
    assert game._ability_form_allowed_locked(druid, game.abilities["druid_moonfire"])
    assert not game._ability_form_allowed_locked(druid, game.abilities["druid_maul"])
    druid.shapeshift_form = "bear"
    assert game._ability_form_allowed_locked(druid, game.abilities["druid_maul"])
    assert not game._ability_form_allowed_locked(druid, game.abilities["druid_moonfire"])


def test_training_bot_completes_the_opposing_team_and_is_ready():
    game = PvPGame()
    human = configured_player(game, "blue", "mage")
    bot = game._add_bot_locked("red", "warrior", "Trainingsbot", True)
    assert bot.is_bot
    assert bot.team == "red"
    assert bot.ready
    assert len(bot.build) == BUILD_POINTS
    human.ready = True
    assert game._all_ready_locked()


def test_adding_training_bot_without_team_assigns_sides_and_ready_starts_countdown():
    game = PvPGame()
    human = game.add_player_locked()
    human.class_id = "mage"
    human.build = ["stat:max_health"] * BUILD_POINTS
    game._preview_stats_locked(human)

    asyncio.run(game.handle_message(human.id, {"type": "add_training_bot", "classId": "warrior"}))
    bots = [player for player in game.players.values() if player.is_bot]
    assert human.team == "blue"
    assert len(bots) == 1
    assert bots[0].team == "red"
    assert bots[0].ready

    asyncio.run(game.handle_message(human.id, {"type": "ready", "ready": True}))
    assert human.ready
    assert game._all_ready_locked()
    assert game.countdown_until is not None


def test_training_bot_can_be_removed_from_lobby():
    game = PvPGame()
    human = configured_player(game, "blue", "mage")
    game._add_bot_locked("red", "warrior", "Trainingsbot", True)
    asyncio.run(game.handle_message(human.id, {"type": "remove_training_bot"}))
    assert all(not player.is_bot for player in game.players.values())
    assert game.countdown_until is None


def test_training_bot_stays_ready_after_returning_to_lobby():
    game = PvPGame()
    human, bot = start_duel(game, "mage", "warrior")
    bot.is_bot = True
    game.match_state = "victory"
    game._restart_lobby_locked()
    assert not human.ready
    assert bot.ready


def test_pvp_jump_uses_the_coop_duration_and_snapshot_progress():
    game = PvPGame()
    human, _ = start_duel(game, "mage", "warrior")
    asyncio.run(game.handle_message(human.id, {"type": "jump"}))
    snapshot = asyncio.run(game.snapshot(human.id))
    assert snapshot["players"][human.id]["jumping"]
    assert 0 <= snapshot["players"][human.id]["jumpProgress"] <= 1


def test_pvp_ability_slots_can_be_swapped_like_coop():
    game = PvPGame()
    mage, _ = start_duel(game, "mage", "warrior")
    mage.abilities = ["mage_fireball", "mage_frostbolt", "mage_frost_nova"]
    mage.ability_slots = {ability_id: index for index, ability_id in enumerate(mage.abilities, start=1)}

    asyncio.run(game.handle_message(mage.id, {"type": "set_ability_slot", "abilityId": "mage_fireball", "slot": 3}))
    assert mage.ability_slots["mage_fireball"] == 3
    assert mage.ability_slots["mage_frost_nova"] == 1

    asyncio.run(game.handle_message(mage.id, {"type": "set_ability_slot", "abilityId": "mage_frostbolt", "slot": 6}))
    assert mage.ability_slots["mage_frostbolt"] == 6
