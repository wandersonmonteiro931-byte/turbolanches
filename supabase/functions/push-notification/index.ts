import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, ...params } = await req.json();

    // ── GET VAPID PUBLIC KEY ──
    if (action === "get_vapid_public_key") {
      const { data } = await supabase
        .from("push_vapid_keys")
        .select("public_key")
        .limit(1)
        .single();
      if (!data) {
        const keys = await generateVapidKeys();
        await supabase.from("push_vapid_keys").insert(keys);
        return json({ public_key: keys.public_key });
      }
      return json({ public_key: data.public_key });
    }

    // ── SUBSCRIBE ──
    if (action === "subscribe") {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      if (!user) return json({ error: "Unauthorized" }, 401);

      const { endpoint, p256dh, auth } = params;

      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", endpoint);
      await supabase
        .from("push_subscriptions")
        .insert({ user_id: user.id, endpoint, p256dh, auth });

      return json({ ok: true });
    }

    // ── SEND (admin only) ──
    if (action === "send") {
      const { title, body, icon, target_type, target_ids, sent_by } = params;

      const { data: vapid } = await supabase
        .from("push_vapid_keys")
        .select("*")
        .limit(1)
        .single();
      if (!vapid) return json({ error: "No VAPID keys" }, 500);

      let query = supabase.from("push_subscriptions").select("*");
      if (target_type === "selected" && target_ids?.length) {
        query = query.in("user_id", target_ids);
      }
      const { data: subs } = await query;

      let sentCount = 0;
      let failedCount = 0;
      const payload = JSON.stringify({
        title,
        body,
        icon: icon || "/favicon.ico",
        data: { url: "/" },
      });

      const BATCH_SIZE = 50;
      for (let i = 0; i < (subs || []).length; i += BATCH_SIZE) {
        const batch = subs!.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((sub) =>
            sendWebPush(sub.endpoint, sub.p256dh, sub.auth, payload, vapid)
          )
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value.ok) sentCount++;
          else failedCount++;
        }
      }

      await supabase.from("push_notifications").insert({
        title,
        body,
        icon,
        target_type,
        target_ids: target_ids || [],
        sent_by,
        sent_count: sentCount,
        failed_count: failedCount,
      });

      return json({ sent_count: sentCount, failed_count: failedCount });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function generateVapidKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"]
  );
  const pubRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privRaw = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  return {
    public_key: btoa(String.fromCharCode(...new Uint8Array(pubRaw)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
    private_key: privRaw.d!,
  };
}

async function sendWebPush(
  endpoint: string,
  p256dhB64: string,
  authB64: string,
  payload: string,
  vapid: any
) {
  const p256dh = base64UrlDecode(p256dhB64);
  const authKey = base64UrlDecode(authB64);

  const localKey = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const localPubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKey.publicKey)
  );

  const subscriberKey = await crypto.subtle.importKey(
    "raw",
    p256dh,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: subscriberKey },
      localKey.privateKey,
      256
    )
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(
    authKey,
    sharedSecret,
    concatBuffers(utf8("WebPush: info\0"), p256dh, localPubRaw),
    32
  );
  const contentKey = await hkdf(
    salt,
    ikm,
    utf8("Content-Encoding: aes128gcm\0"),
    16
  );
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentKey,
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const padded = concatBuffers(
    new Uint8Array(new TextEncoder().encode(payload)),
    new Uint8Array([2])
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded)
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const header = concatBuffers(
    salt,
    rs,
    new Uint8Array([localPubRaw.length]),
    localPubRaw
  );
  const body = concatBuffers(header, encrypted);

  const vapidAuth = await buildVapidAuth(endpoint, vapid);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Urgency: "high",
      ...vapidAuth,
    },
    body,
  });

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
  };
}

async function buildVapidAuth(endpoint: string, vapid: any) {
  const audience = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 43200;
  const header = base64UrlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payloadStr = base64UrlEncode(
    JSON.stringify({
      aud: audience,
      exp,
      sub: "mailto:push@turbolanches.app",
    })
  );
  const unsigned = `${header}.${payloadStr}`;

  const pubBytes = base64UrlDecode(vapid.public_key);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: vapid.private_key,
    x: base64UrlEncode(pubBytes.slice(1, 33)),
    y: base64UrlEncode(pubBytes.slice(33, 65)),
  };
  const signingKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      utf8(unsigned)
    )
  );
  const token = `${unsigned}.${base64UrlEncode(sig)}`;

  return {
    Authorization: `vapid t=${token}, k=${vapid.public_key}`,
  };
}

function utf8(s: string) {
  return new TextEncoder().encode(s);
}
function concatBuffers(...bufs: Uint8Array[]) {
  const total = bufs.reduce((a, b) => a + b.length, 0);
  const r = new Uint8Array(total);
  let offset = 0;
  for (const b of bufs) {
    r.set(b, offset);
    offset += b.length;
  }
  return r;
}
function base64UrlDecode(s: string) {
  const p = s + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(
    atob(p.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );
}
function base64UrlEncode(data: string | Uint8Array) {
  const bytes = typeof data === "string" ? utf8(data) : data;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  len: number
) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    len * 8
  );
  return new Uint8Array(bits);
}
