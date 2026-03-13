import { createAccessPolicyVM } from './contextvm.js';

async function resolveLogger() {
  try {
    // Browser bundlers/CDN may not expose subpath exports uniformly.
    const rootMod = await import('https://esm.sh/@contextvm/sdk');
    if (typeof rootMod.createLogger === 'function') {
      return rootMod.createLogger('blossom-fire/contextvm');
    }
    if (rootMod.logger && typeof rootMod.logger.info === 'function') {
      return rootMod.logger;
    }
  } catch {}

  try {
    const coreMod = await import('https://esm.sh/@contextvm/sdk/core');
    if (typeof coreMod.createLogger === 'function') {
      return coreMod.createLogger('blossom-fire/contextvm');
    }
    if (coreMod.logger && typeof coreMod.logger.info === 'function') {
      return coreMod.logger;
    }
  } catch {}

  // Safe fallback: console-backed logger with compatible shape.
  return {
    info: (...args) => console.log('[contextvm]', ...args),
    warn: (...args) => console.warn('[contextvm]', ...args),
    error: (...args) => console.error('[contextvm]', ...args),
  };
}

export function createContextVmRuntime(opts) {
  const vm = createAccessPolicyVM(opts);
  let logger = null;
  const loggerReady = resolveLogger().then((l) => { logger = l; return l; });

  function log(kind, payload) {
    const fn = logger?.[kind] || console.log;
    try { fn.call(logger, payload); } catch { console.log(payload); }
  }

  return {
    async ready() {
      await loggerReady;
    },
    transition(event) {
      const out = vm.transition(event);
      if (out.ok) {
        log('info', {
          type: 'transition.accepted',
          streamId: opts.streamId,
          actor: event.actor,
          index: event.index,
          action: out.action,
        });
      } else {
        log('warn', {
          type: 'transition.rejected',
          streamId: opts.streamId,
          actor: event.actor,
          index: event.index,
          reason: out.reason,
        });
      }
      return out;
    },
  };
}
