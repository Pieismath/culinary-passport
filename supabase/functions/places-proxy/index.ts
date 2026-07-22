// Supabase Edge Function: places-proxy
//
// B5: Google Places proxying for the iOS app — the mobile client can't use an
// HTTP-referrer-restricted browser key, and shipping any key in the binary leaks
// it. This proxy holds the server key and forwards the three calls the apps make.
//
// POST /places-proxy { kind: "autocomplete" | "textsearch" | "details", ... }
//   autocomplete: { input: string, bias?: { lat, lng, radius? } }
//   textsearch:   { query: string, bias?: { lat, lng, radius? } }
//   details:      { placeId: string }
//
// Secrets: supabase secrets set GOOGLE_PLACES_SERVER_KEY=...
//   (a SEPARATE key from the web one: API-restricted to Places API (New),
//    application restriction "None" — it never leaves this function.)

import { createClient } from "npm:@supabase/supabase-js@2";

const FIELDS = {
  textsearch:
    "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount",
  // types/primaryType carry cuisine ("thai_restaurant") — quick-log infers
  // the passport country from them.
  details: "location,addressComponents,displayName,formattedAddress,types,primaryType",
};

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

  let url: string;
  let init: RequestInit;
  switch (body.kind) {
    case "autocomplete":
      url = "https://places.googleapis.com/v1/places:autocomplete";
      init = post(key, undefined, {
        input: String(body.input ?? ""),
        includedPrimaryTypes: ["restaurant"],
        ...(locationBias && { locationBias }),
      });
      break;
    case "textsearch":
      url = "https://places.googleapis.com/v1/places:searchText";
      init = post(key, FIELDS.textsearch, {
        textQuery: String(body.query ?? ""),
        pageSize: 5,
        ...(locationBias && { locationBias }),
      });
      break;
    case "details": {
      const placeId = String(body.placeId ?? "");
      if (!/^[\w-]+$/.test(placeId)) return json({ error: "Bad placeId" }, 400);
      url = `https://places.googleapis.com/v1/places/${placeId}`;
      init = { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS.details } };
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
