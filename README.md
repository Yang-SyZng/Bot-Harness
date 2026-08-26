# Bot Harness

![version](https://img.shields.io/badge/version-0.0.1__alpha.5-blue)
![GitHub last commit](https://img.shields.io/github/last-commit/Yang-SyZng/Bot-Harness?logo=github)
![github stars](https://img.shields.io/github/stars/Yang-SyZng/Bot-Harness?style=social)

This is a Bot Agent.

Currently, we have compatibility with:

![KOOK](https://img.shields.io/badge/KOOK-FFFFFF?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbDpzcGFjZT0icHJlc2VydmUiIGlkPSLlm77lsYJfMSIgeD0iMCIgeT0iMCIgdmVyc2lvbj0iMS4xIiB2aWV3Qm94PSIwIDAgNTEyIDUxMiI+PHN0eWxlPi5zdDF7ZmlsbDojZmZmfTwvc3R5bGU+PHBhdGggZD0iTTUxMiAzOTYuMzJDNTEyIDQ2MC4yMSA0NjAuMjEgNTEyIDM5Ni4zMSA1MTJIMTE1LjY5QzUxLjggNTEyIDAgNDYwLjIxIDAgMzk2LjMyVjExNS42OEMwIDUxLjc5IDUxLjggMCAxMTUuNjkgMGgyODAuNjJDNDYwLjIxIDAgNTEyIDUxLjc5IDUxMiAxMTUuNjh6IiBzdHlsZT0iZmlsbDojODdlYjAwIi8+PHBhdGggZD0iTTQ2MS41OCAxNzMuOTZINjUuNzlMMzguMyAzMDQuMDlsMTIuMjIgMjIuNTJoMjczLjgybDE4IDMzLjE5aDE4LjA3bDcuMDItMzMuMTloNzguNzNsMjcuNTQtMTMwLjMyeiIvPjxwYXRoIGQ9Ik0xNjQuMzIgMTg5LjQzaC0zNC4wMWwtMjQuNyAyOC4yNCA1Ljk3LTI4LjI0SDc3LjM3TDU0Ljc5IDI5Ni4zMkg4OWw2LjA1LTI4LjY5IDE1LjU3IDI4LjY5aDMxLjEybDIuNDYtMTEuNjgtMjAuMzYtMzcuNTcgMzcuMzMtNDIuNzF6TTQ0OS4xMyAxODkuNDNoLTM0LjAybC0yNC42OSAyOC4yNCA1Ljk2LTI4LjI0aC0zNC4yTDMzOS42IDI5Ni4zMmgzNC4ybDYuMDctMjguNjkgMTUuNTUgMjguNjloMzEuMTNsMi40Ny0xMS42OC0yMC4zOC0zNy41NyAzNy4zNC00Mi43MXpNMjQ5LjkzIDE4OS40M2gtNzEuM2wtMTEuMTcgMTIuNzctMTcuMTkgODEuMzkgNi45IDEyLjczaDcwLjk4bDExLjQ1LTEzLjFMMjU2Ljc1IDIwMnptLTQzLjIyIDcxLjcyaC0xNC4xNGw3LjczLTM2LjU2aDE0LjE0ek0zNDUuNSAxODkuNDNoLTcxLjNsLTExLjE3IDEyLjc3LTE3LjE5IDgxLjM5IDYuOSAxMi43M2g3MC45OGwxMS40NS0xMy4xTDM1Mi4zMiAyMDJ6bS00My4yMiA3MS43MmgtMTQuMTRsNy43Mi0zNi41NkgzMTB6IiBjbGFzcz0ic3QxIi8+PC9zdmc+)

Other platforms are coming soon!!

## Config

```bash
cp .env.example .env
```

In `.env`, fill in the new `PLATFORM_TOKEN`, `API_KEY`, `BASE_URL`, and `LLM_MODEL_ID`.

## Run

```bash
.venv/bin/python examples/bot_test.py
```

Only messages explicitly marked with `@Bot` are processed. Attachment input in the first version only supports single files within a card; readable file formats are `.txt`, `.md`, `.json`, and `.csv`.

