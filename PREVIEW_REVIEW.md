# Preview review

Branch: `ui/phase-2-preview`. Production unchanged. Open `public/index.html`, select demo, use an existing username and `Password123`. For persistent local testing run `npm run db:local`, provision local accounts using the existing provisioning script, then `npm run dev`. Demo is temporary; do not enter real team records.

Audit: pre-redesign baseline `4c74eea`; blue/cash checkpoint `1461bed`. Member IDs come from `users.name`, authenticated via hashed-password/session Worker code. Schedule rules remain in `scheduler.js`: fixed worship slots, role eligibility, leave, 60-minute travel buffer, maximum one transfer/day and existing fairness calculation. PK remains Switcher Rp200,000 / other roles Rp150,000, calculated from final approved assignments. No image sample records were imported. Browser screenshots use isolated test fixtures, not production data.

| Access | All | Emen | Evan | Bowo |
|---|---|---|---|---|
| Personal schedule, PK, availability, cash, account | Yes | Yes | Yes | Yes |
| Team schedule and PK totals | No | Yes | Yes | No |
| Generate / replace / swap / rotate | No | Yes | No | No |
| Approve / reject | No | No | Yes | No |
| Team cash administration | No | No | No | Yes |

Backend permissions use authenticated existing IDs, not rendered display names. Existing draft/official storage, revision checks and audit triggers are preserved. Rotations validate the final arrangement and are saved through the same conditional atomic schedule write. Rejection keeps the previous official schedule; approval publishes the complete draft. Draft PK is labeled estimated. Individual schedule rows contain no PK amounts. Personal and team views are separated; team detail supports Grid/List, recap defaults to monthly totals.

Verified locally: generator/PK rules, exact simultaneous Emen/Evan swap, rotation, revision isolation, approval/rejection, cash member privacy, persistence, and role navigation. Browser coverage is Chromium on Linux; Safari is untested. Cloud Worker/D1 is not configured or tested, so this is not a claim of production readiness. Existing migration 0006 is required for cash timestamps. No production records were touched, no workflow edits, no push to main, no production deployment.

Existing request model remains preferences/availability with recorded/submitted status; it does not have a separate exchange-request approval entity. Members can describe a desired exchange in notes; Emen makes the validated draft change and Evan approves it. No fictional request decisions/history have been created. Single-day requests are submitted separately; no multi-date calendar has been introduced.

Screenshots: `/workspace/design/master` (Evan home/recap/approval, Emen home/detail/generate/rotation, member home/schedule/cash, availability/mobile); `/workspace/design/blue` (Bowo cash and reminder).

Executed checks: build, 21 scheduler/API/rotation tests, 9 login browser tests, and 5 browser suites (review, swap, availability, cash, role views). All passed after updating navigation assertions and fixing 320 px summary-card overflow. Rotation browser coverage includes opening the workflow; save/authorization/final-state correctness are covered by integration tests. Test fixture data is distinct from real production records. Cloud activation still requires user review, configured Worker/D1, migration, account provisioning, and a separately approved production rollout.
