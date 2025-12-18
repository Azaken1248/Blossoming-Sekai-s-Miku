//ALL ROLE IDS USED HERE ARE PLACEHOLDERS AND SHOULD BE REPLACED WITH ACTUAL IDS


const WEEK = 7 * 24 * 60 * 60 * 1000;
const MONTH = 4 * WEEK;

export default {
    LOG_CHANNEL_ID: '1449396640044810531',
    REMINDER_CHANNEL_ID: '1450543772009107596',
    APPROVAL_CHANNEL_ID: '1450576609127043284',
    
    OWNER_ROLE_ID: '1450880407993319495',
    MANAGER_ROLE_IDS: ['1451202870455173151'],
    ADMIN_USER_IDS: ['1213817849693478972', '867113282929557514'],
    
    SCHEDULER_INTERVAL_MINUTES: 60,
    
    REMINDER_THRESHOLDS: {
        SHORT_TASK: {
            duration: 7 * 24 * 60 * 60 * 1000,
            firstReminder: 2 * 24 * 60 * 60 * 1000,
            finalReminder: 1 * 24 * 60 * 60 * 1000
        },
        MEDIUM_TASK: {
            duration: 21 * 24 * 60 * 60 * 1000,
            firstReminder: 5 * 24 * 60 * 60 * 1000,
            finalReminder: 1 * 24 * 60 * 60 * 1000
        },
        LONG_TASK: {
            firstReminder: 7 * 24 * 60 * 60 * 1000,
            finalReminder: 1 * 24 * 60 * 60 * 1000
        }
    },
    
    // 2. List of Role IDs to REMOVE when someone gets 3 strikes
    
    CREW_ROLE_IDS: [
        '1449411540351713503',
        '1449413545224704071',
        '1449415623388958720',
        '1449415914624909333',
        '1449416050457186425',
        '1449416633910038679',
        '1449416803452194929'
    ],

    // 3. The Rules for each Role
    RULES: {
        // VA Group 1
        '1449411540351713503': {
            name: "VA",
            tasks: {
                'skit': 1 * WEEK,
                'story': 2 * WEEK,
                'joke_cover': 2 * WEEK
            },
            extension: 1 * WEEK
        },
        // VA Group 2
        '1449413545224704071': {
            name: "SVA",
            tasks: {
                'short_cover': 2 * WEEK,
                'full_cover': 3 * WEEK,
                'joke_cover': 2 * WEEK
            },
            extension: 2 * WEEK
        },
        // VA Group 3
        '1449415623388958720': {
            name: "translyricist",
            tasks: {
                'short_cover': 1 * WEEK,
                'full_cover': 2 * WEEK
            },
            extension: 2 * WEEK
        },
        // Singer Group 1
        '1449416633910038679': {
            name: "lyricist",
            tasks: {
                'short_song': 3 * WEEK,
                'long_song': 4 * WEEK
            },
            extension: 2 * WEEK
        },
        // Singer Group 2
        '1449415914624909333': {
            name: "composer",
            tasks: {
                'short_song': 1 * MONTH,
                'long_song': 6 * WEEK
            },
            extension: 3 * WEEK
        },
        // Visuals/MV
        '1449416050457186425': {
            name: "editor",
            tasks: {
                'skit': 1 * WEEK,
                'color_mv': 2 * WEEK,
                '2d_mv': 4 * WEEK
            },
            // Special split extensions logic is handled in commands.js
            extension_mv: 2 * WEEK,
            extension_skit: 1 * WEEK
        },
        // VA Group 4
        '1449416803452194929': {
            name: "mixer",
            tasks: {
                'short_cover': 2 * WEEK,
                'full_cover': 3 * WEEK
            },
            extension: 2 * WEEK
        }
    }
};