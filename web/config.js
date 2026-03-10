// Update these two to your server LAN IP after you run `hostname -I`
export const LAN_HOST = location.hostname; // defaults to the current host

export const RELAYS = [
  // Local dev relay (docker-compose)
  `ws://${LAN_HOST}:8080`,

  // NIP-17 relay (may be offline during setup)
  'wss://nip17.tomdwyer.uk',
];

export const BLOB_BASE = `http://${LAN_HOST}:3000`;

// Demo admin secret key (hex, 32 bytes). Replace this before any non-LAN use.
// You can regenerate by opening the browser console on admin.html and running:
//   (await import('https://esm.sh/nostr-tools@2.10.2')).generateSecretKey()
export const ADMIN_SK_HEX = "1".repeat(64);
// Public key (hex) corresponding to ADMIN_SK_HEX. Viewers/broadcasters use this to send NIP-17 join requests.
export const ADMIN_PUB_HEX = "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";

export const TAG_DEMO = "blossom-fire-demo";              // slideshow announcements
export const TAG_DEMO_VIDEO = "blossom-fire-demo-video";   // video chunk announcements
