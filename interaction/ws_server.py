"""
ws_server.py - WebSocket 服务器（后台线程）

向 Electron 前端推送状态事件和口型同步数据。
消息格式（JSON）：
  {"type": "state", "state": "idle|listening|processing"}
  {"type": "lip_sync", "envelope": [float, ...], "duration_ms": int}
  {"type": "speak_start"}
  {"type": "speak_end"}
"""

import asyncio
import json
import logging
import threading
from typing import Optional

import websockets
from websockets.server import WebSocketServerProtocol

logger = logging.getLogger(__name__)

WS_HOST = "127.0.0.1"
WS_PORT = 8766


class WSServer:
    def __init__(self):
        self._clients: set[WebSocketServerProtocol] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None

    def start(self):
        """在后台线程中启动 WebSocket server。"""
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._serve())

    async def _serve(self):
        async with websockets.serve(self._handler, WS_HOST, WS_PORT):
            logger.info(f"WebSocket server listening on ws://{WS_HOST}:{WS_PORT}")
            await asyncio.Future()  # run forever

    async def _handler(self, ws: WebSocketServerProtocol):
        self._clients.add(ws)
        logger.info(f"Electron connected ({len(self._clients)} clients)")
        try:
            async for _ in ws:
                pass  # 不处理来自 Electron 的消息
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self._clients.discard(ws)
            logger.info(f"Electron disconnected ({len(self._clients)} clients)")

    def send(self, message: dict):
        """线程安全地向所有已连接客户端广播消息。"""
        if not self._loop or not self._clients:
            return
        data = json.dumps(message, ensure_ascii=False)
        asyncio.run_coroutine_threadsafe(self._broadcast(data), self._loop)

    async def _broadcast(self, data: str):
        dead = set()
        for ws in self._clients:
            try:
                await ws.send(data)
            except Exception:
                dead.add(ws)
        self._clients -= dead


# 全局单例
_server: Optional[WSServer] = None


def get_server() -> WSServer:
    global _server
    if _server is None:
        _server = WSServer()
    return _server
