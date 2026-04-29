"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const createRoomMutation = trpc.game.createRoom.useMutation({
    onSuccess: (data) => {
      router.push(`/room/${data.roomId}`);
    },
    onError: (error) => {
      console.error("Create room error:", error);
      alert("Ошибка создания комнаты: " + error.message);
    },
  });

  // Проверка сессии при загрузке
  useEffect(() => {
    const checkSession = async () => {
      try {
        setIsLoading(true);
        const res = await fetch("/api/auth/session");
        
        if (!res.ok) {
          console.log("Session endpoint returned", res.status);
          return;
        }
        
        const text = await res.text();
        if (!text) {
          console.log("Empty session response");
          return;
        }
        
        try {
          const data = JSON.parse(text);
          if (data?.user) {
            setIsLoggedIn(true);
            setUserId(data.user.id);
            setUserName(data.user.name);
          }
        } catch (e) {
          console.log("JSON parse error:", e);
        }
      } catch (err) {
        console.log("Session check error:", err);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkSession();
  }, []);

  const handleSignUp = async () => {
    if (!name || !email || !password) {
      alert("Заполните все поля");
      return;
    }
    
    if (password.length < 8) {
      alert("Пароль должен быть минимум 8 символов");
      return;
    }

    try {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      
      const text = await res.text();
      if (!text) {
        alert("Пустой ответ от сервера");
        return;
      }
      
      try {
        const data = JSON.parse(text);
        if (res.ok) {
          alert("Регистрация успешна! Теперь войдите.");
          setName("");
          setEmail("");
          setPassword("");
        } else {
          alert("Ошибка регистрации: " + (data.error || data.message || "Неизвестная ошибка"));
        }
      } catch (e) {
        alert("Ошибка парсинга ответа: " + text);
      }
    } catch (err) {
      console.error("Sign-up fetch error:", err);
      alert("Ошибка соединения: " + err);
    }
  };

  const handleSignIn = async () => {
    if (!email || !password) {
      alert("Введите email и пароль");
      return;
    }

    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe: true }),
      });
      
      const text = await res.text();
      if (!text) {
        alert("Пустой ответ от сервера");
        return;
      }
      
      try {
        const data = JSON.parse(text);
        if (res.ok && data.user) {
          setIsLoggedIn(true);
          setUserId(data.user.id);
          setUserName(data.user.name);
          alert("Вход выполнен!");
        } else {
          alert("Ошибка входа: " + (data.error || data.message || "Неверный email или пароль"));
        }
      } catch (e) {
        alert("Ошибка парсинга ответа");
      }
    } catch (err) {
      console.error("Sign-in fetch error:", err);
      alert("Ошибка соединения: " + err);
    }
  };

  const handleCreateRoom = () => {
    if (!userId) {
      alert("Сначала войдите в систему");
      return;
    }
    createRoomMutation.mutate({ maxPlayers: 4 });
  };

  const handleJoinRoom = () => {
    if (!userId) {
      alert("Сначала войдите в систему");
      return;
    }
    
    if (roomCode.length === 6) {
      router.push(`/room/${roomCode.toUpperCase()}`);
    } else {
      alert("Введите корректный код комнаты (6 символов)");
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      setIsLoggedIn(false);
      setUserId(null);
      setUserName(null);
      alert("Вы вышли из системы");
    } catch (err) {
      console.error("Sign-out error:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <p>Загрузка...</p>
        </Card>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-center mb-6">Memory Game</h1>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border rounded text-black"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border rounded text-black"
            />
            <input
              type="password"
              placeholder="Пароль (минимум 8 символов)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded text-black"
              minLength={8}
            />
            <div className="flex gap-2">
              <Button onClick={handleSignUp} variant="secondary" className="flex-1">
                Регистрация
              </Button>
              <Button onClick={handleSignIn} className="flex-1">
                Вход
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">Memory Game</h1>
        
        <div className="space-y-4">
          <div className="text-center text-gray-600">
            Добро пожаловать, {userName || userId?.slice(0, 8)}!
          </div>
          
          <Button onClick={handleCreateRoom} className="w-full">
            Создать новую комнату
          </Button>
          
          <Button
            onClick={() => router.push("/bot")}
            variant="secondary"
            className="w-full"
          >
            🤖 Играть с ботом
          </Button>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Код комнаты (6 символов)"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="flex-1 p-2 border rounded uppercase text-black"
              maxLength={6}
            />
            <Button onClick={handleJoinRoom} variant="secondary">
              Подключиться
            </Button>
          </div>
          
          <button
            onClick={handleSignOut}
            className="text-red-500 text-sm w-full text-center mt-4"
          >
            Выйти
          </button>
        </div>
      </Card>
    </div>
  );
}