<script setup>
import legacy from "~/assets/legacy.html?raw";

onMounted(async () => {
  await import("~/assets/legacy-app.js");
});
</script>

<template>
  <div v-html="legacy" />
</template>
