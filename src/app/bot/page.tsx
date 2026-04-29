"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { GameBoard } from "@/components/game/GameBoard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type GamePhase = "idle" | "demo" | "input" | "correct" | "gameover";

export default function BotGamePage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Игровой state
  const [gamePhase, setGamePhase] = useState<GamePhase>("idle");
  const [sequence, setSequence] = useState<number[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [userInput, setUserInput] = useState<number[]>([]);
  const [round, setRound] = useState(1);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  // tRPC
  const createBotRoom = trpc.game.createBotRoom.useMutation();
  const playBotRound = trpc.game.playBotRound.useMutation();

  // Проверка сессии
  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) {
          setIsLoggedIn(true);
          setUserId(data.user.id);
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  // Создать игру с ботом
  const handleStartGame = async () => {
    if (!userId) return;
    const result = await createBotRoom.mutateAsync();
    setRoomId(result.roomId);
    setSequence(result.sequence);
    setRound(1);
    setScore(0);
    setUserInput([]);
    startDemo(result.sequence);
  };

  // Демонстрация последовательности
  const startDemo = useCallback(async (seq: number[]) => {
    setGamePhase("demo");
    setCurrentStep(-1);

    // Пауза перед началом
    await new Promise((resolve) => setTimeout(resolve, 500));

    for (let i = 0; i < seq.length; i++) {
      setCurrentStep(i);
      // Показываем цвет
      await new Promise((resolve) => setTimeout(resolve, 900));
      // Пауза между цветами
      setCurrentStep(-1);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setCurrentStep(-1);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setGamePhase("input");
    setUserInput([]);
  }, []);

  // Обработка клика
  const handleCellClick = async (cellIndex: number) => {
    if (gamePhase !== "input" || !roomId) return;

    const newInput = [...userInput, cellIndex];
    setUserInput(newInput);

    // Проверяем промежуточный результат
    if (newInput[newInput.length - 1] !== sequence[newInput.length - 1]) {
      // Ошибка!
      const result = await playBotRound.mutateAsync({
        roomId,
        sequence: newInput,
      });
      setScore(result.rounds || round);
      setGamePhase("gameover");
      return;
    }

    // Если ввёл всю последовательность правильно
    if (newInput.length === sequence.length) {
      setGamePhase("correct");
      setScore(round);

      const result = await playBotRound.mutateAsync({
        roomId,
        sequence: newInput,
      });

      if (result.correct && result.sequence) {
        setRound(result.round);
        setSequence(result.sequence);
        await new Promise((resolve) => setTimeout(resolve, 800));
        startDemo(result.sequence);
      }
    }
  };

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
          <h1 className="text-2xl font-bold mb-4">Memory Game — Бот</h1>
          <p className="text-gray-600 mb-4">Войдите, чтобы играть с ботом</p>
          <Button onClick={() => router.push("/")}>На главную</Button>
        </Card>
      </div>
    );
  }

  // Экран начала игры
  if (gamePhase === "idle") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="text-center p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold mb-2">🤖 Игра с ботом</h1>
          <p className="text-gray-600 mb-6">
            Запоминай последовательность цветов и повторяй её. С каждым раундом
            последовательность удлиняется!
          </p>
          <div className="space-y-4">
            <Button onClick={handleStartGame} className="w-full text-lg py-3">
              Начать игру
            </Button>
            <Button
              onClick={() => router.push("/")}
              variant="secondary"
              className="w-full"
            >
              ← На главную
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Демонстрация
  if (gamePhase === "demo") {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Запомни последовательность!</h2>
          <p className="text-gray-600 mt-2">Раунд {round}</p>
        </div>
        <GameBoard
          onCellClick={() => {}}
          disabled={true}
          highlightIndex={
            currentStep >= 0 && currentStep < sequence.length
              ? sequence[currentStep]
              : null
          }
        />
        <p className="text-gray-500">
          {currentStep >= sequence.length
            ? "Твоя очередь!"
            : `Запоминай... ${currentStep + 1} / ${sequence.length}`}
        </p>
      </div>
    );
  }

  // Ввод
  if (gamePhase === "input") {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Повтори последовательность!</h2>
          <p className="text-gray-600 mt-2">Раунд {round}</p>
        </div>
        <GameBoard
          onCellClick={handleCellClick}
          disabled={false}
        />
        <p className="text-gray-500">
          Введено: {userInput.length} / {sequence.length}
        </p>
      </div>
    );
  }

  // Правильный ответ (переход)
  if (gamePhase === "correct") {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <Card className="text-center p-8">
          <h2 className="text-2xl font-bold text-green-600 mb-2">
            ✅ Правильно!
          </h2>
          <p className="text-gray-600">Раунд {round} пройден</p>
          <p className="text-gray-500 mt-2">Следующий раунд...</p>
        </Card>
      </div>
    );
  }

  // Конец игры
  if (gamePhase === "gameover") {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <Card className="text-center p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold mb-2">😞 Игра окончена</h1>
          <p className="text-gray-600 mb-2">
            Ты запомнил последовательность из <strong>{score}</strong> цветов
          </p>
          <p className="text-gray-500 mb-6">
            {score <= 3 && "Попробуй ещё, у тебя получится лучше!"}
            {score > 3 && score <= 6 && "Неплохой результат!"}
            {score > 6 && score <= 10 && "Отличная память!"}
            {score > 10 && "Впечатляющий результат! 🧠"}
          </p>
          <div className="space-y-3">
            <Button onClick={handleStartGame} className="w-full">
              Играть снова
            </Button>
            <Button
              onClick={() => router.push("/")}
              variant="secondary"
              className="w-full"
            >
              На главную
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return null;
}
