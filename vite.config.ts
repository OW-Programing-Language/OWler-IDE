import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
 plugins:[react()],
 server:{port:1420,strictPort:true,host:'127.0.0.1'},
 clearScreen:false,
 envPrefix:['VITE_','TAURI_ENV_*'],
 build:{target:'es2022'}
});
