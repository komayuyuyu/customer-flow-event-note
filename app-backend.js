(function () {
  const { normalizeRecordArrays } = window.AppData;
  const { createCloudRecordStore } = window.RecordStore;

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
