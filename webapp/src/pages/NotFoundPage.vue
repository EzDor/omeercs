<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';

const router = useRouter();
const { t } = useI18n();
const isVisible = ref(false);

const handleGoBack = () => {
  router.go(-1);
};

onMounted(() => {
  setTimeout(() => {
    isVisible.value = true;
  }, 100);
});
</script>

<template>
  <div class="page-container">
    <!-- Glow orbs -->
    <div class="orb a"></div>
    <div class="orb b"></div>
    <div class="orb c"></div>

    <!-- Main content -->
    <main class="wrap" role="main" aria-labelledby="title">
      <div class="card transition-all duration-1000 transform" :class="isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'" role="group" aria-describedby="desc">
        <div class="content">
          <div class="badge" aria-hidden="true">
            <span class="badge-dot"></span>
            <span>{{ t('notFound.badge') }}</span>
          </div>

          <h1 class="code" aria-label="Error 404">404</h1>

          <h2 id="title" class="title">{{ t('notFound.title') }}</h2>
          <p id="desc" class="desc">
            {{ t('notFound.description') }}
          </p>

          <div class="art" aria-hidden="true">
            <svg viewBox="0 0 600 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="g1" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stop-color="#60a5fa" />
                  <stop offset="1" stop-color="#a78bfa" />
                </linearGradient>
                <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" />
                </filter>
              </defs>
              <rect x="20" y="80" rx="14" width="200" height="90" fill="url(#g1)" opacity=".25" />
              <rect x="240" y="40" rx="14" width="340" height="130" fill="url(#g1)" opacity=".12" />
              <g filter="url(#soft)">
                <circle cx="120" cy="60" r="18" fill="url(#g1)" />
              </g>
              <g stroke="url(#g1)" stroke-width="4" fill="none" opacity=".8">
                <path d="M60 180 Q 160 120 260 170 T 560 160" />
              </g>
              <g fill="none" stroke="url(#g1)" stroke-width="3" opacity=".5">
                <path d="M90 110 l35 0 m20 0 l35 0 m20 0 l35 0" stroke-linecap="round" />
              </g>
            </svg>
          </div>

          <nav class="actions" aria-label="Actions">
            <Button @click="handleGoBack" class="ghost single-button" :aria-label="t('notFound.back')" unstyled>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
              </svg>
              {{ t('notFound.back') }}
            </Button>
          </nav>

          <span class="sr-only">{{ t('notFound.sr') }}</span>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* -------------- CSS Variables & Base -------------- */
:root {
  /* Light theme (default) */
  --page-bg: var(--surface-50);
  --page-text: var(--text-color);
  --page-muted: var(--text-color-secondary);
  --page-primary: var(--primary-color);
  --page-primary-2: var(--primary-400, #f472b6);
  --page-focus: #f59e0b; /* amber-500 */
  --shadow: 0 20px 40px rgba(15, 23, 42, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05) inset;
}

:global(.app-dark) .page-container {
  /* Dark theme */
  --page-bg: var(--surface-950);
  --page-text: var(--text-color);
  --page-muted: var(--text-color-secondary);
  --page-primary: var(--primary-color);
  --page-primary-2: var(--primary-300, #5eead4);
  --shadow: 0 25px 50px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
}

.page-container {
  height: 100vh;
  margin: 0;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    Segoe UI,
    Roboto,
    Inter,
    'Helvetica Neue',
    Arial,
    'Noto Sans',
    'Apple Color Emoji',
    'Segoe UI Emoji',
    'Segoe UI Symbol';
  color: var(--page-text);
  background:
    radial-gradient(1200px 800px at 20% -10%, rgba(96, 165, 250, 0.15), transparent 60%), radial-gradient(900px 700px at 120% 120%, rgba(167, 139, 250, 0.18), transparent 60%),
    var(--page-bg);
  display: grid;
  place-items: center;
  overflow: hidden;
  position: relative;
}

/* -------------- Decorative Orbs -------------- */
.orb {
  position: absolute;
  filter: blur(40px);
  opacity: 0.5;
  pointer-events: none;
  border-radius: 9999px;
  mix-blend-mode: screen;
}
.orb.a {
  width: 420px;
  height: 420px;
  background: #60a5fa;
  top: -120px;
  left: -120px;
}
.orb.b {
  width: 360px;
  height: 360px;
  background: #a78bfa;
  bottom: -100px;
  right: -80px;
}
.orb.c {
  width: 260px;
  height: 260px;
  background: #34d399;
  top: 50%;
  left: 70%;
  transform: translate(-50%, -50%);
  opacity: 0.35;
}

@media (prefers-reduced-motion: no-preference) {
  @keyframes float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-10px);
    }
  }
  .orb {
    animation: float 8s ease-in-out infinite;
  }
  .orb.b {
    animation-duration: 10s;
  }
  .orb.c {
    animation-duration: 12s;
  }
}

