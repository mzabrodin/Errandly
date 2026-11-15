import { Logger } from '@nestjs/common';

import { MailHealth } from './mail-health.js';
import type { MailTransport } from './mail-transport.js';

describe('MailHealth', () => {
  it('is up when the server answers, and logs why it is not', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const verify = vi.fn<MailTransport['verify']>().mockResolvedValueOnce();
    const health = new MailHealth({ verify } as unknown as MailTransport);

    await expect(health.isUp()).resolves.toBe(true);
    verify.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(health.isUp()).resolves.toBe(false);

    expect(warn).toHaveBeenCalledWith('The mail server is unreachable: ECONNREFUSED');
    warn.mockRestore();
  });
});
