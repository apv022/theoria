# Theoria Continuous Development Checklist

**Last updated:** 2026-08-08  
**Purpose:** Persistent product-hardening backlog. Items are not automatically active roadmap commitments; schedule them through the manifest and weekly plan.

## Current decision

- Keep the existing Theoria UI and improve it incrementally.
- Do **not** perform another wholesale site redesign.
- `/home/apv/preview` remains reference material only; pull individual ideas from it when they are demonstrably better.
- Prefer one UX change at a time: reproduce the friction, make the smallest change, compare before/after, test desktop/mobile, keep or revert.

## Recently completed

- [x] Owners can view their own private repositories/versions while non-owners remain blocked.
- [x] Profile activity no longer grows the page without bound; recent activity is intentionally bounded.
- [x] Reader rich-content fidelity was fixed for question options, feedback, matching, ordering, and rubrics.
- [x] Compiler normal preview now uses the shared real Reader presentation rather than compiled HTML.
  - Preview is bounded, has no iframe/app shell/recursive navigation, and uses isolated ephemeral state.
- [x] Normal Reader offline multi-lesson navigation regression was fixed and covered by browser tests.
- [x] Isolated Phase 3 UX prototype was built and reviewed as an experiment.
  - Decision: do not migrate it wholesale; use it only as a source of individual refinements.

## Product defects and usability fixes

- [ ] `BUG` Add safe repository deletion.
  - Require explicit confirmation, owner permission checks, dependency handling, and a defined policy for immutable versions, forks, stars, lineage, and stored source archives.
  - Do not implement until deletion semantics are written down and tested.
- [ ] `POLISH` Improve text spacing/padding where the real interface still feels cramped.
  - Make targeted changes only; do not trigger another global redesign.
- [ ] `POLISH` Improve course thumbnails/covers and fallbacks.
  - Keep a consistent 16:9 presentation where appropriate.
  - Add a better creator-facing cover authoring/upload flow only when needed.
- [ ] `POLISH` Review empty/loading/error states after the pilot deployment and fix the ones users actually encounter.

## Navigation and discovery

- [ ] `BACKLOG` Make course search more prominent/persistent where it improves navigation.
- [ ] `BACKLOG` Add user/profile search and basic creator discovery.
  - Define ranking, privacy behaviour, pagination, and empty states before implementation.
- [ ] `BACKLOG` Refine narrow-screen navigation/hamburger behaviour.
  - First verify what the current hardening pass already solved before replacing anything.
- [ ] `BACKLOG` Refine Home / Explore / Learn / repository navigation one issue at a time from real usage.

## Creation surface

- [ ] `BACKLOG` Continue consolidating Compiler capabilities into one coherent Theoria Creation workflow.
  - Desired visible flow: Create/Import → Edit → Validate → Preview in real Reader → Build/Export → Publish.
  - Preserve the standalone compiled artifact as an export/portability path, not the normal preview experience.
- [ ] `EXPERIMENT` Test a restrained Microsoft Word-style ribbon/command hierarchy for Studio.
  - Adopt only if it improves authoring speed and discoverability without clutter.
- [ ] `EXPERIMENT` Refine Studio as a distinct professional application shell while keeping it part of Theoria Creation.
  - Do not create a new product surface.
- [ ] `POLISH` Improve Studio layout, toolbar behaviour, validation presentation, properties, and mobile/tablet usability incrementally.

## Reader / learning surface

- [ ] `POLISH` Refine Reader shell/navigation only where pilot use exposes friction.
- [ ] `POLISH` Revisit mobile outline behaviour, dense controls, question ergonomics, and lesson progression from real device testing.
- [ ] `BACKLOG` Add onboarding/help only if pilot users demonstrate that the core flows are not self-explanatory.

## Release / production hygiene

- [ ] `SECURITY` Add a tiny forward migration revoking unintended `anon` execute grants from the four authenticated-only repository/publishing RPCs identified in the production preflight.
  - Do not rewrite or rerun `20260802000000_repository_network.sql`.
  - Verify authenticated access remains intact and intentionally public RPCs remain public.
- [ ] `OPS` Run the full local Supabase migration chain + pgTAP once local Docker/Podman database access is restored.
- [ ] `OPS` Align development/test runtime with the repository Node >=24 requirement; current VM Node 22 produces engine warnings.
- [ ] `OPS` Verify production auth configuration before wider pilots: canonical Site URL/callbacks and custom SMTP/email deliverability.
- [ ] `OPS` After each production deployment, smoke-test auth, Explore/repositories, private owner access, stars/forks/network, publishing, Reader online/offline, Studio, and Compiler preview.

## Later / pilot-driven

- [ ] Broader accessibility refinement beyond the existing foundations, driven by concrete audit/pilot findings.
- [ ] Onboarding/tours only if they solve observed confusion.
- [ ] Larger IA or naming changes only if repeated user evidence justifies them.
- [ ] Institutional UX remains outside current pilot-hardening scope.

## Suggested sequence

1. Deploy and smoke-test the current pilot-hardening build.
2. Fix the small RPC ACL drift with a forward migration and verify it.
3. Define and implement safe repository deletion.
4. Incrementally refine spacing, covers, search, empty states, and mobile navigation.
5. Add creator/profile search when discovery needs it.
6. Continue Studio/Compiler workflow consolidation without a wholesale redesign.
7. Let pilot feedback determine onboarding, accessibility, and larger UX changes.
