// Supabase Edge Function: notify-group (scaffold)
//
// B5: push-notification fan-out for group activity. Invoked by a database
// webhook on group_posts inserts (Dashboard → Database → Webhooks →
// "on insert into group_posts" → this function).
//
// Design (v1.2):
//  - Batched, not spammy: collapse by (user, group) — APNs `apns-collapse-id`.
//  - Device tokens live in a `device_tokens` table (added with the push work):
//      device_tokens { user_id uuid, token text, platform text, updated_at }
//  - APNs auth via token-based .p8 key:
//      supabase secrets set APNS_KEY_ID=... APNS_TEAM_ID=... APNS_P8=... APNS_BUNDLE_ID=...
//
// Until the iOS push entitlement exists this function just validates the shape
// and logs the fan-out plan — safe to wire the webhook up early.

import { createClient } from "npm:@supabase/supabase-js@2";

type WebhookPayload = {
  type: "INSERT";
  table: string;
  record: {
    id: string;
    group_id: string;
    author_id: string;
    entry_id: string | null;
    text: string;
  };
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const payload = (await req.json().catch(() => null)) as WebhookPayload | null;
  if (payload?.type !== "INSERT" || payload.table !== "group_posts") {
    return Response.json({ skipped: true });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const post = payload.record;

  // Everyone in the group except the author gets notified.
  const { data: members } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", post.group_id)
    .neq("user_id", post.author_id);

  const { data: author } = await admin
    .from("profiles")
    .select("name")
    .eq("id", post.author_id)
    .single();

  const recipients = (members ?? []).map((m) => m.user_id);
  const preview = post.text.slice(0, 80) || "shared a meal";

  // TODO(v1.2): look up device_tokens for recipients and send via APNs with
  // apns-collapse-id = post.group_id so rapid-fire posts batch into one banner.
  console.log(
    `notify-group: "${author?.name ?? "Someone"}: ${preview}" → ${recipients.length} member(s) of group ${post.group_id}`,
  );

  return Response.json({ queued: recipients.length });
});
