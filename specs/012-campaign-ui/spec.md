# Feature Specification: Campaign User Interface

**Feature Branch**: `012-campaign-ui`
**Created**: 2026-02-15
**Status**: Draft
**Input**: User description: "Campaign user interface: builder wizard, management dashboard, preview player, and run monitoring"

## Clarifications

### Session 2026-02-15

- Q: Should campaign play analytics (event recording, play/completion/win counts, charts) be included in this feature? → A: Exclude analytics entirely; defer all event recording and analytics display to a separate future feature.
- Q: Should the standalone and embed player pages require authentication? → A: Fully public with no authentication; rate limit by IP to prevent abuse.
- Q: What happens to associated runs, steps, and bundles when a campaign is permanently deleted? → A: Partial cascade — delete campaign and generated bundles immediately; retain run history for 30 days before automatic cleanup.
- Q: How should concurrent editing of the same draft campaign be handled? → A: Last save wins with warning — if a newer version is detected on save, show a warning toast and offer to reload.
- Q: How should run completion/failure notifications be delivered? → A: In-app toast only — notification appears as a toast banner when the user is on any page within the application.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a Campaign Through a Guided Wizard (Priority: P1)

A marketer opens the campaign builder and follows a step-by-step wizard to create a new game campaign. They select a game template (spin wheel, scratch card, quiz, or memory match), customize the visual theme with brand colors and fonts, configure game-specific settings (prizes, questions, grid layout), select or generate media assets, and review everything before triggering generation. The wizard validates each step before allowing progression.

**Why this priority**: This is the core creation flow. Without the ability to build campaigns, no other UI features have purpose. It enables the primary value proposition: creating interactive game campaigns without technical expertise.

**Independent Test**: Can be fully tested by walking through the wizard end-to-end, selecting a template, configuring theme and game settings, and triggering generation. Delivers a complete campaign creation experience.

**Acceptance Scenarios**:

1. **Given** a marketer is on the campaign builder page, **When** they select the "Spin Wheel" template, **Then** the wizard advances to theme customization with template-specific options displayed
2. **Given** a marketer has completed theme customization, **When** they modify the primary brand color, **Then** the live preview updates immediately to reflect the change
3. **Given** a marketer is on the game configuration step with a quiz template, **When** they add three questions with correct answers marked, **Then** validation passes and they can proceed to the next step
4. **Given** a marketer has completed all wizard steps, **When** they click "Generate", **Then** the system queues a workflow run and displays a confirmation with a link to monitor progress
5. **Given** a marketer is mid-way through the wizard, **When** they close the browser and return later, **Then** their draft is preserved and they can resume from where they left off

---

### User Story 2 - Manage Existing Campaigns (Priority: P1)

A marketer navigates to the campaign list to view all their campaigns organized by status. They can filter by status (draft, generating, live, failed, archived), search by name, sort by date or activity, and perform actions on individual campaigns: edit drafts, duplicate campaigns, preview live ones, archive completed campaigns, and delete unwanted drafts.

**Why this priority**: Campaign management is the home base where marketers spend most of their time. Without it, users cannot access, organize, or act on campaigns they have created. It is essential alongside the builder.

**Independent Test**: Can be fully tested by loading the campaign list, applying filters, performing search, and executing each action (edit, duplicate, preview, archive, delete) on campaigns in appropriate states.

**Acceptance Scenarios**:

1. **Given** a marketer has 15 campaigns in various statuses, **When** they filter by "live" status, **Then** only live campaigns are displayed with correct count
2. **Given** a marketer views the campaign list, **When** they click "Edit" on a draft campaign, **Then** the campaign builder opens pre-populated with all saved configuration
3. **Given** a marketer selects a live campaign, **When** they click "Duplicate", **Then** a new draft campaign is created with "(Copy)" appended to the name and all configuration preserved
4. **Given** a marketer wants to remove a draft, **When** they click "Delete", **Then** a confirmation dialog appears and upon confirmation the campaign is permanently removed
5. **Given** a marketer has many campaigns, **When** they type a search term, **Then** the list filters in real-time to show only matching campaign names

---

### User Story 3 - Monitor Campaign Generation Progress (Priority: P2)

A marketer triggers campaign generation and wants to track its progress. They navigate to the run monitoring view to see which workflow step is currently executing, how long each step has taken, and whether any step has failed. If a run fails, they can view error details and retry the generation.

