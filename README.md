# Blossoming Sekai's Miku

A comprehensive Discord bot for managing creative project workflows, deadlines, and team coordination. Built with a focus on accountability, flexibility, and user-friendly interactions.

## Introduction

Blossoming Sekai's Miku is a task management bot designed for creative teams working on collaborative projects. It handles task assignment, deadline tracking, submission approvals, extension requests, and team member status management. The bot features an intelligent reminder system, strike-based accountability, and hiatus management to support teams in maintaining productivity while respecting individual needs.

Key features include:

- Role-based task assignment with configurable deadlines
- Multi-tier reminder system with customizable thresholds
- Approval workflow for submissions, extensions, and hiatus requests
- Strike management with automatic demotion
- Hiatus system that pauses deadlines and restores them upon return
- Custom task support with flexible durations
- Comprehensive permission system
- Detailed task history and analytics

## Tech Stack

### Core Technologies

- **Node.js** - Runtime environment
- **Discord.js v14.25.1** - Discord API wrapper
- **MongoDB** - Database for persistent storage
- **Mongoose v8.0.0** - MongoDB object modeling

### Additional Dependencies

- **Express.js v4.18.2** - Web server framework
- **dotenv v17.2.3** - Environment variable management
- **CORS v2.8.5** - Cross-origin resource sharing

### Development Tools

- **ESM** - ES Modules for modern JavaScript
- **PM2** - Process management (recommended for deployment)

## Directory Structure

```
blossoming-sekai's-miku/
├── bot.js                  # Bot entry point (pm2 runs this); starts Discord/bot.ts
├── config.js               # Development configuration
├── configProd.js           # Production configuration
├── PERMISSIONS.md          # Who may run which command
│
├── API/                    # Express API (api.js listens, app.js wires routes)
├── DB/
│   ├── db.js               # MongoDB connection
│   └── Schemas/            # Mongoose schemas
│
├── Discord/
│   ├── bot.ts              # Client, database connection, event routing, login
│   ├── router.ts           # Command name and custom id → handler
│   ├── guard.ts            # Applies the permission policies and onboarding
│   ├── commands/           # Slash command handlers: options → service → view
│   ├── components/         # Approve/deny buttons, pickers, history pager
│   ├── views/              # Every reply, embed and message members see
│   ├── notifier.ts         # Log, approval and request channel posts, demotion
│   ├── scheduler.ts        # Hourly reminders and overdue strikes
│   └── definitions.ts      # Slash command definitions
│
├── Services/               # Business rules; no Discord, Express or Mongoose
├── Utils/
│   ├── DBUtils/            # Repositories: the only code that reads the schemas
│   ├── domain/             # Plain rules and types shared by every layer
│   └── permissions.ts      # Permission levels and policies
│
└── public/                 # Static files for web interface
```

## Installation

### Prerequisites

- Node.js 26 (see `.nvmrc`; `nvm use` picks it up)
- MongoDB instance (local or cloud)
- Discord Bot Token

### Setup Steps

1. Clone the repository:

```bash
git clone <repository-url>
cd blossoming-sekai's-miku
```

2. Install the exact versions in `package-lock.json`:

```bash
npm ci
```

3. Create a `.env` file in the root directory:

```env
BOT_TOKEN=your_discord_bot_token
MONGO_URI=your_mongodb_connection_string
```

The API reads `API/.env` when started from `API/`. It also takes `API_KEY` (required for write endpoints), `PORT` (default `3000`), `HOST` (default `127.0.0.1`, so only the same machine, such as a Cloudflare Tunnel, can reach it; set `0.0.0.0` to listen on every interface), `CORS_ORIGINS` and `NODE_ENV`.

4. Configure role IDs and channel IDs in `config.js`:
   - Update `OWNER_ROLE_ID`
   - Update `MANAGER_ROLE_IDS` array
   - Update `ADMIN_USER_IDS` array
   - Update channel IDs (LOG_CHANNEL_ID, REMINDER_CHANNEL_ID, APPROVAL_CHANNEL_ID)
   - Configure crew role IDs in `CREW_ROLE_IDS`
   - Set up task rules in `RULES` object

5. Start the bot:

```bash
node bot.js
```

For production deployment, use PM2:

```bash
pm2 start bot.js --name miku
```

