import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "generate_draft_spot_asset.py"
SEASON_SUMMARY = ROOT / "assets" / "SeasonSummary.json"


def load_generator_module():
    spec = importlib.util.spec_from_file_location("generate_draft_spot_asset", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class DraftSpotAssetGeneratorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator_module()
        cls.source_rows = json.loads(SEASON_SUMMARY.read_text())

    def test_build_asset_excludes_seasons_without_picks(self):
        asset = self.generator.build_asset(self.source_rows)
        self.assertEqual(asset["season_range"], {"start": 2017, "end": 2025})
        self.assertEqual(asset["team_seasons"], 92)
        self.assertFalse(any(row["season"] < 2017 for row in asset["rows"]))
        self.assertEqual(next(row for row in asset["pick_summary"] if row["draft_pick"] == 11)["n"], 1)
        self.assertEqual(next(row for row in asset["pick_summary"] if row["draft_pick"] == 12)["n"], 1)
        self.assertIsInstance(asset["pick_summary"][0]["playoff_rate"], float)
        self.assertTrue(all(row["confidence"] for row in asset["owner_recommendations"]))

    def test_cli_output_is_deterministic(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            first = Path(tmpdir) / "DraftSpot.first.json"
            second = Path(tmpdir) / "DraftSpot.second.json"
            base_cmd = [
                "python3",
                str(SCRIPT_PATH),
                "--season-summary",
                str(SEASON_SUMMARY),
            ]
            subprocess.run([*base_cmd, "--out", str(first)], check=True, cwd=ROOT)
            subprocess.run([*base_cmd, "--out", str(second)], check=True, cwd=ROOT)
            self.assertEqual(first.read_text(), second.read_text())


if __name__ == "__main__":
    unittest.main()
