import { resolve } from 'path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    build: {
        // for styles to work
        cssCodeSplit: false,
        lib: {
            entry: resolve(__dirname, 'lib/main.ts'),
            name: 'VueSuggestionInput',
            // the proper extensions will be added
            fileName: 'vue-suggestion-input'
        },
        rollupOptions: {
            // make sure to externalize deps that shouldn't be bundled
            // into your library
            external: ['vue'],
            output: {
                // Provide global variables to use in the UMD build
                // for externalized deps
                globals: {
                    vue: 'Vue'
                }
            }
        }
    }
});