## Commands

### Task Management

| Command      | Description                  | Permission                  | Usage                                                   |
| ------------ | ---------------------------- | --------------------------- | ------------------------------------------------------- |
| `/assign`    | Assign a task to a user      | Owners only                 | `/assign user:@user role:VA task:skit name:"Task Name"` |
| `/submit`    | Submit a completed task      | Onboarded users (self only) | `/submit task:"Task Name"`                              |
| `/extension` | Request a deadline extension | Onboarded users (self only) | `/extension task:"Task Name" reason:"Reason"`           |
| `/tasks`     | View detailed task list      | Everyone                    | `/tasks user:@user`                                     |
| `/history`   | View task completion history | Everyone                    | `/history user:@user status:COMPLETED`                  |

### User Management

| Command          | Description                     | Permission        | Usage                                    |
| ---------------- | ------------------------------- | ----------------- | ---------------------------------------- |
| `/onboard`       | Onboard a new user              | Owners only       | `/onboard user:@user`                    |
| `/profile`       | View user profile               | Everyone          | `/profile user:@user`                    |
| `/strike list`   | View list of users with strikes | Managers & Owners | `/strike list`                           |
| `/strike add`    | Add a strike to a user          | Managers & Owners | `/strike add user:@user reason:"Reason"` |
| `/strike remove` | Remove a strike from a user     | Managers & Owners | `/strike remove user:@user`              |

### Hiatus Management

| Command                  | Description             | Permission                      | Usage                                        |
| ------------------------ | ----------------------- | ------------------------------- | -------------------------------------------- |
| `/hiatus`                | Request or grant hiatus | Onboarded users / Owners        | `/hiatus reason:"Taking a break"`            |
| `/hiatus` (direct grant) | Grant hiatus to a user  | Owners only                     | `/hiatus user:@user reason:"Approved break"` |
| `/endhiatus`             | End hiatus              | Onboarded users (self) / Owners | `/endhiatus user:@user`                      |

### Utility Commands

| Command   | Description                    | Permission | Usage     |
| --------- | ------------------------------ | ---------- | --------- |
| `/help`   | Display all available commands | Everyone   | `/help`   |
| `/ping`   | Check bot response time        | Everyone   | `/ping`   |
| `/uptime` | Check bot uptime               | Everyone   | `/uptime` |

## Features

### Task Assignment System

- Role-based task categories (VA, SVA, Mixer, Composer, etc.)
- Pre-configured task types with default deadlines
- Custom task support with flexible duration and extension settings
- Automatic deadline calculation based on role and task type

### Reminder System

- Two-tier reminders (first reminder and final reminder)
- Configurable thresholds based on task duration
- Automatic reminder scheduling via interval-based scheduler
- Smart reminder tracking to prevent duplicates

### Approval Workflow

- Button-based approval system for submissions
- Extension request approval by managers and owners
- Hiatus request approval by managers and owners
- Channel-specific notifications for requesters

### Strike Management

- Automatic strike addition on missed deadlines
- Strike removal on task completion
- Configurable 3-strike system with automatic demotion
- Role removal upon reaching maximum strikes

### Hiatus System

- Request-based hiatus for regular users
- Direct grant capability for owners
- Automatic deadline pausing during hiatus
- Fresh deadline calculation upon hiatus end
- Reset reminder flags for clean restart

### Permission System

- Role-based access control
- Admin user bypass for developers
- Granular permissions for different command types
- Read-only access for informational commands

### History and Analytics

- Comprehensive task history with filtering
- Paginated results for large datasets
- Filter by user, task name, status, or role
- Status tracking (PENDING, COMPLETED, LATE, EXCUSED)

## Configuration

### Environment Variables

Required variables in `.env`:

- `BOT_TOKEN` - Discord bot token
- `MONGO_URI` - MongoDB connection string

### Config Files

- `config.js` - Development configuration with placeholder IDs
- `configProd.js` - Production configuration with actual server IDs

### Key Configuration Options

- `SCHEDULER_INTERVAL_MINUTES` - How often to check for reminders and overdue tasks
- `REMINDER_THRESHOLDS` - Define when reminders are sent based on task duration
- `CREW_ROLE_IDS` - Roles to be removed when user reaches 3 strikes
- `RULES` - Task types and deadlines for each role category

