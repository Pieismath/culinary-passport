// Supabase Edge Function: generate-avatar
//
// Selfie in → stylized character portrait out. The heart of the productized
// avatar pipeline (Part B): every avatar in the app is rendered through the SAME
// locked style prompt so group views feel like a matched set.
//
// POST multipart/form-data { selfie: File }  (authenticated)
//   → { url: string, provider: string }  — public URL in avatars/{user_id}/base.png
//
// Deploy:  supabase functions deploy generate-avatar
// Secrets: supabase secrets set GEMINI_API_KEY=...        (primary: Nano Banana)
//          supabase secrets set BFL_API_KEY=...           (optional fallback: Flux Kontext)
//          supabase secrets set AVATAR_PROVIDER=gemini    (or "flux")

import { createClient } from "npm:@supabase/supabase-js@2";

// ── Style contract ──────────────────────────────────────────────────────────
// LOCKED. Server-side constant, never user-editable — consistency across all
// users is the product. Accessory variants (v2) APPEND to this, never replace it.
const STYLE_PROMPT =
  "Stylized 3D-render character portrait of the person in this photo, " +
  "soft Pixar-adjacent shading, warm rim lighting, friendly expression, " +
  "half-body, transparent background, editorial illustration style. " +
  "Preserve the person's recognizable facial features, hairstyle, and skin tone.";

const DAILY_LIMIT = 3; // regenerations per user per day — Nano Banana isn't free at scale

// ── Provider abstraction ────────────────────────────────────────────────────
// Swappable so we can A/B Gemini ("Nano Banana") against Flux Kontext without
// touching the client. Both take a selfie, return PNG bytes in the house style.

type AvatarProvider = {
  name: string;
  generate(selfie: Uint8Array, mime: string): Promise<Uint8Array>;
};

const gemini: AvatarProvider = {
  name: "gemini-2.5-flash-image",
  async generate(selfie, mime) {
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) throw new Error("GEMINI_API_KEY not set");
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: STYLE_PROMPT },
              { inlineData: { mimeType: mime, data: encodeBase64(selfie) } },
            ],
          }],
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const part = json.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
    if (!part) throw new Error("Gemini returned no image");
    return decodeBase64(part.inlineData.data);
  },
};

const flux: AvatarProvider = {
  name: "flux-kontext-pro",
  async generate(selfie, _mime) {
    const key = Deno.env.get("BFL_API_KEY");
    if (!key) throw new Error("BFL_API_KEY not set");
    // Flux Kontext is async: submit, then poll the result endpoint.
    const submit = await fetch("https://api.bfl.ai/v1/flux-kontext-pro", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-key": key },
      body: JSON.stringify({
        prompt: STYLE_PROMPT,
        input_image: encodeBase64(selfie),
        output_format: "png",
      }),
    });
    if (!submit.ok) throw new Error(`BFL error ${submit.status}: ${await submit.text()}`);
    const { polling_url } = await submit.json();
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(polling_url, { headers: { "x-key": key } });
      const status = await poll.json();
      if (status.status === "Ready") {
        const img = await fetch(status.result.sample);
        return new Uint8Array(await img.arrayBuffer());
      }
      if (status.status === "Error" || status.status === "Failed") {
        throw new Error(`BFL generation failed: ${JSON.stringify(status)}`);
      }
    }
    throw new Error("BFL generation timed out");
  },
};

const providers: Record<string, AvatarProvider> = { gemini, flux };

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Caller identity from their JWT; storage/DB writes via service role.
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

  // Rate limit: DAILY_LIMIT generations per rolling 24h.
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin
    .from("avatar_generations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", dayAgo);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return json({ error: `Avatar limit reached (${DAILY_LIMIT}/day) — try again tomorrow` }, 429);
  }

  const form = await req.formData();
  const selfie = form.get("selfie");
  if (!(selfie instanceof File)) return json({ error: "Attach a 'selfie' file" }, 400);
  if (selfie.size > 8 * 1024 * 1024) return json({ error: "Selfie too large (8 MB max)" }, 400);
  const bytes = new Uint8Array(await selfie.arrayBuffer());

  const providerName = Deno.env.get("AVATAR_PROVIDER") ?? "gemini";
  const provider = providers[providerName];
  if (!provider) return json({ error: `Unknown provider ${providerName}` }, 500);

  try {
    const png = await provider.generate(bytes, selfie.type || "image/jpeg");

    // Cache-forever path: one canonical base avatar per user, replaced only on re-upload.
    const path = `${user.id}/base.png`;
    const { error: upErr } = await admin.storage
      .from("avatars")
      .upload(path, png, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

    const url = admin.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    await admin.from("avatar_generations").insert({ user_id: user.id, provider: provider.name });
    await admin.from("profiles").update({ avatar_url: `${url}?v=${Date.now()}` }).eq("id", user.id);

    return json({ url, provider: provider.name });
  } catch (err) {
    console.error("generate-avatar failed:", err);
    return json({ error: err instanceof Error ? err.message : "Generation failed" }, 502);
  }
});

// ── helpers ─────────────────────────────────────────────────────────────────

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

function encodeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
