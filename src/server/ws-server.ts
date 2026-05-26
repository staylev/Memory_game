import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";

const PORT = 3001;

// Типизация входящих сообщений от клиента
type JoinMessage = { type: "join"; roomId: string; userId: string };
type GameStartedMessage = { type: "game_started"; sequence: number[]; round: number };
type SequenceDemoMessage = { type: "sequence_demo"; sequence: number[] };
type PlayerReadyMessage = { type: "player_ready" };
type PlayerFinishedMessage = { type: "player_finished"; correct: boolean; nextPlayerId?: string };
type PlayerEliminatedMessage = { type: "player_eliminated"; userId: string };
type GameFinishedMessage = { type: "game_finished"; winnerId: string };

type WSMessage = 
  | JoinMessage
  | GameStartedMessage
  | SequenceDemoMessage
  | PlayerReadyMessage
  | PlayerFinishedMessage
  | PlayerEliminatedMessage
  | GameFinishedMessage;

// Типизация исходящих сообщений от сервера
type JoinedMessage = { type: "joined"; success: boolean };
type GameStartedBroadcast = { type: "game_started"; sequence: number[]; round: number };
type SequenceDemoBroadcast = { type: "sequence_demo"; sequence: number[] };
type PlayerReadyBroadcast = { type: "player_ready"; userId: string | null };
type PlayerFinishedBroadcast = { type: "player_finished"; userId: string | null; correct: boolean; nextPlayerId?: string; order?: string[] };
type PlayerEliminatedBroadcast = { type: "player_eliminated"; userId: string };
type GameFinishedBroadcast = { type: "game_finished"; winnerId: string };

type BroadcastMessage = 
  | JoinedMessage
  | GameStartedBroadcast
  | SequenceDemoBroadcast
  | PlayerReadyBroadcast
  | PlayerFinishedBroadcast
  | PlayerEliminatedBroadcast
  | GameFinishedBroadcast;

// Типизация клиента
interface Client {
  ws: WebSocket;
  userId: string | null;
  roomId: string | null;
}

const clients: Client[] = [];

const wss = new WebSocketServer({ port: PORT });

wss.on("error", (error) => {
  console.error("[WS Server] Error:", error.message);
  if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(`[WS Server] Port ${PORT} is already in use. Please kill the process or use a different port.`);
  }
});

wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
  console.log(`[WS] New connection from ${_req.socket.remoteAddress}`);
  const client: Client = { ws, userId: null, roomId: null };
  clients.push(client);

  ws.on("error", (err) => {
    console.error("[WS] Socket error:", err.message);
  });

  ws.on("message", (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString()) as WSMessage;

      switch (message.type) {
        case "join": {
          client.userId = message.userId;
          client.roomId = message.roomId;
          const response: JoinedMessage = { type: "joined", success: true };
          ws.send(JSON.stringify(response));
          break;
        }

        case "game_started": {
          console.log(`[WS] game_started received from userId=${client.userId}, roomId=${client.roomId}`);
          broadcastToRoom(client.roomId, {
            type: "game_started",
            sequence: message.sequence,
            round: message.round,
          });
          break;
        }

        case "sequence_demo": {
          broadcastToRoom(client.roomId, {
            type: "sequence_demo",
            sequence: message.sequence,
          });
          break;
        }

        case "player_ready": {
          broadcastToRoom(client.roomId, {
            type: "player_ready",
            userId: client.userId,
          });
          break;
        }

        case "player_finished": {
          // Соберём всех клиентов в комнате в порядке подключения
          const roomClients = clients.filter(c => c.roomId === client.roomId && c.userId != null && c.ws.readyState === WebSocket.OPEN);
          const activeUserIds = roomClients.map(c => c.userId as string);

          const currentIndex = activeUserIds.indexOf(client.userId || "");
          const nextIndex = activeUserIds.length > 0 ? (currentIndex + 1) % activeUserIds.length : -1;
          const nextPlayerId = nextIndex >= 0 ? activeUserIds[nextIndex] : null;

          broadcastToRoom(client.roomId, {
            type: "player_finished",
            userId: client.userId,
            correct: message.correct,
            nextPlayerId: nextPlayerId ?? undefined,
            order: activeUserIds,
          });
          break;
        }

        case "player_eliminated": {
          broadcastToRoom(client.roomId, {
            type: "player_eliminated",
            userId: message.userId,
          });
          break;
        }

        case "game_finished": {
          broadcastToRoom(client.roomId, {
            type: "game_finished",
            winnerId: message.winnerId,
          });
          break;
        }

        default: {
          const unknownMsg = message as { type: string };
          console.warn("Unknown message type:", unknownMsg.type);
          break;
        }
      }
    } catch (err) {
      console.error("WebSocket error:", err);
    }
  });

  ws.on("close", () => {
    console.log(`[WS] Connection closed, userId=${client.userId}`);
    const index = clients.findIndex((c) => c.ws === ws);
    if (index !== -1) {
      clients.splice(index, 1);
    }
  });

  // Heartbeat для поддержания соединения
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  ws.on("close", () => {
    clearInterval(pingInterval);
  });
});

function broadcastToRoom(roomId: string | null, message: BroadcastMessage): void {
  if (!roomId) {
    console.log(`[WS] broadcastToRoom: roomId is null, skipping`);
    return;
  }
  
  console.log(`[WS] broadcastToRoom(${roomId}): sending message type=${message.type}`);
  console.log(`[WS] Total clients: ${clients.length}`);
  console.log(`[WS] Clients in room ${roomId}:`, clients.filter(c => c.roomId === roomId).map(c => c.userId));
  
  let sentCount = 0;
  for (const client of clients) {
    console.log(`[WS] Checking client: userId=${client.userId}, roomId=${client.roomId}, readyState=${client.ws.readyState}`);
    if (client.roomId === roomId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
      sentCount++;
      console.log(`[WS] Sent to userId=${client.userId}`);
    } else {
      console.log(`[WS] Skipped client: roomId match=${client.roomId === roomId}, readyState=${client.ws.readyState}`);
    }
  }
  console.log(`[WS] broadcastToRoom(${roomId}): sent to ${sentCount} clients`);
}

console.log(`WebSocket server running on ws://localhost:${PORT}`);

export { wss };