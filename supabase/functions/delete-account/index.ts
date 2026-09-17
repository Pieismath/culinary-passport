// Supabase Edge Function: delete-account
//
// App Store guideline 5.1.1(v): apps with accounts must offer in-app account
// deletion. The client can't call auth.admin, so this function does the work:
// verify the caller's JWT, remove their storage objects (rows cascade from the
// auth user), then delete the auth user itself.
//
// POST with the user's own Authorization header. No body. Deletes ONLY the
// calling user — there is no way to pass a target id.
//
// Deploy: supabase functions deploy delete-account

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Caller identity from their JWT — the only account this can ever delete.
  const auth = req.headers.get("Authorization") ?? "";
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return json({ error: "Not signed in" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Storage objects don't cascade with the auth user — collect and remove
  // everything under the user's folder in each bucket (paths are written
  // lowercase by the app; tolerate legacy uppercase too).
  const folders = [user.id.toLowerCase(), user.id.toUpperCase()];
  for (const bucket of ["photos", "avatars"]) {
    for (const folder of folders) {
      await emptyFolder(admin, bucket, folder);
    }
  }

  // Covers of the groups this user owns — those groups are deleted below.
  const { data: owned } = await admin.from("groups").select("id")
    .eq("created_by", user.id);
  for (const group of owned ?? []) {
    await emptyFolder(admin, "group-covers", group.id);
  }

  // Groups the user OWNS die with them (created_by cascade) — that is the
  // documented behavior in the app's confirm dialog.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: error.message }, 500);

  return json({ deleted: true });
});

/// `list` pages at 1000 objects; a well-travelled account can have more photos
/// than that, so keep removing until the folder comes back empty.
async function emptyFolder(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  folder: string,
) {
  for (let round = 0; round < 50; round++) {
    const { data: objects } = await admin.storage.from(bucket)
      .list(folder, { limit: 1000 });
    if (!objects || objects.length === 0) return;
    const { error } = await admin.storage.from(bucket)
      .remove(objects.map((o) => `${folder}/${o.name}`));
    if (error) return;
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
