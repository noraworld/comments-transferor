'use strict'

import { Octokit } from '@octokit/rest'
import fs from 'fs'
import { execSync } from 'child_process'

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
    else if (process.env.DRY_RUN === 'true') {
      console.error('The action is supposed to be performed until all the comments are transferred, but it is done only once because dry run is enabled.')
      process.exit(0)
    }
  }
}

async function getComments() {
  const octokit = process.env.PERSONAL_ACCESS_TOKEN ?
                  new Octokit({ auth: process.env[process.env.PERSONAL_ACCESS_TOKEN] }) :
                  new Octokit({ auth: process.env.GITHUB_TOKEN })
  const repository = process.env.ISSUE_REPO
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

      if (process.env.DRY_RUN !== 'true') {
        execSync(`gh issue comment --repo "${targetIssueRepo}" "${targetIssueNumber}" --body-file "${tmpFile}"`)
        await deleteComment(comment.id)
      }
      else {
        console.info(commentBody)
      }
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
  const repository = process.env.ISSUE_REPO
  const [ owner, repo ] = repository.split('/')

  await octokit.issues.deleteComment({
    owner,
    repo,
    comment_id: commentID,
  })
}

function buildCommentBody(commentBody) {
  commentBody = process.env.REPLACE_TWITTER_SHORT_URL                    ?                 replaceTwitterShortURL(commentBody) : commentBody
  commentBody = process.env.TRIM_EMPTY_IMAGE_TAG                         ?                      trimEmptyImageTag(commentBody) : commentBody
  commentBody = process.env.LINKIFY_HASHTAGS                             ?                        linkifyHashtags(commentBody) : commentBody
  commentBody = process.env.LINKIFY_MENTIONS                             ?                        linkifyMentions(commentBody) : commentBody
  commentBody = process.env.MOVE_TRAILING_URLS_TO_NEXT_LINES             ?            moveTrailingUrlsToNextLines(commentBody) : commentBody
  commentBody = process.env.REMOVE_SPACES_AFTER_JAPANESE_PUNCTUATION     ?   removeSpacesAfterJapanesePunctuation(commentBody) : commentBody
  commentBody = process.env.TRIM_MISSKEY_PROFILE_ICON_URL                ?              trimMisskeyProfileIconUrl(commentBody) : commentBody
  commentBody = process.env.REPLACE_MISSKEY_IMAGE_URL_WITH_MULTIPLE_ONES ? replaceMisskeyImageUrlWithMultipleOnes(commentBody) : commentBody

  return commentBody
}

function getServiceName(commentBody) {
  // TODO: Mastodon
  const fromTwitterRegex = /From \[Twitter\]\(https:\/\/(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/\d+\)\n?$/
  const fromMisskeyRegex = /From \[Misskey\]\(https:\/\/misskey\.io\/notes\/[a-zA-Z0-9]+\)\n?$/

  if (fromTwitterRegex.test(commentBody)) return 'twitter'
  if (fromMisskeyRegex.test(commentBody)) return 'misskey'
}

function replaceTwitterShortURL(commentBody) {
  return commentBody.replaceAll(/https\:\/\/t\.co\/[a-zA-Z0-9]*/g, match => {
    // HTTP modules like axios are hard to use because await can't be used here.
    return execSync(`curl -Ls -o /dev/null -w "%{url_effective}" "${match}" || true`)
  })
}

function replaceMisskeyImageUrlWithMultipleOnes(commentBody) {
  return commentBody.replaceAll(/\!\[.*?\]\(https:\/\/media\.misskeyusercontent\.jp\/.*?\)/g, () => {
    return buildMisskeyAllImageUrls(commentBody)
  })
}

function buildMisskeyAllImageUrls(commentBody) {
  return getMisskeyAllImageUrls(commentBody).map((e) => `![image](${e})`).join("\n")
}

function getMisskeyAllImageUrls(commentBody) {
  const noteId = commentBody.match(/> From \[Misskey\]\(https:\/\/misskey\.io\/notes\/(.*?)\)/)[1]

  return execSync(`curl -LsX POST -H "Content-Type: application/json" -d '{ "noteId" : "${noteId}" }' https://misskey.io/api/notes/show | jq -r '.files[].url' || true`).toString().split("\n").filter(e => e)
}

function trimMisskeyProfileIconUrl(commentBody) {
  return commentBody.replaceAll(/\!\[.*?\]\(https:\/\/proxy\.misskeyusercontent\.jp\/avatar\.webp.*?\)(\n\n)?/g, '')
}

function trimEmptyImageTag(commentBody) {
  return commentBody.replaceAll(/\!\[\]\(\)(\n\n)?/g, '')
}

function linkifyHashtags(commentBody) {
  switch (getServiceName(commentBody)) {
    case 'twitter':
      return commentBody.replace(/#(\S+)/g, (_, tag) => {
        const encodedTag = encodeURIComponent(tag)
        return `[#${tag}](https://twitter.com/hashtag/${encodedTag})`
      })
    default:
      return commentBody
  }
}

function linkifyMentions(commentBody) {
  switch (getServiceName(commentBody)) {
    case 'twitter':
      return commentBody.replace(/@(\S+)/g, (_, mention) => {
        const encodedMention = encodeURIComponent(mention)
        return `[@${mention}](https://twitter.com/${encodedMention})`
      })
    case 'misskey':
      return commentBody.replace(/(?<!`)(?:(?<=^)|(?<=\s))@([a-zA-Z0-9]+)(?=\s|$)(?!`)/g, (_, mention) => {
        const encodedMention = encodeURIComponent(mention)
        return `[@${mention}](https://misskey.io/@${encodedMention})`
      })
    default:
      return commentBody
  }
}

function moveTrailingUrlsToNextLines(commentBody) {
  const regex = /(.*?)(\s*)(https?:\/\/[^\s)]+)$/gm

  return commentBody.replace(regex, (_match, textBeforeUrl, _space, url) => {
    if (/https?:\/\/(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/\d+\/photo\/\d+/.test(url)) {
      return `${textBeforeUrl.trim()}\n\n[Attachment files from Twitter](${url})`
    }
    else {
      return `${textBeforeUrl.trim()}\n\n${url}`
    }
  })
}

function removeSpacesAfterJapanesePunctuation(commentBody) {
  const regex = /(。)(\s(?!\r|\n))+/g

  return commentBody.replace(regex, (_, japanesePunctuation) => {
    return japanesePunctuation
  })
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
