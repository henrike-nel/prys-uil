import { run } from './run';

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