**Why this priority**: After triggering generation, users need visibility into what is happening. Without monitoring, a failed generation would leave users in the dark with no recourse. This is critical for trust and usability but depends on the builder existing first.

**Independent Test**: Can be fully tested by triggering a campaign generation and observing the run list, run detail with step progress, and exercising retry/cancel controls.

**Acceptance Scenarios**:

1. **Given** a campaign generation is in progress, **When** the marketer opens the run detail view, **Then** they see a visual timeline of steps with the currently executing step highlighted
2. **Given** a run has completed successfully, **When** the marketer views the run detail, **Then** all steps show green checkmarks with duration displayed for each
3. **Given** a run has failed at a specific step, **When** the marketer views the run detail, **Then** the failed step is highlighted in red with a descriptive error message
4. **Given** a run has failed, **When** the marketer clicks "Retry", **Then** a new run is queued and the marketer is redirected to the new run's monitoring view
5. **Given** a run is queued but not yet started, **When** the marketer clicks "Cancel", **Then** a confirmation dialog appears and upon confirmation the run is cancelled

---

### User Story 4 - Preview and Share a Generated Campaign (Priority: P2)

A marketer has a successfully generated campaign and wants to preview it, test it on mobile devices, and share a preview link with stakeholders for approval. They open the campaign preview player which shows the game in a device frame, provides a QR code for mobile testing, and offers a shareable link.

**Why this priority**: Preview and sharing are essential for the approval workflow before launching campaigns. This allows marketers to validate quality and get stakeholder buy-in, but it requires campaigns to be built and generated first.

**Independent Test**: Can be fully tested by opening the preview player for a generated campaign, interacting with the game, scanning the QR code on a mobile device, and sharing the preview link with another user.

**Acceptance Scenarios**:

1. **Given** a campaign has been successfully generated, **When** the marketer opens the preview, **Then** the game loads and is fully playable within the preview interface
2. **Given** the preview is open, **When** the marketer selects a mobile device frame (e.g., iPhone), **Then** the game renders within that device frame at the correct dimensions
3. **Given** the preview is open, **When** the marketer clicks "Generate QR Code", **Then** a scannable QR code is displayed that links to the campaign's standalone player URL
4. **Given** the preview is open, **When** the marketer clicks "Copy Link", **Then** the shareable preview URL is copied to the clipboard with a confirmation notification

---

### User Story 5 - Embed a Campaign on an External Website (Priority: P3)

A marketer wants to embed their generated campaign game on their own website so customers can play without leaving the site. They obtain an embed code from the campaign management view and place it on their website. The embedded game communicates events (game started, completed, win/lose) back to the host page.

**Why this priority**: Embedding extends the reach of campaigns beyond the platform. While valuable for distribution, it is an advanced feature that requires all creation, management, and preview flows to be working first.

**Independent Test**: Can be fully tested by copying the embed code, placing it in an external HTML page, loading the page, playing the game, and verifying that game events are communicated to the host page.

**Acceptance Scenarios**:

1. **Given** a live campaign exists, **When** the marketer copies the embed code, **Then** the code contains an iframe tag with the correct embed URL
2. **Given** an embedded game is loaded on a third-party site, **When** a user plays and completes the game, **Then** the host page receives game event messages (start, complete, win/lose) via the browser messaging interface
3. **Given** an embedded game is on a responsive page, **When** the parent container resizes, **Then** the game adapts to fit the available space

---

### User Story 6 - Bulk Campaign Operations (Priority: P3)

A marketer with many campaigns wants to perform bulk actions to efficiently manage their workspace. They select multiple campaigns from the list and archive or delete them in a single operation.

**Why this priority**: Bulk operations improve efficiency for power users with many campaigns but are not needed for initial adoption. Individual actions cover the same ground at lower volume.

**Independent Test**: Can be fully tested by selecting multiple campaigns in the list, triggering a bulk archive or delete action, and verifying all selected campaigns are updated correctly.

**Acceptance Scenarios**:

1. **Given** a marketer selects 5 draft campaigns, **When** they click "Bulk Delete", **Then** a confirmation dialog shows the count and upon confirmation all 5 are deleted
2. **Given** a marketer selects 3 live campaigns, **When** they click "Bulk Archive", **Then** all 3 campaigns transition to archived status

---

### Edge Cases

