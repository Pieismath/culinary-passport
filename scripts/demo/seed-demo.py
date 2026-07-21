#!/usr/bin/env python3
"""Populate the live project with a demo cast for recording a walkthrough:
family + friends with filled-in globes, a busy feed, and group chats with
threaded replies and mixed emoji reactions.

Everything it creates is tagged in demo-cast.json so teardown-demo.py can
remove it exactly. Jason's own account is NOT modified except:
  * demo users follow him (and he follows them back)
  * demo users are added to his existing "Fang family" group
Both are reversible by the teardown script.
"""
import json, subprocess, sys, urllib.request, urllib.error, uuid, datetime, io, random

REF = "akduiwnbkozlbfkjycgc"
JASON = "a53d7188-f4c1-4823-9b0f-4d4f70562ce2"
FANG_FAMILY = "f638daca-8b11-4718-ba89-c0d2d4e3d63f"

keys = json.loads(subprocess.run(["supabase", "projects", "api-keys", "--project-ref", REF, "-o", "json"],
                                 capture_output=True, text=True).stdout)
ANON = next(k["api_key"] for k in keys if k["name"] == "anon")
SR = next(k["api_key"] for k in keys if k["name"] == "service_role")
URL = f"https://{REF}.supabase.co"
sr_h = {"Authorization": f"Bearer {SR}", "apikey": SR, "Content-Type": "application/json"}
PW = "DemoCast!" + uuid.uuid4().hex[:10]
today = datetime.date.today()
rng = random.Random(7)


def req(url, method="GET", headers=None, body=None, raw=False):
    if isinstance(body, (dict, list)):
        body = json.dumps(body).encode()
    r = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(r, timeout=45) as resp:
            d = resp.read()
            return resp.status, (d if raw else (json.loads(d) if d else None))
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300]


def uh(jwt):
    return {"Authorization": f"Bearer {jwt}", "apikey": ANON, "Content-Type": "application/json"}


def days_ago(n):
    return (today - datetime.timedelta(days=n)).isoformat()


