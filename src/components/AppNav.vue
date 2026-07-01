<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { navItems } from '@/router/nav'

const route = useRoute()

function isNavActive(path: string) {
  return route.path === path
}
</script>

<template>
  <header class="app-nav">
    <RouterLink class="app-nav-brand" to="/">Article to Pic</RouterLink>
    <nav class="app-nav-links">
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        class="app-nav-link"
        :class="{ 'router-link-exact-active': isNavActive(item.path) }"
        :to="item.path"
      >
        {{ item.label }}
      </RouterLink>
    </nav>
  </header>
</template>

<style scoped>
.app-nav {
  display: flex;
  align-items: center;
  gap: 24px;
  height: 48px;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid #e5e5ea;
  flex-shrink: 0;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.app-nav-brand {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  text-decoration: none;
  white-space: nowrap;
}

.app-nav-brand:hover {
  color: #7c3aed;
}

.app-nav-links {
  display: flex;
  gap: 4px;
}

.app-nav-link {
  padding: 6px 14px;
  border-radius: 6px;
  color: #555;
  text-decoration: none;
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
}

.app-nav-link:hover {
  background: #f5f5f7;
  color: #1a1a1a;
}

.app-nav-link.router-link-exact-active {
  background: #ede9fe;
  color: #7c3aed;
  font-weight: 500;
}
</style>
