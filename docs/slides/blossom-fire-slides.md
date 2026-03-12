---
marp: true
title: Blossom Fire
paginate: true
theme: default
---

# Blossom Fire
## Sovereign-first live media over Nostr + Blossom

Tom Dwyer  
Project: `blossom-fire-demo`

---

# The Problem

Most "decentralized" streaming still depends on centralized choke points:

- centralized signaling/control
- opaque access control
- platform-tied identity
- brittle UX on unreliable networks

**Goal:** Build a stream architecture that is practical, inspectable, and user-operated.

---

# What Blossom Fire Is

A live media prototype with strict control/data separation:

- **Control plane:** Nostr events + NIP-17 DMs
- **Data plane:** Blob chunks (Blossom)
- **Policy plane:** explicit key-mediated viewer authorization

This is not just censorship-resistance marketing; it is an operational trust-boundary design.

---

# Architecture at a Glance

1. Broadcaster records and emits media chunks
2. Chunk metadata announced on Nostr
3. Blob payload uploaded to Blossom-compatible store
4. Admin receives broadcaster key metadata
5. Admin forwards viewer-specific authorization metadata
6. Viewer fetches/decrypts/plays authorized chunks

---

# Sovereignty Properties

- **Self-hostable** relay + blob + web app
- **Portable identity** (Nostr keys)
- **Explicit access policy** (`access_req`, `adminkey`, `viewerkey`)
- **Replaceable components** without redesigning identity model
- **No mandatory SFU/TURN dependency**

---

# Why It Works on Bad Networks

Designed for imperfect links:

- chunk-oriented transport
- retryable fetch behavior
- out-of-order metadata tolerance
- buffer-aware playback policies
- graceful fallback when ideal pipelines fail

Prefers **eventual playable continuity** over fragile realtime purity.

---

# Protocol Flow (Simplified)

- Viewer → Admin: `access_req`
- Broadcaster → Nostr: chunk announcement (`i`, `x`, `m`, `enc` tags)
- Broadcaster → Admin DM: `adminkey`
- Admin → Viewer DM: `viewerkey`
- Viewer: fetch blob + decode if authorized + play

Security and policy are message-level concerns, not hidden backend magic.

---

# Browser Reality: MSE vs Compatibility

Playback strategy is practical, not ideological:

- **MSE path** for robust buffering where stable
- **Compatibility path** for Chrome edge cases
- fallback and recovery logic instead of hard failure

This keeps the system usable while media pipeline maturity improves.

---

# Comparison Matrix

| Dimension | Blossom Fire | Typical WebRTC+SFU | Hivetalk-style |
|---|---|---|---|
| Identity portability | High | Low-Medium | Medium |
| Self-host sovereignty | High | Medium | Medium |
| Realtime smoothness | Medium | High | High |
| Poor-network tolerance | High | Medium | Medium |
| Hidden central points | Low | Medium-High | Medium |

---

# What Is Novel Here

- Nostr-native control for live media authorization
- blob transport decoupled from identity/control
- policy-forward architecture for individual operators
- resilient operation under unreliable transport conditions

---

# Practical Use Cases

- sovereign community livestreams
- constrained/rural network environments
- high-censorship-risk operators
- self-hosted event broadcasting
- experiments in user-owned media infrastructure

---

# Current Status

Implemented:

- broadcaster/admin/viewer flow
- key distribution and viewer gating
- chunk publication + retrieval
- reliability and fallback improvements
- Chrome compatibility-mode hardening

In progress:

- stronger MSE path stability in Chrome
- richer playback telemetry and diagnostics

---

# Next Steps

1. fMP4/CMAF path for stronger cross-browser MSE
2. adaptive bitrate/chunk policy for network variance
3. hardened encryption/key lifecycle policies
4. operator controls for sovereignty defaults
5. polished UX + observability + deploy docs

---

# Takeaway

Blossom Fire demonstrates that live video can be:

- **decentralized in architecture**
- **sovereign in operation**
- **resilient in rough network conditions**

without requiring users to trust a single control platform.

---

# Links

- Repo: `blossom-fire-demo`
- Stack: Nostr + NIP-17 + Blossom blobs
- Focus: Sovereign, resilient live media
