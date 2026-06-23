import asyncio
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .game import game


clients: dict[str, WebSocket] = {}
client_versions: dict[str, int] = {}
client_map_revisions: dict[str, int] = {}
client_static_sent_at: dict[str, float] = {}
SIMULATION_INTERVAL = 0.05
BROADCAST_INTERVAL = 1 / 15
STATIC_REFRESH_INTERVAL = 2.0


async def game_loop() -> None:
    last_broadcast = 0.0
    while True:
        await game.tick()
        now = time.monotonic()
        if now - last_broadcast >= BROADCAST_INTERVAL:
            await broadcast(now)
            last_broadcast = now
        await asyncio.sleep(SIMULATION_INTERVAL)


async def broadcast(now: float) -> None:
    async def send_snapshot(player_id: str, ws: WebSocket) -> None:
        try:
            snapshot = await game.snapshot(player_id, include_static=True)
            map_revision = int(snapshot.get("mapRevision", 0))
            last_revision = client_map_revisions.get(player_id)
            include_static = (
                last_revision != map_revision
                or now - client_static_sent_at.get(player_id, 0) >= STATIC_REFRESH_INTERVAL
            )
            if not include_static:
                snapshot.pop("mapObjects", None)
                snapshot.pop("abilities", None)
                snapshot.pop("classes", None)
                snapshot.pop("upgrades", None)
            client_map_revisions[player_id] = map_revision
            client_static_sent_at[player_id] = now
            await ws.send_json(snapshot)
        except Exception:
            if clients.get(player_id) is ws:
                clients.pop(player_id, None)
                client_versions.pop(player_id, None)
                client_map_revisions.pop(player_id, None)
                client_static_sent_at.pop(player_id, None)
                await game.remove_player(player_id)

    await asyncio.gather(*(send_snapshot(player_id, ws) for player_id, ws in list(clients.items())))


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(game_loop())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def test_mode() -> bool:
    return os.getenv("GAME_TEST_MODE", "false").lower() == "true"


@app.get("/debug/state")
async def debug_state():
    if not test_mode():
        raise HTTPException(status_code=404)
    return await game.snapshot()


@app.post("/debug/action")
async def debug_action(body: dict):
    if not test_mode():
        raise HTTPException(status_code=404)
    return await game.debug_action(body.get("action", ""), body.get("payload", {}))


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    player = None
    reconnect_token = ws.query_params.get("token")
    try:
        player = await game.add_player(reconnect_token)
    except ValueError:
        await ws.close(code=1008)
        return
    my_version = client_versions.get(player.id, 0) + 1
    client_versions[player.id] = my_version
    try:
        old_ws = clients.get(player.id)
        if old_ws is not None and old_ws != ws:
            try:
                await old_ws.close()
            except Exception:
                pass
        clients[player.id] = ws
        snapshot = await game.snapshot(player.id)
        client_map_revisions[player.id] = int(snapshot.get("mapRevision", 0))
        client_static_sent_at[player.id] = time.monotonic()
        await ws.send_json(snapshot)
        while True:
            msg = await ws.receive_json()
            await game.handle_message(player.id, msg)
    except WebSocketDisconnect:
        pass
    finally:
        if client_versions.get(player.id) == my_version:
            clients.pop(player.id, None)
            client_versions.pop(player.id, None)
            client_map_revisions.pop(player.id, None)
            client_static_sent_at.pop(player.id, None)
            if player is not None:
                await game.remove_player(player.id)
