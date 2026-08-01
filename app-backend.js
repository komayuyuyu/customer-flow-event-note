(function () {
  const { normalizeRecordArrays } = window.AppData;

  function createLocalBackend({ eventsForDate }) {
    return {
      mode: 'local',
      async initialize() {},
      async getDay(date) {
        const response = await fetch(`./api/day?date=${encodeURIComponent(date)}`);
        if (!response.ok) throw new Error('読み込みに失敗しました');
        const result = await response.json();
        return { ...result, observation: normalizeRecordArrays(result.observation) };
      },
      async getEvents(date) { return eventsForDate(date); },
      async saveObservation(payload) {
        const observation = normalizeRecordArrays(payload);
        const response = await fetch('./api/observations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(observation) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '保存できませんでした');
        return result;
      },
      async listObservations() {
        const response = await fetch('./api/observations');
        if (!response.ok) throw new Error('記録一覧を読み込めませんでした');
        return (await response.json()).map(normalizeRecordArrays);
      },
    };
  }

  async function createCloudBackend({ config, eventsForDate, onUserChange = () => {} }) {
    const firebase = await window.FirebaseClient.create(config, {
      captureRedirectErrors: true,
      onUserChange,
      unauthorizedMessage: 'このGoogleアカウントには記録権限がありません。',
    });

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
          const { db, firestoreSdk } = firebase.dataServices();
          const reference = firestoreSdk.doc(db, 'users', user.uid, 'observations', date);
          const snapshot = await firestoreSdk.getDoc(reference);
          if (snapshot.exists()) observation = normalizeRecordArrays(snapshot.data());
        }
        return { date, events, observation };
      },
      async getEvents(date) { return eventsForDate(date); },
      async saveObservation(payload) {
        const user = firebase.currentUser();
        if (!user) throw new Error('記録するにはGoogleログインが必要です。');
        const { db, firestoreSdk } = firebase.dataServices();
        const normalizedPayload = normalizeRecordArrays(payload);
        const observation = { ...normalizedPayload, ownerUid: user.uid, updatedAt: firestoreSdk.serverTimestamp() };
        const reference = firestoreSdk.doc(db, 'users', user.uid, 'observations', normalizedPayload.date);
        await firestoreSdk.setDoc(reference, observation, { merge: true });
        return { ok: true, observation };
      },
      async listObservations() {
        const user = firebase.currentUser();
        if (!user) return [];
        const { db, firestoreSdk } = firebase.dataServices();
        const collection = firestoreSdk.collection(db, 'users', user.uid, 'observations');
        const snapshot = await firestoreSdk.getDocs(collection);
        return snapshot.docs.map(item => normalizeRecordArrays(item.data())).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      },
    };
  }

  function isCloudConfigured(config) {
    return window.FirebaseClient.isConfigured(config);
  }

  window.AppBackend = { createCloudBackend, createLocalBackend, isCloudConfigured };
}());
