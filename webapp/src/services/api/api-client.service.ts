import axios, { type AxiosInstance } from 'axios';
import { authService } from './auth.service';

class ApiClientService {
  private client: AxiosInstance;

  constructor() {
    const API_BASE_URL = import.meta.env.VITE_API_CENTER_BASE_URL;

    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use(async (config) => {
      const token = await authService.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  getClient(): AxiosInstance {
    return this.client;
  }
}

export const apiClient = new ApiClientService().getClient();
