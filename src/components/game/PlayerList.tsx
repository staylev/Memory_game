"use client";

interface Player {
  userId: string;
  isActive: boolean;
  name?: string;
}

interface PlayerListProps {
  players: Player[];
  currentUserId?: string;
}

export function PlayerList({ players, currentUserId }: PlayerListProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">Игроки ({players.length})</h3>
      <div className="space-y-1">
        {players.map((player) => (
          <div
            key={player.userId}
            className={`flex items-center justify-between p-2 rounded-lg ${
              player.userId === currentUserId ? "bg-blue-100" : "bg-gray-100"
            } ${!player.isActive ? "opacity-50 line-through" : ""}`}
          >
            <span>
              {player.name || player.userId.slice(0, 8)}
              {player.userId === currentUserId && " (вы)"}
            </span>
            <span
              className={`text-sm px-2 py-1 rounded ${
                player.isActive ? "bg-green-500 text-white" : "bg-red-500 text-white"
              }`}
            >
              {player.isActive ? "активен" : "выбыл"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}