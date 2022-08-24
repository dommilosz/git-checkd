# Git Checkd
Package for checking all repositories in your repository folder.

This package will check if the repository is synced with remote, has clean working tree.

### Usage
###### Cli arguments:
 * `-p <path>` Set path of search. Default `.`
 * `-a` Show all repositories, even if clean and synced
 * `-l` Only list repositories don't fetch nor read status
 * `-r` Recursive (default depth: 4)
 * `--max-depth <depth>` Set recursive depth (default 4)
 * `--no-color` Don't use colors
 * `--no-fetch` Don't fetch, still uses git status.
 * `-c <n>` Set max concurrent tasks at once
 * `-h` or `--help` Shows help menu