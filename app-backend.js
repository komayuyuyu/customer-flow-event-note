(function () {
  const FIREBASE_SDK_VERSION = '12.15.0';

  function createLocalBackend({ eventsForDate }) {
    return {
      mode: 'local',
      async initialize() {},
      async getDay(date) {
        const response = await fetch(`./api/day?date=${encodeURIComponent(date)}`);
        if (!response.ok) throw new Error('読み込みに失敗しました');
        return response.json();
      },
      async getEvents(date) { return eventsForDate(date); },
      async saveObservation(payload) {
        const response = await fetch('./api/observations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '保存できませんでした');
        return result;
      },
      async listObservations() {
        const response = await fetch('./api/observations');
        if (!response.ok) throw new Error('記録一覧を読み込めませんでした');
        return response.json();
      },
    };
  }

  async function createCloudBackend({ config, eventsForDate, onUserChange = () => {} }) {
    const sdkRoot = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
    const [{ initializeApp }, authSdk, firestoreSdk] = await Promise.all([
      import(`${sdkRoot}/firebase-app.js`), import(`${sdkRoot}/firebase-auth.js`), import(`${sdkRoot}/firebase-firestore.js`),
    ]);
    const app = initializeApp(config.firebase);
    const auth = authSdk.getAuth(app);
    const db = firestoreSdk.getFirestore(app);
    const provider = new authSdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    let currentUser = null;
    let authError = null;
    let initialAuthResolved = false;
    let resolveInitialAuth;
    const initialAuth = new Promise(resolve => { resolveInitialAuth = resolve; });

    await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
    authSdk.getRedirectResult(auth).catch(error => { authError = error; onUserChange(null, authError); });
    authSdk.onAuthStateChanged(auth, user => {
      if (user && config.allowedUid && user.uid !== config.allowedUid) {
        authError = new Error('このGoogleアカウントには記録権限がありません。');
        authSdk.signOut(auth);
        return;
      }
      currentUser = user;
      onUserChange(user, authError);
      authError = null;
      if (!initialAuthResolved) { initialAuthResolved = true; resolveInitialAuth(); }
    });

    return {
      mode: 'cloud',
      async initialize() { await initialAuth; onUserChange(currentUser, authError); },
      async login() { return authSdk.signInWithPopup(auth, provider); },
      async logout() { await authSdk.signOut(auth); },
      async getDay(date) {
        const events = await eventsForDate(date);
        let observation = null;
        if (currentUser) {
          const reference = firestoreSdk.doc(db, 'users', currentUser.uid, 'observations', date);
          const snapshot = await firestoreSdk.getDoc(reference);
          if (snapshot.exists()) observation = snapshot.data();
        }
        return { date, events, observation };
      },
      async getEvents(date) { return eventsForDate(date); },
      async saveObservation(payload) {
        if (!currentUser) throw new Error('記録するにはGoogleログインが必要です。');
        const observation = { ...payload, ownerUid: currentUser.uid, updatedAt: firestoreSdk.serverTimestamp() };
        const reference = firestoreSdk.doc(db, 'users', currentUser.uid, 'observations', payload.date);
        await firestoreSdk.setDoc(reference, observation, { merge: true });
        return { ok: true, observation };
      },
      async listObservations() {
        if (!currentUser) return [];
        const collection = firestoreSdk.collection(db, 'users', currentUser.uid, 'observations');
        const snapshot = await firestoreSdk.getDocs(collection);
        return snapshot.docs.map(item => item.data()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      },
    };
  }

  function isCloudConfigured(config) {
    const firebase = config?.firebase || {};
    return Boolean(config?.enabled && firebase.apiKey && firebase.authDomain && firebase.projectId && firebase.appId);
  }

  window.AppBackend = { createCloudBackend, createLocalBackend, isCloudConfigured };
}());
