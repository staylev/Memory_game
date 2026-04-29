"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GameRoom } from "@/components/game/GameRoom";
import { trpc } from "@/lib/trpc/client";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  // Получаем текущую сессию
  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) {
          setUserId(data.user.id);
          setUserName(data.user.name);
        }
      })
      .catch(() => {
        // Если не авторизован, перенаправляем на главную
        window.location.href = "/";
      });
  }, []);

  // Присоединяемся к комнате при загрузке
  const joinMutation = trpc.game.joinRoom.useMutation({
    onError: (error) => {
      // Если уже в комнате — это нормально, не выкидываем
      if (error.message?.includes("уже в этой комнате")) {
        console.log("Уже в комнате, пропускаем");
        return;
      }
      console.error("Ошибка подключения:", error);
      alert(error.message);
      window.location.href = "/";
    },
  });

  useEffect(() => {
    if (userId && roomId) {
      joinMutation.mutate({ roomId });
    }
  }, [userId, roomId]);

  if (!userId) {
    return <div className="text-center p-8">Загрузка...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <GameRoom roomId={roomId} userId={userId} userName={userName || undefined} />
    </div>
  );
}