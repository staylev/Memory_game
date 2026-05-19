"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

interface GameRecord {
  id: string;
  roomId: string;
  totalRounds: number | null;
  finishedAt: Date | null;
  isWinner: boolean;
  isBotGame: boolean;
  winnerId: string | null;
  mode: "bot" | "multiplayer";
}

export default function HistoryPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Получаем историю игр
  const historyQuery = trpc.game.getGameHistory.useQuery(undefined, {
    enabled: isLoggedIn,
    retry: false,
  });

  // Проверка сессии
  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) {
          setIsLoggedIn(true);
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Card className="text-center p-8">
          <p>Загрузка...</p>
        </Card>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="text-center p-8">
          <h1 className="text-2xl font-bold mb-4">История игр</h1>
          <p className="text-gray-600 mb-4">Войдите, чтобы увидеть историю игр</p>
          <Button onClick={() => router.push("/")}>На главную</Button>
        </Card>
      </div>
    );
  }

  if (historyQuery.error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="text-center p-8">
          <h1 className="text-2xl font-bold mb-4">Ошибка</h1>
          <p className="text-red-600 mb-4">
            {historyQuery.error.message}
          </p>
          <Button onClick={() => router.push("/")}>На главную</Button>
        </Card>
      </div>
    );
  }

  const games = historyQuery.data || [];

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">📜 История игр</h1>
          <Button onClick={() => router.push("/")} variant="secondary">
            ← На главную
          </Button>
        </div>

        {games.length === 0 ? (
          <Card className="text-center p-12">
            <p className="text-gray-500 text-lg">
              У вас пока нет сыгранных игр
            </p>
            <Button
              onClick={() => router.push("/")}
              className="mt-4"
            >
              Начать игру
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {games.map((game) => (
              <Card
                key={game.id}
                className={`
                  p-6 transition-all hover:shadow-lg
                  ${game.isWinner ? "border-2 border-green-400 bg-green-50" : ""}
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {game.isWinner ? "🏆" : game.isBotGame ? "🤖" : "🎮"}
                      </span>
                      <div>
                        <h3 className="text-xl font-bold">
                          {game.isWinner ? "Победа!" : game.isBotGame ? "Игра с ботом" : "Мультиплеер"}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Комната: {game.roomId}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="px-3 py-1 bg-gray-200 rounded-full">
                        {game.mode === "bot" ? "🤖 Бот" : "👥 Мультиплеер"}
                      </span>
                      <span>
                        Раундов: <strong>{game.totalRounds}</strong>
                      </span>
                      {game.winnerId && game.mode !== "bot" && (
                        <span>
                          Победитель: <strong>{game.winnerId.slice(0, 8)}</strong>
                        </span>
                      )}
                    </div>

                    {game.finishedAt && (
                      <p className="text-xs text-gray-400">
                        {new Date(game.finishedAt).toLocaleString("ru-RU", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    {game.isWinner ? (
                      <span className="text-green-600 font-bold text-lg">
                        ✓ Вы выиграли
                      </span>
                    ) : game.isBotGame ? (
                      <span className="text-gray-500">
                        Раундов: {game.totalRounds}
                      </span>
                    ) : (
                      <span className="text-red-500 font-medium">
                        Не победили
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Статистика */}
        {games.length > 0 && (
          <Card className="p-6 bg-blue-50">
            <h2 className="text-xl font-bold mb-4">📊 Статистика</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">
                  {games.length}
                </p>
                <p className="text-sm text-gray-600">Всего игр</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">
                  {games.filter((g) => g.isWinner).length}
                </p>
                <p className="text-sm text-gray-600">Побед</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">
                  {games.filter((g) => g.mode === "bot").length}
                </p>
                <p className="text-sm text-gray-600">Игр с ботом</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-orange-600">
                  {games.filter((g) => g.mode === "multiplayer").length}
                </p>
                <p className="text-sm text-gray-600">Мультиплеер</p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
