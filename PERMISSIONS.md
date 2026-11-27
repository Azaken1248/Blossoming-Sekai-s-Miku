# Bot Permissions Documentation

This document outlines the permission requirements for all bot commands and interactions.

## Permission Roles

- **Owner**: Highest level access, can perform all actions
- **Manager**: Can manage strikes and approve/deny hiatus and extension requests
- **Onboarded User**: User who has been onboarded to the system
- **Everyone**: Any user in the server

## Command Permissions

| Command          | Who Can Use       | Can Target Others                        | Notes                               |
| ---------------- | ----------------- | ---------------------------------------- | ----------------------------------- |
| `/assign`        | Owners only       | ✅ Yes                                   | Assign tasks to users               |
| `/bulkassign`    | Owners only       | ✅ Yes                                   | Assign one task to up to 25 users   |
| `/removetask`    | Managers & Owners | ✅ Yes                                   | Remove a task that is not completed |
| `/onboard`       | Owners only       | ✅ Yes                                   | Onboard new users to the system     |
| `/deboard`       | Owners only       | ✅ Yes                                   | Deboard a user, keeping their work  |
| `/strike list`   | Managers & Owners | N/A                                      | View list of users with strikes     |
| `/strike add`    | Managers & Owners | ✅ Yes                                   | Add strikes to users                |
| `/strike remove` | Managers & Owners | ✅ Yes                                   | Remove strikes from users           |
| `/submit`        | Onboarded Users   | ❌ Self only (Owners: ✅)                | Submit completed tasks              |
| `/extension`     | Onboarded Users   | ❌ Self only (Owners: ✅)                | Request task extensions             |
| `/hiatus`        | Onboarded Users   | ❌ Self only (Owners: ✅ grant directly) | Request hiatus from tasks           |
| `/endhiatus`     | Onboarded Users   | ❌ Self only (Owners: ✅)                | End your own hiatus                 |
| `/profile`       | Everyone          | ✅ Yes                                   | View user profiles (read-only)      |
| `/card`          | Everyone          | ✅ Yes                                   | View a member's ID card             |
| `/tasks`         | Everyone          | ✅ Yes                                   | View user tasks (read-only)         |
| `/history`       | Everyone          | ✅ Yes                                   | View task history (read-only)       |
| `/checkfree`     | Everyone          | ✅ Yes                                   | See who has no active task          |
| `/help`          | Everyone          | N/A                                      | Display help information            |
| `/ping`          | Everyone          | N/A                                      | Check the bot's response time       |
| `/uptime`        | Everyone          | N/A                                      | See how long the bot has been up    |

The table is enforced by `COMMAND_POLICY` and `APPROVAL_POLICY` in `Utils/permissions.ts`, applied in one place by
`Discord/guard.ts`. A test fails if a registered command has no policy or no handler.

## Button Interaction Permissions

| Action              | Who Can Approve/Deny | Description                        |
| ------------------- | -------------------- | ---------------------------------- |
| Submission Approval | Owners only          | Approve or deny task submissions   |
| Extension Approval  | Managers & Owners    | Approve or deny extension requests |
| Hiatus Approval     | Managers & Owners    | Approve or deny hiatus requests    |

## Permission Logic

### Self vs Others

- **Normal Users**: Can only use action commands (submit, extension, hiatus, endhiatus) for themselves
- **Owners**: Can use action commands on behalf of any user
- **Read-Only Commands**: Anyone can view information about any user (profile, tasks, history)

### Onboarding Requirement

Users must be onboarded before they can:

- Submit tasks
- Request extensions
- Request hiatus
- End their hiatus

### Role Hierarchy

```
Owner (highest)
  ├─ Can do everything
  └─ Can perform actions for others

Manager
  ├─ Manage strikes
  ├─ Approve/deny extensions
  └─ Approve/deny hiatus requests

Onboarded User
  ├─ Submit own tasks
  ├─ Request own extensions
  ├─ Request hiatus
  └─ End own hiatus

Everyone (lowest)
  └─ View information only
```

## Configuration

Role IDs are configured in `config.js`:

```javascript
OWNER_ROLE_ID: 'PLACEHOLDER_OWNER_ROLE_ID'
MANAGER_ROLE_IDS: ['PLACEHOLDER_MANAGER_ROLE_ID_1', 'PLACEHOLDER_MANAGER_ROLE_ID_2']
```

**Important**:

- Replace these placeholder values with your actual Discord role IDs before deployment.
- `MANAGER_ROLE_IDS` is an array - you can add multiple manager role IDs to support different manager roles.

## Error Messages

The wording members see when a policy refuses them lives in `Discord/views/permissions.ts`; `Utils/permissions.ts`
returns only whether an action is allowed.
