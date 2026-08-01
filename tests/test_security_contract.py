import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SecurityContractTests(unittest.TestCase):
    def test_firestore_rules_restrict_owner_and_observation_shape(self):
        rules = (ROOT / "firebase" / "firestore.rules").read_text(encoding="utf-8")

        self.assertIn("request.auth.uid == '__ALLOWED_UID__'", rules)
        self.assertIn("data.keys().hasOnly", rules)
        self.assertIn("data.keys().hasAll(['date', 'ownerUid', 'trafficLevel', 'updatedAt'])", rules)
        self.assertIn("data.date == recordDate", rules)
        self.assertIn("data.trafficLevel in ['暇', '通常', '混雑']", rules)
        self.assertIn("isOptionalShortString(data, 'note', 600)", rules)
        self.assertIn("isOptionalList(data, 'relatedEvents', 64)", rules)
        self.assertIn("data.updatedAt == request.time", rules)

    def test_external_event_links_are_scheme_limited_and_isolated(self):
        ui_utils = (ROOT / "ui-utils.js").read_text(encoding="utf-8")
        app_view = (ROOT / "app-view.js").read_text(encoding="utf-8")

        self.assertIn("function safeExternalUrl", ui_utils)
        self.assertIn("if (!candidate) return '';", ui_utils)
        self.assertIn("new URL(candidate);", ui_utils)
        self.assertNotIn("new URL(candidate, window.location.href)", ui_utils)
        self.assertIn("url.protocol === 'https:' || url.protocol === 'http:'", ui_utils)
        self.assertIn("!url.username && !url.password", ui_utils)
        self.assertIn("safeExternalUrl(item?.url)", app_view)
        self.assertIn('target="_blank" rel="noopener noreferrer"', app_view)

    def test_all_pages_define_the_same_content_security_policy(self):
        policies = []
        for filename in ("index.html", "records.html", "record.html"):
            html = (ROOT / filename).read_text(encoding="utf-8")
            self.assertIn('http-equiv="Content-Security-Policy"', html)
            self.assertIn("default-src 'self'", html)
            self.assertIn("object-src 'none'", html)
            self.assertIn("https://www.gstatic.com", html)
            self.assertIn("https://apis.google.com", html)
            self.assertIn("https://www.google.com", html)
            self.assertIn("https://www.recaptcha.net", html)
            self.assertIn("https://*.googleapis.com", html)
            self.assertIn('name="referrer" content="strict-origin-when-cross-origin"', html)
            policies.append(html.split('http-equiv="Content-Security-Policy" content="', 1)[1].split('"', 1)[0])

        self.assertEqual(len(set(policies)), 1)

    def test_app_check_is_initialized_after_auth_and_before_firestore(self):
        config = (ROOT / "firebase-config.js").read_text(encoding="utf-8")
        client = (ROOT / "firebase-client.js").read_text(encoding="utf-8")

        self.assertIn('"provider": "recaptcha-enterprise"', config)
        self.assertIn('"tokenAutoRefresh": true', config)
        self.assertIn("firebase-app-check.js", client)
        self.assertIn("new appCheckSdk.ReCaptchaEnterpriseProvider", client)
        self.assertIn("isTokenAutoRefreshEnabled", client)
        self.assertLess(client.index("authSdk.getAuth"), client.index("appCheckSdk.initializeAppCheck"))
        self.assertLess(client.index("appCheckSdk.initializeAppCheck"), client.index("firestoreSdk.getFirestore"))
        self.assertIn("dataServices", client)

    def test_codeql_scans_javascript_on_main_and_pull_requests(self):
        workflow = (ROOT / ".github" / "workflows" / "codeql.yml").read_text(encoding="utf-8")

        self.assertIn("github/codeql-action/init@v4", workflow)
        self.assertIn("github/codeql-action/analyze@v4", workflow)
        self.assertIn("languages: javascript-typescript", workflow)
        self.assertIn("queries: security-extended", workflow)
        self.assertIn("security-events: write", workflow)


if __name__ == "__main__":
    unittest.main()