- What happens when a marketer tries to navigate away from the wizard with unsaved changes? The system displays an "unsaved changes" warning dialog.
- What happens when the auto-save fails (e.g., network disconnection)? The system shows a non-blocking warning indicator and retries on reconnection. Local state is preserved.
- What happens when a marketer tries to edit a campaign that is currently generating? The edit action is disabled with a tooltip explaining the campaign is being generated.
- What happens when a marketer tries to delete a live campaign? The delete option is unavailable; only archive is offered. Archived campaigns can be hard-deleted.
- What happens when a campaign's game bundle fails to load in the preview player? An error screen is displayed with a "Retry" button and a message suggesting the user regenerate the campaign.
- What happens when a run is retried but the original run is still displayed? The run list shows both the original (failed) and new (queued/running) runs, linked as parent-child.
- What happens when the campaign list is empty? An empty state is displayed with a prominent "Create Your First Campaign" call-to-action.
- What happens when a marketer accesses a campaign belonging to a different tenant? The system returns a "not found" response without leaking information about other tenants.
- What happens when two users (or two tabs) edit the same draft campaign simultaneously? On save, if the system detects the campaign was modified since the user last loaded it, a warning toast is shown indicating the campaign was edited elsewhere, with an option to reload the latest version. Last save wins.
- What happens to runs and bundles when a campaign is permanently deleted? Generated bundles are deleted immediately to reclaim storage. Run history (runs and steps) is retained for 30 days for debugging purposes, then automatically cleaned up.

## Requirements *(mandatory)*

### Functional Requirements

**Campaign Builder Wizard**

- **FR-001**: System MUST provide a multi-step wizard for campaign creation with the following sequential steps: template selection, theme customization, game configuration, asset selection, and review/generate
- **FR-002**: System MUST display available game templates as visual cards showing a preview image, title, description, and supported capabilities
- **FR-003**: System MUST provide theme customization including primary/secondary/accent color pickers, font family selection from presets, and background options (solid color, gradient, or uploaded image)
- **FR-004**: System MUST show a live preview that reflects theme changes in real time as the user modifies colors, fonts, or backgrounds
- **FR-005**: System MUST render a dynamic game configuration form based on the selected template's configuration schema (e.g., segment editor for spin wheel, question editor for quiz, grid size selector for memory match, reveal content for scratch card)
- **FR-006**: System MUST validate game configuration against the template's schema before allowing the user to proceed to the next step
- **FR-007**: System MUST allow users to select or generate media assets (images, audio, video) for each asset slot required by the template
- **FR-008**: System MUST display a full campaign summary on the review step with an interactive game preview
- **FR-009**: System MUST allow forward, backward, and direct step navigation within the wizard, provided all prior step validations pass for forward navigation
- **FR-010**: System MUST auto-save the campaign draft periodically (every 30 seconds) while the wizard is open
- **FR-010a**: System MUST detect when a draft has been modified by another session since it was last loaded, and display a warning with an option to reload the latest version before overwriting
- **FR-011**: System MUST preserve wizard state across browser sessions so users can resume where they left off
- **FR-012**: System MUST trigger a workflow run when the user clicks "Generate" on the review step and display a confirmation with the run identifier

**Campaign Management**

- **FR-013**: System MUST display all campaigns belonging to the current tenant in a list view with campaign name, template type, status badge, creation date, and thumbnail
- **FR-014**: System MUST support both card (grid) and table layout options for the campaign list, with user preference persisted
- **FR-015**: System MUST provide filtering by campaign status (draft, generating, live, failed, archived), template type, and date range
- **FR-016**: System MUST provide sorting by campaign name, creation date, and last updated date
- **FR-017**: System MUST provide text search that filters campaigns by name
- **FR-018**: System MUST paginate the campaign list at 20 items per page
- **FR-019**: System MUST support campaign actions appropriate to each status: edit (draft), duplicate (any), preview (live), archive (live), delete (draft), regenerate (live/failed), restore (archived), cancel (generating)
- **FR-020**: System MUST require confirmation for destructive actions (delete, bulk delete, cancel generation)
- **FR-021**: System MUST support bulk selection with bulk archive and bulk delete operations
- **FR-022**: System MUST delete generated game bundles immediately when a campaign is permanently deleted, and retain associated run history for 30 days before automatic cleanup

**Campaign Preview Player**

