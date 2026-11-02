import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    // আপনার প্রজেক্টে এই ফোল্ডারগুলোর যেটাই থাকুক না কেন, Tailwind সবগুলোতে ডিজাইন কাজ করাবে
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;