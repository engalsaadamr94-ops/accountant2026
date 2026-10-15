import type { Config } from "tailwindcss";

// الألوان معرّفة كمتغيرات CSS في globals.css لتدعم الوضع الليلي
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        paper: v("paper"),
        sheet: v("sheet"),
        ink: v("ink"),
        "ink-soft": v("ink-soft"),
        muted: v("muted"),
        rule: v("rule"),
        "rule-strong": v("rule-strong"),
        brand: v("brand"),
        "brand-deep": v("brand-deep"),
        "brand-tint": v("brand-tint"),
        amber: v("amber"),
        "amber-tint": v("amber-tint"),
        loss: v("loss"),
        "loss-tint": v("loss-tint"),
        gain: v("gain"),
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "sans-serif"],
      },
      borderRadius: { field: "6px", panel: "10px" },
    },
  },
  plugins: [],
} satisfies Config;