- **FR-023**: System MUST provide a standalone player page where end users can play a generated campaign game at full screen
- **FR-024**: System MUST provide an embed-ready player with no navigation chrome that fits within a parent container
- **FR-025**: System MUST provide a preview mode with debug controls including device frame selector, game reset, QR code generator, and shareable link
- **FR-026**: System MUST display a loading indicator with asset progress while the game bundle loads
- **FR-027**: System MUST display user-friendly error screens when a campaign fails to load, with retry options
- **FR-028**: System MUST communicate game events (ready, started, completed with result) to the host page when embedded via the browser messaging interface
- **FR-029**: System MUST support responsive layout across desktop, tablet, and mobile viewports
- **FR-030**: System MUST serve the standalone and embed player pages without requiring authentication, accessible to any user with the URL
- **FR-031**: System MUST rate-limit requests to public player pages by IP address to prevent abuse

**Run Monitoring**

- **FR-032**: System MUST display a paginated list of workflow runs for the current tenant with status, workflow name, creation date, and duration
- **FR-033**: System MUST support filtering runs by status (queued, running, completed, failed) and date range, plus search by run identifier or campaign name
- **FR-034**: System MUST display a run detail view showing all workflow steps in a visual timeline with per-step status, duration, and cache-hit indicators
- **FR-035**: System MUST display descriptive error information for failed runs and failed steps
- **FR-036**: System MUST auto-refresh run status at regular intervals (every 5 seconds) while a run is in a queued or running state
- **FR-037**: System MUST provide a retry action for failed runs that queues a new run
- **FR-038**: System MUST provide a cancel action for queued or running runs with a confirmation prompt
- **FR-039**: System MUST display an in-app toast notification on any page within the application when a monitored run completes or fails

### Key Entities

- **Campaign**: Represents a game campaign created by a marketer. Has a name, belongs to a tenant, references a game template, holds configuration (theme, game settings, assets), tracks a status lifecycle (draft, generating, live, failed, archived), and links to its most recent generation run and resulting game bundle
- **Run**: Represents an execution of the campaign generation workflow. Belongs to a campaign and tenant, tracks overall status and timing, and contains ordered steps
- **Run Step**: Represents a single step within a generation run. Tracks the skill being executed, its status, duration, whether the result was cached, and links to input/output artifacts
- **Game Template**: Defines a type of interactive game (spin wheel, scratch card, quiz, memory match). Provides a configuration schema, preview assets, and capability metadata

## Out of Scope

- **Campaign analytics**: Play event recording, play/completion/win counts, conversion tracking, sparkline charts, and any dedicated analytics views are deferred to a separate future feature.

## Assumptions

- Authentication and tenant context are already handled by the existing Clerk integration and tenant context middleware. The UI assumes a logged-in user with an active organization.
- Game templates (spin wheel, scratch card, quiz, memory match) and their configuration schemas are already defined in the backend template system.
- The run engine and workflow orchestration backend are already functional and expose the necessary endpoints for triggering, monitoring, and retrying runs.
- Asset storage and media generation capabilities are already available from prior phases.
- The campaign list defaults to 20 items per page, which is a reasonable default for dashboard-style views.
- Auto-save interval of 30 seconds balances data safety with unnecessary network traffic.
- Run status polling at 5-second intervals provides near-real-time feedback without excessive load.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A marketer can create a complete campaign from template selection through generation trigger in under 5 minutes for a simple configuration
- **SC-002**: 90% of first-time users successfully complete the campaign builder wizard without abandoning or requiring external help
- **SC-003**: Campaign list page loads and displays results within 2 seconds for a tenant with up to 100 campaigns
- **SC-004**: Theme customization changes are reflected in the live preview within 500 milliseconds of user input
- **SC-005**: Generated campaigns load and become playable in the preview player within 3 seconds on a standard broadband connection
- **SC-006**: Run monitoring updates are visible to the user within 10 seconds of a status change occurring in the backend
- **SC-007**: All campaign management actions (edit, duplicate, archive, delete) complete and reflect in the UI within 2 seconds
- **SC-008**: Campaign builder draft state survives a full browser restart with no data loss
- **SC-009**: The embedded campaign player functions correctly when loaded inside a third-party website iframe
- **SC-010**: All interface views (builder, list, player, monitoring) are usable on mobile viewports (360px width and above)
