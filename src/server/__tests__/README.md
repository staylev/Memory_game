# Тесты серверной логики

## Обзор

Проект покрыт интеграционными и модульными тестами для серверной логики игры.

**Всего тестов: 57**

## Запуск тестов

```bash
# Запустить все тесты
npm test

# Запустить в режиме watch (автоматический перезапуск)
npm run test:watch

# Запустить с UI
npm run test:ui

# Запустить с отчётом о покрытии
npm run test:coverage
```

## Структура тестов

### `src/server/__tests__/helpers.ts`
Вспомогательные функции для тестирования:
- `createMockDB()` — фабрика мок-базы данных
- `createMockUser()` — создание тестового пользователя
- `createMockRoom()` — создание тестовой комнаты
- `createMockPlayer()` — создание тестового игрока
- `createTestTRPC()` — настройка tRPC для тестов

### `src/server/__tests__/auth-context.test.ts`
Тесты контекста авторизации и вспомогательных функций:

#### Session Context
- ✅ Передача пользователя в контекст
- ✅ Структура сессии

#### Mock Database
- ✅ Создание пустой БД
- ✅ Инициализация с данными
- ✅ Операции вставки
- ✅ Операции обновления

#### Data Validation
- ✅ Валидация пользователя
- ✅ Валидация комнаты
- ✅ Валидация последовательности

#### Game State Transitions
- ✅ Смена статуса комнаты
- ✅ Отслеживание активных игроков
- ✅ Подсчёт раундов

#### Helper Functions
- ✅ Генерация уникальных ID
- ✅ Генерация кодов комнат
- ✅ Генерация случайных последовательностей

#### Edge Cases
- ✅ Пустая сессия
- ✅ Несуществующая комната
- ✅ Пустой список игроков
- ✅ JSON парсинг
- ✅ Null currentSequence

**20 тестов**

### `src/server/__tests__/game.test.ts`
Модульные тесты вспомогательных функций:
- `generateSequence()` — генерация последовательности цветов
- `generateRoomCode()` — генерация кода комнаты

**12 тестов**

### `src/server/__tests__/game-router.test.ts`
Интеграционные тесты game router:

#### `createRoom`
- ✅ Создание комнаты с валидными параметрами
- ✅ Добавление создателя в комнату
- ✅ MaxPlayers по умолчанию = 4
- ✅ Валидация min/max игроков

#### `joinRoom`
- ✅ Подключение к существующей комнате
- ✅ Отказ для несуществующей комнаты
- ✅ Отказ для заполненной комнаты
- ✅ Отказ для повторного подключения

#### `getRoom`
- ✅ Получение информации о комнате
- ✅ Ошибка для несуществующей комнаты

#### `startGame`
- ✅ Старт игры с 2+ игроками
- ✅ Отказ если < 2 игроков
- ✅ Отказ если не создатель

#### `createBotRoom`
- ✅ Создание комнаты для игры с ботом

#### `playBotRound`
- ✅ Правильная последовательность
- ✅ Неправильная последовательность
- ✅ Увеличение последовательности

**18 тестов**

### `src/server/__tests__/trpc.test.ts`
Тесты tRPC middleware и валидации:

#### Middleware
- ✅ publicProcedure без авторизации
- ✅ protectedProcedure отклоняет без сессии
- ✅ protectedProcedure принимает с сессией

#### Валидация Zod
- ✅ Валидация email
- ✅ Валидация длины строки (roomId)
- ✅ Валидация диапазона чисел (maxPlayers)

**7 тестов**

## Итоги

| Файл | Тестов | Описание |
|------|--------|----------|
| `auth-context.test.ts` | 20 | Контекст, БД, валидация, edge cases |
| `game.test.ts` | 12 | Вспомогательные функции |
| `game-router.test.ts` | 18 | Интеграционные тесты router |
| `trpc.test.ts` | 7 | Middleware и валидация Zod |
| **Итого** | **57** | |

## Покрытие

```
File                      | % Stmts | % Branch | % Funcs | % Lines
--------------------------|---------|----------|---------|---------
server/__tests__/         |   55.07 |    60.00 |   51.51 |   54.38
```

## Примеры тестов

### Тест создания комнаты

```typescript
it("должен создавать новую комнату с валидными параметрами", async () => {
  const result = await gameRouter.createRoom({ maxPlayers: 4 });
  expect(result.roomId).toHaveLength(6);
  expect(result.room.status).toBe("waiting");
  expect(result.room.maxPlayers).toBe(4);
});
```

### Тест валидации

```typescript
it("должен отклонять maxPlayers < 2", async () => {
  await expect(gameRouter.createRoom({ maxPlayers: 1 })).rejects.toThrow();
});
```

### Тест middleware

```typescript
it("должен отклонять запрос без сессии", async () => {
  await expect(caller.secret()).rejects.toThrow(TRPCError);
});
```

## Добавление новых тестов

1. Создайте файл `*.test.ts` в `src/server/__tests__/`
2. Импортируйте хелперы из `./helpers`
3. Используйте `describe`/`it` для структуры
4. Запустите `npm test`

## CI/CD Интеграция

Добавьте в ваш CI пайплайн:

```yaml
- name: Run tests
  run: npm test

- name: Check coverage
  run: npm run test:coverage
```
