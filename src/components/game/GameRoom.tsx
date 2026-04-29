"use client";

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { GameBoard } from "./GameBoard";
import { PlayerList } from "./PlayerList";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface GameRoomProps {
  roomId: string;
  userId: string;
  userName?: string;
}

type GamePhase = "lobby" | "demo" | "input" | "finished";

export function GameRoom({ roomId, userId, userName }: GameRoomProps) {
  const [gamePhase, setGamePhase] = useState<GamePhase>("lobby");
  const [sequence, setSequence] = useState<number[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [userInput, setUserInput] = useState<number[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
 

  // tRPC запросы
  const getRoomQuery = trpc.game.getRoom.useQuery({ roomId }, { refetchInterval: 2000 });
  const startGameMutation = trpc.game.startGame.useMutation();
  const submitAnswerMutation = trpc.game.submitAnswer.useMutation();

  // WebSocket
  const { lastMessage, sendMessage } = useGameWebSocket(roomId, userId);

  // Получаем данные комнаты
  const roomData = getRoomQuery.data;
  const players = roomData?.players || [];
  
  // Определяем создателя (при загрузке)
 const isCreator = roomData?.room?.creatorId === userId;

  // Демонстрация последовательности
  const startDemo = useCallback(async (seq: number[]) => {
    setGamePhase("demo");
    setSequence(seq);
    
    for (let i = 0; i < seq.length; i++) {
      setCurrentStep(i);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    
    setCurrentStep(-1);
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    setGamePhase("input");
    setUserInput([]);
    sendMessage("player_ready");
  }, [sendMessage]);

  // Обработка WebSocket сообщений
  useEffect(() => {
    if (!lastMessage) return;

    const handleMessage = async () => {
      switch (lastMessage.type) {
        case "game_started":
          setSequence(lastMessage.sequence);
          setGamePhase("demo");
          setCurrentStep(0);
          sendMessage("sequence_demo", { sequence: lastMessage.sequence });
          break;

        case "sequence_demo":
          if (lastMessage.sequence) {
            await startDemo(lastMessage.sequence);
          }
          break;

        case "game_finished":
          setWinner(lastMessage.winnerId);
          setGamePhase("finished");
          sendMessage("game_finished", { winnerId: lastMessage.winnerId });
          break;
      
        default:
          break;
      }
    };
    
    handleMessage();
  }, [lastMessage, sendMessage, startDemo]);

  // Обработка клика по ячейке
  const handleCellClick = async (cellIndex: number) => {
    if (gamePhase !== "input") return;
    
    const newInput = [...userInput, cellIndex];
    setUserInput(newInput);
    
    if (newInput.length === sequence.length) {
      const result = await submitAnswerMutation.mutateAsync({
        roomId,
        sequence: newInput,
      });
      
      sendMessage("player_finished", { correct: result.correct });
      
      if (result.finished && result.winnerId) {
        setWinner(result.winnerId);
        setGamePhase("finished");
        sendMessage("game_finished", { winnerId: result.winnerId });
      } else {
        setGamePhase("lobby");
      }
    }
  };

  // Начать игру (создатель)
  const handleStartGame = async () => {
    const result = await startGameMutation.mutateAsync({ roomId });
    sendMessage("game_started", { sequence: result.sequence, round: result.round });
  };

  // Копирование ссылки
  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    alert("Ссылка скопирована!");
  }, []);

  // Лобби
  if (gamePhase === "lobby" && !winner) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-2">Комната: {roomId}</h1>
            <button
              onClick={copyLink}
              className="text-blue-500 underline mb-4"
            >
              Скопировать ссылку
            </button>
          </div>
          
          <PlayerList 
            players={players.map(p => ({ 
              userId: p.userId || "", 
              isActive: p.isActive ?? true,
              name: p.userId === userId ? userName : undefined
            }))}
            currentUserId={userId}
          />
          
          {isCreator && players.length >= 2 && (
            <div className="mt-6 text-center">
              <Button onClick={handleStartGame}>
                Начать игру
              </Button>
            </div>
          )}
          
          {isCreator && players.length < 2 && (
            <p className="text-center text-gray-500 mt-4">
              Ожидание игроков ({players.length}/2...)
            </p>
          )}
          
          {!isCreator && (
            <p className="text-center text-gray-500 mt-4">
              Ожидание начала игры...
            </p>
          )}
        </Card>
      </div>
    );
  }

  // Демонстрация
  if (gamePhase === "demo") {
    return (
      <div className="text-center space-y-8">
        <h2 className="text-2xl font-bold">Запомни последовательность!</h2>
        <GameBoard
          onCellClick={() => {}}
          disabled={true}
          highlightIndex={currentStep >= 0 ? sequence[currentStep] : null}
        />
        <p className="text-gray-500">
          Шаг {currentStep + 1} из {sequence.length}
        </p>
      </div>
    );
  }

  // Ввод
  if (gamePhase === "input") {
    return (
      <div className="text-center space-y-8">
        <h2 className="text-2xl font-bold">Повтори последовательность!</h2>
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

  // Конец игры
  if (gamePhase === "finished" || winner) {
    const isWinner = winner === userId;
    return (
      <div className="text-center space-y-8">
        <Card>
          <h1 className="text-3xl font-bold mb-4">
            {isWinner ? "🏆 Поздравляем! Вы победили! 🏆" : "Игра окончена"}
          </h1>
          {!isWinner && winner && (
            <p className="text-xl">Победитель: {winner.slice(0, 8)}</p>
          )}
          <div className="mt-6">
            <Button onClick={() => window.location.reload()}>
              Создать новую игру
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return <div>Загрузка...</div>;
}