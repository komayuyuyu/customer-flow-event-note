(function () {
  const config = window.CUSTOMER_FLOW_FIREBASE_CONFIG || { enabled: false };
  const { normalizeRecordArrays } = window.AppData;
  const { createCloudRecordStore, createLocalRecordStore } = window.RecordStore;
  const localRecords = createLocalRecordStore();
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
    if (!config.enabled) return localRecords.list();
    return cloudRecords.list();
  }

  async function get(date) {
    if (!config.enabled) return localRecords.get(date);
    return cloudRecords.get(date);
  }

  async function save(payload) {
    const observation = normalizeRecordArrays(payload);
    if (!config.enabled) return localRecords.save(observation);
    await cloudRecords.save(observation);
  }

  async function remove(date) {
    if (!config.enabled) return localRecords.remove(date);
    await cloudRecords.remove(date);
  }

  window.RecordsBackend = { initialize, login, logout, list, get, save, remove, currentUser: () => currentUser };
}());
