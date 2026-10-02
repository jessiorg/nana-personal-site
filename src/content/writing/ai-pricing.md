---
title: "Why we price AI by outcome, not by GPU-hour"
eyebrow: "Memo · 2026"
date: "2026"
dek: "Cost-based pricing is a tax on uncertainty. A reference-floor pricing model decouples revenue from MFU and captures the widening spread between customer value and our cost base."
ref: "Now →"
refHref: "/#now"
---

Cost-based pricing is a tax on uncertainty.

The conventional model — price per GPU-hour, price per token, price per API call — is a model built for the vendor, not the customer. It means the customer's cost rises exactly when the vendor's cost falls. Every time a model becomes more efficient, the vendor captures the efficiency gain as margin. The customer gets nothing.

That's not a pricing model. That's an inefficiency tax.

## The reference-floor model

The alternative is a reference-floor model. Set a price floor based on the market value of the outcome — what the customer would pay a human to do the same thing. Then structure revenue so that as our cost base falls, the customer captures a portion of that fall through lower prices.

> The only moat that compounds is a reference price that holds even as our cost base falls.

This means our revenue per unit of outcome is tied to customer value, not to our compute cost. If we halve the cost of serving a unit, we don't halve the price — we reduce it by some fraction, and the spread widens. That spread is what funds the next round of build.

## Why this works for energy trading specifically

In physical commodity trading, the reference price is the market. If you're buying crude at a discount to Brent because of logistics, and selling refined product at a premium because of location, your spread is determined by physical reality — not by your cost to move a barrel.

AI pricing in energy trading should work the same way. The reference price is the marginal value of the decision: what does a better forecast save? What does an optimised dispatch avoid?

Price against that, not against the cost of running a GPU.

## What this requires

It requires that you can measure the outcome. That's the hard part. Most AI vendors can't because their customers can't — or won't share the measurement.

That's why we built the data layer first. Before we priced anything, we instrumented the decisions. The pricing model is downstream of the measurement infrastructure.

If you can't measure it, you can't price it. If you can't price it, you're just charging for compute.
