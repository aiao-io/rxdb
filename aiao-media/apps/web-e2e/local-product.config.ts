import { defineConfig } from '@playwright/test';
import base from './supabase-local.config';
export default defineConfig({ ...base, testMatch: 'product-local.spec.mts', timeout: 120000 });
