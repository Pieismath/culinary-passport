#!/usr/bin/env python3
"""Remove ONLY the demo meals seed-jason-meals.py added to Jason's account.

They're identified by a zero-width-space marker appended to their notes, so
meals he logged himself are never touched.

    python3 teardown-jason-meals.py            # dry run
    python3 teardown-jason-meals.py --confirm  # delete them
"""
import json, subprocess, sys, urllib.request, urllib.error, urllib.parse

REF = "akduiwnbkozlbfkjycgc"
JASON = "a53d7188-f4c1-4823-9b0f-4d4f70562ce2"
MARKER = "​"

keys = json.loads(subprocess.run(["supabase", "projects", "api-keys", "--project-ref", REF, "-o", "json"],
                                 capture_output=True, text=True).stdout)
SR = next(k["api_key"] for k in keys if k["name"] == "service_role")
URL = f"https://{REF}.supabase.co"
headers = {"Authorization": f"Bearer {SR}", "apikey": SR, "Content-Type": "application/json"}


def req(url, method="GET"):
    r = urllib.request.Request(url, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=45) as resp:
            d = resp.read()
            return resp.status, (json.loads(d) if d else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200]


st, rows = req(f"{URL}/rest/v1/entries?user_id=eq.{JASON}&select=id,restaurant_name,notes")
demo = [r for r in (rows or []) if (r.get("notes") or "").endswith(MARKER)]
kept = [r for r in (rows or []) if not (r.get("notes") or "").endswith(MARKER)]

print(f"demo meals to remove: {len(demo)}")
for r in demo:
    print(f"  {r['restaurant_name']}")
print(f"his own meals (kept): {len(kept)}")
for r in kept:
    print(f"  {r['restaurant_name']}")

if "--confirm" not in sys.argv:
    print("\ndry run — re-run with --confirm to delete the demo meals")
    sys.exit(0)

for r in demo:
    st, _ = req(f"{URL}/rest/v1/entries?id=eq.{r['id']}", "DELETE")
print(f"removed {len(demo)} demo meals")
