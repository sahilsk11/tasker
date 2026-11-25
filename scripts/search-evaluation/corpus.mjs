export const coreTasks = [
  {
    label: "task_latency",
    title: "Reduce API latency for first request",
    sessions: [
      {
        label: "session_first_request_delay",
        title: "Wait before the first interaction",
        messages: [
          {
            role: "user",
            text: "The first request after startup takes about 1.8 seconds, but the next few are quick. Can we find what makes the initial interaction feel sluggish?"
          },
          {
            role: "assistant",
            text: "Measure connection setup and handler time separately. Compare a fresh process with a warmed process, and record p50 and p95 response times before changing the code."
          }
        ]
      },
      {
        label: "session_recent_index_slow",
        title: "Recent thread list slows as history grows",
        messages: [
          {
            role: "user",
            text: "Opening the latest conversations becomes noticeably slower after a long coding session. The query filters by session and sorts every saved turn by ordinal."
          },
          {
            role: "assistant",
            text: "Inspect the query plan with a realistic message count. A composite index on session_id and ordinal should avoid scanning unrelated history."
          }
        ]
      },
      {
        label: "session_p95_release",
        title: "After-release timing check",
        messages: [
          {
            role: "user",
            text: "The dashboard's p95 moved from 120 ms to 940 ms after yesterday's rollout. The median barely changed, so the regression may affect only the first request or a small set of large histories."
          },
          {
            role: "assistant",
            text: "Compare traces by request size and process age. Keep the before-and-after samples so the release can be rolled back if the tail remains elevated."
          }
        ]
      },
      {
        label: "session_latency_title_only",
        title: "API latency triage",
        messages: []
      }
    ]
  },
  {
    label: "task_conversation_nav",
    title: "Make conversation history easier to navigate",
    sessions: [
      {
        label: "session_sidebar_restore",
        title: "Locate an older thread",
        messages: [
          {
            role: "user",
            text: "People cannot find the left rail that lists their previous agent threads when the main panel is narrow. Selecting an older item should return to that saved discussion."
          },
          {
            role: "assistant",
            text: "Keep the conversation list reachable at narrow widths and give each entry a readable title. The selected thread should remain obvious without hiding the current transcript."
          }
        ]
      },
      {
        label: "session_prior_thread_scroll",
        title: "Opening a previous run",
        messages: [
          {
            role: "user",
            text: "When I switch to an earlier conversation and return, I lose my place. Restore the transcript position as well as the active thread."
          },
          {
            role: "assistant",
            text: "Persist the selected thread and its scroll offset per view. Avoid restoring an offset until the message list has finished rendering."
          }
        ]
      },
      {
        label: "session_sidebar_title_only",
        title: "Chat sidebar navigation",
        messages: []
      },
      {
        label: "session_history_title_only",
        title: "Conversation history index",
        messages: []
      }
    ]
  },
  {
    label: "task_vm_wake",
    title: "Shorten cold virtual machine wake-up",
    sessions: [
      {
        label: "session_suspended_runner",
        title: "Workstation did not answer at dawn",
        messages: [
          {
            role: "user",
            text: "The remote development machine is suspended overnight. My first command sits idle while compute resumes, although later commands run normally."
          },
          {
            role: "assistant",
            text: "Separate provider wake time from project setup time. A small health request before dispatch could start the VM earlier, but measure the extra idle cost first."
          }
        ]
      },
      {
        label: "session_preflight_wait",
        title: "Hold before running the test suite",
        messages: [
          {
            role: "user",
            text: "A newly allocated workspace sometimes reports ready before its filesystem and network are usable. The initial test command then times out."
          },
          {
            role: "assistant",
            text: "Use a bounded readiness probe for both the checkout and network. Report which prerequisite is still unavailable rather than retrying the test blindly."
          }
        ]
      },
      {
        label: "session_vm_title_only",
        title: "Cold compute wake-up investigation",
        messages: []
      }
    ]
  },
  {
    label: "task_auth",
    title: "Separate login state from coding session state",
    sessions: [
      {
        label: "session_auth_cookie_refresh",
        title: "Stay signed in across browser refresh",
        messages: [
          {
            role: "user",
            text: "After refreshing the page I am asked to authenticate again. The browser cookie expires sooner than expected, even though the application was left open."
          },
          {
            role: "assistant",
            text: "Check cookie expiry, renewal, and the identity provider's session lifetime. This is browser authentication state, not a saved coding conversation."
          }
        ]
      },
      {
        label: "session_task_session_binding",
        title: "Attach the right coding thread to a task",
        messages: [
          {
            role: "user",
            text: "I need to find the development conversation registered to this work item. It has a provider thread ID and transcript, but it is not the user's sign-in session."
          },
          {
            role: "assistant",
            text: "Resolve the saved agent conversation by its provider and provider ID, then confirm its task ID. Keep that lookup separate from cookie or token authentication."
          }
        ]
      },
      {
        label: "session_token_scope",
        title: "Avoid mixing thread IDs with credentials",
        messages: [
          {
            role: "user",
            text: "A support note used the word session for both an access token and a coding thread. We should never put a credential into a conversation identifier."
          },
          {
            role: "assistant",
            text: "Use distinct field names and validation for credentials, provider IDs, and saved conversation IDs. Do not log token values."
          }
        ]
      }
    ]
  },
  {
    label: "task_message_sync",
    title: "Make saved conversation sync safe to retry",
    sessions: [
      {
        label: "session_append_retry",
        title: "Safely retry a partially delivered batch",
        messages: [
          {
            role: "user",
            text: "The client times out after sending turns, so it cannot tell whether the server saved them. Retrying should not create duplicate entries."
          },
          {
            role: "assistant",
            text: "Give each turn a stable external ID. An identical resend can be skipped; reusing an ID with different content should reject the batch without partial writes."
          }
        ]
      },
      {
        label: "session_duplicate_turn",
        title: "Prevent repeated turns in history",
        messages: [
          {
            role: "user",
            text: "A reconnect can replay the last assistant answer and user prompt. Keep the transcript in order while suppressing messages already accepted."
          },
          {
            role: "assistant",
            text: "Track a monotonic ordinal alongside the source message ID. Resume from the saved head and make appends idempotent."
          }
        ]
      },
      {
        label: "session_saved_roles",
        title: "Which transcript content is retained",
        messages: [
          {
            role: "user",
            text: "Search needs the clean text of user and assistant turns from task_session_messages, not tool output, environment dumps, or generated files."
          },
          {
            role: "assistant",
            text: "Persist only the supported user and assistant message roles with their text and order. Leave unrelated artifacts outside conversation search."
          }
        ]
      }
    ]
  },
  {
    label: "task_storage",
    title: "Persist Tasker data across local restarts",
    sessions: [
      {
        label: "session_restart_state",
        title: "State disappears after a restart",
        messages: [
          {
            role: "user",
            text: "A task created before restarting the local service is missing afterward. Confirm the process uses the same SQLite file on each launch."
          },
          {
            role: "assistant",
            text: "Read the configured database path at startup and verify a write, close, and reopen cycle. Avoid silently falling back to an in-memory database."
          }
        ]
      },
      {
        label: "session_wal_backup",
        title: "Copy the database while writes continue",
        messages: [
          {
            role: "user",
            text: "A raw file copy taken during active SQLite writes is incomplete. What is a safe way to snapshot the local store?"
          },
          {
            role: "assistant",
            text: "Use SQLite's online backup mechanism or quiesce writes before copying. Account for the write-ahead log rather than copying only the main file."
          }
        ]
      },
      {
        label: "session_storage_title_only",
        title: "Local database durability",
        messages: []
      }
    ]
  },
  {
    label: "task_deployment",
    title: "Deploy the Worker with current database schema",
    sessions: [
      {
        label: "session_d1_missing_column",
        title: "Hosted rollout reports an unknown column",
        messages: [
          {
            role: "user",
            text: "The new Worker code expects a session context column that the hosted database does not have yet. The app deploy succeeds but requests fail."
          },
          {
            role: "assistant",
            text: "Check the migration history for the target database and apply the additive schema change before shifting traffic to code that reads it."
          }
        ]
      },
      {
        label: "session_migration_before_worker",
        title: "Order the release steps",
        messages: [
          {
            role: "user",
            text: "We need a rollout that avoids old and new Worker versions disagreeing about a table shape during deploy."
          },
          {
            role: "assistant",
            text: "Use an expand-and-contract sequence: add compatible columns first, deploy code that tolerates both shapes, then remove obsolete fields in a later release."
          }
        ]
      },
      {
        label: "session_deploy_title_only",
        title: "Database rollout checklist",
        messages: []
      }
    ]
  },
  {
    label: "task_runtime_config",
    title: "Correct local API runtime configuration",
    sessions: [
      {
        label: "session_public_api_url",
        title: "Fix callback address in local runtime",
        messages: [
          {
            role: "user",
            text: "The browser sends a callback to the wrong host when running in a worktree. The expected setting is PUBLIC_API_BASE_URL, and it should match the temporary local API."
          },
          {
            role: "assistant",
            text: "Read PUBLIC_API_BASE_URL from the worktree manifest and keep the browser and API origins paired. Do not hard-code the hosted service address."
          }
        ]
      },
      {
        label: "session_wake_grace",
        title: "Avoid repeated wake-up attempts",
        messages: [
          {
            role: "user",
            text: "The session runner polls too aggressively while a remote machine starts. Which setting controls the grace period before another wake request?"
          },
          {
            role: "assistant",
            text: "SESSION_WAKE_GRACE_MS is the exact configuration identifier to inspect. Keep the delay bounded and test the first request after a suspended interval."
          }
        ]
      },
      {
        label: "session_message_batch_limit",
        title: "Large transcript batch is rejected",
        messages: [
          {
            role: "user",
            text: "A very large conversation push fails validation even though individual turns are valid. Find the batch size constraint."
          },
          {
            role: "assistant",
            text: "SESSION_MESSAGES_MAX_PER_PUSH controls the supported number of messages in one request. Split longer histories into bounded batches."
          }
        ]
      }
    ]
  },
  {
    label: "task_cli_resume",
    title: "Resume saved coding work from the CLI",
    sessions: [
      {
        label: "session_t3_cli_resume",
        title: "Open a saved T3 thread from the terminal",
        messages: [
          {
            role: "user",
            text: "I have a conversation in T3 with decisions I need for today's code change. Can the command line show the linked Tasker item and reopen that thread?"
          },
          {
            role: "assistant",
            text: "List saved task and session references, resolve the T3 provider ID, and preserve the original conversation link when opening it."
          }
        ]
      },
      {
        label: "session_working_directory",
        title: "Return to the last working directory",
        messages: [
          {
            role: "user",
            text: "Resuming the assistant conversation is not enough if the terminal opens in the repository root instead of the directory used last time."
          },
          {
            role: "assistant",
            text: "Store the working path with the task or session context and verify it still exists before using it."
          }
        ]
      }
    ]
  },
  {
    label: "task_accessibility",
    title: "Improve keyboard access to conversation history",
    sessions: [
      {
        label: "session_keyboard_history",
        title: "Keyboard access to the session list",
        messages: [
          {
            role: "user",
            text: "The list of past runs cannot be reached reliably without a mouse. Add a visible focus state and predictable arrow-key movement."
          },
          {
            role: "assistant",
            text: "Use semantic buttons with labels, preserve a clear focus ring, and test the list with keyboard-only navigation."
          }
        ]
      },
      {
        label: "session_scroll_switcher",
        title: "Keep position while switching conversations",
        messages: [
          {
            role: "user",
            text: "Switching between two long transcripts resets the viewport to the top. Each conversation should remember its own reading position."
          },
          {
            role: "assistant",
            text: "Key the saved scroll offset by conversation ID and restore it after the corresponding message page is loaded."
          }
        ]
      }
    ]
  },
  {
    label: "task_webhook",
    title: "Harden webhook delivery and verification",
    sessions: [
      {
        label: "session_webhook_signature",
        title: "Reject callbacks with a bad signature",
        messages: [
          {
            role: "user",
            text: "A callback should be rejected if its HMAC does not match the raw request body. The current handler parses JSON before checking the signature."
          },
          {
            role: "assistant",
            text: "Verify the signature against the original bytes with a constant-time comparison, then parse the payload only after authentication succeeds."
          }
        ]
      },
      {
        label: "session_callback_retry",
        title: "Back off after a temporary callback failure",
        messages: [
          {
            role: "user",
            text: "The partner returns HTTP 429 with a Retry-After header. Our delivery loop ignores it and sends another callback immediately."
          },
          {
            role: "assistant",
            text: "Respect Retry-After when valid, cap the delay, and use exponential backoff with jitter for transient failures."
          }
        ]
      }
    ]
  },
  {
    label: "task_build",
    title: "Make local TypeScript builds reproducible",
    sessions: [
      {
        label: "session_compile_map",
        title: "Compiler output differs between machines",
        messages: [
          {
            role: "user",
            text: "One developer gets a sourcemap warning while another does not. Compare the Node version, lockfile, and package build flags."
          },
          {
            role: "assistant",
            text: "Pin the supported runtime range and use the same package manager lockfile. Keep generated output out of source control."
          }
        ]
      },
      {
        label: "session_lockfile",
        title: "Install fails after a dependency update",
        messages: [
          {
            role: "user",
            text: "A clean checkout cannot reproduce the package graph after a dependency range changed. Check whether the workspace lockfile was updated."
          },
          {
            role: "assistant",
            text: "Run the repository's pinned pnpm version and commit the lockfile change with the manifest update."
          }
        ]
      }
    ]
  },
  {
    label: "task_release_notes",
    title: "Keep release notes readable across locales",
    sessions: [
      {
        label: "session_unicode_title_only",
        title: "Résumé notes, café & tests ☕",
        messages: []
      }
    ]
  }
];

