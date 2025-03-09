# Comments Transferor
Comments Transferor moves the comments posted on a specific issue to another one. It only transfers the comments, not the issue itself. It is handy when you want to make a copy of the conversation on a fixed issue to a dynamic one.

## Workflow example
Let's say you put the following YAML file on [`noraworld/social-media-recorder`](https://github.com/noraworld/social-media-recorder/blob/main/.github/workflows/comments-transferor.yml). It moves the comments on [issue #1 of `noraworld/social-media-recorder`](https://github.com/noraworld/social-media-recorder/issues/1) to the latest issue of `noraworld/foo` every time they are posted.

```yaml
name: Comments Transferor

on:
  issue_comment:
    types: [created]

jobs:
  build:
    if: ${{ github.event.issue.number == 1 }}
    runs-on: ubuntu-latest
    concurrency:
      group: comments-transferor
      cancel-in-progress: true
    steps:
      - name: Transfer comments
        uses: noraworld/comments-transferor@main
        with:
          target_issue_repo: noraworld/foo
          target_issue_number: latest
          personal_access_token: GH_TOKEN
          replace_twitter_short_url: true
          trim_empty_image_tag: true
          linkify_hashtags: true
          linkify_mentions: true
          move_trailing_urls_to_next_lines: true
          remove_spaces_after_japanese_punctuation: true
          trim_misskey_profile_icon_url: true
          replace_misskey_image_url_with_multiple_ones: true
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

Some online services have a limit specifying the issue where you want to make it post the comments. For instance, IFTTT doesn't provide the option to post the comment to the latest issue. It helps you to do things like that.

### Options
| Key                                            | Description                                                                        | Example                      | Type    | Required |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------- | ------- | -------- |
| `issue_repo`                                   | Select a repository with a username whose issue you want to transfer from          | `username/reponame`          | String  | `false`  |
| `issue_number`                                 | Select an issue number of a repository whose issue you want to transfer from       | `123`                        | String  | `false`  |
| `target_issue_repo`                            | Select a repository with a username whose issue you want to transfer               | `username/reponame`          | String  | `true`   |
| `target_issue_number`                          | Select an issue number                                                             | `123` [^target_issue_number] | String  | `true`   |
| `personal_access_token`                        | Specify your personal access token name stored in your repository                  | `GH_TOKEN`                   | String  | `false`  |
| `replace_twitter_short_url`                    | Specify whether Twitter short URLs are replaced with the redirected ones           | `true`                       | Boolean | `false`  |
| `trim_empty_image_tag`                         | Specify whether the markdown-styled empty image tags are trimmed                   | `true`                       | Boolean | `false`  |
| `linkify_hashtags`                             | Specify whether the hashtags are turned into the links                             | `true`                       | Boolean | `false`  |
| `linkify_mentions`                             | Specify whether the mentions are turned into the links                             | `true`                       | Boolean | `false`  |
| `move_trailing_urls_to_next_lines`             | Specify whether the trailing urls are moved to the next lines                      | `true`                       | Boolean | `false`  |
| `remove_spaces_after_japanese_punctuation`     | Specify whether the spaces after Japanese punctuation are removed                  | `true`                       | Boolean | `false`  |
| `trim_misskey_profile_icon_url`                | Specify whether the Misskey profile icon URL is removed                            | `true`                       | Boolean | `false`  |
| `replace_misskey_image_url_with_multiple_ones` | Specify whether to retrieve multiple images and replace the URL with multiple ones | `true`                       | Boolean | `false`  |

[^target_issue_number]: You can use the special character `latest` to specify the latest issue on a repository you select.

## Development
```shell
cp -i .env.sample .env
node --env-file=.env app.js
```
