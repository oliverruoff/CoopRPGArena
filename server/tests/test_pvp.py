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
