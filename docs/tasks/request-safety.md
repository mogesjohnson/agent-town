# Local request safety

Keep malformed JSON, null/scalar bodies and overlapping agent calls from interrupting play.
Reject cross-origin browser state changes before built-in or extension routing; require
JSON for body-bearing state changes. Preserve loopback CLI and MCP clients without Origin.
Validate the loopback Host to prevent DNS rebinding. Limits are not authentication against
other local processes. No provider sandbox claims or CLI argument changes in this work.
