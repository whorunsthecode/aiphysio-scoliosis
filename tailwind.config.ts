import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#fbf7f2",
        surface: "#fffcf7",
        ink: {
          primary: "#2d2520",
          secondary: "#8a7f76",
          tertiary: "#b8aea4",
        },
        sage: {
          DEFAULT: "#7fa78a",
          dark: "#6b9077",
          wash: "rgba(127, 167, 138, 0.06)",
          tint: "rgba(127, 167, 138, 0.10)",
        },
        terracotta: {
          DEFAULT: "#c98870",
          dark: "#b27460",
          wash: "rgba(201, 136, 112, 0.05)",
        },
        drift: "#e8a397",
        border: "#e8e0d6",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "ui-serif", "Georgia", "serif"],
        body: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 2px 12px rgba(120, 80, 60, 0.06)",
        "card-lift": "0 6px 24px rgba(120, 80, 60, 0.08)",
        "focus-sage": "0 0 0 3px rgba(127, 167, 138, 0.15)",
      },
      borderRadius: {
        chip: "1.125rem",
        card: "1.375rem",
        input: "0.875rem",
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      },
      keyframes: {
        "soft-pulse": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        "soft-rise": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "soft-pulse": "soft-pulse 2.4s ease-in-out infinite",
        "soft-rise": "soft-rise 240ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
