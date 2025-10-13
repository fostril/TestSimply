import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans]
      },
      colors: {
        brand: {
          DEFAULT: "#2563eb",
          foreground: "#eff6ff"
        }
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
