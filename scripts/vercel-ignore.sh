#!/bin/bash
# Vercel's "Ignored Build Step" (vercel.json ignoreCommand). Exit 0 skips the build, exit 1 builds.
# Every build costs Rob money, so:
#   - a preview (any branch but main) builds only when its commit message contains [preview];
#   - production skips commits that only touch scripts, the database, workflows or instructions,
#     since none of those change what readers see.
if [ "$VERCEL_ENV" != "production" ]; then
  case "$VERCEL_GIT_COMMIT_MESSAGE" in *"[preview]"*) exit 1 ;; *) exit 0 ;; esac
fi
git diff --quiet HEAD^ HEAD -- . ':(exclude)scripts' ':(exclude)supabase' ':(exclude).github' \
  ':(exclude).claude' ':(exclude)CLAUDE.md' ':(exclude)CONTENT_GUIDELINES.md' ':(exclude)Open database viewer.cmd'
