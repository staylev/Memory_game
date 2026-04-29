import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";

const PORT = 3001;

// Типизация входящих сообщений от клиента
type JoinMessage = { type: "join"; roomId: string; userId: string };
type GameStartedMessage = { type: "game_started"; sequence: number[]; round: number };
type SequenceDemoMessage = { type: "sequence_demo"; sequence: number[] };
type PlayerReadyMessage = { type: "player_ready" };
type PlayerFinishedMessage = { type: "player_finished"; correct: boolean };
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
type PlayerFinishedBroadcast = { type: "player_finished"; userId: string | null; correct: boolean };
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

wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
  const client: Client = { ws, userId: null, roomId: null };
  clients.push(client);

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
          broadcastToRoom(client.roomId, {
            type: "player_finished",
            userId: client.userId,
            correct: message.correct,
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
    const index = clients.findIndex((c) => c.ws === ws);
    if (index !== -1) {
      clients.splice(index, 1);
    }
  });
});

function broadcastToRoom(roomId: string | null, message: BroadcastMessage): void {
  if (!roomId) return;
  
  for (const client of clients) {
    if (client.roomId === roomId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }
}

console.log(`WebSocket server running on ws://localhost:${PORT}`);

export { wss };