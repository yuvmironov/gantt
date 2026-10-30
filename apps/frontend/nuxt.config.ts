export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  app: {
    head: {
      title: "SMART OATI",
      link: [{ rel: "stylesheet", href: "/styles.css" }],
    },
  },
});
