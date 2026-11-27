# Scintle

**Your AI chats, turned into a history of your ideas, found on their own.** You never type an idea in.
Scintle finds every idea in your chats on its own and keeps its story: how it started, how it changed, and
where it ended up.

It is a Claude Code plugin. This package only installs it, through Claude Code's own installer.

## Install

```
npx scintle install
```

It checks for Node 22.13+ and Claude Code 2.1.292+, shows the command it will run, and asks before
running it:

```
claude plugin install scintle --marketplace scintle/scintle
```

`--scope user|project|local` picks where Claude Code installs it (default: user). With no terminal
attached, add `--yes`, or run that command yourself.

Or, in Claude Code:

```
/plugin marketplace add scintle/scintle
/plugin install scintle@scintle
```

This package has no install script and writes nothing itself.

Docs: https://scintle.github.io/scintle/
