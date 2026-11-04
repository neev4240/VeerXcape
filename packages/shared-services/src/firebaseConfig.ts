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
  env: Record<string, string | undefined> = {}
): VeerXcapeFirebaseWebConfig {
  return {
    apiKey: env.VITE_FIREBASE_API_KEY || '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'veerxcape-01.firebaseapp.com',
    projectId: env.VITE_FIREBASE_PROJECT_ID || 'veerxcape-01',
    storageBucket:
      env.VITE_FIREBASE_STORAGE_BUCKET || 'veerxcape-01.firebasestorage.app',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '237246156685',
    appId:
      env.VITE_FIREBASE_APP_ID || '1:237246156685:web:5feb4e7f7fccb73f38f7c4',
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-0R2DB5P5BX'
  };
}
