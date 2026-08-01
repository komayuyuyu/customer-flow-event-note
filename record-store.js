(function () {
  const { normalizeRecordArrays } = window.AppData;

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

  window.RecordStore = { createCloudRecordStore };
}());
