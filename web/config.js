// Update these two to your server LAN IP after you run `hostname -I`
export const LAN_HOST = location.hostname; // defaults to the current host

export const RELAYS = [
  `ws://${LAN_HOST}:8080`,
  'wss://nip17.tomdwyer.uk',
];

export const BLOB_BASE = `http://${LAN_HOST}:3000`;

// Demo admin secret key (hex, 32 bytes). Replace this before any non-LAN use.
// You can regenerate by opening the browser console on admin.html and running:
//   (await import('https://esm.sh/nostr-tools@2.10.2')).generateSecretKey()
export const ADMIN_SK_HEX = "1".repeat(64);

export const TAG_DEMO = "blossom-fire-demo";
export const TAG_REQ = "blossom-fire-demo-req";
export const TAG_ADMINKEY = "blossom-fire-demo-adminkey";
