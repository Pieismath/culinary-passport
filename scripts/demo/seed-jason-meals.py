#!/usr/bin/env python3
"""Add demo meals to Jason's own account so his personal globe looks lived-in
for a recording. Separate from seed-demo.py because this touches a REAL
account: every entry it writes is tagged in the notes with a marker, and
teardown-jason-meals.py removes exactly those rows and nothing else.

    python3 seed-jason-meals.py           # add them
    python3 teardown-jason-meals.py       # take them away again
"""
import json, subprocess, sys, urllib.request, urllib.error, datetime

REF = "akduiwnbkozlbfkjycgc"
JASON = "a53d7188-f4c1-4823-9b0f-4d4f70562ce2"
MARKER = "​"  # zero-width space appended to notes: invisible, greppable

keys = json.loads(subprocess.run(["supabase", "projects", "api-keys", "--project-ref", REF, "-o", "json"],
                                 capture_output=True, text=True).stdout)
SR = next(k["api_key"] for k in keys if k["name"] == "service_role")
URL = f"https://{REF}.supabase.co"
headers = {"Authorization": f"Bearer {SR}", "apikey": SR, "Content-Type": "application/json",
           "Prefer": "return=representation"}
today = datetime.date.today()


def days_ago(n):
    return (today - datetime.timedelta(days=n)).isoformat()


# (country, restaurant, city, days ago, rating, dish, notes, visibility)
MEALS = [
    ("JP", "Sokyo", "Sydney", 4, 5, "Omakase", "Best meal of the year. Every piece perfect.", "public"),
    ("KR", "Wangjeon", "Sydney", 10, 5, "Galbi", "Grilled at the table, smoky and sweet.", "groups"),
    ("VN", "Great Aunty Three", "Sydney", 17, 4, "Bun cha", "Fresh herbs, grilled pork, unbeatable value.", "public"),
    ("IT", "Fabbrica", "Sydney", 25, 5, "Cacio e pepe", "Simple and perfect. Pasta done right.", "public"),
    ("MX", "Tacos Amigos", "Sydney", 33, 4, "Al pastor", "Street style, smoky chilli, ate six.", "public"),
    ("IN", "Don't Tell Aunty", "Sydney", 41, 5, "Butter chicken", "Rich and spicy, naan was incredible.", "public"),
    ("CN", "Golden Century", "Sydney", 52, 5, "Pipis in XO", "Late night classic. Wok breath everywhere.", "groups"),
    ("GR", "Alpha", "Sydney", 63, 4, "Grilled octopus", "Seafood done simply, lemon and oil.", "public"),
    ("LB", "Al Aseel", "Sydney", 74, 5, "Mixed grill", "Grilled meats and garlic sauce. Huge feed.", "public"),
    ("ET", "Abyssinia", "Sydney", 88, 5, "Doro wat", "Ate with my hands. Spicy and completely new to me.", "public"),
    ("TR", "Efendy", "Sydney", 99, 4, "Iskender kebab", "Grilled lamb, yoghurt, bread soaking it up.", "public"),
    ("ES", "Movida", "Sydney", 112, 4, "Jamon croquettes", "Small plates, big night. Wine flowed.", "public"),
    ("PE", "Nikkei Bar", "Sydney", 126, 5, "Ceviche", "Sour, fresh, bright — want more Peruvian food.", "public"),
    ("FR", "Bistro Rex", "Sydney", 141, 4, "Steak frites", "Classic done properly. Cheese course after.", "public"),
    ("MY", "Mamak", "Sydney", 158, 4, "Roti canai", "Queued 40 minutes. Worth it.", "public"),
    ("BR", "Braza", "Sydney", 172, 4, "Picanha", "Grilled meat until surrender.", "public"),
    ("MA", "Kazbah", "Sydney", 190, 4, "Lamb tagine", "Slow stew, sweet and savoury.", "public"),
    ("TW", "Ho Jiak", "Sydney", 205, 5, "Beef noodle soup", "Broth simmered for hours. Comfort food.", "public"),
]


def req(url, method="GET", body=None):
    if isinstance(body, (dict, list)):
        body = json.dumps(body).encode()
    r = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=45) as resp:
            d = resp.read()
            return resp.status, (json.loads(d) if d else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200]


added = 0
for code, restaurant, city, ago, rating, dish, notes, visibility in MEALS:
    st, rows = req(f"{URL}/rest/v1/entries", "POST", {
        "user_id": JASON, "country_code": code, "restaurant_name": restaurant,
        "city": city, "date_tried": days_ago(ago), "rating": rating,
        "signature_dish": dish, "notes": notes + MARKER,
        "would_return": rating >= 4, "visibility": visibility,
    })
    if st == 201:
        added += 1
    else:
        print(f"  ! {restaurant}: {st} {rows}")

# match the demo cast's timeline so the feed interleaves naturally
req(f"{URL}/rest/v1/rpc/", "GET")
print(f"added {added} demo meals to Jason's journal")
print("remove them any time with: python3 teardown-jason-meals.py")
