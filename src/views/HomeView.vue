<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <main class="home">
    <div class="home-content">
      <h1>Article to Pic</h1>
      <nav class="home-nav">
        <RouterLink class="home-link" to="/editor">进入编辑器</RouterLink>
      </nav>
    </div>
  </main>
</template>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #333;
}

.home-content {
  text-align: center;
}

.home-nav {
  margin-top: 24px;
}

.home-link {
  display: inline-block;
  padding: 10px 20px;
  border-radius: 8px;
  background: #7c3aed;
  color: #fff;
  text-decoration: none;
  font-size: 15px;
}

.home-link:hover {
  background: #6d28d9;
}
</style>
