/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'delaval-blue': '#0A8043',     // Main Green
                'delaval-dark-blue': '#065F30', // Dark Green
                'delaval-light-blue': '#E6F4EA', // Light Green bg
                'delaval-accent': '#FFD700',   // Gold accent from logo
                'success-green': '#00A862',
                'warning-yellow': '#FFC107',
                'error-red': '#DC3545',
            },
            fontFamily: {
                sans: ['"Inter"', 'sans-serif'],
                display: ['"Inter"', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
