// Lightweight ContextVM-style policy module for admin access control.
// Deterministic transition decisions + explicit audit records.

export function createAccessPolicyVM({ streamId, isSenderAllowed, resolveViewerByIndex }) {
  function transition(event) {
    const ts = Math.floor(Date.now() / 1000);
    const base = {
      vm: 'contextvm-lite',
      streamId,
      ts,
      event,
    };

    if (event.type !== 'toggle_by_index') {
      return { ok: false, reason: 'unsupported_event', transition: { ...base, ok: false, reason: 'unsupported_event' } };
    }

    if (!isSenderAllowed(event.actor)) {
      return { ok: false, reason: 'sender_not_allowed', transition: { ...base, ok: false, reason: 'sender_not_allowed' } };
    }

    const resolved = resolveViewerByIndex(event.index);
    if (!resolved) {
      return { ok: false, reason: 'invalid_index', transition: { ...base, ok: false, reason: 'invalid_index' } };
    }

    const nextAllowed = !resolved.viewer.allowed;
    return {
      ok: true,
      action: {
        type: 'set_viewer_allowed',
        viewerPub: resolved.pub,
        allowed: nextAllowed,
        index: resolved.index,
      },
      transition: {
        ...base,
        ok: true,
        action: 'set_viewer_allowed',
        viewerPub: resolved.pub,
        viewerNpub: resolved.viewer.npub,
        index: resolved.index,
        from: !!resolved.viewer.allowed,
        to: !!nextAllowed,
      },
    };
  }

  return { transition };
}
