(function () {
  const SDK_VERSION = '12.15.0';
  const config = window.CUSTOMER_FLOW_FIREBASE_CONFIG || { enabled: false };
  let auth;
  let db;
  let authSdk;
  let firestoreSdk;
  let user;

  async function initialize(onUserChange = () => {}) {
    if (!config.enabled) {
      user = { uid: 'local' };
      onUserChange(user);
      return user;
    }
    const root = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
    const [{ initializeApp }, loadedAuth, loadedFirestore] = await Promise.all([
      import(`${root}/firebase-app.js`),
      import(`${root}/firebase-auth.js`),
      import(`${root}/firebase-firestore.js`),
    ]);
    authSdk = loadedAuth;
    firestoreSdk = loadedFirestore;
    const app = initializeApp(config.firebase, `records-${Math.random().toString(36).slice(2)}`);
    auth = authSdk.getAuth(app);
    db = firestoreSdk.getFirestore(app);
    await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
    return new Promise(resolve => {
      let first = true;
      authSdk.onAuthStateChanged(auth, async current => {
        if (current && config.allowedUid && current.uid !== config.allowedUid) {
          await authSdk.signOut(auth);
          current = null;
        }
        user = current;
        onUserChange(user);
        if (first) { first = false; resolve(user); }
      });
    });
  }

  async function login() {
    if (!config.enabled) return user;
    const provider = new authSdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (mobile) return authSdk.signInWithRedirect(auth, provider);
    return authSdk.signInWithPopup(auth, provider);
  }

  async function logout() { if (!config.enabled) return; return authSdk.signOut(auth); }

  function requireUser() {
    if (!user) throw new Error('記録を見るにはGoogleログインが必要です。');
    return user;
  }

  async function list() {
    if (!config.enabled) {
      const response = await fetch('./api/observations');
      if (!response.ok) throw new Error('記録一覧を読み込めませんでした。');
      return response.json();
    }
    const current = requireUser();
    const collection = firestoreSdk.collection(db, 'users', current.uid, 'observations');
    const snapshot = await firestoreSdk.getDocs(collection);
    return snapshot.docs.map(item => item.data()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  async function get(date) {
    if (!config.enabled) {
      const response = await fetch(`./api/day?date=${encodeURIComponent(date)}`);
      if (!response.ok) throw new Error('記録を読み込めませんでした。');
      return (await response.json()).observation;
    }
    const current = requireUser();
    const reference = firestoreSdk.doc(db, 'users', current.uid, 'observations', date);
    const snapshot = await firestoreSdk.getDoc(reference);
    return snapshot.exists() ? snapshot.data() : null;
  }

  async function save(payload) {
    if (!config.enabled) {
      const response = await fetch('./api/observations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('記録を保存できませんでした。');
      return;
    }
    const current = requireUser();
    const reference = firestoreSdk.doc(db, 'users', current.uid, 'observations', payload.date);
    await firestoreSdk.setDoc(reference, {
      ...payload,
      ownerUid: current.uid,
      updatedAt: firestoreSdk.serverTimestamp(),
    }, { merge: true });
  }

  window.RecordsBackend = { initialize, login, logout, list, get, save, currentUser: () => user };
}());
