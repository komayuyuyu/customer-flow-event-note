import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


class FirebaseClientRuntimeTest(unittest.TestCase):
    def run_node(self, script):
        result = subprocess.run(
            [NODE, "-e", textwrap.dedent(script), str(ROOT / "firebase-client.js")],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(NODE, "Node.js is required for JavaScript runtime tests")
    def test_app_check_starts_after_auth_and_before_firestore_once(self):
        self.run_node(
            """
            const assert = require('node:assert/strict');
            const fs = require('node:fs');
            const vm = require('node:vm');

            global.window = {};
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));

            function createSdkMock() {
              let authHandler;
              const calls = [];
              const auth = {};
              class GoogleAuthProvider { setCustomParameters() {} }
              class ReCaptchaEnterpriseProvider {
                constructor(siteKey) { calls.push(`provider:${siteKey}`); }
              }
              return {
                calls,
                async authChanged(user) { await authHandler(user); },
                sdk: {
                  appSdk: { initializeApp: () => ({}) },
                  appCheckSdk: {
                    ReCaptchaEnterpriseProvider,
                    initializeAppCheck: () => { calls.push('app-check'); },
                  },
                  authSdk: {
                    GoogleAuthProvider,
                    browserLocalPersistence: 'local',
                    getAuth: () => auth,
                    setPersistence: async () => { calls.push('persistence'); },
                    getRedirectResult: async () => null,
                    onAuthStateChanged: (_auth, handler) => { authHandler = handler; },
                    signInWithPopup: async () => null,
                    signOut: async () => { await authHandler(null); },
                  },
                  firestoreSdk: {
                    getFirestore: () => { calls.push('firestore'); return 'db'; },
                  },
                },
              };
            }

            (async () => {
              const mock = createSdkMock();
              const notifications = [];
              const client = await window.FirebaseClient.create({
                enabled: true,
                allowedUid: 'owner',
                firebase: { apiKey: 'public', authDomain: 'example', projectId: 'project', appId: 'app' },
                appCheck: { enabled: true, siteKey: 'site-key', tokenAutoRefresh: true },
              }, {
                onUserChange: (user, error) => notifications.push({ uid: user?.uid || null, error: error?.message || '' }),
              }, async () => mock.sdk);

              const initializing = client.initialize();
              assert.deepEqual(mock.calls, ['persistence']);
              await mock.authChanged({ uid: 'owner' });
              assert.equal((await initializing).uid, 'owner');
              assert.deepEqual(notifications, [{ uid: 'owner', error: '' }]);
              assert.deepEqual(mock.calls, ['persistence']);

              const firstServices = client.dataServices();
              const secondServices = client.dataServices();
              assert.equal(firstServices, secondServices);
              assert.deepEqual(mock.calls, ['persistence', 'provider:site-key', 'app-check', 'firestore']);
            })().catch(error => { console.error(error); process.exitCode = 1; });
            """
        )

    @unittest.skipUnless(NODE, "Node.js is required for JavaScript runtime tests")
    def test_unauthorized_account_error_is_reported_once(self):
        self.run_node(
            """
            const assert = require('node:assert/strict');
            const fs = require('node:fs');
            const vm = require('node:vm');

            global.window = {};
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));

            let authHandler;
            const auth = {};
            class GoogleAuthProvider { setCustomParameters() {} }
            const sdk = {
              appSdk: { initializeApp: () => ({}) },
              appCheckSdk: {
                ReCaptchaEnterpriseProvider: class {},
                initializeAppCheck: () => {},
              },
              authSdk: {
                GoogleAuthProvider,
                browserLocalPersistence: 'local',
                getAuth: () => auth,
                setPersistence: async () => {},
                getRedirectResult: async () => null,
                onAuthStateChanged: (_auth, handler) => { authHandler = handler; },
                signInWithPopup: async () => null,
                signOut: async () => { await authHandler(null); },
              },
              firestoreSdk: { getFirestore: () => 'db' },
            };

            (async () => {
              const notifications = [];
              const client = await window.FirebaseClient.create({
                enabled: true,
                allowedUid: 'owner',
                firebase: { apiKey: 'public', authDomain: 'example', projectId: 'project', appId: 'app' },
              }, {
                unauthorizedMessage: 'このGoogleアカウントには記録権限がありません。',
                onUserChange: (user, error) => notifications.push({ uid: user?.uid || null, error: error?.message || '' }),
              }, async () => sdk);

              const initializing = client.initialize();
              await authHandler({ uid: 'someone-else' });
              assert.equal(await initializing, null);
              assert.equal(client.currentUser(), null);
              assert.deepEqual(notifications, [{
                uid: null,
                error: 'このGoogleアカウントには記録権限がありません。',
              }]);
            })().catch(error => { console.error(error); process.exitCode = 1; });
            """
        )

    @unittest.skipUnless(NODE, "Node.js is required for JavaScript runtime tests")
    def test_auth_operations_are_deduplicated_while_pending(self):
        self.run_node(
            """
            const assert = require('node:assert/strict');
            const fs = require('node:fs');
            const vm = require('node:vm');

            global.window = {};
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));

            let loginCalls = 0;
            let logoutCalls = 0;
            let releaseLogin;
            let releaseLogout;
            let loginGate = new Promise(resolve => { releaseLogin = resolve; });
            let logoutGate = new Promise(resolve => { releaseLogout = resolve; });
            const auth = {};
            class GoogleAuthProvider { setCustomParameters() {} }
            const sdk = {
              appSdk: { initializeApp: () => ({}) },
              appCheckSdk: {
                ReCaptchaEnterpriseProvider: class {},
                initializeAppCheck: () => {},
              },
              authSdk: {
                GoogleAuthProvider,
                browserLocalPersistence: 'local',
                getAuth: () => auth,
                setPersistence: async () => {},
                getRedirectResult: async () => null,
                onAuthStateChanged: () => {},
                async signInWithPopup() {
                  loginCalls += 1;
                  await loginGate;
                },
                async signOut() {
                  logoutCalls += 1;
                  await logoutGate;
                },
              },
              firestoreSdk: { getFirestore: () => 'db' },
            };

            (async () => {
              const client = await window.FirebaseClient.create({
                enabled: true,
                firebase: { apiKey: 'public', authDomain: 'example', projectId: 'project', appId: 'app' },
              }, {}, async () => sdk);

              const firstLogin = client.login();
              const duplicateLogin = client.login();
              await new Promise(resolve => setImmediate(resolve));
              assert.equal(loginCalls, 1);
              releaseLogin();
              await Promise.all([firstLogin, duplicateLogin]);

              loginGate = Promise.resolve();
              await client.login();
              assert.equal(loginCalls, 2);

              const firstLogout = client.logout();
              const duplicateLogout = client.logout();
              await new Promise(resolve => setImmediate(resolve));
              assert.equal(logoutCalls, 1);
              releaseLogout();
              await Promise.all([firstLogout, duplicateLogout]);

              logoutGate = Promise.resolve();
              await client.logout();
              assert.equal(logoutCalls, 2);
            })().catch(error => { console.error(error); process.exitCode = 1; });
            """
        )


if __name__ == "__main__":
    unittest.main()
