# Issue tracker: GitHub

Issues and specs for this repository live as GitHub issues. Use the `gh` CLI for operations and infer the repository from the current Git remote.

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read with discussion: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

Use a heredoc when a title or body requires multiline shell input. GitHub shares one number space across issues and pull requests, so resolve an ambiguous reference with `gh pr view <number>` and fall back to `gh issue view <number>`.

## Pull requests as a triage surface

**PRs as a request surface: no.** External pull requests do not enter the issue-triage workflow unless this flag is deliberately changed later.

## Skill operations

- When a skill says to publish work to the issue tracker, create a GitHub issue.
- When a skill asks for the relevant ticket, read the issue and its comments.
- For wayfinding, prefer GitHub sub-issues and native issue dependencies. If unavailable, use a task list in the parent issue and a `Blocked by: #<number>` line in child issues.
- Do not create, edit, label, comment on, or close remote issues unless the user has authorized that external write.
