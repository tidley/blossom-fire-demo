# Blossom Fire — MLS/NIP-17 message schemas (draft)

This doc defines the **control-plane** JSON payloads carried over NIP-17 (gift-wrapped DMs).

These messages are **versioned** and intentionally small.

Conventions:

- All payloads are JSON objects.
- Top-level fields:
  - `type` (string)
  - `v` (number; schema version)
  - `streamId` (string)
- `created_at` is a UNIX timestamp (seconds) when relevant.

> NOTE: On branch `mls` these schemas are implemented in code as runtime-checked helpers (see `web/mls/messages.js`).

---

## join-request (viewer → admin)

```json
{
  "type": "join-request",
  "v": 1,
  "streamId": "video3",
  "viewerPubkey": "<32-byte hex pubkey>",
  "created_at": 1710000000
}
```

Semantics:

- Viewer asks admin to be added to the MLS group for `streamId`.
- Transported via NIP-17 to the admin.

---

## welcome (admin → viewer)

```json
{
  "type": "welcome",
  "v": 1,
  "streamId": "video3",
  "welcome": "<opaque bytes; base64>",
  "created_at": 1710000000
}
```

Semantics:

- `welcome` is the MLS Welcome message (opaque bytes for now).
- Viewer applies it to instantiate group state.

---

## commit (admin → group)

```json
{
  "type": "commit",
  "v": 1,
  "streamId": "video3",
  "commit": "<opaque bytes; base64>",
  "created_at": 1710000000
}
```

Semantics:

- `commit` is an MLS Commit (epoch rotation) message.
- All members apply it; removed members cannot.

---

## chunk-announcement (admin/broadcaster → group)

```json
{
  "type": "chunk-announcement",
  "v": 1,
  "streamId": "video3",
  "chunkId": 123,
  "blob": "<blossom hash>",
  "codec": "video/webm;codecs=vp8,opus",
  "created_at": 1710000000
}
```

Semantics:

- Delivered to current group members via MLS application messages (transported using NIP-17).
- Viewers derive the chunk key locally from the MLS exporter secret for the current epoch.
