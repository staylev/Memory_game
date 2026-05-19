"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

export default function Home() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isLoginMode, setIsLoginMode] = useState(true);
  
  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  
  // Auth states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const createRoomMutation = trpc.game.createRoom.useMutation({
    onSuccess: (data) => {
      router.push(`/room/${data.roomId}`);
    },
    onError: (error) => {
      console.error("Create room error:", error);
      showToast("Ошибка создания комнаты: " + error.message, "error");
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

  // Validation functions
  const validateEmail = (email: string): string => {
    if (!email) return "Email обязателен";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return "Некорректный email";
    return "";
  };

  const validatePassword = (password: string): string => {
    if (!password) return "Пароль обязателен";
    if (password.length < 8) return "Пароль должен быть минимум 8 символов";
    return "";
  };

  const validateName = (name: string): string => {
    if (!name) return "Имя обязательно";
    if (name.length < 2) return "Имя должно быть минимум 2 символа";
    return "";
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    const error = validateEmail(e.target.value);
    setErrors(prev => ({ ...prev, email: error }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    const error = validatePassword(e.target.value);
    setErrors(prev => ({ ...prev, password: error }));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    const error = validateName(e.target.value);
    setErrors(prev => ({ ...prev, name: error }));
  };

  const handleSignUp = async () => {
    // Validate all fields
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const nameError = validateName(name);
    
    if (emailError || passwordError || nameError) {
      setErrors({ email: emailError, password: passwordError, name: nameError });
      return;
    }

    try {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        showToast("Регистрация успешна! Теперь войдите.", "success");
        setEmail("");
        setPassword("");
        setName("");
        setErrors({});
        setIsLoginMode(true);
      } else {
        setErrors({ form: data.error || data.message || "Неизвестная ошибка" });
      }
    } catch (err) {
      console.error("Sign-up fetch error:", err);
      setErrors({ form: "Ошибка соединения" });
    }
  };

  const handleSignIn = async () => {
    // Validate fields
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    
    if (emailError || passwordError) {
      setErrors({ email: emailError, password: passwordError });
      return;
    }

    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe: true }),
      });
      
      const data = await res.json();
      
      if (res.ok && data.user) {
        setIsLoggedIn(true);
        setUserId(data.user.id);
        setUserName(data.user.name);
        setErrors({});
      } else {
        setErrors({ form: data.error || data.message || "Неверный email или пароль" });
      }
    } catch (err) {
      console.error("Sign-in fetch error:", err);
      setErrors({ form: "Ошибка соединения" });
    }
  };

  const switchToRegister = () => {
    setIsLoginMode(false);
    setErrors({});
  };

  const switchToLogin = () => {
    setIsLoginMode(true);
    setErrors({});
  };

  const handleCreateRoom = () => {
    if (!userId) {
      showToast("Сначала войдите в систему", "warning");
      return;
    }
    createRoomMutation.mutate({ maxPlayers: 4 });
  };

  const handleJoinRoom = () => {
    if (!userId) {
      showToast("Сначала войдите в систему", "warning");
      return;
    }
    
    if (roomCode.length === 6) {
      router.push(`/room/${roomCode.toUpperCase()}`);
    } else {
      showToast("Введите корректный код комнаты (6 символов)", "warning");
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      setIsLoggedIn(false);
      setUserId(null);
      setUserName(null);
      showToast("Вы вышли из системы", "info");
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
          
          {/* Переключатель режимов */}
          <div className="flex mb-6 border-b">
            <button
              onClick={() => setIsLoginMode(true)}
              className={`flex-1 py-3 text-center font-medium transition-colors ${
                isLoginMode
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Вход
            </button>
            <button
              onClick={() => setIsLoginMode(false)}
              className={`flex-1 py-3 text-center font-medium transition-colors ${
                !isLoginMode
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Регистрация
            </button>
          </div>

          {/* Форма входа */}
          {isLoginMode && (
            <div className="space-y-4">
              <div>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={handleEmailChange}
                  className={`w-full p-3 border rounded text-black ${
                    errors.email ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                )}
              </div>
              
              <div>
                <input
                  type="password"
                  placeholder="Пароль"
                  value={password}
                  onChange={handlePasswordChange}
                  onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                  className={`w-full p-3 border rounded text-black ${
                    errors.password ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {errors.password && (
                  <p className="text-red-500 text-sm mt-1">{errors.password}</p>
                )}
              </div>

              {errors.form && (
                <div className="p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
                  {errors.form}
                </div>
              )}
              
              <Button onClick={handleSignIn} className="w-full py-3 text-lg">
                Войти
              </Button>
            </div>
          )}

          {/* Форма регистрации */}
          {!isLoginMode && (
            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Имя"
                  value={name}
                  onChange={handleNameChange}
                  className={`w-full p-3 border rounded text-black ${
                    errors.name ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name}</p>
                )}
              </div>
              
              <div>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={handleEmailChange}
                  className={`w-full p-3 border rounded text-black ${
                    errors.email ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                )}
              </div>
              
              <div>
                <input
                  type="password"
                  placeholder="Пароль (минимум 8 символов)"
                  value={password}
                  onChange={handlePasswordChange}
                  onKeyDown={(e) => e.key === "Enter" && handleSignUp()}
                  className={`w-full p-3 border rounded text-black ${
                    errors.password ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {errors.password && (
                  <p className="text-red-500 text-sm mt-1">{errors.password}</p>
                )}
              </div>

              {errors.form && (
                <div className="p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
                  {errors.form}
                </div>
              )}
              
              <Button onClick={handleSignUp} variant="secondary" className="w-full py-3 text-lg">
                Зарегистрироваться
              </Button>
            </div>
          )}

          {/* Переключатель */}
          <div className="mt-6 text-center text-sm text-gray-600">
            {isLoginMode ? (
              <>
                Нет аккаунта?{" "}
                <button
                  onClick={switchToRegister}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Зарегистрироваться
                </button>
              </>
            ) : (
              <>
                Уже есть аккаунт?{" "}
                <button
                  onClick={switchToLogin}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Войти
                </button>
              </>
            )}
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

          <Button
            onClick={() => router.push("/history")}
            variant="secondary"
            className="w-full"
          >
            📜 История игр
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