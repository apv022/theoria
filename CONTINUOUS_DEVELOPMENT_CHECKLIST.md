# Theoria Continuous Development Checklist

**Last updated:** 2026-08-05  
**Purpose:** Persistent product-hardening backlog. Items are not automatically active roadmap commitments; schedule them through the manifest and weekly plan.

## Product defects and usability fixes

- [ ] `BUG` Improve text spacing and padding where the interface feels cramped.
  - Done when primary pages have consistent readable spacing on desktop and mobile without reducing information clarity.
- [ ] `BUG` Redesign course thumbnails/covers.
  - Done when generated and fallback thumbnails are visually consistent, legible, and credible across repository and library views.
- [ ] `BUG` Allow owners to view their own private courses.
  - Done when an authenticated owner can open every private repository/version they own while non-owners remain blocked.
- [ ] `BUG` Constrain profile activity/update feeds to a scrollable region.
  - Done when long histories no longer continuously push the rest of the page downward.
- [ ] `BUG` Add repository deletion.
  - Require explicit confirmation, permission checks, dependency handling, and a defined policy for versions, forks, stars, and stored source archives.

## Navigation and discovery

- [ ] `BACKLOG` Give course search a persistent header/search bar.
- [ ] `BACKLOG` Add user/profile search and basic creator discovery.
  - Scope filters, ranking, privacy behaviour, and empty states before implementation.
- [ ] `BACKLOG` Add a compact GitHub-style hamburger/navigation menu for narrower layouts.

## Creation surface

- [ ] `BACKLOG` Unify the compiler and Studio into one coherent Theoria Creation workflow.
  - Import, edit, validate, compile, preview, and publish should feel like one product rather than separate tools.
- [ ] `EXPERIMENT` Prototype a Microsoft Word-style ribbon for Studio commands.
  - Test whether grouped contextual controls improve authoring speed without overwhelming new users.
- [ ] `EXPERIMENT` Evaluate whether Studio should use a distinct application shell while remaining part of Theoria Creation.
  - Do not split it into a separate product surface; test visual and workflow separation only.

## Site architecture and visual redesign

- [ ] `EXPERIMENT` Build and test a new site layout in an isolated dummy environment before touching production.
  - Compare navigation clarity, responsive behaviour, repository discovery, learning flow, and access to Creation.
  - Promote only after the prototype is demonstrably better than the current layout.

## Suggested sequence

1. Private-course access and profile overflow bugs.
2. Repository deletion with safe data rules.
3. Spacing, thumbnails, and search-header polish.
4. User search and responsive navigation.
5. Isolated layout and Studio-shell experiments.
6. Compiler/Studio workflow unification after the prototype direction is validated.
