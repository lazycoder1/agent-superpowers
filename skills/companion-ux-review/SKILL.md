---
name: companion-ux-review
description: Exercise Companion workflows as a first-time user through native Computer Use, judge whether the agent's proposed effects are trustworthy, perform only explicitly authorized effects, and return evidence-backed UI/UX pain points and improvements. Use for live Companion usability reviews, end-to-end sales or email journey tests, trust and progressive-disclosure audits, and pre-release native-app QA where Codex must operate the real interface rather than infer behavior from source code.
---

# Companion UX Review

Operate Companion like the intended user. Observe the interface before reading implementation details. Treat confusion, dead ends, and compensating knowledge as findings rather than silently working around them.

## Required tools

- Load and follow the `computer-use` skill.
- Use Computer Use against the native Companion app as the primary test surface.
- Use source, logs, APIs, or Playwright only after observing the UI, and only to explain or reproduce a finding.
- If Computer Use is unavailable, stop and report that the native review cannot be performed. Do not silently replace it with source inspection or browser automation.

## Establish the review contract

Extract these facts from the request before acting:

1. User goal and starting surface.
2. Exact account, deal, contact, thread, or artifact in scope.
3. External effects allowed, including exact recipient and purpose.
4. Completion evidence required.

Default to review-only. Never infer authority to send, publish, delete, or grant controls. When authority is explicit, keep it bounded to the named destination and purpose.

## Run the journey

1. Open the native app and capture the starting state.
2. Follow the most obvious common path. Do not use hidden implementation knowledge to choose controls.
3. After every action, fetch fresh app state before choosing the next action.
4. Record friction immediately: the user's likely question, the visible cue, what happened, and whether recovery was obvious.
5. Try one obvious recovery for a blocked step. Do not brute-force unclear navigation.
6. Capture screenshots at the start, at trust-critical decisions, at failures, and at verified completion.

Evaluate the product continuously for:

- one obvious primary action;
- progressive disclosure and contextual actions;
- visible system status and consequence preview;
- editability before an external effect;
- evidence for the agent's reasoning;
- clear scope, recipient, thread, and control boundaries;
- recovery from ambiguity, missing knowledge, or low confidence;
- keyboard, focus, scrolling, clipping, and responsive behavior.

## Review agent-generated email

Read [references/email-trust-rubric.md](references/email-trust-rubric.md) before testing an email workflow.

For an existing-thread reply, verify the exact provider thread, chronological context, eligible human participant, reply subject, and same-thread routing. For a new message, verify that it is explicitly a new thread and not an accidental reply.

Run the product's simulation or preview before granting controls. Judge the proposed message independently. Approve only when it is grounded in visible context, concise, correctly addressed, free of invented facts or commitments, and has an appropriate next step. If a small edit makes it acceptable, edit and re-review it once. Otherwise, do not send; record why the trust gate failed.

Immediately before an authorized send, verify:

- exact recipient and sender;
- existing reply versus new thread;
- subject and complete body;
- attachments, CC, and BCC;
- provider consequence shown by the UI.

After sending, require an explicit receipt or provider state. Never infer delivery from a button click or optimistic animation.

## Produce the review

Return a concise report containing:

1. Outcome and side-effect ledger: what was sent or not sent, recipient, reply/new-thread distinction, and visible receipt.
2. Journey table: step, expected next action, actual result, friction, and evidence.
3. Pain points ordered by severity: blocker, high, medium, polish.
4. Trust assessment: what made the agent predictable or unsafe.
5. Recommended UI changes, using established interaction patterns before proposing novel ones.
6. Separate product defects from usability/design findings.

Use neutral evidence. Do not turn one observation into a universal claim. If the flow cannot finish, report the exact last trustworthy state and the smallest product change that would unblock it.
