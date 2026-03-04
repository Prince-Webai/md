/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'delaval-blue': '#1863DC',
                'delaval-dark-blue': '#124CA8',
                'delaval-light-blue': '#F0F6FF',
                'delaval-accent': '#14A637',
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
