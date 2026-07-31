(function () {
  const FIREBASE_SDK_VERSION = '12.15.0';
  let sdkPromise;

  function isConfigured(config) {
    const firebase = config?.firebase || {};
    return Boolean(config?.enabled && firebase.apiKey && firebase.authDomain && firebase.projectId && firebase.appId);
  }

  function loadSdk() {
    if (!sdkPromise) {
      const root = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
      sdkPromise = Promise.all([
        import(`${root}/firebase-app.js`),
        import(`${root}/firebase-auth.js`),
        import(`${root}/firebase-firestore.js`),
      ]).then(([appSdk, authSdk, firestoreSdk]) => ({ appSdk, authSdk, firestoreSdk }));
    }
    return sdkPromise;
  }

  async function create(config, options = {}) {
    const {
      captureRedirectErrors = false,
      onUserChange = () => {},
      unauthorizedMessage = '',
    } = options;
    const { appSdk, authSdk, firestoreSdk } = await loadSdk();
    const app = appSdk.initializeApp(config.firebase);
    const auth = authSdk.getAuth(app);
    const db = firestoreSdk.getFirestore(app);
    const provider = new authSdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    let currentUser = null;
    let authError = null;
    let notificationsEnabled = false;
    let initialAuthResolved = false;
    let resolveInitialAuth;
    const initialAuth = new Promise(resolve => { resolveInitialAuth = resolve; });

    await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
    if (captureRedirectErrors) {
      authSdk.getRedirectResult(auth).catch(error => {
        authError = error;
        if (notificationsEnabled) onUserChange(null, authError);
      });
    }
    authSdk.onAuthStateChanged(auth, async user => {
      if (user && config.allowedUid && user.uid !== config.allowedUid) {
        authError = unauthorizedMessage ? new Error(unauthorizedMessage) : null;
        await authSdk.signOut(auth);
        return;
      }
      currentUser = user;
      if (notificationsEnabled) {
        onUserChange(currentUser, authError);
        authError = null;
      }
      if (!initialAuthResolved) {
        initialAuthResolved = true;
        resolveInitialAuth(currentUser);
      }
    });

    return {
      authSdk,
      firestoreSdk,
      db,
      async initialize() {
        notificationsEnabled = true;
        await initialAuth;
        onUserChange(currentUser, authError);
        authError = null;
        return currentUser;
      },
      async login() { return authSdk.signInWithPopup(auth, provider); },
      async logout() { return authSdk.signOut(auth); },
      currentUser() { return currentUser; },
    };
  }

  window.FirebaseClient = { create, isConfigured };
}());
