import { runCli, runRestore } from '../Utils/Backup/backupJobs.js';

process.exitCode = await runCli(runRestore, process.argv.slice(2));
