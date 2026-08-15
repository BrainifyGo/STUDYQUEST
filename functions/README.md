# Parked — not deployed

This folder holds `redeemUpgradeKey` and `consumeGeneration`, written on 2026-08-11 as the
server-side replacement for two client-side billing bypasses. **Neither is live, and nothing in
`src/` calls them.**

## Why

Cloud Functions require the Firebase **Blaze** plan. The deploy fails before it starts:

```
Error: Your project brainify-app-5f96d must be on the Blaze (pay-as-you-go) plan
       to complete this command.
```

The free tier would have covered this app comfortably, but Blaze needs a card on file, so it was
not a decision to make in a deploy step.

## What runs instead

The security holes are closed in `firestore.rules` without any server code:

- **Upgrade keys** — the document ID is now the key string itself, so redemption is a direct
  `get` and `list` is admin-only. A key can only go unused → used, stamped with the claimer's
  uid, and `isPro` only flips for the account named on that key. See `redeemedWithMyKey()`.
- **Token budgets** — `tokensUsedToday` / `tokensUsedThisMonth` are pinned against client writes
  and rolled over by `readBudget()` in `server.ts`, which runs on the Admin SDK.

The rules-only path has one honest weakness the function would not have: redemption is two
writes rather than one transaction, so a crash between them spends the key without granting Pro.
`UpgradePage.tsx` detects exactly that case and shows the user the key to send to support instead
of a generic error.

## If you ever move to Blaze

1. Put the `functions` block back in `firebase.json` (see git history for the exact block).
2. `cd functions && npm install && cd .. && firebase deploy --only functions`
3. Point `handleKeyUpgrade` in `src/components/UpgradePage.tsx` back at
   `httpsCallable(getFunctions(), 'redeemUpgradeKey')`.
4. Tighten `firestore.rules`: drop `redeemedWithMyKey()` from the users `allow update`, and set
   the `upgrade_keys` block back to `allow get, list, create, update, delete: if isAdmin()`.

`redeemUpgradeKey` looks keys up with `where('key', '==', key)`, and the migration preserves the
`key` field, so it will still work against the re-keyed documents.
