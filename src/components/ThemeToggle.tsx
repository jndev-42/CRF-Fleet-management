"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
    const [mounted, setMounted] = useState(false);
    const { theme, setTheme } = useTheme();

    // useEffect only runs on the client, so now we can safely show the UI
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div style={{ width: 36, height: 36 }} />;
    }

    return (
        <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="btn btn-secondary"
            style={{
                padding: "8px",
                borderRadius: "var(--radius-sm)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
            aria-label="Toggle Theme"
        >
            {theme === "dark" ? (
                <Sun size={20} className="text-muted" />
            ) : (
                <Moon size={20} className="text-muted" />
            )}
        </button>
    );
}
