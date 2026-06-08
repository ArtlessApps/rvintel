#!/usr/bin/env node
/**
 * E2E smoke test: all three Stripe checkout plans.
 * Creates a test user per plan, opens a Checkout session, verifies price + product.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

function loadEnv() {
  const raw = readFileSync(".env.local", "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)="(.*)"\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);
const stripe = new Stripe(env.STRIPE_SECRET_KEY);

const PLANS = [
  {
    key: "solo",
    priceId: env.STRIPE_PRICE_ID_SOLO,
    productName: "RVIntel One",
    amount: 999,
  },
  {
    key: "growth",
    priceId: env.STRIPE_PRICE_ID_GROWTH,
    productName: "RVIntel Growth",
    amount: 1999,
  },
  {
    key: "fleet",
    priceId: env.STRIPE_PRICE_ID_FLEET,
    productName: "RVIntel Fleet",
    amount: 3999,
  },
];

async function authCookie(email) {
  const { data: linkData, error: linkErr } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
    });
  if (linkErr) throw linkErr;

  const { data: session, error: otpErr } =
    await supabaseAdmin.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
  if (otpErr) throw otpErr;

  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const payload = {
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    expires_in: session.session.expires_in,
    expires_at: session.session.expires_at,
    token_type: "bearer",
    user: session.user,
  };
  return `${cookieName}=base64-${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

async function activate(email) {
  const res = await fetch(`${env.NEXT_PUBLIC_SITE_URL}/api/admin/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ADMIN_SECRET}`,
    },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `activate failed ${res.status}`);
  return data;
}

async function checkout(plan, cookie) {
  const res = await fetch(`${env.NEXT_PUBLIC_SITE_URL}/api/stripe/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ plan }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `checkout failed ${res.status}`);
  return data.url;
}

function sessionIdFromUrl(url) {
  const m = url.match(/\/pay\/(cs_test_[^#?]+)/);
  return m?.[1] ?? null;
}

async function testPlan(plan) {
  const email = `e2e-${plan.key}@rvintel.dev`;
  console.log(`\n── ${plan.productName} (${plan.key}) ──`);

  await activate(email);
  const cookie = await authCookie(email);
  const checkoutUrl = await checkout(plan.key, cookie);
  if (!checkoutUrl) throw new Error("No checkout URL returned");

  const sessionId = sessionIdFromUrl(checkoutUrl);
  if (!sessionId) throw new Error(`Could not parse session id from ${checkoutUrl}`);

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items.data.price.product"],
  });

  const line = session.line_items?.data?.[0];
  const price = line?.price;
  const product = price?.product;
  const productName = typeof product === "object" ? product?.name : null;
  const priceId = typeof price === "object" ? price?.id : null;
  const amount = typeof price === "object" ? price?.unit_amount : null;

  const ok =
    priceId === plan.priceId &&
    amount === plan.amount &&
    productName === plan.productName;

  console.log(`  checkout session: ${sessionId}`);
  console.log(`  price:            ${priceId} ($${(amount ?? 0) / 100}/mo)`);
  console.log(`  product:          ${productName}`);
  console.log(`  status:           ${ok ? "✅ PASS" : "❌ FAIL"}`);

  if (!ok) {
    throw new Error(
      `Expected ${plan.priceId} / ${plan.productName} / ${plan.amount}, got ${priceId} / ${productName} / ${amount}`
    );
  }

  return { email, sessionId, checkoutUrl };
}

async function main() {
  console.log("Stripe plan checkout smoke test");
  console.log(`Site: ${env.NEXT_PUBLIC_SITE_URL}`);

  for (const p of PLANS) {
    if (!p.priceId) throw new Error(`Missing env price for ${p.key}`);
  }

  const results = [];
  for (const plan of PLANS) {
    results.push(await testPlan(plan));
  }

  console.log("\n════════════════════════════════════");
  console.log(`All ${PLANS.length} plans passed checkout wiring.`);
  console.log("Open any URL below to complete payment with 4242… in browser:");
  for (const r of results) {
    console.log(`  ${r.email}: ${r.checkoutUrl.split("#")[0]}`);
  }
}

main().catch((err) => {
  console.error("\n❌", err.message ?? err);
  process.exit(1);
});
