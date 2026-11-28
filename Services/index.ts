import config from '../config.js';
import * as analyticsRecords from '../Utils/DBUtils/analyticsRecords.ts';
import * as apiRecords from '../Utils/DBUtils/apiRecords.ts';
import { DEFAULT_DEBOARDED_MESSAGE, members, tasks } from '../Utils/DBUtils/index.ts';
import { createAnalyticsService } from './analyticsService.ts';
import { createApprovalService } from './approvalService.ts';
import { createProfileService, type ProfileService } from './profileService.ts';
import { createRecordService } from './recordService.ts';
import { createAssignmentService } from './assignmentService.ts';
import { createCardService, readCardServiceUrl } from './cardService.ts';
import { createExtensionService } from './extensionService.ts';
import { createHiatusService } from './hiatusService.ts';
import { createMemberService } from './memberService.ts';
import { createReminderService } from './reminderService.ts';
import { createStrikeService } from './strikeService.ts';
import { createSubmissionService } from './submissionService.ts';

const rules = config.RULES;
const clock = { now: () => new Date() };

export const analyticsService = createAnalyticsService({ records: analyticsRecords });
export const approvalService = createApprovalService({ tasks, rules });
export const assignmentService = createAssignmentService({ tasks, members, rules, clock });
export const cardService = createCardService({
    members,
    fetch: (url) => globalThis.fetch(url),
    baseUrl: readCardServiceUrl(process.env['CARD_SERVICE_URL']),
});
export const extensionService = createExtensionService({ tasks, members, rules });
export const hiatusService = createHiatusService({ members, rules, clock });
export const memberService = createMemberService({ members, defaultFarewell: DEFAULT_DEBOARDED_MESSAGE });
export const recordService = createRecordService({ records: apiRecords });
export const reminderService = createReminderService({ tasks, members, thresholds: config.REMINDER_THRESHOLDS });
export const strikeService = createStrikeService({ members });
export const submissionService = createSubmissionService({ tasks, members });

type ProfilePorts = Omit<Parameters<typeof createProfileService>[0], 'records'>;

export const bindProfileService = (ports: ProfilePorts): ProfileService =>
    createProfileService({
        records: {
            listUsers: apiRecords.listUsers,
            summaryRecord: apiRecords.summaryRecord,
            storedMember: apiRecords.storedMember,
            taskRoles: apiRecords.taskRoles,
            profile: apiRecords.getUserProfile,
        },
        ...ports,
    });

export { SearchTooLongError } from '../Utils/DBUtils/searchPattern.ts';
