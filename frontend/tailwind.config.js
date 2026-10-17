/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "var(--bg)",
          panel: "var(--panel)",
          panel2: "var(--panel-2)",
          panel3: "var(--panel-3)",
          border: "var(--border)",
          "border-strong": "var(--border-strong)",
          text: "var(--text)",
          muted: "var(--muted)",
          faint: "var(--faint)",
          accent: "var(--accent)",
          "accent-strong": "var(--accent-strong)",
          contrast: "var(--accent-contrast)",
          danger: "var(--danger)",
        },
        ink: {
          950: "#070b14",
          900: "#0b1120",
          850: "#0f172a",
          800: "#141c2f",
          700: "#1e293b",
          600: "#334155",
        },
        frost: {
          300: "#c4f7ff",
          400: "#7de3f4",
          500: "#42c9e6",
          600: "#159bbd",
        },
        ice: {
          100: "#effcff",
          200: "#c8f4ff",
          300: "#8bdeef",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Consolas", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px var(--border-strong), 0 18px 40px -20px var(--glow)",
        frost:
          "inset 0 1px 0 rgba(255,255,255,0.14), 0 14px 32px -22px var(--glow)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.25s ease-out",
        "soft-pulse": "soft-pulse 3.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
