// Supabase Edge Function: places-proxy
//
// B5: Google Places proxying for the iOS app — the mobile client can't use an
// HTTP-referrer-restricted browser key, and shipping any key in the binary leaks
// it. This proxy holds the server key and forwards the three calls the apps make.
//
// POST /places-proxy { kind: "autocomplete" | "details", ... }
//   autocomplete: { input: string, bias?: { lat, lng, radius? }, sessionToken?: string }
//   details:      { placeId: string, sessionToken?: string }
//
// Secrets: supabase secrets set GOOGLE_PLACES_SERVER_KEY=...
//   (a SEPARATE key from the web one: API-restricted to Places API (New),
//    application restriction "None" — it never leaves this function.)
//
// BILLING — the field mask picks the SKU, so keep it in the Essentials tier:
// `displayName` and `primaryType` are Pro fields ($17/1k, 5k free) and pull the
// WHOLE call up to Pro. We don't need either: the place's name comes back with
// the autocomplete suggestion for free, and `types` (Essentials) already
// carries the cuisine ("thai_restaurant"). Essentials is $5/1k with 10k free.
// Adding a Pro/Enterprise field here quintuples the per-call price — don't,
// without checking developers.google.com/maps/documentation/places/web-service/data-fields.

import { createClient } from "npm:@supabase/supabase-js@2";

const DETAILS_FIELDS = "location,addressComponents,formattedAddress,types";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const key = Deno.env.get("GOOGLE_PLACES_SERVER_KEY");
  if (!key) return json({ error: "GOOGLE_PLACES_SERVER_KEY not configured" }, 500);

  // Require a signed-in USER — this proxy is not a public Places mirror.
  // The platform's verify_jwt gate also lets the bare anon key through, so
  // resolve the token to a real user the same way generate-avatar does.
  const auth = req.headers.get("Authorization") ?? "";
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return json({ error: "Not signed in" }, 401);

  const body = await req.json().catch(() => null);
  if (!body?.kind) return json({ error: "Missing kind" }, 400);

  const locationBias = body.bias
    ? {
        circle: {
          center: { latitude: body.bias.lat, longitude: body.bias.lng },
          radius: body.bias.radius ?? 30000,
        },
      }
    : undefined;

  // A session token ties the keystroke-by-keystroke autocomplete calls to the
  // one details call that ends the search: Google then bills the whole burst as
  // a single free session instead of per request. Only tokens that look like
  // ours are forwarded, and each is good for exactly one search.
  const sessionToken = /^[\w-]{8,64}$/.test(String(body.sessionToken ?? ""))
    ? String(body.sessionToken)
    : undefined;

  let url: string;
  let init: RequestInit;
  switch (body.kind) {
    case "autocomplete":
      url = "https://places.googleapis.com/v1/places:autocomplete";
      init = post(key, undefined, {
        input: String(body.input ?? ""),
        includedPrimaryTypes: ["restaurant"],
        ...(sessionToken && { sessionToken }),
        ...(locationBias && { locationBias }),
      });
      break;
    case "details": {
      const placeId = String(body.placeId ?? "");
      if (!/^[\w-]+$/.test(placeId)) return json({ error: "Bad placeId" }, 400);
      const query = sessionToken ? `?sessionToken=${sessionToken}` : "";
      url = `https://places.googleapis.com/v1/places/${placeId}${query}`;
      init = { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_FIELDS } };
      break;
    }
    default:
      return json({ error: `Unknown kind ${body.kind}` }, 400);
  }

  const upstream = await fetch(url, init);
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

function post(key: string, fieldMask: string | undefined, body: unknown): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      ...(fieldMask && { "X-Goog-FieldMask": fieldMask }),
    },
    body: JSON.stringify(body),
  };
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
