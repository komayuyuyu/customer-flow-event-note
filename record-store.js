(function () {
  const { normalizeRecordArrays } = window.AppData;

  function createLocalRecordStore({ messages = {} } = {}) {
    const errorMessages = {
      get: '記録を読み込めませんでした。',
      list: '記録一覧を読み込めませんでした。',
      save: '記録を保存できませんでした。',
      remove: '記録を削除できませんでした。',
      ...messages,
    };

    async function getDay(date) {
      const response = await fetch(`./api/day?date=${encodeURIComponent(date)}`);
      if (!response.ok) throw new Error(errorMessages.get);
      const result = await response.json();
      return { ...result, observation: normalizeRecordArrays(result.observation) };
    }

    async function get(date) {
      return (await getDay(date)).observation;
    }

    async function list() {
      const response = await fetch('./api/observations');
      if (!response.ok) throw new Error(errorMessages.list);
      return (await response.json()).map(normalizeRecordArrays);
    }

    async function save(payload) {
      const observation = normalizeRecordArrays(payload);
      const response = await fetch('./api/observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(observation),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || errorMessages.save);
      return result;
    }

    async function remove(date) {
      const response = await fetch(`./api/observations?date=${encodeURIComponent(date)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(errorMessages.remove);
    }

    return { getDay, get, list, save, remove };
  }

  function createCloudRecordStore({
    currentUser,
    dataServices,
    readAuthMessage = '記録を見るにはGoogleログインが必要です。',
    writeAuthMessage = '記録するにはGoogleログインが必要です。',
  }) {
    function userOrFallback({ allowAnonymous = false, message = readAuthMessage } = {}) {
      const user = currentUser();
      if (user || allowAnonymous) return user;
      throw new Error(message);
    }

    async function get(date, options = {}) {
      const user = userOrFallback(options);
      if (!user) return null;
      const { db, firestoreSdk } = dataServices();
      const reference = firestoreSdk.doc(db, 'users', user.uid, 'observations', date);
      const snapshot = await firestoreSdk.getDoc(reference);
      return snapshot.exists() ? normalizeRecordArrays(snapshot.data()) : null;
    }

    async function list(options = {}) {
      const user = userOrFallback(options);
      if (!user) return [];
      const { db, firestoreSdk } = dataServices();
      const collection = firestoreSdk.collection(db, 'users', user.uid, 'observations');
      const snapshot = await firestoreSdk.getDocs(collection);
      return snapshot.docs
        .map(item => normalizeRecordArrays(item.data()))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }

    async function save(payload) {
      const user = userOrFallback({ message: writeAuthMessage });
      const { db, firestoreSdk } = dataServices();
      const normalizedPayload = normalizeRecordArrays(payload);
      const observation = {
        ...normalizedPayload,
        ownerUid: user.uid,
        updatedAt: firestoreSdk.serverTimestamp(),
      };
      const reference = firestoreSdk.doc(db, 'users', user.uid, 'observations', normalizedPayload.date);
      await firestoreSdk.setDoc(reference, observation, { merge: true });
      return observation;
    }

    async function remove(date) {
      const user = userOrFallback();
      const { db, firestoreSdk } = dataServices();
      const reference = firestoreSdk.doc(db, 'users', user.uid, 'observations', date);
      await firestoreSdk.deleteDoc(reference);
    }

    return { get, list, save, remove };
  }

  window.RecordStore = { createCloudRecordStore, createLocalRecordStore };
}());
