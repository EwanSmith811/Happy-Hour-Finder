"use client";

import React, { useEffect, useState } from "react";

type ToastItem = { id: number; message: string; type?: "success" | "error" };

export default function Toast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as any;
      if (!detail || !detail.message) return;
      const id = Date.now();
      setToasts((t) => [...t, { id, message: detail.message, type: detail.type }]);
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, detail.duration || 4000);
    };

    window.addEventListener("show-toast", handler as EventListener);
    return () => window.removeEventListener("show-toast", handler as EventListener);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-6 z-60 flex flex-col gap-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`max-w-sm px-4 py-2 rounded-lg shadow-md border ${
            t.type === "error" ? "bg-red-600/95 border-red-400" : "bg-emerald-600/95 border-emerald-400"
          } text-white`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
