"use client";

import { useState, useCallback } from "react";

interface GameBoardProps {
  onCellClick: (index: number) => void;
  disabled?: boolean;
  highlightIndex?: number | null;
}

// Базовые цвета
const cellColors = [
  { base: "bg-red-500", active: "bg-red-300", shadow: "shadow-red-400" },
  { base: "bg-blue-500", active: "bg-blue-300", shadow: "shadow-blue-400" },
  { base: "bg-green-500", active: "bg-green-300", shadow: "shadow-green-400" },
  { base: "bg-yellow-500", active: "bg-yellow-300", shadow: "shadow-yellow-400" },
];

export function GameBoard({ onCellClick, disabled = false, highlightIndex = null }: GameBoardProps) {
  const [pressedIndex, setPressedIndex] = useState<number | null>(null);

  const handleClick = useCallback((index: number) => {
    if (disabled) return;

    // Визуальная обратная связь при нажатии
    setPressedIndex(index);
    setTimeout(() => setPressedIndex(null), 200);

    onCellClick(index);
  }, [disabled, onCellClick]);

  return (
    <div className="grid grid-cols-2 gap-6 max-w-md mx-auto">
      {[0, 1, 2, 3].map((index) => {
        const isHighlighted = highlightIndex === index;
        const isPressed = pressedIndex === index;
        const color = cellColors[index];

        return (
          <button
            key={index}
            onClick={() => handleClick(index)}
            disabled={disabled}
            className={`
              w-36 h-36 rounded-2xl transition-all duration-150
              ${isHighlighted || isPressed ? color.active : color.base}
              ${isHighlighted ? "ring-8 ring-white scale-110 shadow-[0_0_40px_rgba(255,255,255,0.8)] z-10" : ""}
              ${isPressed ? "scale-95 shadow-inner" : "shadow-lg"}
              ${disabled && !isHighlighted ? "opacity-60" : "opacity-100"}
              ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:brightness-110 active:scale-95"}
            `}
            style={{
              boxShadow: isHighlighted
                ? `0 0 50px 10px rgba(255,255,255,0.9), inset 0 0 20px rgba(255,255,255,0.5)`
                : undefined,
            }}
          >
            {/* Цифра в центре для наглядности */}
            <span className={`
              text-4xl font-bold select-none
              ${isHighlighted || isPressed ? "text-white" : "text-white/30"}
            `}>
              {index + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}