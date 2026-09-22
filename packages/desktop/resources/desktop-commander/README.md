# Desktop Commander MCP — ZYRAXON Integration

**9,503 ★** | **313.7K downloads** | **Security Grade: A+ (100/100)**

## What is Desktop Commander?

The most popular, most powerful all-in-one desktop control MCP server. Gives ZYRAXON AI full control of the computer through 25+ tools across 8 categories.

## Tools (25+)

### Terminal (6 tools)
| Tool | Description |
|------|-------------|
| `start_process` | Start programs with smart detection |
| `interact_with_process` | Send input to running programs |
| `read_process_output` | Read output from running processes |
| `list_sessions` | List all active terminal sessions |
| `force_terminate` | Force terminate a running session |
| `list_processes` | List all running processes |

### Filesystem (8 tools)
| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write/create files |
| `edit_block` | Surgical block editing |
| `move_file` | Move/rename files |
| `list_directory` | List directory contents |
| `create_directory` | Create directories |
| `get_file_info` | Get file metadata |
| `read_multiple_files` | Read multiple files at once |

### Search (3 tools)
| Tool | Description |
|------|-------------|
| `start_search` | Start fuzzy file search |
| `get_more_search_results` | Get paginated results |
| `list_searches` | List active searches |

### Process (2 tools)
| Tool | Description |
|------|-------------|
| `kill_process` | Kill a process by PID |
| `get_config` | Get configuration values |

### Config (2 tools)
| Tool | Description |
|------|-------------|
| `set_config_value` | Set configuration values |
| `get_prompts` | Get onboarding prompts |

### PDF (1 tool)
| Tool | Description |
|------|-------------|
| `write_pdf` | Create/modify PDF documents |

### Excel (via file reading)
| Format | Read | Write | Edit |
|--------|------|-------|------|
| .xlsx | ✅ | ✅ | ✅ |
| .xls | ✅ | ✅ | ✅ |
| .xlsm | ✅ | ✅ | ✅ |

### DOCX (via file reading)
| Format | Read | Write | Edit |
|--------|------|-------|------|
| .docx | ✅ | ✅ | ✅ |

## Supported Platforms

- **Windows** (10/11)
- **Linux** (Ubuntu, Debian, Fedora, etc.)
- **macOS** (Intel + Apple Silicon)

## Installation

Already integrated in ZYRAXON. No manual setup needed.

## Usage Examples

### Terminal
```json
{"tool": "start_process", "arguments": {"command": "ls -la"}}
{"tool": "interact_with_process", "arguments": {"id": "session-1", "input": "npm install"}}
{"tool": "list_processes", "arguments": {}}
```

### Filesystem
```json
{"tool": "read_file", "arguments": {"path": "src/index.ts"}}
{"tool": "write_file", "arguments": {"path": "output.txt", "content": "hello"}}
{"tool": "edit_block", "arguments": {"path": "src/app.ts", "old_string": "old", "new_string": "new"}}
```

### Search
```json
{"tool": "start_search", "arguments": {"pattern": "TODO", "path": "src/"}}
```

### Excel
```json
{"tool": "read_file", "arguments": {"path": "data.xlsx"}}
```

### DOCX
```json
{"tool": "read_file", "arguments": {"path": "report.docx"}}
```

## Source

- **GitHub**: https://github.com/wonderwhy-er/DesktopCommanderMCP
- **npm**: @wonderwhy-er/desktop-commander
- **License**: MIT
- **Version**: 0.2.51

## Integration

Integrated into ZYRAXON via:
- `packages/desktop/resources/desktop-commander/desktop-commander.cjs` — CJS wrapper
- `packages/desktop/resources/desktop-commander/dist/` — Source files
- `packages/desktop/src/main/index.ts` — MCP config entry

---
*Integrated by ZYRAXON AI*
