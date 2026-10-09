# Serron — Proactive Talk (System Integrity–driven) — Cursor tasks

Implement in order. Test and confirm each part works before starting 
the next — do not combine into one large change.

---

## Part 1 — Data layer: "next question" resolver (no UI changes yet)

Goal: a single source of truth for "what should Talk ask next", built 
entirely from data that already exists (System Integrity section 
fields — Your Body, Your Health, Your Mind, Lifestyle & Habits, 
Goals & Intent — the same fields already shown in the profile modals, 
e.g. "Your Body" → Sex at birth, Gender identity, Age, Height, Weight, 
Body build, Blood type, Physical activity, Regular discomfort, 
primary goal, priority level).

Requirements:
- Add a function (e.g. `getNextProfileQuestion()`) that:
  - Walks the 5 sections in a fixed order: Your Body → Your Health → 
    Your Mind → Lifestyle & Habits → Goals & Intent.
  - Within each section, walks its fields in the order they appear in 
    the existing profile modal.
  - Returns the first field that is empty/unanswered, along with 
    which section it belongs to.
  - Returns `null` if every field in every section is filled 
    (profile complete).
- Do NOT invent new fields or new questions — only use fields that 
  already exist in the profile modals (Your Body, Your Health, Your 
  Mind, Lifestyle & Habits, Goals & Intent). If a section's fields 
  aren't fully defined yet in code, stub it with the fields visible 
  in the existing "Your Body" modal as the reference pattern and flag 
  which other sections still need their field lists confirmed.
- No Talk UI changes in this part. Verify via a temporary dev-only 
  console log or test script that calls `getNextProfileQuestion()` 
  and prints the correct next field for a few test states (empty 
  profile, partially filled, fully filled).

**Checkpoint before Part 2:** confirm the resolver returns the 
correct next field in the correct section order for at least 3 test 
scenarios (fresh user, mid-profile, complete profile).

---

## Part 2 — Talk greeting + first proactive question

Goal: replace the current passive "I'm online..." welcome message 
with a proactive greeting + first question, using Part 1's resolver.

Requirements:
- On opening Talk, if `getNextProfileQuestion()` returns a field 
  (profile not complete):
  1. Show a short, warm greeting — 1-2 sentences max, explaining 
     what Serron is and what the user gets from it (not a long 
     paragraph — this must be skimmable in a few seconds).
  2. Immediately followed by ONE natural-language question for the 
     next unanswered field (not a form-field label — phrase it 
     conversationally, e.g. field "Age" → "How old are you?" not 
     "Age:").
- If `getNextProfileQuestion()` returns `null` (profile complete), 
  keep the existing passive behavior — do not change this case in 
  this part.
- This proactive greeting+question should appear every time Talk is 
  opened while the profile is incomplete, not just the first time 
  ever (confirmed direction: repeats on every open until complete).
- Do NOT yet implement answer-parsing/saving in this part — that's 
  Part 3. For now it's fine if the user's reply doesn't yet update 
  anything; just confirm the right question appears.

**Checkpoint before Part 3:** open Talk fresh, confirm greeting + 
correct first question appears. Answer it (reply won't be processed 
yet), close Talk, reopen — confirm the SAME question still appears 
(since nothing was saved yet, this is expected and correct for this 
checkpoint).

---

## Part 3 — Capturing answers and updating System Integrity

Goal: when the user answers the proactive question, save it to the 
correct profile field and visibly update System Integrity.

Requirements:
- Parse the user's free-text reply for the field currently being 
  asked about (e.g. if asking for Age, extract a number; if asking 
  Sex at birth, match against the known options Male/Female/Prefer 
  not to say). Use simple, reliable parsing per field type — do not 
  over-engineer free-form NLP for this first pass; if the reply is 
  ambiguous, Talk should ask a quick clarifying follow-up rather than 
  guessing.
- On a successful parse, save the value to the same data field the 
  profile modal (e.g. "Your Body") reads from — so the profile modal 
  and Talk stay in sync (editing in one place reflects in the other).
- Update the section's completion status (e.g. "Your Health: Not 
  started" → "In progress", and once all fields in a section are 
  filled → "Complete") and the overall System Integrity percentage — 
  both should update immediately and be visible in the sidebar 
  without requiring a page refresh.
- After saving one answer, call `getNextProfileQuestion()` again and 
  ask the next question in the same message flow (still one question 
  at a time).

**Checkpoint before Part 4:** answer 2-3 questions in a row, confirm: 
(a) the profile modal shows the same values Talk collected, (b) the 
sidebar section status and System Integrity percentage update 
immediately after each answer, (c) Talk asks a different question 
each time, in the correct order.

---

## Part 4 — Pacing: pause and ask permission to continue

Goal: after 2-3 questions in one session, Talk pauses and explicitly 
asks the user whether to continue now or later — never silently 
keeps going and never silently stops.

Requirements:
- Track how many proactive questions have been asked in the current 
  open Talk session (resets each time Talk is closed and reopened).
- After 2-3 questions answered in one session (pick 3 as the 
  default, easy to tune), Talk sends a short message explicitly 
  asking: continue now, or pick this up another time — with two 
  clear reply options (can be actual tappable buttons if that matches 
  existing Talk UI patterns, or just a natural-language prompt the 
  user replies to in text).
- If the user chooses to continue, resume asking questions (reset the 
  in-session counter) up to the same 2-3 limit before pausing again.
- If the user chooses to stop (or doesn't respond / sends something 
  unrelated), Talk should gracefully back off with a warm, 
  non-pushy message (e.g. acknowledging it'll pick up next time) and 
  switch to passive mode for the rest of that session — the user can 
  still ask it anything freely.

**Checkpoint before Part 5:** open Talk, answer 3 questions, confirm 
the pause prompt appears with a real choice; test both choosing to 
continue and choosing to stop, confirm behavior matches in each case.

---

## Part 5 — Completion fallback

Goal: once all 5 sections are fully complete, Talk should stop 
asking profile questions and behave as it does today (passive, 
waits for the user).

Requirements:
- When `getNextProfileQuestion()` returns `null`, Talk's opening 
  behavior reverts to today's existing passive welcome message — no 
  regressions to current behavior for fully-onboarded users.
- Confirm this transition happens automatically the moment the last 
  field is filled — no separate manual toggle needed.

**Checkpoint:** manually fill all remaining fields (via profile 
modals or Talk) until System Integrity shows all 5 sections 
Complete, reopen Talk, confirm it no longer asks a profile question 
and behaves like the current passive mode.

---

## Notes for all parts

- Keep proactive-question logic isolated from the rest of Talk's 
  free-form chat logic where possible — don't rewrite the existing 
  "Ask me anything" free-form handling, only add the proactive 
  layer on top of it.
- No changes to Feed, Focus Area, or System Integrity's underlying 
  formula in this task set — only wiring Talk to read/write the 
  existing profile field data and section status.
- Test at ~390px mobile width for any new UI elements (pause prompt, 
  etc.), consistent with the rest of the app's mobile-first testing.