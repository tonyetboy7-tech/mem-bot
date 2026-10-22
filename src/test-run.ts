/** practice run with real SOL: no $MEM needed. mem spends what you send him, the wallet you connect on the site is the holder. */
process.env.TEST_MODE = 'true';
process.env.DRY_RUN = process.env.DRY_RUN === 'true' ? 'true' : 'false';
await import('./index');
export {};
