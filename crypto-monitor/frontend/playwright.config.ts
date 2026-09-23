import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',timeout:120000,workers:1,use:{baseURL:'http://127.0.0.1:3000',trace:'off',screenshot:'off',video:'off'},reporter:'list'});
