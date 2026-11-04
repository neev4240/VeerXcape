export interface VeerXcapeFirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

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
