import 'reflect-metadata';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import App from './App.vue';
import router from './router';
import i18n from './i18n';
import '@/assets/styles.scss';
import Aura from '@primeuix/themes/aura';
import { ConfirmationService, ToastService } from 'primevue';
import { clerkPlugin } from '@clerk/vue';

// PrimeVue components
import Toast from 'primevue/toast';
import SelectButton from 'primevue/selectbutton';

// PrimeVue directives
import StyleClass from 'primevue/styleclass';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error('Add your Clerk Publishable Key to the .env file');
}

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(i18n);
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.app-dark',
    },
  },
});
app.use(ToastService);
app.use(ConfirmationService);
app.use(clerkPlugin, { publishableKey: PUBLISHABLE_KEY });

// Register PrimeVue components
app.component('PrimeToast', Toast);
app.component('SelectButton', SelectButton);

// Register PrimeVue directives
app.directive('styleclass', StyleClass);

app.mount('#app');
