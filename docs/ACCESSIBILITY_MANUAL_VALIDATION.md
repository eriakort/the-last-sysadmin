# Manual accessibility validation — execution record

Status: **Not run — awaiting hands-on validation**

This worksheet is the final manual validation step for the accessibility remediation sequence. It is intentionally a test protocol, not a declaration of conformance. Automated Playwright/axe checks cannot verify the quality of speech output, practical keyboard usability, or whether focus and announcements make sense to a person using assistive technology.

## Recommended test setup

Run the checks against the same deployed build/revision that contains the accessibility remediation:

- **Keyboard-only:** Chrome or Edge on Windows; do not use the mouse after loading the page. Keep browser zoom at 100% for the baseline, then repeat focus checks at 200%.
- **Screen reader:** NVDA with Firefox or Chrome on Windows. NVDA is free; use its default browse/focus behavior and speech viewer or recorded notes to capture unexpected output.
- **Optional second platform:** VoiceOver with Safari on macOS, if available.

Record exact browser, operating-system, screen-reader and version numbers, application URL, and tested commit before starting. Do not infer a pass from axe output.

## Test procedure

For every check, record **Pass**, **Fail**, **Blocked**, or **Not tested**, plus concise notes. A pass means the task was completed without a pointer and without losing the user's place or context.

### A. Keyboard-only — both application areas

- [ ] Starting at the browser address bar, reach the main content and primary navigation using only Tab / Shift+Tab.
- [ ] Every focused control has a clearly visible focus indicator in the current theme.
- [ ] Focus order follows the visual and task order; there are no unexpected keyboard traps.
- [ ] Links, buttons, inputs, selects, toggles, and custom controls can be operated using their standard keyboard interaction.
- [ ] Navigation communicates the current page and does not require pointer hover to reveal essential labels or actions.
- [ ] Open and close each available dialog/palette using its documented keyboard control; verify initial focus, Tab and Shift+Tab containment, Escape dismissal, and focus return to the opener.
- [ ] Repeat focus visibility checks at 200% browser zoom and in each available theme.

### B. Network Trainer — topology builder

- [ ] Enter Build mode and reach every device, link, drawing, and note using the keyboard.
- [ ] Each topology object announces a useful name and role; selected/pressed state is communicated where applicable.
- [ ] Device selection and activation work with the keyboard, including Enter and Space where the control semantics call for them.
- [ ] The context menu can be opened from the keyboard (Shift+F10 or the Context Menu key) on each supported object type.
- [ ] Context-menu items can be traversed and activated using the keyboard; Escape closes the menu and restores focus to the originating object.
- [ ] Device movement and link creation can be completed without dragging. Record the exact keyboard path used.
- [ ] Editing or deleting links, drawings, and notes is possible without a pointer.
- [ ] After selection, editing, undo/redo, deletion, and topology rerendering, focus remains visible and predictable.
- [ ] Validation/build feedback is announced without unexpectedly moving focus.

### C. Network Trainer — dialogs and workbench

- [ ] Open the settings, statistics, incident queue, classroom, and search palette using keyboard controls.
- [ ] Each dialog has a useful announced title and modal state where appropriate.
- [ ] Initial focus is sensible; Tab and Shift+Tab stay within the modal; Escape closes it where dismissal is supported.
- [ ] Closing a dialog returns focus to the control that opened it.
- [ ] Search input, result list, active result, and result count/state are understandable without visual context.
- [ ] Mission/build status changes are announced once, concisely, and do not interrupt unrelated speech.

### D. Linux Sysadmin workspace

- [ ] Navigate the main application and workspace controls without a pointer.
- [ ] Reach and operate the terminal input, submit a command, and understand command output and status feedback.
- [ ] Focus remains visible in the terminal and other controls that previously suppressed native outlines.
- [ ] Open and dismiss the race/other modal overlay with the keyboard; verify title announcement, focus containment, Escape behavior, and focus restoration.
- [ ] Verify log/output announcements are useful and do not repeatedly read the entire terminal history.

### E. Screen-reader pass

Repeat representative tasks from sections B–D with NVDA running:

- [ ] Navigate landmarks, headings, links, buttons, form controls, and dialogs using screen-reader navigation commands.
- [ ] Confirm every interactive control has a meaningful accessible name, role, and state; no controls are announced only as “button” or “graphic” without context.
- [ ] Confirm topology objects and their selected/pressed state are understandable and distinguishable.
- [ ] Confirm context-menu and dialog entry/exit are announced and focus does not jump to an unrelated location.
- [ ] Confirm status and validation announcements are concise, timely, and not duplicated.
- [ ] Confirm terminal input and output can be reached and understood; verify that live output does not overwhelm speech.
- [ ] Record any instructions, shortcuts, state changes, or errors that are visible but not announced.

## Results record

Complete this table only after executing the checks. Add rows for additional combinations or retests.

| Date | Application revision | OS | Browser | Screen reader | Sections | Result / issue references |
|---|---|---|---|---|---|---|
| Not run | — | — | — | — | — | Awaiting hands-on validation |

### Defect log

For each failure, record:
- ID and severity (Blocker / Major / Minor)
- Exact page, workflow, and steps to reproduce
- Expected behavior and actual behavior
- Keyboard sequence and/or screen-reader speech output
- Browser, OS, assistive technology, theme, and tested commit
- Whether the issue blocks task completion or has a workaround

## Exit criteria

The manual validation item is complete only when:

1. Sections A–D have been exercised keyboard-only on the target build.
2. Section E has been exercised with at least one screen reader.
3. Results, versions, commit, and defects are recorded here.
4. Blocker and Major issues are fixed and retested, or explicitly documented as accepted limitations with an owner and follow-up.
5. The audit document links to this completed record.

Do not describe the application as WCAG-conformant based solely on this worksheet or automated scans. A full conformance claim requires a broader audit against the applicable WCAG success criteria.
