"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { GameBoard } from "./GameBoard";
import { PlayerList } from "./PlayerList";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

interface GameRoomProps {
  roomId: string;
  userId: string;
  userName?: string;
}

type GamePhase = "lobby" | "demo" | "input" | "waiting" | "finished";

export function GameRoom({ roomId, userId, userName }: GameRoomProps) {
  const { showToast } = useToast();
  const [gamePhase, setGamePhase] = useState<GamePhase>("lobby");
  const [sequence, setSequence] = useState<number[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [userInput, setUserInput] = useState<number[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [startGameError, setStartGameError] = useState<string | null>(null);
  const [roundResult, setRoundResult] = useState<{ correct: boolean } | null>(null);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0); // Текущий игрок в очереди
  const [playersOrder, setPlayersOrder] = useState<string[]>([]); // Очередь игроков
 
  // tRPC запросы
  const getRoomQuery = trpc.game.getRoom.useQuery({ roomId }, { refetchInterval: 1000 });
  const startGameMutation = trpc.game.startGame.useMutation();
  const submitAnswerMutation = trpc.game.submitAnswer.useMutation();
  const leaveRoomMutation = trpc.game.leaveRoom.useMutation();
  const nextRoundMutation = trpc.game.nextRound.useMutation();
  const createRoomMutation = trpc.game.createRoom.useMutation();

  // WebSocket (отключён временно, используем polling)
  // const { isConnected, lastMessage, sendMessage } = useGameWebSocket(roomId, userId);
  const isConnected = true;
  const lastMessage = null;
  const sendMessage = () => {};

  // Отладка подключения
  useEffect(() => {
    console.log("[GameRoom] WebSocket connection status:", { isConnected, roomId, userId });
  }, [isConnected, roomId, userId]);

  // Получаем данные комнаты
  const roomData = getRoomQuery.data;
  const players = roomData?.players || [];
  const isLoading = getRoomQuery.isLoading;
  
  // Определяем создателя (при загрузке)
  const isCreator = roomData?.room?.creatorId === userId;

  // Проверка: может ли пользователь начать игру
  const canStartGame = isCreator && players.length >= 2 && roomData?.room?.status === "waiting";
  
  // Отладка: проверяем значения
  useEffect(() => {
    if (roomData?.room) {
      console.log("[GameRoom] Room data loaded:", {
        roomId,
        userId,
        creatorId: roomData.room.creatorId,
        isCreator,
        roomStatus: roomData.room.status,
        playerCount: players.length,
      });
    }
  }, [roomData, roomId, userId, isCreator, players.length]);
      
  // Демонстрация последовательности
  const startDemo = useCallback(async (seq: number[]) => {
    if (demoRunningRef.current) {
      console.log("[GameRoom] startDemo: already running, skipping");
      return;
    }
    
    demoRunningRef.current = true;
    setGamePhase("demo");
    setSequence(seq);
    setCurrentStep(0);
    
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      if (!seq || seq.length === 0) {
        console.error("[GameRoom] startDemo: sequence is empty");
        return;
      }
      
      for (let i = 0; i < seq.length; i++) {
        setCurrentStep(i);
        await new Promise((resolve) => setTimeout(resolve, 800));
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      
      setCurrentStep(-1);
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      setGamePhase("input");
      setUserInput([]);
    } finally {
      demoRunningRef.current = false;
    }
  }, []);

  // Ссылка для предотвращения повторных запусков демо
  const demoRunningRef = useRef(false);
  const prevRoomStatusRef = useRef<string | null>(null);
  const prevSequenceRef = useRef<string | null>(null);
  
  // Отслеживаем roundComplete через polling
  useEffect(() => {
    if (roomData?.room?.roundComplete && gamePhase === "input") {
      console.log("[GameRoom] Round complete detected via polling");
      setRoundResult({ correct: true }); // Все игроки ввели правильно
      setGamePhase("waiting");
      setUserInput([]);
      
      // Только создатель запускает следующий раунд
      if (isCreator) {
        console.log("[GameRoom] Starting next round as creator...");
        setTimeout(async () => {
          try {
            const nextResult = await nextRoundMutation.mutateAsync({ roomId });
            console.log("[GameRoom] Next round started:", nextResult);
          } catch (error) {
            console.error("[GameRoom] Error starting next round:", error);
          }
        }, 1500);
      }
    }
  }, [roomData?.room?.roundComplete, gamePhase, isCreator, roomId, nextRoundMutation]);

  // Отслеживаем изменение статуса комнаты
  useEffect(() => {
    if (roomData?.room?.status && prevRoomStatusRef.current !== roomData.room.status) {
      console.log("[GameRoom] Room status changed:", {
        from: prevRoomStatusRef.current,
        to: roomData.room.status,
        sequence: roomData.room.currentSequence,
        currentPlayerId: roomData.room.currentPlayerId,
      });
      
      // Если статус изменился на "playing" и у нас есть последовательность - запускаем демо
      if (roomData.room.status === "playing" && roomData.room.currentSequence && gamePhase === "lobby") {
        const seq = JSON.parse(roomData.room.currentSequence);
        console.log("[GameRoom] Starting demo after status change to playing");
        
        const order = players.map(p => p.userId).filter((id): id is string => id != null);
        setPlayersOrder(order);
        
        // Находим индекс текущего игрока
        const currentPlayerIdx = order.indexOf(roomData.room.currentPlayerId || "");
        setCurrentPlayerIndex(currentPlayerIdx >= 0 ? currentPlayerIdx : 0);
        
        startDemo(seq);
      }
      
      // Если статус изменился на "finished" — показываем экран завершения
      if (roomData.room.status === "finished" && gamePhase !== "finished") {
        console.log("[GameRoom] Game finished detected");
        setWinner(roomData.room.winnerId || null);
        setGamePhase("finished");
      }
      
      prevRoomStatusRef.current = roomData.room.status;
    }
  }, [roomData?.room?.status, roomData?.room?.currentSequence, roomData?.room?.currentPlayerId, gamePhase, players, startDemo]);

  // Отслеживаем изменение последовательности (новый раунд)
  useEffect(() => {
    const currentSequence = roomData?.room?.currentSequence;
    if (currentSequence && prevSequenceRef.current !== currentSequence && gamePhase !== "lobby") {
      console.log("[GameRoom] Sequence changed - new round starting");
      prevSequenceRef.current = currentSequence;
      
      const seq = JSON.parse(currentSequence);
      const order = players.map(p => p.userId).filter((id): id is string => id != null);
      setPlayersOrder(order);
      
      // Находим индекс текущего игрока
      const currentPlayerIdx = order.indexOf(roomData.room.currentPlayerId || "");
      setCurrentPlayerIndex(currentPlayerIdx >= 0 ? currentPlayerIdx : 0);
      
      // Запускаем демо нового раунда
      startDemo(seq);
    }
  }, [roomData?.room?.currentSequence, roomData?.room?.currentPlayerId, gamePhase, players, startDemo]);

  // Отслеживаем смену текущего игрока
  useEffect(() => {
    if (roomData?.room?.currentPlayerId && gamePhase === "input") {
      const order = players.map(p => p.userId).filter((id): id is string => id != null);
      const currentPlayerIdx = order.indexOf(roomData.room.currentPlayerId);
      if (currentPlayerIdx >= 0 && currentPlayerIdx !== currentPlayerIndex) {
        console.log("[GameRoom] Current player changed:", {
          newPlayerId: roomData.room.currentPlayerId,
          newIndex: currentPlayerIdx,
          isMyTurn: roomData.room.currentPlayerId === userId,
        });
        setCurrentPlayerIndex(currentPlayerIdx);
        setUserInput([]);
        setRoundResult(null);
      }
    }
  }, [roomData?.room?.currentPlayerId, gamePhase, players, currentPlayerIndex, userId]);

  // Обработка клика по ячейке
  const handleCellClick = async (cellIndex: number) => {
    if (gamePhase !== "input") return;
    
    // Проверяем, чей сейчас ход (используем данные из сервера)
    const serverCurrentPlayerId = roomData?.room?.currentPlayerId;
    if (serverCurrentPlayerId !== userId) {
      console.log("[GameRoom] Not your turn, current player:", serverCurrentPlayerId);
      return;
    }
    
    const newInput = [...userInput, cellIndex];
    setUserInput(newInput);
    
    if (newInput.length === sequence.length) {
      try {
        const result = await submitAnswerMutation.mutateAsync({
          roomId,
          sequence: newInput,
        });
        
        // Сохраняем результат
        setRoundResult({ correct: result.correct ?? false });
        
        if (result.finished) {
          setWinner(result.winnerId || null);
          setGamePhase("finished");
        } else {
          // Переходим к следующему игроку (данные обновятся через polling)
          setUserInput([]);
          setRoundResult(null);
        }
      } catch (error: any) {
        showToast(error.message || "Ошибка при отправке ответа", "error");
        console.error("[GameRoom] Submit answer error:", error);
      }
    }
  };

  // Начать игру (создатель)
  const handleStartGame = async () => {
    console.log("[GameRoom] handleStartGame called", { 
      isCreator, 
      canStartGame, 
      roomId,
      userId,
      playersCount: players.length 
    });
    
    if (!isCreator) {
      const errorMsg = "Только создатель комнаты может начать игру";
      setStartGameError(errorMsg);
      showToast(errorMsg, "error");
      return;
    }
    
    if (players.length < 2) {
      const errorMsg = "Нужно минимум 2 игрока";
      setStartGameError(errorMsg);
      showToast(errorMsg, "error");
      return;
    }
    
    try {
      setStartGameError(null);
      console.log("[GameRoom] Calling startGame mutation...");
      const result = await startGameMutation.mutateAsync({ roomId });
      console.log("[GameRoom] startGame result:", result);
      
      // Устанавливаем очередь игроков
      const order = players.map(p => p.userId).filter((id): id is string => id != null);
      setPlayersOrder(order);
      
      // Устанавливаем текущего игрока из результата
      const currentPlayerIdx = order.indexOf(result.currentPlayerId || "");
      setCurrentPlayerIndex(currentPlayerIdx >= 0 ? currentPlayerIdx : 0);
      
      console.log("[GameRoom] Starting demo for creator...");
      await startDemo(result.sequence);
      
    } catch (error: any) {
      const errorMessage = error?.message || "Не удалось начать игру";
      setStartGameError(errorMessage);
      showToast(errorMessage, "error");
      console.error("[GameRoom] Start game error:", error);
    }
  };

  // Копирование ссылки
  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    showToast("Ссылка скопирована!", "success");
  }, [showToast]);

  // Выход из комнаты
  const handleLeaveRoom = () => {
    leaveRoomMutation.mutate({ roomId }, {
      onSuccess: () => {
        window.location.href = "/";
      },
      onError: (error) => {
        showToast(error.message || "Не удалось покинуть комнату", "error");
      }
    });
  };

  // Загрузка
  if (isLoading) {
    return <div className="text-center p-8">Загрузка...</div>;
  }

  // Лобби
  if (gamePhase === "lobby" && !winner) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">Комната: {roomId}</h1>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomId);
                  showToast("Код скопирован!", "success");
                }}
                className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                title="Скопировать код"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              <button
                onClick={copyLink}
                className="text-blue-500 underline"
              >
                Скопировать ссылку
              </button>
              <Button
                onClick={handleLeaveRoom}
                variant="secondary"
              >
                Выйти из комнаты
              </Button>
            </div>
          </div>
          
          <PlayerList 
            players={players.map(p => ({ 
              userId: p.userId || "", 
              isActive: p.isActive ?? true,
              name: p.name
            }))}
            currentUserId={userId}
          />
          
          {canStartGame && (
            <div className="mt-6 text-center">
              <Button onClick={handleStartGame}>
                Начать игру
              </Button>
              {startGameError && (
                <p className="text-red-500 mt-2 text-sm">{startGameError}</p>
              )}
            </div>
          )}
          
          {isCreator && !canStartGame && players.length < 2 && (
            <p className="text-center text-gray-500 mt-4">
              Ожидание игроков ({players.length}/2...)
            </p>
          )}
          
          {isCreator && roomData?.room?.status !== "waiting" && (
            <p className="text-center text-gray-500 mt-4">
              Игра уже началась
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
      <div className="min-h-screen flex flex-col items-center justify-center p-4 space-y-6">
        <h2 className="text-3xl font-bold text-center">Запомни последовательность!</h2>
        <div className="py-4">
          <GameBoard
            onCellClick={() => {}}
            disabled={true}
            highlightIndex={currentStep >= 0 ? sequence[currentStep] : null}
          />
        </div>
        <p className="text-lg text-gray-600">
          Шаг {currentStep + 1} из {sequence.length}
        </p>
      </div>
    );
  }

  // Ввод
  if (gamePhase === "input") {
    const serverCurrentPlayerId = roomData?.room?.currentPlayerId;
    const currentPlayerName = players.find(p => p.userId === serverCurrentPlayerId)?.name;
    const isMyTurn = serverCurrentPlayerId === userId;
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 space-y-6">
        <h2 className="text-3xl font-bold text-center">
          {isMyTurn ? "Повтори последовательность!" : `Ход игрока: ${currentPlayerName || serverCurrentPlayerId?.slice(0, 8)}`}
        </h2>
        <div className="py-4">
          <GameBoard
            onCellClick={handleCellClick}
            disabled={!isMyTurn}
          />
        </div>
        {isMyTurn ? (
          <p className="text-lg text-gray-600">
            Введено: {userInput.length} / {sequence.length}
          </p>
        ) : (
          <p className="text-lg text-gray-500">
            Ожидайте хода...
          </p>
        )}
      </div>
    );
  }

  // Ожидание начала следующего раунда
  if (gamePhase === "waiting") {
    const resultText = roundResult === null 
      ? "🔄 Раунд завершён!" 
      : roundResult.correct 
        ? "✅ Правильно!" 
        : "❌ Неправильно!";
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 space-y-6">
        <h2 className="text-3xl font-bold text-center">
          {resultText}
        </h2>
        <p className="text-lg text-gray-600 text-center">
          {isCreator ? "Начинается следующий раунд..." : "Ожидайте начала следующего раунда..."}
        </p>
      </div>
    );
  }

  // Конец игры
  if (gamePhase === "finished" || winner || roomData?.room?.status === "finished") {
    const finalWinnerId = winner || roomData?.room?.winnerId;
    const isWinner = finalWinnerId === userId;
    const winnerName = players.find(p => p.userId === finalWinnerId)?.name;
    
    const handleCreateNewRoom = async () => {
      try {
        const result = await createRoomMutation.mutateAsync({ maxPlayers: 4 });
        window.location.href = `/room/${result.roomId}`;
      } catch (error: any) {
        showToast(error.message || "Не удалось создать комнату", "error");
      }
    };
    
    const handleGoHome = () => {
      window.location.href = "/";
    };
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 space-y-8">
        <Card className="max-w-md w-full">
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold">
              {isWinner ? "🏆 Поздравляем! Вы победили! 🏆" : "Игра окончена"}
            </h1>
            {!isWinner && finalWinnerId && (
              <p className="text-xl text-gray-600">
                Победитель: {winnerName || finalWinnerId.slice(0, 8)}
              </p>
            )}
            <div className="flex flex-col gap-3 pt-4">
              <Button onClick={handleCreateNewRoom} variant="primary">
                Создать новую комнату
              </Button>
              <Button onClick={handleGoHome} variant="secondary">
                Главное меню
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return <div>Загрузка...</div>;
}