# Token usage visibility

Show session input/output token totals and tokens per completed agent turn.
Separate provider-reported counts from rough text estimates; mock calls consume zero.
Never infer currency charges or subscription allowance from token estimates.
Track failed calls as unknown usage. Counts reset when the server restarts and exclude
extension-owned calls such as newspaper generation. Keep existing adapter text replies.

Acceptance: ledger tests cover reported, estimated, mock and failed calls; state exposes
per-agent accounting; the browser presents session and per-agent totals with clear labels.
