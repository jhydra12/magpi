# Agent instructions

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
