import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


class UiUtilsRuntimeTest(unittest.TestCase):
    @unittest.skipUnless(NODE, "Node.js is required for JavaScript runtime tests")
    def test_quiet_periods_are_mutually_exclusive(self):
        script = textwrap.dedent(
            """
            const assert = require('node:assert/strict');
            const fs = require('node:fs');
            const vm = require('node:vm');

            global.window = {};
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));

            const {
              bindQuietPeriodExclusivity,
              normalizeQuietPeriods,
              selectedQuietPeriods,
            } = window.UiUtils;

            assert.deepEqual(normalizeQuietPeriods(['午前', '特になし', '昼']), ['午前', '昼']);
            assert.deepEqual(normalizeQuietPeriods(['特になし']), ['特になし']);
            assert.deepEqual(normalizeQuietPeriods(['午前', '午前']), ['午前']);

            const inputs = [
              { name: 'period', value: '午前', checked: true },
              { name: 'period', value: '昼', checked: false },
              { name: 'period', value: '特になし', checked: false },
            ];
            let changeListener;
            const root = {
              addEventListener(type, listener) {
                if (type === 'change') changeListener = listener;
              },
              querySelectorAll(selector) {
                return selector.includes(':checked') ? inputs.filter(input => input.checked) : inputs;
              },
            };

            bindQuietPeriodExclusivity(root);
            inputs[2].checked = true;
            changeListener({ target: inputs[2] });
            assert.equal(inputs[0].checked, false);
            assert.deepEqual(selectedQuietPeriods(root), ['特になし']);

            inputs[1].checked = true;
            changeListener({ target: inputs[1] });
            assert.equal(inputs[2].checked, false);
            assert.deepEqual(selectedQuietPeriods(root), ['昼']);
            """
        )
        result = subprocess.run(
            [NODE, "-e", script, str(ROOT / "ui-utils.js")],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
