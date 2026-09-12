#!/usr/bin/env python3
"""Report-only comparison of canonical H2H rows with an explicit source file."""
from __future__ import annotations
import argparse, json
from pathlib import Path

def key(row):
    return (int(row.get("season", 0)), int(row.get("week", 0)), tuple(sorted((str(row.get("teamA", "")), str(row.get("teamB", ""))))))
def scores(row):
    teams = (str(row.get("teamA", "")), str(row.get("teamB", "")))
    values = (row.get("scoreA"), row.get("scoreB"))
    return values if teams[0] <= teams[1] else (values[1], values[0])
def display(k): return [k[0], k[1], list(k[2])]
def load(path):
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, list): raise ValueError("source files must contain JSON arrays")
    return {key(row): row for row in value}
def reconcile(canonical, source):
    matched, different, missing, new = [], [], [], []
    for k, before in canonical.items():
        after = source.get(k)
        if after is None: missing.append({"key": display(k)})
        elif scores(before) == scores(after): matched.append({"key": display(k)})
        else: different.append({"key": display(k), "before": {"scoreA": scores(before)[0], "scoreB": scores(before)[1]}, "after": {"scoreA": scores(after)[0], "scoreB": scores(after)[1]}})
    for k in source.keys() - canonical.keys(): new.append({"key": display(k)})
    return {"matched": matched, "different": different, "missing": missing, "new": new,
            "summary": {"matched": len(matched), "different": len(different), "missing": len(missing), "new": len(new)}}
def main():
    p = argparse.ArgumentParser(description=__doc__); p.add_argument("--canonical", required=True); p.add_argument("--source", required=True); p.add_argument("--season", type=int, required=True); p.add_argument("--out", required=True); p.add_argument("--out-candidate")
    a = p.parse_args(); out = Path(a.out).resolve(); canonical = Path(a.canonical).resolve()
    if out == canonical or out.name in {"H2H.json", "CurrentSeason.json", "TransactionHistory.json"}:
        raise SystemExit("refusing canonical reconciliation output path")
    result = reconcile({k:v for k,v in load(canonical).items() if k[0] == a.season}, {k:v for k,v in load(a.source).items() if k[0] == a.season})
    result["season"] = a.season; result["source"] = str(Path(a.source).resolve())
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
if __name__ == "__main__": main()
