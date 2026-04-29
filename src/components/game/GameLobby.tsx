"use client";

import { Button } from "@/components/ui/Button";
import { PlayerList } from "./PlayerList";

interface GameLobbyProps {
  roomId: string;
  players: Array<{ userId: string; isActive: boolean; name?: string }>;
  currentUserId: string;
  isCreator: boolean;
  onStartGame: () => void;
  onCopyLink: () => void;
}

export function GameLobby({
  roomId,
  players,
  currentUserId,
  isCreator,
  onStartGame,
  onCopyLink,
}: GameLobbyProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Игровая комната</h1>
        <p className="text-gray-600">
          Код комнаты: <span className="font-mono font-bold text-xl">{roomId}</span>
        </p>
        <Button onClick={onCopyLink} variant="secondary" className="mt-2">
          Скопировать ссылку
        </Button>
      </div>

      <PlayerList players={players} currentUserId={currentUserId} />

      <div className="text-center">
        {isCreator ? (
          <Button
            onClick={onStartGame}
            disabled={players.length < 2}
            variant="primary"
          >
            {players.length < 2 ? "Нужно минимум 2 игрока" : "Начать игру"}
          </Button>
        ) : (
          <p className="text-gray-500">Ожидание начала игры...</p>
        )}
      </div>
    </div>
  );
}