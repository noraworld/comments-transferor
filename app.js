'use strict'

const { Octokit } = require('@octokit/rest')
const fs = require('fs')
const { execSync } = require('child_process')
const tmpFile = 'tmp.md'
const spiltCommentsCheckAttemptsMaximum = 5

async function run() {
  let comments = null
  let attempt = 0

  while (true) {
    comments = await getComments()
    if (comments.length === 0) break
    // await is important because it's performed before the number of comments is checked above.
    await transferComments(comments)

    attempt++
    if (attempt > spiltCommentsCheckAttemptsMaximum) {
      console.error(`The action was run ${attempt} times, but the comments still exist.`)
      process.exit(1)
    }
  }
}

async function getComments() {
  const octokit = process.env.PERSONAL_ACCESS_TOKEN ?
                  new Octokit({ auth: process.env[process.env.PERSONAL_ACCESS_TOKEN] }) :
                  new Octokit({ auth: process.env.GITHUB_TOKEN })
  const repository = process.env.GITHUB_REPOSITORY
  const [ owner, repo ] = repository.split('/')
  const issueNumber = process.env.ISSUE_NUMBER

  let comments = []
  let page = 1
  const perPage = 100
  let response = null

  do {
    response = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      page,
      per_page: perPage
    })

    comments = comments.concat(response.data)
    page++
  } while (response.data.length === perPage)

  return comments
}

async function transferComments(comments) {
  let targetIssueRepo = process.env.TARGET_ISSUE_REPO

  let targetIssueNumber = ''
  if (process.env.TARGET_ISSUE_NUMBER && process.env.TARGET_ISSUE_NUMBER !== 'latest') {
    targetIssueNumber = process.env.TARGET_ISSUE_NUMBER
  }
  else {
    targetIssueNumber = execSync(`gh issue list --repo "${targetIssueRepo}" --limit 1 | awk '{ print $1 }'`).toString().trim()
  }

  let commentBody = null
  for (let comment of comments) {
    try {
      commentBody = comment.body
      commentBody = buildCommentBody(commentBody)

      fs.writeFileSync(tmpFile, commentBody)
      execSync(`gh issue comment --repo "${targetIssueRepo}" "${targetIssueNumber}" --body-file "${tmpFile}"`)
      await deleteComment(comment.id)
    }
    catch (error) {
      console.error(error)
      process.exit(1)
    }
  }

  fs.unlinkSync(tmpFile)
}

async function deleteComment(commentID) {
  const octokit = process.env.PERSONAL_ACCESS_TOKEN ?
                  new Octokit({ auth: process.env[process.env.PERSONAL_ACCESS_TOKEN] }) :
                  new Octokit({ auth: process.env.GITHUB_TOKEN })
  const repository = process.env.GITHUB_REPOSITORY
  const [ owner, repo ] = repository.split('/')

  await octokit.issues.deleteComment({
    owner,
    repo,
    comment_id: commentID,
  })
}

function buildCommentBody(commentBody) {
  commentBody = process.env.REPLACE_TWITTER_SHORT_URL ? replaceTwitterShortURL(commentBody) : commentBody
  commentBody = process.env.TRIM_EMPTY_IMAGE_TAG      ?      trimEmptyImageTag(commentBody) : commentBody

  return commentBody
}

function replaceTwitterShortURL(commentBody) {
  return commentBody.replaceAll(/https\:\/\/t\.co\/[a-zA-Z0-9]*/g, match => {
    // HTTP modules like axios are hard to use because await can't be used here.
    return execSync(`curl -Ls -o /dev/null -w "%{url_effective}" "${match}"`)
  })
}

function trimEmptyImageTag(commentBody) {
  return commentBody.replaceAll(/\!\[\]\(\)(\n\n)?/g, '')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
