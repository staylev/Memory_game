"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type WebSocketMessage = 
  | { type: "joined"; success: boolean }
  | { type: "game_started"; sequence: number[]; round: number }
  | { type: "sequence_demo"; sequence: number[] }
  | { type: "player_ready"; userId: string }
  | { type: "player_finished"; userId: string; correct: boolean; nextPlayerId?: string; order?: string[] }
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
  const messageQueueRef = useRef<Array<{ type: string; data: Record<string, unknown>; retries: number }>>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const WS_URL = "ws://localhost:3001";
  const RECONNECT_DELAY = 2000;
  const roomIdRef = useRef<string | null>(roomId);
  const userIdRef = useRef<string | null>(userId);
  const isConnectingRef = useRef(false);

  roomIdRef.current = roomId;
  userIdRef.current = userId;

  const connect = useCallback(() => {
    const roomId = roomIdRef.current;
    const userId = userIdRef.current;
    
    if (!roomId || !userId) {
      console.log("[WebSocket] Cannot connect: roomId or userId is null");
      return;
    }

    if (isConnectingRef.current) {
      console.log("[WebSocket] Connection already in progress, skipping");
      return;
    }

    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error("[WebSocket] Max reconnect attempts reached");
      return;
    }

    isConnectingRef.current = true;
    reconnectAttemptsRef.current += 1;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
      
    console.log("[WebSocket] Connecting to", WS_URL);
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WebSocket] Connection opened");
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);
      isConnectingRef.current = false;
      
      setTimeout(() => {
        const joinMessage = JSON.stringify({ type: "join", roomId, userId });
        console.log("[WebSocket] Sending join:", joinMessage);
        ws.send(joinMessage);
      }, 100);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        console.log("[WebSocket] Received message:", message);
        setLastMessage(message);
      } catch (err) {
        console.error("[WebSocket] Failed to parse message:", event.data);
      }
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Connection error:", error);
      isConnectingRef.current = false;
      setIsConnected(false);
    };

    ws.onclose = () => {
      console.log("[WebSocket] Connection closed");
      setIsConnected(false);
      wsRef.current = null;
      isConnectingRef.current = false;
      
      if (roomIdRef.current && userIdRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
      }
    };
  }, []);

  useEffect(() => {
    if (roomId && userId) {
      reconnectAttemptsRef.current = 0;
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [roomId, userId, connect]);

  const sendMessage = useCallback((type: string, data: Record<string, unknown> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type, ...data });
      wsRef.current.send(message);
    }
  }, []);

  return { isConnected, lastMessage, sendMessage };
}