/* -------------- Card -------------- */
.wrap {
  position: relative;
  z-index: 1;
  width: min(680px, 92vw);
  padding: 28px;
}

.card {
  background: var(--surface-card);
  backdrop-filter: saturate(180%) blur(20px);
  border: 1px solid var(--surface-border);
  border-radius: var(--content-border-radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  position: relative;
}

/* -------------- Content -------------- */
.content {
  display: grid;
  gap: 22px;
  padding: clamp(20px, 5vw, 36px);
  text-align: center;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-inline: auto;
  padding: 8px 12px;
  border: 1px solid var(--surface-border);
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--page-muted);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
}
.badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(90deg, var(--page-primary), var(--page-primary-2));
  box-shadow: 0 0 12px rgba(96, 165, 250, 0.8);
}

.code {
  font-weight: 800;
  font-size: clamp(64px, 14vw, 140px);
  line-height: 0.9;
  letter-spacing: -0.04em;
  color: var(--page-primary);
  background: linear-gradient(90deg, var(--page-primary), var(--page-primary-2));
  -webkit-background-clip: text;
  background-clip: text;
  margin: 4px 0 0;
}

/* Fallback for browsers that don't support background-clip: text */
@supports not (-webkit-background-clip: text) {
  .code {
    color: var(--page-primary);
    background: none;
    -webkit-text-fill-color: inherit;
  }
}

.title {
  font-weight: 700;
  font-size: clamp(20px, 3.5vw, 28px);
  letter-spacing: -0.01em;
}

.desc {
  color: var(--page-muted);
  font-size: clamp(14px, 2.5vw, 16px);
  line-height: 1.7;
  margin: 0 auto;
  max-width: 54ch;
}

/* -------------- Actions -------------- */
.actions {
  display: flex;
  justify-content: center;
  margin-top: 6px;
}

.single-button {
  max-width: 200px;
  width: 100%;
}

.btn,
.ghost {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  text-decoration: none;
  font-weight: 600;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    background 0.2s ease,
    border-color 0.2s ease;
  will-change: transform;
  border: 1px solid var(--surface-border);
}
.btn {
  color: #0b1020;
  background: linear-gradient(135deg, var(--page-primary), var(--page-primary-2));
  box-shadow:
    0 10px 25px rgba(99, 102, 241, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}
.btn:focus-visible,
.ghost:focus-visible {
  outline: 3px solid var(--page-focus);
  outline-offset: 2px;
}
.btn:hover {
  transform: translateY(-1px);
  box-shadow:
    0 15px 30px rgba(99, 102, 241, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}
.ghost {
  background: rgba(255, 255, 255, 0.05);
  color: var(--page-text);
  backdrop-filter: blur(10px);
}

/* Theme-specific styles for ghost button and badge */
:global(.app-dark) .ghost {
  background: rgba(255, 255, 255, 0.05);
}

:global(.app-dark) .ghost:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
}

:global(.app-dark) .badge {
  background: rgba(255, 255, 255, 0.05);
}

/* Light theme styles */
.ghost {
  background: rgba(0, 0, 0, 0.05);
}

.ghost:hover {
  background: rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.badge {
  background: rgba(0, 0, 0, 0.05);
}

/* -------------- Illustration (SVG) -------------- */
.art {
  width: min(520px, 80%);
  margin: 0 auto -6px;
  opacity: 0.95;
}
.art svg {
  width: 100%;
  height: auto;
  display: block;
}

/* -------------- Utility -------------- */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
