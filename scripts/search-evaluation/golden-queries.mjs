export const goldenQueries = [
  {
    id: "latency",
    query: "latency",
    relevantGroups: [
      ["task:task_latency"],
      ["session:session_latency_title_only", "session:session_first_request_delay"]
    ],
    minGroupsAt5: 2,
    maxFirstRelevantRank: 2
  },
  {
    id: "first-interaction-slow",
    query: "Why is the first interaction sluggish while later requests are quick?",
    relevantGroups: [["session:session_first_request_delay"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 3
  },
  {
    id: "chat-sidebar",
    query: "chat sidebar",
    relevantGroups: [
      ["session:session_sidebar_title_only"],
      ["session:session_sidebar_restore"]
    ],
    minGroupsAt5: 2,
    maxFirstRelevantRank: 2
  },
  {
    id: "older-conversations-navigation",
    query: "Where did my older conversations go in the left-hand navigation?",
    relevantGroups: [["session:session_sidebar_restore", "session:session_history_title_only"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 3
  },
  {
    id: "resume-and-reading-position",
    query: "Resume a discussion and keep my place in the transcript",
    relevantGroups: [
      ["session:session_prior_thread_scroll"],
      ["session:session_scroll_switcher"]
    ],
    minGroupsAt5: 2,
    maxFirstRelevantRank: 3
  },
  {
    id: "cold-vm",
    query: "cold VM wake issues",
    relevantGroups: [
      ["task:task_vm_wake"],
      ["session:session_vm_title_only", "session:session_suspended_runner"]
    ],
    minGroupsAt5: 2,
    maxFirstRelevantRank: 3
  },
  {
    id: "suspended-machine",
    query: "The remote host has been sleeping overnight, and the first command is delayed while it wakes",
    relevantGroups: [["session:session_suspended_runner"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 3
  },
  {
    id: "browser-auth-session",
    query: "Why does my browser keep logging me out after refresh?",
    relevantGroups: [["session:session_auth_cookie_refresh"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 3,
    prohibited: ["session:session_task_session_binding"]
  },
  {
    id: "coding-session-not-login",
    query: "Find the development thread linked to this task, not the sign-in session",
    relevantGroups: [["session:session_task_session_binding"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 3,
    prohibited: ["session:session_auth_cookie_refresh"]
  },
  {
    id: "persist-after-restart",
    query: "Keep local data after the process restarts",
    relevantGroups: [
      ["task:task_storage"],
      ["session:session_restart_state", "session:session_storage_title_only"]
    ],
    minGroupsAt5: 2,
    maxFirstRelevantRank: 3
  },
  {
    id: "deployment-schema-order",
    query: "Deploy the Worker only after the database schema is ready",
    relevantGroups: [
      ["task:task_deployment"],
      ["session:session_d1_missing_column", "session:session_migration_before_worker"]
    ],
    minGroupsAt5: 2,
    maxFirstRelevantRank: 3
  },
  {
    id: "exact-wake-identifier",
    query: "SESSION_WAKE_GRACE_MS",
    relevantGroups: [["session:session_wake_grace"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 1
  },
  {
    id: "exact-message-table",
    query: "task_session_messages",
    relevantGroups: [["session:session_saved_roles"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 2
  },
  {
    id: "retry-without-duplicates",
    query: "Retry a transcript upload after a timeout without duplicating turns",
    relevantGroups: [
      ["session:session_append_retry"],
      ["session:session_duplicate_turn"]
    ],
    minGroupsAt5: 2,
    maxFirstRelevantRank: 3
  },
  {
    id: "unicode-punctuation",
    query: "“first request” — résumé says p95 regressed!",
    relevantGroups: [["session:session_p95_release"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 3
  },
  {
    id: "saved-state-title-only",
    query: "Where is the durable local database?",
    relevantGroups: [["session:session_storage_title_only"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 3
  },
  {
    id: "title-only-compute",
    query: "Pre-warm the remote compute before the first command",
    relevantGroups: [["session:session_vm_title_only"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 3
  },
  {
    id: "exact-api-config",
    query: "PUBLIC_API_BASE_URL",
    relevantGroups: [["session:session_public_api_url"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 1
  },
  {
    id: "exact-batch-limit",
    query: "SESSION_MESSAGES_MAX_PER_PUSH",
    relevantGroups: [["session:session_message_batch_limit"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 1
  },
  {
    id: "reopen-t3-from-terminal",
    query: "Can I reopen my T3 conversation in the terminal?",
    relevantGroups: [["task:task_cli_resume"], ["session:session_t3_cli_resume"]],
    minGroupsAt5: 2,
    maxFirstRelevantRank: 3
  },
  {
    id: "unicode-title-only",
    query: "café ☕ résumé—notes",
    relevantGroups: [["session:session_unicode_title_only"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 1
  },
  {
    id: "callback-throttle",
    query: "HTTP 429 + Retry-After",
    relevantGroups: [["session:session_callback_retry"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 2
  },
  {
    id: "no-match-dessert",
    query: "best recipe for pistachio gelato",
    relevantGroups: [],
    noMatch: true
  },
  {
    id: "no-match-astronomy",
    query: "calculate the orbital period of a distant exoplanet",
    relevantGroups: [],
    noMatch: true
  },
  {
    id: "semantic-paraphrase-suspended-runner",
    query: "Why does a remote runner stall before it is ready after being asleep?",
    relevantGroups: [["session:session_suspended_runner"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 3
  },
  {
    id: "semantic-paraphrase-auth-thread",
    query: "Find the saved coding thread attached to this task, not my web login session.",
    relevantGroups: [["session:session_task_session_binding"]],
    minGroupsAt5: 1,
    maxFirstRelevantRank: 2
  },
  {
    id: "semantic-paraphrase-transcript-retry",
    query: "Resend a timed-out transcript batch without saving duplicate turns.",
    relevantGroups: [
      ["session:session_append_retry"],
      ["session:session_duplicate_turn"]
    ],
    minGroupsAt5: 2,
    maxFirstRelevantRank: 3
  },
  {
    id: "no-match-planetary-near-topic",
    query: "How many times does Mars circle the Sun during one year?",
    relevantGroups: [],
    noMatch: true
  },
  {
    id: "no-match-baking",
    query: "What temperature should I use to bake sourdough bread?",
    relevantGroups: [],
    noMatch: true
  }
];
