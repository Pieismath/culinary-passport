#!/usr/bin/env python3
"""Remove the demo cast created by seed-demo.py.

Finds every account whose email ends in @culinarypassport.demo and deletes it,
which cascades that person's profile, meals, follows, group memberships, chat
posts, comments and reactions. Their avatar objects and any group they own go
with them. Nothing else is touched — a real account can never match, because
real users don't have @culinarypassport.demo addresses.

    python3 teardown-demo.py            # show what would be removed
    python3 teardown-demo.py --confirm  # actually remove it
"""
import json, subprocess, sys, urllib.request, urllib.error

REF = "akduiwnbkozlbfkjycgc"
DEMO_DOMAIN = "@culinarypassport.demo"

keys = json.loads(subprocess.run(["supabase", "projects", "api-keys", "--project-ref", REF, "-o", "json"],
                                 capture_output=True, text=True).stdout)
SR = next(k["api_key"] for k in keys if k["name"] == "service_role")
URL = f"https://{REF}.supabase.co"
headers = {"Authorization": f"Bearer {SR}", "apikey": SR, "Content-Type": "application/json"}


def call(url, method="GET", body=None):
    if isinstance(body, (dict, list)):
        body = json.dumps(body).encode()
    r = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=45) as resp:
            d = resp.read()
            return resp.status, (json.loads(d) if d else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200]


st, page = call(f"{URL}/auth/v1/admin/users?per_page=200")
users = [u for u in (page or {}).get("users", []) if (u.get("email") or "").endswith(DEMO_DOMAIN)]

if not users:
    print("no demo accounts found — nothing to do")
    sys.exit(0)

print(f"demo accounts ({len(users)}):")
for u in users:
    print(f"  {u['email']}")

if "--confirm" not in sys.argv:
    print("\ndry run — re-run with --confirm to delete these accounts and everything they created")
    sys.exit(0)

for u in users:
    call(f"{URL}/storage/v1/object/avatars/{u['id'].lower()}/avatar.jpg", "DELETE")
    st, _ = call(f"{URL}/auth/v1/admin/users/{u['id']}", "DELETE")
    print(f"removed {u['email']}: {st}")

st, rows = call(f"{URL}/rest/v1/profiles?select=name")
print("profiles remaining:", [r["name"] for r in rows] if isinstance(rows, list) else rows)
