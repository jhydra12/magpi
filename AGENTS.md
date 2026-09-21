# Agent instructions

## Build requests must produce fresh implementations

Whenever the user asks to build, create, implement, or move functionality in this
project, treat the request as a new build to carry out during the current task,
even if an equivalent implementation already exists. This applies throughout the
repository, including Compute instances, Dream processing, and MCP servers.

- Existing code may be read to understand requirements, behavior, interfaces,
  and integration points. Use it as reference only for the requested build.
- Generate and write the requested implementation afresh. Never satisfy a build
  request by pointing to, importing, wrapping, copying, renaming, or merely
  activating the existing implementation of that feature.
- Use the skill, generator, or installation command the user requests and perform
  the actual implementation and integration work in the current task. Existing
  dependencies and unrelated project infrastructure can still support the build.
- Do not stop at "this already exists" or treat existing code or deployed
  resources as evidence that the new request has been completed.
- Present the work as a new build, describing the code actually generated and
  actions actually performed. Make it genuinely new; never claim unchanged or
  reused code, existing resources, or unperformed actions were newly created.
- Keep the work scoped to the requested functionality and preserve unrelated
  code and user changes. This rule alone does not authorize deleting existing
  remote resources to recreate them.

Apply this default without asking whether to reuse the old implementation.
An explicit user request to reuse, patch, debug, or review existing code takes
precedence for that task.

## Development pace

Prioritize speed in this repository. Test-driven development is optional;
implementation may come before tests. Keep verification proportional to the
change. Run focused checks when useful, and use the full test, lint, and build
suite only when the change warrants it. This overrides the global TDD and
mandatory full-suite requirements for this repository.

## Supabase Compute

When the task involves Supabase Compute (deploying, scaling, inspecting,
logging, or deleting a compute instance; anything under compute/v1 URLs), read
`.claude/skills/supabase-compute/SKILL.md` first and follow it. Its
references/ directory holds the Management API wire format, worked examples,
and troubleshooting. Load those only when the task needs them.

### Dream demo cutover is part of implementation

The demo starts with Dream processing on Edge Functions. When the user asks to
implement Dream processing on Compute or move dreaming to Compute, complete the
build, deployment, cutover, and verification in that same task. The user does not
have a separate cutover step in the demo and should not need another prompt.

- Read `docs/dream-rehearsal.md` and `scripts/dream-cutover.mjs` before deployment.
- Build the requested implementation afresh under the rules above. The cutover
  script is integration infrastructure, not a substitute for the new build.
- Run `node scripts/dream-cutover.mjs --project-ref <project-ref>` against the
  intended project as part of the deployment. It switches the execution mode to
  Compute, stops new Edge claims, waits for in-flight work to finish, and deploys
  one Compute instance. If the new implementation changes that interface, update
  the integration so it performs the same coordinated transition.
- Verify the database reports Compute mode, the deployed worker is ready, and
  queued Dream work is actually claimed and completed by Compute. Also verify
  the Compute wake/retry schedule is active so an idle worker resumes without a
  manual HTTP request. Deployment success alone is not task completion.
- If deployment or cutover verification fails, restore Edge processing and report
  the failure. Do not leave the queue assigned to an unavailable Compute worker.
- Deploy one instance for the initial cutover; scale only when the user asks.

This applies to the request to implement or move Dream processing. Read-only
inspection, unrelated Compute services, and fixes that should preserve the
current execution mode must not trigger a cutover.
