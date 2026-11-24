import dotenv from 'dotenv';
import { runBackup, runCli } from '../Utils/Backup/backupJobs.js';

dotenv.config({ quiet: true });

process.exitCode = await runCli(runBackup, process.env);
