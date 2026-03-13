import { createLogger } from 'https://esm.sh/@contextvm/sdk/core';
import { createAccessPolicyVM } from './contextvm.js';

export function createContextVmRuntime(opts) {
  const vm = createAccessPolicyVM(opts);
  const logger = createLogger('blossom-fire/contextvm');

  return {
    transition(event) {
      const out = vm.transition(event);
      if (out.ok) {
        logger.info('transition.accepted', {
          streamId: opts.streamId,
          actor: event.actor,
          index: event.index,
          action: out.action,
        });
      } else {
        logger.warn('transition.rejected', {
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
