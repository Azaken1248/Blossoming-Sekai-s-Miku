//PRODUCTION CONFIGURATION - READY FOR DEPLOYMENT


const WEEK = 7 * 24 * 60 * 60 * 1000;


export default {
    LOG_CHANNEL_ID: '1449120546208878622',
    REMINDER_CHANNEL_ID: '1449299300000468993',
    APPROVAL_CHANNEL_ID: '1394372730757058590',
    
    OWNER_ROLE_ID: '1393977289540239410',
    MANAGER_ROLE_IDS: ['1447982241006489772', '1447982308878717141', '1447982164498186471'], // SVA, Crew, VA Deadline Managers
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
    
    // List of Role IDs to REMOVE when someone gets 3 strikes
    CREW_ROLE_IDS: [
        '1394241724007710823', // SVA
        '1394241631280042074', // VA
        '1394372465068867694', // Mixer
        '1394242208219140178', // Composer
        '1394242001297346662', // Artist
        '1394242091558895750', // Translyricist
        '1394242150794788964', // Lyricist
        '1394242291451039887', // Editor
        '1394242340914200616'  // Skit writer
    ],

    // The Rules for each Role
    RULES: {
        // VA
        '1394241631280042074': {
            name: "VA",
            tasks: {
                'skit': 2 * WEEK,
                'story': 3 * WEEK,
                'joke_cover': 3 * WEEK
            },
            extension: 1 * WEEK
        },
        // SVA
        '1394241724007710823': {
            name: "SVA",
            tasks: {
                'short_cover': 3 * WEEK,
                'full_cover': 4 * WEEK,
                'joke_cover': 3 * WEEK
            },
            extension: 2 * WEEK
        },
        // Translyricist
        '1394242091558895750': {
            name: "translyricist",
            tasks: {
                'short_cover': 2 * WEEK,
                'full_cover': 3 * WEEK
            },
            extension: 2 * WEEK
        },
        // Lyricist
        '1394242150794788964': {
            name: "lyricist",
            tasks: {
                'short_song': 4 * WEEK,
                'long_song': 5 * WEEK
            },
            extension: 2 * WEEK
        },
        // Composer
        '1394242208219140178': {
            name: "composer",
            tasks: {
                'short_song': 5 * WEEK,
                'long_song': 7 * WEEK
            },
            extension: 3 * WEEK
        },
        // Editor
        '1394242291451039887': {
            name: "editor",
            tasks: {
                'skit': 2 * WEEK,
                'story': 3 * WEEK,
                'color_mv': 3 * WEEK,
                '2d_mv': 5 * WEEK
            },
            // Special split extensions logic is handled in commands.js
            extension_mv: 2 * WEEK,
            extension_skit: 1 * WEEK,
            extension_story: 1 * WEEK
        },
        // Mixer
        '1394372465068867694': {
            name: "mixer",
            tasks: {
                'short_cover': 3 * WEEK,
                'full_cover': 4 * WEEK
            },
            extension: 2 * WEEK
        },
        // Artist
        '1394242001297346662': {
            name: "artist",
            tasks: {
                'custom_task': 1 * WEEK // Placeholder, uses custom if needed
            },
            extension: 2 * WEEK
        },
        // Skit writer
        '1394242340914200616': {
            name: "skit_writer",
            tasks: {
                'custom_task': 1 * WEEK // Placeholder, uses custom if needed
            },
            extension: 1 * WEEK
        },
        // Bot Dev
        '1462373658344423515': {
            name: "BOT DEV",
            tasks: {
                'bot_feature': 7 * 24 * 60 * 60 * 1000,
                'bug_fix': 3 * 24 * 60 * 60 * 1000
            },
            extension: 3 * 24 * 60 * 60 * 1000
        }
    }
};
