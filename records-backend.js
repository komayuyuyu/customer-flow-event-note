(function () {
  const config = window.CUSTOMER_FLOW_FIREBASE_CONFIG || { enabled: false };
  const { normalizeRecordArrays } = window.AppData;
  const { createCloudRecordStore } = window.RecordStore;
  let firebase;
  let cloudRecords;
  let currentUser;

  async function initialize(onUserChange = () => {}) {
    if (!config.enabled) {
      currentUser = { uid: 'local' };
      onUserChange(currentUser);
      return currentUser;
    }
    firebase = await window.FirebaseClient.create(config, {
      unauthorizedMessage: 'このGoogleアカウントには記録権限がありません。',
      onUserChange(user, error) {
        currentUser = user;
        onUserChange(currentUser, error);
      },
    });
    cloudRecords = createCloudRecordStore({
      currentUser: () => currentUser,
      dataServices: firebase.dataServices,
      writeAuthMessage: '記録を見るにはGoogleログインが必要です。',
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

  async function list() {
    if (!config.enabled) {
      const response = await fetch('./api/observations');
      if (!response.ok) throw new Error('記録一覧を読み込めませんでした。');
      return (await response.json()).map(normalizeRecordArrays);
    }
    return cloudRecords.list();
  }

  async function get(date) {
    if (!config.enabled) {
      const response = await fetch(`./api/day?date=${encodeURIComponent(date)}`);
      if (!response.ok) throw new Error('記録を読み込めませんでした。');
      return normalizeRecordArrays((await response.json()).observation);
    }
    return cloudRecords.get(date);
  }

  async function save(payload) {
    const observation = normalizeRecordArrays(payload);
    if (!config.enabled) {
      const response = await fetch('./api/observations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(observation) });
      if (!response.ok) throw new Error('記録を保存できませんでした。');
      return;
    }
    await cloudRecords.save(observation);
  }

  async function remove(date) {
    if (!config.enabled) {
      const response = await fetch(`./api/observations?date=${encodeURIComponent(date)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('記録を削除できませんでした。');
      return;
    }
    await cloudRecords.remove(date);
  }

  window.RecordsBackend = { initialize, login, logout, list, get, save, remove, currentUser: () => currentUser };
}());
