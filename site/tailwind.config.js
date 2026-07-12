/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAFBFC", // primary background — warm white
        mist: "#F4F7FB", // secondary background
        card: "#FFFFFF",
        surface: "#EEF6FF", // accent surface
        softblue: "#DDEEFF",
        softmint: "#EAF8F2",
        softlavender: "#F3EEFF",
        softpeach: "#FFF2EA",
        ink: "#17212D", // primary text
        muted: "#66758A", // secondary text
        hairline: "rgba(120,140,170,.12)",
        brand: {
          DEFAULT: "#3E7BFA",
          500: "#3E7BFA",
          600: "#2F6BED",
          indigo: "#6161FF", // monday accent, used sparingly
        },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
        display: ['"Inter Tight"', '"Inter"', "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.045em",
      },
      borderColor: {
        DEFAULT: "rgba(120,140,170,.12)",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(23,33,45,.04), 0 8px 24px rgba(23,33,45,.05)",
        lift: "0 24px 60px rgba(35,55,110,.12)",
        glass: "0 8px 32px rgba(35,55,110,.10), inset 0 1px 0 rgba(255,255,255,.6)",
      },
      backdropBlur: {
        xs: "2px",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
