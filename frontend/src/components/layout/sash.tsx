"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

type SashProps = {
  /** Current width of the panel the sash resizes (px). */
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (value: number) => void;
  /** Called on drag start/end, e.g. to disable width transitions while dragging. */
  onDraggingChange?: (dragging: boolean) => void;
  /** Keyboard step in px. */
  step?: number;
  label?: string;
  className?: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * VS Code-style sash on a panel's right edge: a 4px hit area centred on the
 * 1px divider, col-resize cursor, 2px primary highlight on hover (after
 * 150ms) or while dragging. Double-click resets; arrow keys resize.
 */
export function Sash({ value, min, max, defaultValue, onChange, onDraggingChange, step = 16, label = "Resize sidebar", className }: SashProps) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; width: number } | null>(null);

  function setDrag(next: boolean) {
    setDragging(next);
    onDraggingChange?.(next);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, width: value };
    setDrag(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    onChange(clamp(start.current.width + event.clientX - start.current.x, min, max));
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    start.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    if (delta) {
      event.preventDefault();
      onChange(clamp(value + delta, min, max));
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(min);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange(max);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onChange(defaultValue);
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onChange(defaultValue)}
      onKeyDown={onKeyDown}
      className={cn(
        "group/sash absolute top-0 -right-[2.5px] z-30 h-full w-[4px] cursor-col-resize touch-none outline-none",
        className
      )}
    >
      {/* The highlight: 2px primary line, shown on hover after 150ms, immediately while dragging or focused. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-primary opacity-0 transition-opacity duration-100",
          "group-hover/sash:opacity-100 group-hover/sash:delay-150 group-focus-visible/sash:opacity-100",
          dragging && "opacity-100 delay-0"
        )}
      />
    </div>
  );
}
