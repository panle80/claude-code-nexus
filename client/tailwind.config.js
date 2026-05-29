/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        claude: {
          canvas: "rgb(var(--color-canvas) / <alpha-value>)",
          surface: "rgb(var(--color-surface) / <alpha-value>)",
          "surface-raised": "rgb(var(--color-surface-raised) / <alpha-value>)",
          "surface-hover": "rgb(var(--color-surface-hover) / <alpha-value>)",
          border: "rgb(var(--color-border) / <alpha-value>)",
          "border-hover": "rgb(var(--color-border-hover) / <alpha-value>)",
          coral: "rgb(var(--color-coral) / <alpha-value>)",
          "coral-hover": "rgb(var(--color-coral-hover) / <alpha-value>)",
          teal: "rgb(var(--color-teal) / <alpha-value>)",
          ink: "rgb(var(--color-ink) / <alpha-value>)",
          body: "rgb(var(--color-body) / <alpha-value>)",
          muted: "rgb(var(--color-muted) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