const distractorTopics = [
  {
    taskLabel: "distractor_task_calendar",
    taskTitle: "Review calendar import edge cases",
    sessionTitle: "Check recurring event boundaries",
    userText: "An event that repeats on the last weekday of a month should keep its local date when exported to an iCalendar file.",
    assistantText: "Add examples for leap years, daylight-saving transitions, and months with five occurrences of the selected weekday."
  },
  {
    taskLabel: "distractor_task_csv",
    taskTitle: "Validate spreadsheet import behavior",
    sessionTitle: "Preserve quoted delimiters in rows",
    userText: "A comma inside a quoted spreadsheet cell is being treated as a new column during upload.",
    assistantText: "Use a standards-compliant parser and test escaped quotes, empty cells, and line breaks inside quoted values."
  },
  {
    taskLabel: "distractor_task_palette",
    taskTitle: "Tune the dashboard color palette",
    sessionTitle: "Compare contrast in dark mode",
    userText: "The warning orange is difficult to distinguish from the selected row when the dashboard uses its dark theme.",
    assistantText: "Check contrast ratios for text and controls, then validate the palette with a color-vision simulation."
  },
  {
    taskLabel: "distractor_task_keyboard",
    taskTitle: "Document editor keyboard shortcuts",
    sessionTitle: "Avoid collisions in key bindings",
    userText: "The editor's new multi-cursor shortcut conflicts with the browser command on one platform.",
    assistantText: "List shortcuts by operating system and allow users to reset customized bindings."
  },
  {
    taskLabel: "distractor_task_image",
    taskTitle: "Resize images for the profile editor",
    sessionTitle: "Keep uploaded portraits sharp",
    userText: "The profile crop looks blurry after saving a large portrait from a mobile device.",
    assistantText: "Preserve the original dimensions until the crop is committed and avoid repeated lossy re-encoding."
  },
  {
    taskLabel: "distractor_task_metrics",
    taskTitle: "Improve dashboard metric labels",
    sessionTitle: "Explain weekly active accounts",
    userText: "Readers confuse the rolling seven-day count with the total number of accounts created this month.",
    assistantText: "Name the interval explicitly and include a short definition next to the chart legend."
  },
  {
    taskLabel: "distractor_task_locale",
    taskTitle: "Fix locale-aware number formatting",
    sessionTitle: "Render decimal separators consistently",
    userText: "A price entered with a comma decimal separator becomes one hundred times larger after parsing.",
    assistantText: "Use the user's locale during parsing and store a normalized numeric value rather than formatted text."
  },
  {
    taskLabel: "distractor_task_notifications",
    taskTitle: "Throttle duplicate email notifications",
    sessionTitle: "Group alerts during a busy hour",
    userText: "A burst of status changes sends one email for every update and overwhelms the project inbox.",
    assistantText: "Coalesce related events into a short digest and preserve an unsubscribe option for each notification category."
  }
];

export function makeDistractors(count) {
  const sessionsByTask = new Map();

  for (let index = 1; index <= count; index += 1) {
    const topic = distractorTopics[(index - 1) % distractorTopics.length];
    const suffix = String(index).padStart(5, "0");
    const session = {
      label: `distractor_session_${suffix}`,
      title: `${topic.sessionTitle} (case ${suffix})`,
      messages: [
        {
          role: "user",
          text: `${topic.userText} Evaluation case ${suffix} adds a distinct import sample for regression coverage.`
        },
        {
          role: "assistant",
          text: `${topic.assistantText} The sample identifier is CASE-${suffix}.`
        }
      ]
    };
    const task = sessionsByTask.get(topic.taskLabel) ?? {
      label: topic.taskLabel,
      title: topic.taskTitle,
      sessions: []
    };

    task.sessions.push(session);
    sessionsByTask.set(topic.taskLabel, task);
  }

  return [...sessionsByTask.values()];
}
