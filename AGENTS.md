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
