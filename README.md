# Cat Stopper 🐱

A Pomodoro timer for VS Code. You work, then a cat takes over the screen and
counts down your break. No cat, no code.

- Status bar shows the current phase and the time left.
- Warns you shortly before the break starts.
- When the break starts, a cat video locks the editor until the countdown ends.
- Long break automatically after a configurable number of work sessions.

![Cat Stopper break screen](media/screenshot.png)

## Install

1. Download the latest `cat-stopper-X.Y.Z.vsix` from
   [Releases](https://github.com/HannaKastrytsa/cat-stopper/releases/latest).
2. Install it:

   ```sh
   code --install-extension cat-stopper-v0.4.1.vsix
   ```

   Or in VS Code: **Extensions** panel → `...` menu → **Install from VSIX...**

3. Reload VS Code. The timer starts on its own.

> Using Cursor, Windsurf or VSCodium? Same `.vsix`, use their
> "Install from VSIX..." menu (or `cursor --install-extension ...`).

## Commands

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and type "Cat Stopper":

| Command | What it does |
| --- | --- |
| Pause / Resume Timer | Freezes or continues the countdown |
| Start Work Session | Begins a fresh work session |
| Start Break Now | Jumps straight to the break |
| Skip Break | Skips the break and goes back to work |
| Restart Timer | Resets everything |
| Open Timer Settings | Opens the settings below |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `catStopper.workMinutes` | 25 | Work session length (decimals allowed, `0.25` = 15 s) |
| `catStopper.breakMinutes` | 5 | Short break length |
| `catStopper.longBreakMinutes` | 15 | Long break length |
| `catStopper.sessionsBeforeLongBreak` | 4 | Work sessions before a long break (`1` = always long) |
| `catStopper.warnSecondsBefore` | 60 | Warn this many seconds before the break |

## Build from source

```sh
git clone https://github.com/HannaKastrytsa/cat-stopper.git
cd cat-stopper
npm install
npm run package
code --install-extension cat-stopper-0.4.1.vsix
```

## Releasing a new version

Bump `version` in `package.json`, then:

```sh
git tag v0.4.1
git push origin v0.4.1
```

GitHub Actions builds the `.vsix` and attaches it to a new release.

## License

MIT