# ── avatars: initial-on-color discs (honest placeholder, reads well on device)
def avatar_png(initials, hex_color):
    from PIL import Image, ImageDraw, ImageFont
    size = 512
    img = Image.new("RGB", (size, size), hex_color)
    draw = ImageDraw.Draw(img)
    for path in ["/System/Library/Fonts/SFNSRounded.ttf",
                 "/System/Library/Fonts/Helvetica.ttc",
                 "/Library/Fonts/Arial.ttf"]:
        try:
            font = ImageFont.truetype(path, 210)
            break
        except Exception:
            font = None
    if font is None:
        font = ImageFont.load_default()
    box = draw.textbbox((0, 0), initials, font=font)
    draw.text(((size - (box[2] - box[0])) / 2 - box[0], (size - (box[3] - box[1])) / 2 - box[1]),
              initials, font=font, fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


# ── the cast ────────────────────────────────────────────────────────────────
CAST = [
    dict(tag="mom", name="Linda Fang", username="lindafang", color="#e05c5c",
         bio="Feeding this family for 30 years. Soup is medicine.", city="Sydney"),
    dict(tag="dad", name="Wei Fang", username="weifang", color="#2fa8bf",
         bio="Will drive 45 minutes for good dumplings.", city="Sydney"),
    dict(tag="jenn", name="Jenn", username="jennbun", color="#d86fb4",
         bio="Long distance, longer restaurant list. NYC.", city="New York"),
    dict(tag="marcus", name="Marcus Lee", username="marcuseats", color="#e8883a",
         bio="Sydney. Chasing the perfect bowl of noodles.", city="Sydney"),
    dict(tag="priya", name="Priya Nair", username="priyanair", color="#8b6fd8",
         bio="Spice tolerance: unreasonable.", city="Sydney"),
    dict(tag="leo", name="Leo Alvarez", username="leoalvarez", color="#2fbf8a",
         bio="Grill guy. If it's over fire, I'm there.", city="Sydney"),
]

# (country, restaurant, city, days ago, rating, dish, notes, visibility)
MEALS = {
    "mom": [
        ("CN", "Golden Century", "Sydney", 12, 5, "Pipis in XO", "Tastes like home. The wok breath is unreal.", "public"),
        ("TW", "Ho Jiak", "Sydney", 30, 5, "Beef noodle soup", "Broth simmered properly. Comfort in a bowl.", "public"),
        ("VN", "Great Aunty Three", "Sydney", 48, 4, "Bun bo hue", "Fresh herbs everywhere, exactly how I like it.", "public"),
        ("KR", "Wangjeon", "Sydney", 66, 4, "Kimchi jjigae", "Fermented and fiery. Wei couldn't handle it.", "groups"),
        ("JP", "Sokyo", "Sydney", 88, 5, "Chirashi", "Special occasion seafood. Worth it.", "public"),
        ("MY", "Mamak", "Sydney", 110, 4, "Roti canai", "Queued 40 minutes, would queue again.", "public"),
        ("TH", "Chat Thai", "Sydney", 140, 4, "Boat noodles", "Spicy enough to make me sweat. Good.", "public"),
        ("IN", "Don't Tell Aunty", "Sydney", 175, 5, "Butter chicken", "Rich, spicy, the naan was perfect.", "public"),
    ],
    "dad": [
        ("CN", "Din Tai Fung", "Sydney", 9, 5, "Xiao long bao", "18 folds. I counted. Best dumplings in the city.", "public"),
        ("NP", "Kathmandu Kitchen", "Sydney", 26, 5, "Momo", "Dumplings again, different passport stamp.", "public"),
        ("KR", "Fatt Sang", "Sydney", 40, 5, "Galbi", "Grilled at the table, smoky and sweet.", "public"),
        ("DE", "Löwenbräu", "Sydney", 61, 3, "Pork knuckle", "Hearty but heavy. One is enough for a decade.", "public"),
        ("PL", "Kurtosh", "Sydney", 95, 4, "Pierogi", "More dumplings. I have a type.", "groups"),
        ("GE", "Kolkhoz", "Sydney", 120, 5, "Khinkali", "Georgian dumplings — soup inside. Extraordinary.", "public"),
        ("TR", "Efendy", "Sydney", 150, 4, "Iskender kebab", "Grilled meat and bread, can't go wrong.", "public"),
    ],
    "jenn": [
        ("US", "Katz's Delicatessen", "New York", 5, 5, "Pastrami on rye", "The sandwich is the size of my head.", "public"),
        ("IT", "Rubirosa", "New York", 18, 5, "Vodka slice", "Thin crust, sweet sauce. I dream about this.", "public"),
        ("JP", "Rai Rai Ken", "New York", 33, 4, "Shoyu ramen", "Noodles with real bite. Slurped it in 8 minutes.", "public"),
        ("ET", "Awash", "New York", 52, 5, "Doro wat", "Ate with my hands, injera soaked in spice. New favourite.", "public"),
        ("MX", "Los Tacos No.1", "New York", 70, 5, "Adobada", "Street tacos standing up. Perfect.", "public"),
        ("PE", "Llama Inn", "New York", 92, 4, "Ceviche", "Sour, fresh, bright. Wish Jason had been there.", "groups"),
        ("FR", "Le Coucou", "New York", 130, 5, "Duck", "Fancy night. Cheese course nearly finished me.", "public"),
        ("GR", "Kiki's", "New York", 160, 4, "Grilled octopus", "Seafood done simply. Sat outside for hours.", "public"),
    ],
    "marcus": [
        ("JP", "RaRa Ramen", "Sydney", 3, 5, "Tonkotsu", "18 hour broth. Noodles perfect. My benchmark.", "public"),
        ("VN", "Pho An", "Sydney", 15, 5, "Pho tai", "Noodle soup royalty. Broth is clean and deep.", "public"),
        ("CN", "Master Ken's", "Sydney", 28, 4, "Dan dan noodles", "Numbing spicy noodles, went back twice.", "public"),
        ("KR", "Danjee", "Sydney", 44, 4, "Japchae", "Sweet potato noodles, grilled beef on the side.", "public"),
        ("TH", "Home Thai", "Sydney", 63, 4, "Pad see ew", "Smoky wok noodles at 1am. Elite.", "public"),
        ("MY", "Albee's Kitchen", "Sydney", 85, 5, "Char kway teow", "Smoky, greasy, perfect. Noodles again, no regrets.", "public"),
        ("SG", "Ho Jiak Haymarket", "Sydney", 108, 4, "Laksa", "Coconut noodle soup. Spicy and rich.", "public"),
        ("ID", "Ayam Goreng 99", "Sydney", 136, 4, "Nasi goreng", "Fried rice with sambal that fights back.", "public"),
    ],
    "priya": [
        ("IN", "Chatkazz", "Sydney", 7, 5, "Pani puri", "Street food heaven. Spicy, sour, everything.", "public"),
        ("LK", "Lankan Filling Station", "Sydney", 21, 5, "Hoppers", "Fermented rice pancakes, fiery sambol.", "public"),
        ("ET", "Abyssinia", "Sydney", 38, 5, "Vegetarian combo", "Vegetarian and enormous. Spice done properly.", "public"),
        ("MX", "Tacos Amigos", "Sydney", 57, 4, "Al pastor", "Smoky chilli, fresh lime. Street style.", "public"),
        ("MA", "Kazbah", "Sydney", 79, 4, "Lamb tagine", "Slow stew, sweet and savoury bread mopping.", "groups"),
        ("LB", "Al Aseel", "Sydney", 102, 5, "Mixed grill", "Grilled meats, fresh herbs, garlic that lingers.", "public"),
        ("KH", "Angkor Wat", "Sydney", 128, 4, "Fish amok", "Coconut curry, subtle. Wanted more spice.", "public"),
    ],
    "leo": [
        ("BR", "Braza", "Sydney", 11, 5, "Picanha", "Meat carved at the table until you surrender.", "public"),
        ("AR", "Porteño", "Sydney", 24, 5, "Asado", "Grilled over coals for hours. Smoky perfection.", "public"),
        ("ZA", "Bushman's Kloof", "Sydney", 46, 4, "Boerewors", "Grilled sausage, chakalaka on the side.", "public"),
        ("TR", "Stanbuli", "Sydney", 68, 4, "Adana kebab", "Charcoal grilled, smoky and juicy.", "public"),
        ("PT", "Bica", "Sydney", 90, 4, "Grilled sardines", "Seafood on the grill, lemon, done.", "public"),
        ("UY", "El Toro", "Sydney", 115, 4, "Chivito", "Steak sandwich engineering.", "groups"),
        ("ES", "Movida", "Sydney", 145, 5, "Chorizo", "Smoky, wine-friendly. Stayed for four courses.", "public"),
    ],
}

cast = {}
print("creating cast…")
for person in CAST:
    email = f"demo-{person['tag']}@culinarypassport.demo"
    st, u = req(f"{URL}/auth/v1/admin/users", "POST", sr_h,
                {"email": email, "password": PW, "email_confirm": True,
                 "user_metadata": {"name": person["name"]}})
    if st not in (200, 201):
        print(f"  ! {person['tag']}: {st} {u}"); sys.exit(1)
    uid = u["id"]
    st, tok = req(f"{URL}/auth/v1/token?grant_type=password", "POST",
                  {"apikey": ANON, "Content-Type": "application/json"},
                  {"email": email, "password": PW})
    jwt = tok["access_token"]

    initials = "".join(w[0] for w in person["name"].split()[:2]).upper()
    jpeg = avatar_png(initials, person["color"])
    path = f"{uid.lower()}/avatar.jpg"
    req(f"{URL}/storage/v1/object/avatars/{path}", "POST",
        {"Authorization": f"Bearer {jwt}", "apikey": ANON, "Content-Type": "image/jpeg"}, jpeg)
    avatar_url = f"{URL}/storage/v1/object/public/avatars/{path}"

    req(f"{URL}/rest/v1/profiles?id=eq.{uid}", "PATCH", uh(jwt),
        {"username": person["username"], "bio": person["bio"], "is_public": True,
         "color": person["color"], "home_city": person["city"], "avatar_url": avatar_url,
         "name": person["name"]})
    cast[person["tag"]] = dict(id=uid, jwt=jwt, email=email, **person)
    print(f"  ✓ {person['name']}")

# ── journals ────────────────────────────────────────────────────────────────
print("logging meals…")
entry_ids = {}
for tag, meals in MEALS.items():
    person = cast[tag]
    for code, restaurant, city, ago, rating, dish, notes, visibility in meals:
        st, rows = req(f"{URL}/rest/v1/entries", "POST",
                       {**uh(person["jwt"]), "Prefer": "return=representation"},
                       {"user_id": person["id"], "country_code": code, "restaurant_name": restaurant,
                        "city": city, "date_tried": days_ago(ago), "rating": rating,
                        "signature_dish": dish, "notes": notes, "would_return": rating >= 4,
                        "visibility": visibility})
        if st == 201:
            entry_ids.setdefault(tag, {})[code] = rows[0]["id"]
    print(f"  ✓ {person['name']}: {len(meals)}")

# ── follow graph ────────────────────────────────────────────────────────────
print("wiring follows…")
for tag, person in cast.items():
    req(f"{URL}/rest/v1/follows", "POST", uh(person["jwt"]),
        {"follower_id": person["id"], "followee_id": JASON})
    for other in cast.values():
        if other["id"] != person["id"] and rng.random() < 0.7:
            req(f"{URL}/rest/v1/follows", "POST", uh(person["jwt"]),
                {"follower_id": person["id"], "followee_id": other["id"]})

# ── groups ──────────────────────────────────────────────────────────────────
print("filling groups…")
# family joins Jason's existing group (service role: he's the owner)
for tag in ("mom", "dad", "jenn"):
    req(f"{URL}/rest/v1/group_members", "POST", sr_h,
        {"group_id": FANG_FAMILY, "user_id": cast[tag]["id"], "role": "member"})

# a friends group owned by Marcus, with Jason in it
st, g = req(f"{URL}/rest/v1/groups", "POST",
            {**uh(cast["marcus"]["jwt"]), "Prefer": "return=representation"},
            {"name": "Sydney Eats", "created_by": cast["marcus"]["id"], "invite_code": "sydneyeats"})
friends_group = g[0]["id"]
for tag in ("priya", "leo"):
    req(f"{URL}/rest/v1/rpc/join_group_by_invite", "POST", uh(cast[tag]["jwt"]), {"code": "sydneyeats"})
req(f"{URL}/rest/v1/group_members", "POST", sr_h,
    {"group_id": friends_group, "user_id": JASON, "role": "member"})

# ── chat: posts, threaded replies, mixed reactions ──────────────────────────
print("writing chats…")
CHATS = [
    (FANG_FAMILY, [
        ("mom", "Sunday dinner at ours. I'm making the beef noodle soup.", "TW",
         [("dad", "I'll get the noodles from Ashfield."), ("jenn", "Wish I could teleport for this 😭")],
         [("dad", "😋"), ("jenn", "❤️"), ("jenn", "🍜")]),
        ("dad", "Din Tai Fung again. 18 folds per dumpling, I counted.", "CN",
         [("mom", "You count every time."), ("jenn", "dad has a type and it's dumplings 🥟")],
         [("mom", "😂"), ("jenn", "😂"), ("mom", "🥟")]),
        ("jenn", "Found Ethiopian in the East Village — ate everything with my hands. Adding it to the family list.", "ET",
         [("mom", "Send the name, we'll find one here."), ("dad", "Is it spicy? Your mother says everything is spicy.")],
         [("mom", "🤩"), ("dad", "👏"), ("mom", "🔥")]),
    ]),
    (None, [  # friends group, filled in below
        ("marcus", "RaRa Ramen. 18 hour broth. This is the bar now.", "JP",
         [("priya", "Broth good but needs chilli oil, sorry."), ("leo", "everything needs fire according to you")],
         [("priya", "🍜"), ("leo", "🔥"), ("priya", "🤤")]),
        ("leo", "Asado at Porteño — three hours over coals. Bring appetite.", "AR",
         [("marcus", "In. Booking for Friday?"), ("priya", "Only if there's something green on the table 🥗")],
         [("marcus", "🥩"), ("priya", "😂"), ("marcus", "🙌"), ("leo", "💯")]),
        ("priya", "Lankan Filling Station — hoppers + sambol. Spice level: correct.", "LK",
         [("leo", "correct for you is lethal for me"), ("marcus", "the egg hopper is unreal though")],
         [("leo", "🥵"), ("marcus", "😋"), ("leo", "🌶️")]),
    ]),
]

for group_id, thread in CHATS:
    gid = group_id or friends_group
    for author, text, entry_code, replies, reactions in thread:
        person = cast[author]
        payload = {"group_id": gid, "author_id": person["id"], "text": text}
        linked = entry_ids.get(author, {}).get(entry_code)
        if linked:
            payload["entry_id"] = linked
        st, rows = req(f"{URL}/rest/v1/group_posts", "POST",
                       {**uh(person["jwt"]), "Prefer": "return=representation"}, payload)
        if st != 201:
            print(f"  ! post {st} {rows}"); continue
        pid = rows[0]["id"]
        for replier, reply in replies:
            req(f"{URL}/rest/v1/post_comments", "POST", uh(cast[replier]["jwt"]),
                {"post_id": pid, "author_id": cast[replier]["id"], "text": reply})
        for reactor, emoji in reactions:
            req(f"{URL}/rest/v1/post_reactions", "POST", uh(cast[reactor]["jwt"]),
                {"post_id": pid, "user_id": cast[reactor]["id"], "emoji": emoji})
print("  ✓ chats")

json.dump({"url": URL, "sr": SR, "password": PW,
           "users": {t: {"id": c["id"], "email": c["email"], "name": c["name"]} for t, c in cast.items()},
           "friends_group": friends_group, "fang_family": FANG_FAMILY, "jason": JASON},
          open(sys.argv[1], "w"), indent=2)
print(f"\ndemo cast ready — {len(cast)} people, {sum(len(m) for m in MEALS.values())} meals")
print(f"details in {sys.argv[1]} (teardown-demo.py removes everything)")
