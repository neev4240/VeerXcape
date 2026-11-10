export interface VeerXcapeFirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export const VEERXCAPE_NATIVE_APP_METADATA = {
  bundleId: 'com.zealion.veerxcape',
  projectId: 'veerxcape-01',
  projectNumber: '237246156685',
  storageBucket: 'veerxcape-01.firebasestorage.app',
  android: {
    packageName: 'com.zealion.veerxcape',
    mobileSdkAppId: '1:237246156685:android:f3cb6d458bb1372e38f7c4',
    oauthClientId:
      '237246156685-2ahkkqvmih3tc491denn4qqtli61mgev.apps.googleusercontent.com',
    configPath: 'apps/mobile-app/android/app/google-services.json'
  },
  ios: {
    bundleId: 'com.zealion.veerxcape',
    googleAppId: '1:237246156685:ios:356992972d69398338f7c4',
    clientId:
      '237246156685-826ckobt9nb69bj4luahmvjlet1k4rp7.apps.googleusercontent.com',
    reversedClientId:
      'com.googleusercontent.apps.237246156685-826ckobt9nb69bj4luahmvjlet1k4rp7',
    configPath: 'apps/mobile-app/ios/App/App/GoogleService-Info.plist'
  }
} as const;

/**
 * Resolves the Firebase Web SDK configuration from Vite environment variables
 * (`VITE_FIREBASE_*`) or explicit runtime overrides across all VeerXcape web/mobile apps.
 */
export function resolveFirebaseWebConfig(
  env: Record<string, string | boolean | undefined> = {}
): VeerXcapeFirebaseWebConfig {
  return {
    apiKey: String(env.VITE_FIREBASE_API_KEY || ''),
    authDomain: String(
      env.VITE_FIREBASE_AUTH_DOMAIN || 'veerxcape-01.firebaseapp.com'
    ),
    projectId: String(env.VITE_FIREBASE_PROJECT_ID || 'veerxcape-01'),
    storageBucket: String(
      env.VITE_FIREBASE_STORAGE_BUCKET || 'veerxcape-01.firebasestorage.app'
    ),
    messagingSenderId: String(
      env.VITE_FIREBASE_MESSAGING_SENDER_ID || '237246156685'
    ),
    appId: String(
      env.VITE_FIREBASE_APP_ID || '1:237246156685:web:5feb4e7f7fccb73f38f7c4'
    ),
    measurementId: String(env.VITE_FIREBASE_MEASUREMENT_ID || 'G-0R2DB5P5BX')
  };
}

/**
 * Resolves the centralized backend API base URL from Vite/runtime environment variables.
 */
export function resolveApiBaseUrl(
  env: Record<string, string | boolean | undefined> = {}
): string {
  const configured = env.VITE_API_BASE_URL;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, '');
  }
  const projectId = String(env.VITE_FIREBASE_PROJECT_ID || 'veerxcape-01');
  return `http://127.0.0.1:5001/${projectId}/asia-south1/api`;
}

/**
 * Resolves the optional Firebase Auth Emulator host (`127.0.0.1:9099`) when configured.
 */
export function resolveAuthEmulatorHost(
  env: Record<string, string | boolean | undefined> = {}
): string | null {
  const host = env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
  if (typeof host === 'string' && host.trim().length > 0) {
    return host.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
  return null;
}

/**
 * Demo mode is strictly OFF by default and only enabled when explicitly requested
 * in a non-production development environment (`VITE_ENABLE_DEMO_MODE=true`).
 */
export function isExplicitDevDemoModeEnabled(
  env: Record<string, string | boolean | undefined> = {}
): boolean {
  const isProd =
    env.PROD === true ||
    env.PROD === 'true' ||
    env.MODE === 'production' ||
    env.NODE_ENV === 'production';
  if (isProd) {
    return false;
  }
  return env.VITE_ENABLE_DEMO_MODE === 'true' || env.VITE_ENABLE_DEMO_MODE === true;
}

