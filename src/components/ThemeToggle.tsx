"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("hh_theme");
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
        if (stored === "light") document.documentElement.classList.add("light");
        else document.documentElement.classList.remove("light");
      } else {
        // default prefer dark
        const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
        const t = prefersLight ? "light" : "dark";
        setTheme(t);
        if (t === "light") document.documentElement.classList.add("light");
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      window.localStorage.setItem("hh_theme", next);
    } catch (e) {}
    if (next === "light") document.documentElement.classList.add("light");
    else document.documentElement.classList.remove("light");
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      title="Toggle light/dark"
      className="h-10 w-10 rounded-md flex items-center justify-center bg-white/5 hover:bg-white/8 transition text-white"
    >
      {theme === "light" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
