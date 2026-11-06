import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@veerxcape/shared-constants': path.resolve(
        __dirname,
        'packages/shared-constants/src/index.ts'
      ),
      '@veerxcape/shared-types': path.resolve(
        __dirname,
        'packages/shared-types/src/index.ts'
      ),
      '@veerxcape/shared-validation': path.resolve(
        __dirname,
        'packages/shared-validation/src/index.ts'
      ),
      '@veerxcape/shared-services': path.resolve(
        __dirname,
        'packages/shared-services/src/index.ts'
      )
    }
  },
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['functions/**/__tests__/emulator/**/*.test.ts']
  }
});

