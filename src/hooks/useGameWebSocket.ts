"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type WebSocketMessage = 
  | { type: "joined"; success: boolean }
  | { type: "game_started"; sequence: number[]; round: number }
  | { type: "sequence_demo"; sequence: number[] }
  | { type: "player_ready"; userId: string }
  | { type: "player_finished"; userId: string; correct: boolean }
  | { type: "player_eliminated"; userId: string }
  | { type: "game_finished"; winnerId: string };

interface UseGameWebSocketReturn {
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  sendMessage: (type: string, data?: Record<string, unknown>) => void;
}

export function useGameWebSocket(
  roomId: string | null,
  userId: string | null
): UseGameWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!roomId || !userId) return;

    const ws = new WebSocket("ws://localhost:3001");
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "join", roomId, userId }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as WebSocketMessage;
      setLastMessage(message);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [roomId, userId]);

  const sendMessage = useCallback((type: string, data: Record<string, unknown> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    }
  }, []);

  return { isConnected, lastMessage, sendMessage };
}