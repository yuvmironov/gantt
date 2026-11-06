export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  app: {
    head: {
      title: "RP Gant",
      link: [{ rel: "stylesheet", href: "/design-system.css" }],
    },
  },
});
