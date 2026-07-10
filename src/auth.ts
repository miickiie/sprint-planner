import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  setPersistence,
  signInWithPopup,
  signOut,
  User,
  UserCredential,
} from 'firebase/auth';
let firebaseConfig: any = null;

try {
  if (import.meta.env.VITE_FIREBASE_API_KEY) {
    firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.replace(/^https?:\/\//, ''),
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };
  } else {
    // @ts-ignore
    const config = import.meta.glob('../firebase-applet-config.json', { eager: true });
    if (Object.keys(config).length > 0) {
      const configModule: any = Object.values(config)[0];
      firebaseConfig = configModule?.default || configModule;
    }
  }
} catch (e) {
  console.warn("Failed to load Firebase config", e);
}

export const isFirebaseConfigured = !!firebaseConfig?.apiKey;

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
const authPersistenceReady = auth
  ? setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.warn('Failed to set Firebase auth persistence', error);
    })
  : Promise.resolve();

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
let cachedAccessToken: string | null = null;

const extractSheetsAccess = (result: UserCredential) => {
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Failed to get access token from Firebase Auth');
  }

  cachedAccessToken = credential.accessToken;
  return { user: result.user, accessToken: cachedAccessToken };
};

export const initAuth = (
  onAuthSuccess?: (user: User, hasSheetsAccess: boolean) => void,
  onAuthFailure?: () => void
) => {
  if (!auth) {
    if (onAuthFailure) onAuthFailure();
    return () => {};
  }
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, !!cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!auth) throw new Error("Firebase is not configured");
  try {
    await authPersistenceReady;
    const result = await signInWithPopup(auth, provider);
    return extractSheetsAccess(result);
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  }
};

export const connectSheetsAccess = async (): Promise<{ user: User; accessToken: string }> => {
  if (!auth) throw new Error("Firebase is not configured");
  try {
    await authPersistenceReady;
    const result = auth.currentUser
      ? await reauthenticateWithPopup(auth.currentUser, provider)
      : await signInWithPopup(auth, provider);
    return extractSheetsAccess(result);
  } catch (error: any) {
    console.error('Google Sheets reconnect error:', error);
    throw error;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  if (!auth) return;
  await signOut(auth);
  cachedAccessToken = null;
};
