# Troubleshooting

Back to the [README](../README.md).

## `Unknown command: /<plugin>:<command>` — the commands never show up

Most often the plugin is installed but not *enabled*, or it is enabled with **project** scope.
Check what Claude Code actually sees:

```
claude plugin list
```

If the plugin is listed as enabled and the commands still do not exist, the likely cause is a
**Windows drive-letter case mismatch**, which hits the VS Code extension specifically:

- The extension launches its bundled binary with a lowercase drive letter as the working
  directory (`c:\path\to\project`).
- A project-scoped install records `projectPath` with an uppercase one (`C:\path\to\project`),
  because that is how the terminal reports it.
- That comparison is case-sensitive, so the install record does not match and the plugin is
  skipped — every command reports `Unknown command` and the slash-command picker says
  *No matching commands*.

The debug log is misleading here: it reports
`Plugin "<name>" not cached at ...\.claude\plugins\cache\<marketplace>\<name>\<version> — run
/plugin to refresh` even though that directory exists and is complete. Refreshing therefore
never helps, and the same plugin works fine from a terminal session, which makes it look like a
problem with the plugin's own content.

**Fix — install user-scoped**, which carries no `projectPath` and so skips the comparison:

```
claude plugin install <name>@hantsch --scope user
```

Then restart the Claude Code session in VS Code; the plugin registry is read at process start.

To confirm the diagnosis yourself, run the extension's own binary headless from a lowercase
working directory and watch the plugin lines:

```
cd /d c:\path\to\project
"%USERPROFILE%\.vscode\extensions\anthropic.claude-code-<version>-win32-x64\resources\native-binary\claude.exe" ^
  --setting-sources=user,project,local --debug --debug-to-stderr -p "say ok"
```

Broken: `Found 1 plugins (0 enabled, 1 disabled)` and `Total plugin commands loaded: 0`.
Working: `Found 2 plugins (1 enabled, ...)` and `Total plugin commands loaded: <n>`.

This is a Claude Code issue, not a plugin-authoring mistake — worth keeping in mind when a
plugin from this marketplace appears to be broken only inside the editor.

