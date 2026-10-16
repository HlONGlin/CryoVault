/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
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
        glow: "0 0 0 1px rgba(66,201,230,0.28), 0 18px 40px -20px rgba(24,173,212,0.45)",
        frost: "inset 0 1px 0 rgba(255,255,255,0.12), 0 14px 32px -22px rgba(66,201,230,0.8)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
