import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .game import game


clients: dict[str, WebSocket] = {}


async def game_loop() -> None:
    while True:
        await game.tick()
        await broadcast()
        await asyncio.sleep(0.05)


async def broadcast() -> None:
    for player_id, ws in list(clients.items()):
        try:
            await ws.send_json(await game.snapshot(player_id))
        except Exception:
            clients.pop(player_id, None)


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
    try:
        player = await game.add_player()
    except ValueError:
        await ws.close(code=1008)
        return
    clients[player.id] = ws
    await ws.send_json(await game.snapshot(player.id))
    try:
        while True:
            msg = await ws.receive_json()
            await game.handle_message(player.id, msg)
    except WebSocketDisconnect:
        pass
    finally:
        clients.pop(player.id, None)
        await game.remove_player(player.id)
