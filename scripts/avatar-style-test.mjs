#!/usr/bin/env node
// Avatar pipeline de-risk harness (Part B, step 0).
//
// The go/no-go test for the iOS build: run several different selfies through the
// EXACT prompt the generate-avatar edge function uses, and eyeball whether the
// outputs (a) feel like a matched set and (b) preserve likeness. If Gemini
// disappoints, re-run with --provider flux before committing to the build.
//
// Usage:
//   GEMINI_API_KEY=... node scripts/avatar-style-test.mjs selfie1.jpg selfie2.jpg ...
//   BFL_API_KEY=...    node scripts/avatar-style-test.mjs --provider flux *.jpg
//
// Writes avatar-test-output/<name>.png for each input plus contact-sheet.html
// showing originals next to generated avatars.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";

// Keep in sync with supabase/functions/generate-avatar/index.ts — this IS the test.
const STYLE_PROMPT =
  "Stylized 3D-render character portrait of the person in this photo, " +
  "soft Pixar-adjacent shading, warm rim lighting, friendly expression, " +
  "half-body, transparent background, editorial illustration style. " +
  "Preserve the person's recognizable facial features, hairstyle, and skin tone.";

const args = process.argv.slice(2);
const providerIdx = args.indexOf("--provider");
const provider = providerIdx === -1 ? "gemini" : args.splice(providerIdx, 2)[1];
const files = args;

if (files.length === 0) {
  console.error("Usage: node scripts/avatar-style-test.mjs [--provider gemini|flux] selfie1.jpg ...");
  process.exit(1);
}

const OUT = "avatar-test-output";
await mkdir(OUT, { recursive: true });

async function generateGemini(bytes, mime) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Set GEMINI_API_KEY");
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: STYLE_PROMPT },
            { inlineData: { mimeType: mime, data: bytes.toString("base64") } },
          ],
        }],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error("No image in response");
  return Buffer.from(part.inlineData.data, "base64");
}

async function generateFlux(bytes) {
  const key = process.env.BFL_API_KEY;
  if (!key) throw new Error("Set BFL_API_KEY");
  const submit = await fetch("https://api.bfl.ai/v1/flux-kontext-pro", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-key": key },
    body: JSON.stringify({
      prompt: STYLE_PROMPT,
      input_image: bytes.toString("base64"),
      output_format: "png",
    }),
  });
  if (!submit.ok) throw new Error(`BFL ${submit.status}: ${await submit.text()}`);
  const { polling_url } = await submit.json();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await (await fetch(polling_url, { headers: { "x-key": key } })).json();
    if (poll.status === "Ready") {
      return Buffer.from(await (await fetch(poll.result.sample)).arrayBuffer());
    }
    if (poll.status === "Error" || poll.status === "Failed") {
      throw new Error(`BFL failed: ${JSON.stringify(poll)}`);
    }
  }
  throw new Error("BFL timed out");
}

const mimeOf = (f) =>
  ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" })[
    extname(f).toLowerCase()
  ] ?? "image/jpeg";

const rows = [];
for (const file of files) {
  const name = basename(file, extname(file));
  process.stdout.write(`→ ${name} (${provider}) … `);
  try {
    const bytes = await readFile(file);
    const t0 = Date.now();
    const png = provider === "flux" ? await generateFlux(bytes) : await generateGemini(bytes, mimeOf(file));
    const outPath = join(OUT, `${name}.png`);
    await writeFile(outPath, png);
    console.log(`ok (${((Date.now() - t0) / 1000).toFixed(1)}s) → ${outPath}`);
    rows.push({ name, original: file, generated: `${name}.png` });
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
  }
}

const html = `<!doctype html><meta charset="utf-8"><title>Avatar style test — ${provider}</title>
<style>
  body { font-family: system-ui; background: #f5f2ea; padding: 32px; }
  h1 { font-weight: 600; } .grid { display: flex; flex-wrap: wrap; gap: 24px; }
  figure { margin: 0; background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  img { height: 260px; display: block; border-radius: 8px; }
  .pair { display: flex; gap: 8px; }
  figcaption { margin-top: 8px; font-size: 13px; color: #555; }
</style>
<h1>Avatar style test — provider: ${provider}</h1>
<p>Judge: do these feel like ONE character set? Is each person recognizable?</p>
<div class="grid">${rows
  .map(
    (r) => `<figure><div class="pair"><img src="../${r.original}"><img src="${r.generated}"></div><figcaption>${r.name}</figcaption></figure>`,
  )
  .join("")}</div>`;
await writeFile(join(OUT, "contact-sheet.html"), html);
console.log(`\n${rows.length}/${files.length} generated. Open ${OUT}/contact-sheet.html to judge the set.`);
