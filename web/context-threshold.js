export function createThresholdController({ threshold = 2, isAdmin }) {
  let unlocked = false;
  const votes = new Map(); // key: `${viewerPub}:${target}` -> Set(actor)

  function clearViewerVotes(viewerPub) {
    for (const key of Array.from(votes.keys())) {
      if (key.startsWith(`${viewerPub}:`)) votes.delete(key);
    }
  }

  function toggleUnlock(actor) {
    if (!isAdmin(actor)) return { ok: false, reason: 'admin_only' };
    unlocked = !unlocked;
    votes.clear();
    return { ok: true, unlocked };
  }

  function decide({ actor, viewerPub, currentAllowed, desiredAllowed = null }) {
    const target = (desiredAllowed === null || desiredAllowed === undefined)
      ? !currentAllowed
      : !!desiredAllowed;

    if (isAdmin(actor)) {
      clearViewerVotes(viewerPub);
      return { ok: true, apply: true, allowed: target, mode: unlocked ? 'admin-override-unlocked' : 'admin-override' };
    }

    if (!unlocked) {
      return { ok: false, reason: 'locked_admin_override' };
    }

    const key = `${viewerPub}:${target ? 1 : 0}`;
    const set = votes.get(key) || new Set();
    set.add(actor);
    votes.set(key, set);

    const count = set.size;
    if (count >= threshold) {
      clearViewerVotes(viewerPub);
      return { ok: true, apply: true, allowed: target, mode: 'threshold', votes: count, threshold };
    }

    return { ok: true, apply: false, allowed: target, mode: 'threshold-pending', votes: count, threshold };
  }

  return {
    isUnlocked: () => unlocked,
    toggleUnlock,
    decide,
  };
}
