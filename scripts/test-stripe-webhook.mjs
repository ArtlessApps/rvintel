#!/usr/bin/env node
/**
 * POST a signed Stripe test event to a webhook URL.
 * Usage:
 *   node scripts/test-stripe-webhook.mjs [url] [whsec_...]
 * Defaults: url=https://www.rvintel.io/api/stripe/webhook, secret from STRIPE_WEBHOOK_SECRET
 */

import Stripe from "stripe";

const url =
  process.argv[2] ??
  process.env.WEBHOOK_URL ??
  "https://www.rvintel.io/api/stripe/webhook";
const secret = process.argv[3] ?? process.env.STRIPE_WEBHOOK_SECRET;

if (!secret) {
  console.error("Missing STRIPE_WEBHOOK_SECRET (arg or env).");
  process.exit(1);
}

const payload = JSON.stringify({
  id: "evt_test_webhook_probe",
  object: "event",
  api_version: "2026-05-27.dahlia",
  created: Math.floor(Date.now() / 1000),
  type: "customer.subscription.updated",
  livemode: true,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
  data: {
    object: {
      id: "sub_test_probe",
      object: "subscription",
      customer: "cus_test_probe",
      status: "active",
      trial_end: null,
      items: {
        data: [
          {
            current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
            price: { id: process.env.STRIPE_PRICE_ID_SOLO ?? "price_test" },
          },
        ],
      },
    },
  },
});

const stripe = new Stripe("sk_test_placeholder");
const signature = stripe.webhooks.generateTestHeaderString({
  payload,
  secret,
});

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Stripe-Signature": signature,
  },
  body: payload,
});

const text = await res.text();
console.log(`URL: ${url}`);
console.log(`HTTP: ${res.status}`);
console.log(`Body: ${text}`);

if (res.status >= 200 && res.status < 300) {
  console.log("PASS — webhook accepted signed event.");
  process.exit(0);
}

console.error("FAIL — expected HTTP 2xx.");
process.exit(1);
