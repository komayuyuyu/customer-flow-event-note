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
        import(`${root}/firebase-app-check.js`),
        import(`${root}/firebase-auth.js`),
        import(`${root}/firebase-firestore.js`),
      ]).then(([appSdk, appCheckSdk, authSdk, firestoreSdk]) => ({ appSdk, appCheckSdk, authSdk, firestoreSdk }));
    }
    return sdkPromise;
  }

  async function create(config, options = {}, sdkLoader = loadSdk) {
    const {
      captureRedirectErrors = false,
      onUserChange = () => {},
      unauthorizedMessage = '',
    } = options;
    const { appSdk, appCheckSdk, authSdk, firestoreSdk } = await sdkLoader();
    const app = appSdk.initializeApp(config.firebase);
    const auth = authSdk.getAuth(app);
    const provider = new authSdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    let protectedServices;

    function dataServices() {
      if (!protectedServices) {
        if (config.appCheck?.enabled && config.appCheck.siteKey) {
          const appCheckProvider = new appCheckSdk.ReCaptchaEnterpriseProvider(config.appCheck.siteKey);
          appCheckSdk.initializeAppCheck(app, {
            provider: appCheckProvider,
            isTokenAutoRefreshEnabled: config.appCheck.tokenAutoRefresh !== false,
          });
        }
        protectedServices = {
          db: firestoreSdk.getFirestore(app),
          firestoreSdk,
        };
      }
      return protectedServices;
    }
    let currentUser = null;
    let authError = null;
    let loginPromise;
    let logoutPromise;
    let notificationsEnabled = false;
    let initialAuthResolved = false;
    let initialNotificationSent = false;
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
        if (!initialAuthResolved) initialNotificationSent = true;
        authError = null;
      }
      if (!initialAuthResolved) {
        initialAuthResolved = true;
        resolveInitialAuth(currentUser);
      }
    });

    async function login() {
      if (!loginPromise) loginPromise = authSdk.signInWithPopup(auth, provider);
      try {
        return await loginPromise;
      } finally {
        loginPromise = null;
      }
    }

    async function logout() {
      if (!logoutPromise) logoutPromise = authSdk.signOut(auth);
      try {
        return await logoutPromise;
      } finally {
        logoutPromise = null;
      }
    }

    return {
      authSdk,
      dataServices,
      async initialize() {
        notificationsEnabled = true;
        await initialAuth;
        if (!initialNotificationSent) {
          onUserChange(currentUser, authError);
          authError = null;
        }
        return currentUser;
      },
      login,
      logout,
      currentUser() { return currentUser; },
    };
  }

  window.FirebaseClient = { create, isConfigured };
}());
