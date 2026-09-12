#!/usr/bin/env python3
"""Read-only Sleeper history reconciliation; never mutates canonical assets."""
from __future__ import annotations
import argparse, json, math, os, tempfile
from datetime import datetime, timezone
from pathlib import Path
CANONICAL={"H2H.json","CurrentSeason.json","TransactionHistory.json"}
def pair(r): return tuple(sorted((str(r.get("teamA","")),str(r.get("teamB","")))))
def key(r): return (int(r.get("season",0)),int(r.get("week",0)),pair(r))
def cents(v): return None if v is None or isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) else round(float(v)*100)
def score(r):
    v=(r.get("scoreA"),r.get("scoreB")); t=(str(r.get("teamA","")),str(r.get("teamB",""))); return v if t[0]<=t[1] else v[::-1]
def load_rows(path,label):
    value=json.loads(Path(path).read_text(encoding="utf-8")); result={}
    if not isinstance(value,list): raise ValueError(f"{label} must be a JSON array")
    for row in value:
        k=key(row)
        if k in result: raise ValueError(f"{label} contains duplicate canonical key {k}")
        result[k]=row
    return result
def load_source(path, mapping):
    value=json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(value, list): return load_rows(path, "source")
    if not isinstance(value, dict) or not isinstance(value.get("weeks"), dict): raise ValueError("source fixture requires retrieved_at and weeks")
    rows=[]
    for week, raw_rows in value["weeks"].items():
        if not isinstance(raw_rows, list): raise ValueError("source week must be an array")
        for row in raw_rows:
            row=dict(row); row["week"]=int(week)
            for side in ("A","B"):
                roster=row.get(f"roster{side}") or row.get(f"roster_id{side}")
                if roster is not None:
                    if str(roster) not in mapping: raise ValueError("source contains unknown roster")
                    row[f"team{side}"]=mapping[str(roster)]
            rows.append(row)
    temp=Path(tempfile.mkstemp(prefix="reconcile-source-")[1]); temp.write_text(json.dumps(rows),encoding="utf-8")
    try: return load_rows(temp,"source")
    finally: temp.unlink(missing_ok=True)
def reconcile(old,new,season=2025,mapping="mapping.json"):
    matched=[]; different=[]; missing=[]; added=[]
    for k,before in old.items():
        if k[0]!=season: continue
        after=new.get(k)
        if after is None: missing.append({"key":list(k)}); continue
        if tuple(cents(v) for v in score(before))==tuple(cents(v) for v in score(after)) and before.get("status")==after.get("status"): matched.append({"key":list(k)})
        else: different.append({"key":list(k),"before":{"scores":score(before),"status":before.get("status")},"after":{"scores":score(after),"status":after.get("status")}})
    for k,v in new.items():
        if k[0]==season and k not in old: added.append({"key":list(k),"after":v})
    return {"season":season,"mapping":str(Path(mapping).resolve()),"matched":matched,"different":different,"missing":missing,"new":added,"summary":{"matched":len(matched),"different":len(different),"missing":len(missing),"new":len(added)},"downstream_consequences":"Differences may affect records, trophies, odds, recaps, and derived statistics; no assets are changed."}
def safe(path,canonical,source):
    target=Path(path).resolve(); roots=(canonical.resolve(),source.resolve())
    if target.name in CANONICAL or any(root==target or root in target.parents for root in roots): raise ValueError("output must be outside canonical and source paths")
    return target
def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument("--season",type=int,required=True); p.add_argument("--mapping",required=True); p.add_argument("--canonical",required=True); p.add_argument("--source-fixture",required=True); p.add_argument("--out",required=True); p.add_argument("--out-candidate"); p.add_argument("--allow-live",action="store_true"); a=p.parse_args()
    canonical=Path(a.canonical).resolve(); source=Path(a.source_fixture).resolve(); out=safe(a.out,canonical,source); mapping=json.loads(Path(a.mapping).read_text(encoding="utf-8"))
    if not isinstance(mapping,dict): raise ValueError("mapping must be a JSON object")
    result=reconcile(load_rows(canonical,"canonical"),load_source(source,mapping),a.season,a.mapping); result["source_retrieved_at"]=datetime.fromtimestamp(source.stat().st_mtime,timezone.utc).isoformat().replace("+00:00","Z"); result["report_generated_at"]=datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile("w",encoding="utf-8",dir=out.parent,delete=False) as f: json.dump(result,f,indent=2,sort_keys=True); f.write("\n"); temp=f.name
    os.replace(temp,out)
    if a.out_candidate:
        candidate=safe(a.out_candidate,canonical,source)
        rows=[row for row in load_source(source,mapping).values() if int(row.get("season",a.season))==a.season]
        candidate.write_text(json.dumps(rows,indent=2,sort_keys=True)+"\n",encoding="utf-8")
if __name__=="__main__": main()
