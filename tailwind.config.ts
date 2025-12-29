import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans],
      },
      colors: {
        background: "#09090b", // Zinc 950
        foreground: "#fafafa", // Zinc 50
        card: {
          DEFAULT: "#18181b", // Zinc 900
          foreground: "#fafafa",
        },
        popover: {
          DEFAULT: "#18181b",
          foreground: "#fafafa",
        },
        primary: {
          DEFAULT: "#3b82f6", // Blue 500
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#27272a", // Zinc 800
          foreground: "#fafafa",
        },
        muted: {
          DEFAULT: "#27272a",
          foreground: "#a1a1aa", // Zinc 400
        },
        accent: {
          DEFAULT: "#27272a",
          foreground: "#fafafa",
        },
        destructive: {
          DEFAULT: "#ef4444", // Red 500
          foreground: "#fafafa",
        },
        border: "#27272a",
        input: "#27272a",
        ring: "#3b82f6",
        brand: {
          DEFAULT: "#3b82f6",
          foreground: "#ffffff",
        },
      },
      borderRadius: {
        lg: "0.5rem",
        md: "calc(0.5rem - 2px)",
        sm: "calc(0.5rem - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
