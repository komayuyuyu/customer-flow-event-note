(function () {
  const config = window.CUSTOMER_FLOW_FIREBASE_CONFIG || { enabled: false };
  let firebase;
  let currentUser;

  async function initialize(onUserChange = () => {}) {
    if (!config.enabled) {
      currentUser = { uid: 'local' };
      onUserChange(currentUser);
      return currentUser;
    }
    firebase = await window.FirebaseClient.create(config, {
      onUserChange(user) {
        currentUser = user;
        onUserChange(currentUser);
      },
    });
    await firebase.initialize();
    return currentUser;
  }

  async function login() {
    if (!config.enabled) return currentUser;
    return firebase.login();
  }

  async function logout() {
    if (!config.enabled) return;
    return firebase.logout();
  }

  function requireCurrentUser() {
    if (!currentUser) throw new Error('記録を見るにはGoogleログインが必要です。');
    return currentUser;
  }

  async function list() {
    if (!config.enabled) {
      const response = await fetch('./api/observations');
      if (!response.ok) throw new Error('記録一覧を読み込めませんでした。');
      return response.json();
    }
    const user = requireCurrentUser();
    const collection = firebase.firestoreSdk.collection(firebase.db, 'users', user.uid, 'observations');
    const snapshot = await firebase.firestoreSdk.getDocs(collection);
    return snapshot.docs.map(item => item.data()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  async function get(date) {
    if (!config.enabled) {
      const response = await fetch(`./api/day?date=${encodeURIComponent(date)}`);
      if (!response.ok) throw new Error('記録を読み込めませんでした。');
      return (await response.json()).observation;
    }
    const user = requireCurrentUser();
    const reference = firebase.firestoreSdk.doc(firebase.db, 'users', user.uid, 'observations', date);
    const snapshot = await firebase.firestoreSdk.getDoc(reference);
    return snapshot.exists() ? snapshot.data() : null;
  }

  async function save(payload) {
    if (!config.enabled) {
      const response = await fetch('./api/observations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('記録を保存できませんでした。');
      return;
    }
    const user = requireCurrentUser();
    const reference = firebase.firestoreSdk.doc(firebase.db, 'users', user.uid, 'observations', payload.date);
    await firebase.firestoreSdk.setDoc(reference, {
      ...payload,
      ownerUid: user.uid,
      updatedAt: firebase.firestoreSdk.serverTimestamp(),
    }, { merge: true });
  }

  async function remove(date) {
    if (!config.enabled) {
      const response = await fetch(`./api/observations?date=${encodeURIComponent(date)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('記録を削除できませんでした。');
      return;
    }
    const user = requireCurrentUser();
    const reference = firebase.firestoreSdk.doc(firebase.db, 'users', user.uid, 'observations', date);
    await firebase.firestoreSdk.deleteDoc(reference);
  }

  window.RecordsBackend = { initialize, login, logout, list, get, save, remove, currentUser: () => currentUser };
}());
