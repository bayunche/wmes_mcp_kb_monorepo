/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        text: "rgb(var(--c-text) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        danger: "rgb(var(--c-danger) / <alpha-value>)",
        success: "rgb(var(--c-success) / <alpha-value>)"
      },
      boxShadow: {
        glass: "0 25px 60px rgba(32,52,110,0.14)"
      },
      borderRadius: {
        lg: "24px",
        md: "16px",
        sm: "10px"
      },
      backdropBlur: {
        glass: "24px"
      }
    }
  },
  plugins: []
};