## Backups

The free MongoDB tier has no automatic backups, so `npm run backup` makes one. It needs Node only, no MongoDB tools.

Add to `.env`:

- `BACKUP_DIR` - Where backups go. Use a different disk from the server's own, or a synced folder, so one failure cannot lose both
- `BACKUP_RETENTION_DAYS` - Days to keep (default `14`). The newest backup is never removed

Each run writes `sekai-<UTC time>/`: one gzipped EJSON file per collection plus `manifest.json` with counts and indexes. It then re-reads every file to check the counts, and deletes backups past retention. A failed run leaves nothing half written and exits with code 1.

Backups contain member data. Keep `BACKUP_DIR` readable only by the account that runs the bot.

Run it nightly. On Windows (Task Scheduler):

```powershell
schtasks /Create /TN "Sekai backup" /SC DAILY /ST 03:00 /TR "cmd /c cd /d \"C:\path\to\Blossoming Sekai's Miku\" && npm run backup >> backup.log 2>&1"
```

On Linux (`crontab -e`):

```
0 3 * * * cd "/path/to/Blossoming Sekai's Miku" && npm run backup >> backup.log 2>&1
```

To restore, point at an empty database. Restore refuses any database that already has one of the backed-up collections, so it cannot overwrite live data:

```
npm run restore -- <BACKUP_DIR>/sekai-20261122T030000Z "mongodb+srv://.../sekai_restored"
```

## Development

CI runs the same checks on every pull request. Run them locally with:

```
npm run typecheck
npm run lint
npm run format:check
npm run coverage
```

`npm run coverage` runs the tests and then the coverage gate. Every file must be fully covered unless `coverage-floors.json` lists it with the number of lines, branches, functions and statements it may leave uncovered. The gate fails if any file goes over its cap, and also if a file improves without its cap being lowered, so the caps always match reality. After adding tests, run `npm run coverage:update` to lower the caps; it never raises them. A cap can only go up by editing the file, which shows in review.

The characterisation suite in `tests/characterisation/` records everything the bot says and stores for each command, button, menu and scheduler run. Regenerate its recordings with `--test-update-snapshots` only when a change is meant to alter behaviour.

`npm run mutation` runs Stryker over `Utils/domain/` and `Services/` against their unit tests and fails below a 95% mutation score. The HTML report goes to `reports/mutation/`. CI runs it on pull requests that touch that code and every night.

## Permission Roles

### Owner

- Highest access level
- Can assign tasks, onboard users, and grant hiatus
- Can perform actions on behalf of other users
- Can approve all types of requests

### Manager

- Can manage strikes (add/remove)
- Can approve/deny extension requests
- Can approve/deny hiatus requests

### Onboarded User

- Can submit tasks
- Can request extensions for own tasks
- Can request hiatus
- Can end own hiatus

### Admin Users

- Hardcoded user IDs that bypass all role restrictions
- Reserved for bot developers/maintainers

See [PERMISSIONS.md](PERMISSIONS.md) for detailed permission documentation.

## Database Schema

### User Schema

- Discord user ID and username
- Strike count (0-3)
- Hiatus status
- Join date
- Associated assignments (referenced)

### Assignment Schema

- User reference
- Discord user ID for quick lookups
- Role category and name
- Task type and custom name
- Description
- Assignment and deadline dates
- Extension status and custom extension days
- Reminder tracking flags
- Submission channel ID for notifications
- Status (PENDING, COMPLETED, LATE, EXCUSED)

## API Endpoints

The bot includes an Express API server for potential integrations:

- Web dashboard support
- External tool integration
- Analytics and reporting

## Credits

### Development

- **Primary Developer**: Azaken/Aza
- **Bot Character**: Hatsune Miku (Project SEKAI)
- **Framework**: Discord.js v14
- **Server Owner**: Charlie
- **Bot Icon**: Sunny

### Acknowledgments

- Discord.js community for excellent documentation
- Project SEKAI for character inspiration
- MongoDB team for reliable database solutions

### License

This project is licensed under the [MIT](LICENSE) License.

---

**Note**: This bot is designed for the Blossoming SEKAI creative community. All configuration should be adjusted to match your specific server structure and workflow requirements.
