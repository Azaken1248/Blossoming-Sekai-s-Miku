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
├── bot.js                  # Main bot entry point
├── api.js                  # Express API server
├── config.js               # Development configuration
├── configProd.js           # Production configuration
├── package.json            # Project dependencies
├── .env                    # Environment variables
├── .gitignore              # Git ignore rules
├── PERMISSIONS.md          # Detailed permission documentation
│
├── DB/
│   ├── db.js               # MongoDB connection
│   └── Schemas/
│       ├── assignment.js   # Task assignment schema
│       └── user.js         # User profile schema
│
├── Utils/
│   ├── DBUtils/
│   │   ├── taskUtils.js    # Task database operations
│   │   └── userUtils.js    # User database operations
│   │
│   └── DiscordUtils/
│       └── commands.js     # Command handlers and logic
│
└── public/                 # Static files for web interface
```

## Installation

### Prerequisites
- Node.js v16 or higher
- MongoDB instance (local or cloud)
- Discord Bot Token

### Setup Steps

1. Clone the repository:
```bash
git clone <repository-url>
cd blossoming-sekai's-miku
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
BOT_TOKEN=your_discord_bot_token
MONGO_URI=your_mongodb_connection_string
```

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

| Command | Description | Permission | Usage |
|---------|-------------|------------|-------|
| `/assign` | Assign a task to a user | Owners only | `/assign user:@user role:VA task:skit name:"Task Name"` |
| `/submit` | Submit a completed task | Onboarded users (self only) | `/submit task:"Task Name"` |
| `/extension` | Request a deadline extension | Onboarded users (self only) | `/extension task:"Task Name" reason:"Reason"` |
| `/tasks` | View detailed task list | Everyone | `/tasks user:@user` |
| `/history` | View task completion history | Everyone | `/history user:@user status:COMPLETED` |

### User Management

| Command | Description | Permission | Usage |
|---------|-------------|------------|-------|
| `/onboard` | Onboard a new user | Owners only | `/onboard user:@user` |
| `/profile` | View user profile | Everyone | `/profile user:@user` |
| `/strike add` | Add a strike to a user | Managers & Owners | `/strike add user:@user reason:"Reason"` |
| `/strike remove` | Remove a strike from a user | Managers & Owners | `/strike remove user:@user` |

### Hiatus Management

| Command | Description | Permission | Usage |
|---------|-------------|------------|-------|
| `/hiatus` | Request or grant hiatus | Onboarded users / Owners | `/hiatus reason:"Taking a break"` |
| `/hiatus` (direct grant) | Grant hiatus to a user | Owners only | `/hiatus user:@user reason:"Approved break"` |
| `/endhiatus` | End hiatus | Onboarded users (self) / Owners | `/endhiatus user:@user` |

### Utility Commands

| Command | Description | Permission | Usage |
|---------|-------------|------------|-------|
| `/help` | Display all available commands | Everyone | `/help` |
| `/ping` | Check bot response time | Everyone | `/ping` |
| `/uptime` | Check bot uptime | Everyone | `/uptime` |

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
- **Server Owner**:
- **Bot Icon**:

### Acknowledgments
- Discord.js community for excellent documentation
- Project SEKAI for character inspiration
- MongoDB team for reliable database solutions

### License
This project is licensed under the [MIT](LICENSE.md)  License.

---

**Note**: This bot is designed for the Blossoming SEKAI creative community. All configuration should be adjusted to match your specific server structure and workflow requirements.
