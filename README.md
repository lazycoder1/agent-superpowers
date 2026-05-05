# agent-superpowers

A personal collection of skills I've built for AI coding agents (Claude Code, Cursor, etc.). Each skill is a self-contained `SKILL.md` plus the implementation files needed to apply it.

## Layout

```
skills/
  <skill-name>/
    SKILL.md      ← when to use, why, how
    files/        ← drop-in code, configs, snippets
```

## Use as Claude Code skills

Symlink any skill into `~/.agents/skills/` (or `~/.claude/skills/`) so the agent picks it up:

```sh
ln -s ~/workspace/personal/agent-superpowers/skills/mermaid-diagrams ~/.agents/skills/mermaid-diagrams
```

## Skills

- **[mermaid-diagrams](skills/mermaid-diagrams/SKILL.md)** — build-time SSR mermaid for static sites with dual light/dark themes and a click-to-zoom lightbox. Reference implementation in Astro; pattern ports to any SSG.
