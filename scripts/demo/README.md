# Demo cast

Populates the live project with a believable world for recording a walkthrough:
family and friends with filled-in globes, a busy discover feed, and group chats
with threaded replies and mixed emoji reactions.

```bash
python3 seed-demo.py demo-cast.json   # create (writes credentials to the json)
python3 teardown-demo.py              # dry run: list what would be removed
python3 teardown-demo.py --confirm    # remove all of it
```

**The cast** — Linda Fang (mom), Wei Fang (dad), Jenn, Marcus Lee, Priya Nair,
Leo Alvarez. Each has a photo, bio, username, distinct globe color, 7–8 logged
meals with notes and ratings, and a follow graph. Their emails all end in
`@culinarypassport.demo`, which is how teardown finds them — a real account can
never match.

**What it touches on Jason's account** (both reversible, both removed by teardown):

- the cast follow him, and are added to his existing **Fang family** group
- he's added to **Sydney Eats**, a group owned by Marcus

His own meals, profile and groups are never modified. Note the meals are
photo-less by design — invented food photos would look worse than none.

`demo-cast.json` holds the demo accounts' shared password and the service-role
key used to create them: keep it out of git (the repo's `.gitignore` covers
`*.json` here) and delete it once the recording is done.
