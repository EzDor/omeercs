<script setup lang="ts">
import { useAuthSetup } from '@/services/api/auth.service';

useAuthSetup();
</script>

<template>
  <router-view></router-view>
</template>
