import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  User,
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
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || null;
export const isGoogleClientConfigured = !!googleClientId;

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
const authPersistenceReady = auth
  ? setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.warn('Failed to set Firebase auth persistence', error);
    })
  : Promise.resolve();

const provider = new GoogleAuthProvider();
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let cachedAccessToken: string | null = null;
let gisScriptPromise: Promise<void> | null = null;

const loadGoogleIdentityServices = () => {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
};

const requestSheetsAccessToken = async (prompt: '' | 'consent') => {
  if (!googleClientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is required for Google Sheets access');
  }

  await loadGoogleIdentityServices();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google Identity Services did not initialize');
  }

  return new Promise<string>((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: googleClientId,
      scope: SHEETS_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Failed to get Google Sheets access token'));
          return;
        }

        cachedAccessToken = response.access_token;
        resolve(response.access_token);
      },
      error_callback: (error) => {
        reject(new Error(error.message || error.type || 'Google Sheets token request failed'));
      },
    });

    tokenClient.requestAccessToken({ prompt });
  });
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
    const accessToken = await requestSheetsAccessToken('consent');
    return { user: result.user, accessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  }
};

export const connectSheetsAccess = async (): Promise<{ user: User; accessToken: string }> => {
  if (!auth) throw new Error("Firebase is not configured");
  if (!auth.currentUser) throw new Error("No signed-in Firebase user");
  try {
    await authPersistenceReady;
    const accessToken = await requestSheetsAccessToken('consent');
    return { user: auth.currentUser, accessToken };
  } catch (error: any) {
    console.error('Google Sheets reconnect error:', error);
    throw error;
  }
};

export const restoreSheetsAccess = async (): Promise<boolean> => {
  if (!auth?.currentUser || cachedAccessToken) return !!cachedAccessToken;
  if (!isGoogleClientConfigured) return false;

  try {
    await requestSheetsAccessToken('');
    return true;
  } catch (error) {
    console.warn('Silent Google Sheets token restore failed', error);
    cachedAccessToken = null;
    return false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const clearSheetsAccessToken = () => {
  cachedAccessToken = null;
};

export const logout = async () => {
  if (!auth) return;
  await signOut(auth);
  cachedAccessToken = null;
};
