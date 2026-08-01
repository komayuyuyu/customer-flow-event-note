(function () {
  const { createCloudRecordStore, createLocalRecordStore } = window.RecordStore;

  function createLocalBackend({ eventsForDate }) {
    const records = createLocalRecordStore({
      messages: {
        get: '読み込みに失敗しました',
        save: '保存できませんでした',
      },
    });
    return {
      mode: 'local',
      async initialize() {},
      getDay: records.getDay,
      async getEvents(date) { return eventsForDate(date); },
      saveObservation: records.save,
      listObservations: records.list,
    };
  }

  async function createCloudBackend({ config, eventsForDate, onUserChange = () => {} }) {
    const firebase = await window.FirebaseClient.create(config, {
      captureRedirectErrors: true,
      onUserChange,
      unauthorizedMessage: 'このGoogleアカウントには記録権限がありません。',
    });
    const records = createCloudRecordStore({
      currentUser: firebase.currentUser,
      dataServices: firebase.dataServices,
    });

    return {
      mode: 'cloud',
      initialize: firebase.initialize,
      login: firebase.login,
      logout: firebase.logout,
      async getDay(date) {
        const events = await eventsForDate(date);
        return { date, events };
      },
      async getEvents(date) { return eventsForDate(date); },
      async saveObservation(payload) {
        const observation = await records.save(payload);
        return { ok: true, observation };
      },
      async listObservations() { return records.list({ allowAnonymous: true }); },
    };
  }

  function isCloudConfigured(config) {
    return window.FirebaseClient.isConfigured(config);
  }

  window.AppBackend = { createCloudBackend, createLocalBackend, isCloudConfigured };
}());
