# AI Agent Instructions

> These instructions are for AI agents (like Roo/Cline) working on this project.

## Command Execution

- Do not prefix commands with `cd /home/gms/gms/projects/hot/node-sqlite3 &&` when the command should run in the current workspace directory
- Use `yarn test`, `yarn lint` instead of npm run scripts (e.g., avoid `npm run test`, use `yarn test` instead)

## Notes

These instructions apply to all future sessions working in this project.

## Memory Bank

The most important part of the Memory Bank is keeping it updated. Currently, the community standard is the UMB (Update Memory Bank) routine:

- Before you start a task: Ask your AI agent, "Read the memory bank and tell me the current status."

- While working, the AI agent will occasionally suggest updates to activeContext.md.

- Before you end a session: Simply type "UMB" or "Update memory bank". The AI agent will then:

  - Move completed items from activeContext.md to progress.md.

  - Log any new technical decisions in decisionLog.md.

  - Clear the activeContext.md for the next session.
