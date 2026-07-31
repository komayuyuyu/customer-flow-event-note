(function () {

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
    const firebase = await window.FirebaseClient.create(config, {
      captureRedirectErrors: true,
      onUserChange,
      unauthorizedMessage: 'このGoogleアカウントには記録権限がありません。',
    });
    const { db, authSdk, firestoreSdk } = firebase;

    return {
      mode: 'cloud',
      initialize: firebase.initialize,
      login: firebase.login,
      logout: firebase.logout,
      async getDay(date) {
        const events = await eventsForDate(date);
        let observation = null;
        const user = firebase.currentUser();
        if (user) {
          const reference = firestoreSdk.doc(db, 'users', user.uid, 'observations', date);
          const snapshot = await firestoreSdk.getDoc(reference);
          if (snapshot.exists()) observation = snapshot.data();
        }
        return { date, events, observation };
      },
      async getEvents(date) { return eventsForDate(date); },
      async saveObservation(payload) {
        const user = firebase.currentUser();
        if (!user) throw new Error('記録するにはGoogleログインが必要です。');
        const observation = { ...payload, ownerUid: user.uid, updatedAt: firestoreSdk.serverTimestamp() };
        const reference = firestoreSdk.doc(db, 'users', user.uid, 'observations', payload.date);
        await firestoreSdk.setDoc(reference, observation, { merge: true });
        return { ok: true, observation };
      },
      async listObservations() {
        const user = firebase.currentUser();
        if (!user) return [];
        const collection = firestoreSdk.collection(db, 'users', user.uid, 'observations');
        const snapshot = await firestoreSdk.getDocs(collection);
        return snapshot.docs.map(item => item.data()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      },
    };
  }

  function isCloudConfigured(config) {
    return window.FirebaseClient.isConfigured(config);
  }

  window.AppBackend = { createCloudBackend, createLocalBackend, isCloudConfigured };
}());
