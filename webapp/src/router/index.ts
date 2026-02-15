import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from '@/layout/AppLayout.vue';
import { requireAuth } from './auth.guard';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/sign-in/:pathMatch(.*)*',
      name: 'sign-in',
      component: () => import('@/pages/SignInPage.vue'),
    },
    {
      path: '/sign-up/:pathMatch(.*)*',
      name: 'sign-up',
      component: () => import('@/pages/SignUpPage.vue'),
    },
    {
      path: '/',
      component: AppLayout,
      beforeEnter: requireAuth,
      children: [
        {
          path: '',
          redirect: '/chat',
        },
        {
          path: '/chat',
          name: 'chat',
          component: () => import('@/pages/ChatPage.vue'),
        },
        {
          path: '/game-creation',
          name: 'game-creation',
          component: () => import('@/pages/GameCreationPage.vue'),
        },
        {
          path: '/campaigns',
          name: 'campaigns',
          component: () => import('@/pages/CampaignsPage.vue'),
        },
      ],
    },
    {
      path: '/:catchAll(.*)',
      name: 'not-found',
      component: () => import('@/pages/NotFoundPage.vue'),
    },
  ],
});

export default router;
